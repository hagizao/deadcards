import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "../helpers/fixtures";

const api = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  SELF.fetch(`http://test${path}`, { ...init, headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) } });
const json = (body: unknown) => JSON.stringify(body);
const STATS = { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 };

const addTeam = (id: string, name: string) =>
  env.DB.prepare("INSERT INTO teams (id, name, tag, region) VALUES (?, ?, 'TG', 'Europa')").bind(id, name).run();
const addCard = (id: string, teamId: string, name: string, accountId: number | null = null, extra: object = {}) =>
  env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, account_id, extra_json) VALUES (?, ?, ?, 'Abrams', ?, '#000', '#000', ?, ?)")
    .bind(id, teamId, name, json(STATS), accountId, json(extra)).run();
const accountOf = (id: string) => env.DB.prepare("SELECT account_id FROM players WHERE id = ?").bind(id).first<number | null>("account_id");

describe("backfill do perfil nas outras cartas", () => {
  const backfill = (cookie: string, id: string, body?: object) =>
    api(`/api/players/${id}/backfill`, { cookie, ...(body ? { method: "POST", body: json(body) } : {}) });

  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM player_matches"), env.DB.prepare("DELETE FROM edl_matches")]);
    await addTeam("t1", "Time 1");
    await addTeam("t2", "Time 2");
    await addCard("main", "t1", "Kaze", 100);
    await addCard("v-inativa", "t1", "Kaze", null, { inactive: true });
    await addCard("v-outro-time", "t2", "  kaze  ", null);
    await addCard("v-variant", "t1", "Kaze Skin", null, { variantOf: "main" });
    await addCard("v-conflito", "t2", "KAZE", 200);
    await addCard("v-igual", "t2", "Kaze", 100);
    await addCard("alheia", "t2", "Lumi", null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("409 sem account e 404 sem carta", async () => {
    const { cookie } = await login("admvicli");
    await addCard("sem", "t1", "Sem Conta");
    expect((await backfill(cookie, "sem")).status).toBe(409);
    expect((await backfill(cookie, "zzz")).status).toBe(404);
  });

  it("lista variantes e cartas de mesmo nome, sem a própria e sem as que já têm a conta", async () => {
    const { cookie } = await login("admvicli");
    const list = (await (await backfill(cookie, "main")).json()) as { playerId: string; by: string; accountId?: number; inactive?: boolean; teamId: string }[];
    expect(Object.fromEntries(list.map((c) => [c.playerId, c.by]))).toEqual({ "v-inativa": "name", "v-outro-time": "name", "v-variant": "variant", "v-conflito": "name" });
    expect(list.find((c) => c.playerId === "v-conflito")?.accountId).toBe(200);
    expect(list.find((c) => c.playerId === "v-inativa")).toMatchObject({ inactive: true, teamId: "t1" });
    expect(list.find((c) => c.playerId === "v-outro-time")).not.toHaveProperty("accountId");
  });

  it("POST valida, pula quem tem outra conta ou não é candidata e atualiza só o account_id", async () => {
    const { cookie } = await login("admvicli");
    for (const body of [{}, { playerIds: "x" }, { playerIds: ["a b"] }, { playerIds: Array(101).fill("x") }]) expect((await backfill(cookie, "main", body)).status).toBe(400);
    const before = await env.DB.prepare("SELECT * FROM players WHERE id = 'v-inativa'").first<Record<string, unknown>>();
    const res = await (await backfill(cookie, "main", { playerIds: ["v-inativa", "v-variant", "v-conflito", "alheia", "main", "v-igual", "nada"] })).json() as { updated: string[]; skipped: { item: string; reason: string }[] };
    expect(res.updated).toEqual(["v-inativa", "v-variant"]);
    expect(res.skipped.map((s) => s.item).sort()).toEqual(["alheia", "main", "nada", "v-conflito", "v-igual"].sort());
    expect(res.skipped.find((s) => s.item === "v-conflito")?.reason).toContain("outra conta");
    expect(await accountOf("v-inativa")).toBe(100);
    expect(await accountOf("v-variant")).toBe(100);
    expect(await accountOf("v-conflito")).toBe(200);
    expect(await accountOf("alheia")).toBeNull();
    expect(await accountOf("v-outro-time")).toBeNull();
    expect(await env.DB.prepare("SELECT * FROM players WHERE id = 'v-inativa'").first()).toEqual({ ...before, account_id: 100 });
  });

  it("roda o linkEdl depois de vincular", async () => {
    const { cookie } = await login("admvicli");
    await env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, done, info_json) VALUES (7, 'ev', 's', 1, ?)")
      .bind(json({ start: 5, dur: 1, win: 0, players: [{ a: 100, t: 0, h: 1, k: 1, d: 1, as: 1, nw: 1 }] })).run();
    await backfill(cookie, "main", { playerIds: ["v-inativa"] });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM player_matches WHERE account_id = 100").first("n")).toBe(1);
  });
});
