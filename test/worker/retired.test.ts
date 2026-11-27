import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedCode } from "../helpers/fixtures";

// herói jogado aposentado: desmarcado no Editor, mas alguém já tinha a carta
async function put(cookie: string, id: string, extra: Record<string, unknown> = {}) {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  return SELF.fetch(`http://test/api/players/${id}`, {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ name: id, teamId: "t1", stats: {}, ...extra }),
  });
}

const json = (cookie: string, path: string, method: string, body?: unknown) =>
  SELF.fetch(`http://test${path}`, {
    method,
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("Herói jogado aposentado", () => {
  it("apagar carta que alguém tem devolve 409 com code owned", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    const { userId } = await login("fan");
    await put(cookie, "rmain");
    await put(cookie, "ralt", { variantOf: "rmain", hero: "Mina", altHero: true });
    await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'ralt')").bind(userId).run();
    const res = await json(cookie, "/api/players/ralt", "DELETE");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("owned");
  });

  it("não cria nem resgata código de carta aposentada", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    await put(cookie, "cmain");
    await put(cookie, "calt", { variantOf: "cmain", hero: "Mina", altHero: true });
    await seedCode("OLD-CODE-1", "calt");
    await put(cookie, "calt", { variantOf: "cmain", hero: "Mina", altHero: true, inactive: true });

    const create = await json(cookie, "/api/codes", "POST", { code: "NEW-CODE-1", playerId: "calt", maxUses: 1, startsAt: null, expiresAt: null });
    expect(create.status).toBe(400);

    const { cookie: fan } = await login("fan");
    expect((await json(fan, "/api/redeem", "POST", { code: "OLD-CODE-1" })).status).toBe(404);

    // reativada volta a valer
    await put(cookie, "calt", { variantOf: "cmain", hero: "Mina", altHero: true });
    expect((await json(fan, "/api/redeem", "POST", { code: "OLD-CODE-1" })).status).toBe(200);
  });

  it("carta principal inativa (fora do elenco) continua resgatável", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    await put(cookie, "imain", { inactive: true });
    await seedCode("MAIN-CODE-1", "imain");
    const { cookie: fan } = await login("fan");
    expect((await json(fan, "/api/redeem", "POST", { code: "MAIN-CODE-1" })).status).toBe(200);
  });
});
