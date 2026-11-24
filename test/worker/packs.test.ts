import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedCode } from "../helpers/fixtures";

const req = (cookie: string | undefined, path: string, method = "GET", body?: unknown) =>
  SELF.fetch(`http://test${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), origin: "http://test", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedPackCode(code: string, packTypeId = "pack-semanal", opts: { maxUses?: number; expiresAt?: number | null } = {}) {
  await env.DB.prepare("INSERT INTO redeem_codes (code, pack_type_id, max_uses, expires_at) VALUES (?, ?, ?, ?)")
    .bind(code, packTypeId, opts.maxUses ?? 10, opts.expiresAt ?? null).run();
}

type Inv = { packs: { id: string; test?: boolean; type: { id: string } }[] };

describe("Packs", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')"),
      env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2) VALUES ('a', 't1', 'A', 'Abrams', '{}', '#000', '#000')"),
      env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2) VALUES ('b', 't1', 'B', 'Bebop', '{}', '#000', '#000')"),
    ]);
  });

  it("código de pack vai para o inventário e não dá para resgatar duas vezes", async () => {
    await seedPackCode("PACK-WEEK-1");
    const { cookie } = await login("fan");
    const res = await req(cookie, "/api/redeem", "POST", { code: "pack-week-1" });
    expect(res.status).toBe(200);
    const { packId } = (await res.json()) as { packId: string };
    const inv = (await (await req(cookie, "/api/packs")).json()) as Inv;
    expect(inv.packs.map((p) => p.id)).toEqual([packId]);
    expect((await req(cookie, "/api/redeem", "POST", { code: "PACK-WEEK-1" })).status).toBe(409);
    expect(await env.DB.prepare("SELECT uses FROM redeem_codes WHERE code = 'PACK-WEEK-1'").first("uses")).toBe(1);
  });

  it("código de pack expirado não entra", async () => {
    await seedPackCode("PACK-OLD-1", "pack-semanal", { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const { cookie } = await login("fan");
    expect((await req(cookie, "/api/redeem", "POST", { code: "PACK-OLD-1" })).status).toBe(404);
  });

  it("abrir dá uma carta nova, sem repetidas, e o pack some", async () => {
    await seedPackCode("PACK-WEEK-2");
    const { cookie, userId } = await login("fan");
    await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'a')").bind(userId).run();
    const { packId } = (await (await req(cookie, "/api/redeem", "POST", { code: "PACK-WEEK-2" })).json()) as { packId: string };
    const res = await req(cookie, `/api/packs/${packId}/open`, "POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cards: [{ id: "b", kind: "signature" }] });
    expect(await env.DB.prepare("SELECT 1 FROM user_cards WHERE user_id = ? AND player_id = 'b'").bind(userId).first()).not.toBeNull();
    expect(((await (await req(cookie, "/api/packs")).json()) as Inv).packs).toEqual([]);
    expect((await req(cookie, `/api/packs/${packId}/open`, "POST")).status).toBe(409);
  });

  it("com tudo já na coleção o pack continua fechado", async () => {
    await seedPackCode("PACK-WEEK-3");
    const { cookie, userId } = await login("fan");
    await env.DB.batch(["a", "b"].map((id) => env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(userId, id)));
    const { packId } = (await (await req(cookie, "/api/redeem", "POST", { code: "PACK-WEEK-3" })).json()) as { packId: string };
    const res = await req(cookie, `/api/packs/${packId}/open`, "POST");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("exhausted");
    expect(((await (await req(cookie, "/api/packs")).json()) as Inv).packs.map((p) => p.id)).toEqual([packId]);
  });

  it("não abre pack de outra pessoa", async () => {
    await seedPackCode("PACK-WEEK-4");
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    const { packId } = (await (await req(cookie, "/api/redeem", "POST", { code: "PACK-WEEK-4" })).json()) as { packId: string };
    expect((await req(other, `/api/packs/${packId}/open`, "POST")).status).toBe(404);
  });

  it("admin sempre tem pack de teste, que abre sem gravar", async () => {
    const { cookie, userId } = await login("admvicli");
    const inv = (await (await req(cookie, "/api/packs")).json()) as Inv;
    expect(inv.packs).toEqual([expect.objectContaining({ id: "test:pack-semanal", test: true })]);
    for (let i = 0; i < 3; i++) expect((await req(cookie, "/api/packs/test:pack-semanal/open", "POST")).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM user_cards WHERE user_id = ?").bind(userId).first("n")).toBe(0);
    const { cookie: fan } = await login("fan");
    expect(((await (await req(fan, "/api/packs")).json()) as Inv).packs).toEqual([]);
    expect((await req(fan, "/api/packs/test:pack-semanal/open", "POST")).status).toBe(403);
  });

  it("tipos de pack: só admin, com chances validadas", async () => {
    const { cookie } = await login("admvicli");
    const { cookie: fan } = await login("fan");
    const body = { name: "Final", odds: { alt: 70, signature: 25, special: 5 }, teams: ["t1"] };
    expect((await req(fan, "/api/pack-types/final", "PUT", body)).status).toBe(403);
    expect((await req(cookie, "/api/pack-types/final", "PUT", { ...body, odds: { alt: 70, signature: 25, special: 6 } })).status).toBe(400);
    expect((await req(cookie, "/api/pack-types/final", "PUT", body)).status).toBe(200);
    const list = (await (await req(cookie, "/api/pack-types")).json()) as { id: string; teams: string[] }[];
    expect(list.find((t) => t.id === "final")?.teams).toEqual(["t1"]);
    await seedPackCode("PACK-FINAL-1", "final");
    expect((await req(cookie, "/api/pack-types/final", "DELETE")).status).toBe(409);
  });

  it("código: carta ou pack, nunca os dois", async () => {
    const { cookie } = await login("admvicli");
    const base = { code: "BOTH-CODE-1", maxUses: 1, startsAt: null, expiresAt: null };
    expect((await req(cookie, "/api/codes", "POST", { ...base, playerId: "a", packTypeId: "pack-semanal" })).status).toBe(400);
    expect((await req(cookie, "/api/codes", "POST", base)).status).toBe(400);
    expect((await req(cookie, "/api/codes", "POST", { ...base, packTypeId: "pack-semanal" })).status).toBe(200);
  });

  it("código de carta continua funcionando", async () => {
    await seedCode("CARD-CODE-1", "a");
    const { cookie } = await login("fan");
    expect(await (await req(cookie, "/api/redeem", "POST", { code: "CARD-CODE-1" })).json()).toEqual({ playerId: "a" });
  });
});
