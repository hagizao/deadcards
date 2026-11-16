import { SELF, createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { login } from "../helpers/fixtures";

const api = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  SELF.fetch(`http://test${path}`, { ...init, headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) } });

const raw = (id: number) => ({
  match_id: id, start_time: "2026-11-15 09:21:56", winning_team: "Team0", duration_s: 2831, match_mode: "PrivateLobby",
  players: [
    { account_id: 437080332, team: "Team0", hero_id: 81, kills: 5, deaths: 6, assists: 18, net_worth: 61319, last_hits: 1 },
    { account_id: 176622891, team: "Team1", hero_id: 6, kills: 11, deaths: 8, assists: 17, net_worth: 43359, last_hits: 2 },
  ],
});

const ACCOUNT = 437080332;
const calls = () => (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls.map(([i]) => String(i instanceof Request ? i.url : i));
const PUBS = "/v1/matches/metadata?account_ids=";
const isPubs = (u: string) => u.includes(PUBS);
const PUBS_ROUTE = "/v1/matches/metadata";
const pauseRow = (route: string) => env.DB.prepare("SELECT body FROM api_cache WHERE cache_key = ?").bind(`pause:${route}`).first<string>("body");

describe("metadata das partidas do EDL em lote", () => {
  beforeEach(async () => {
    await env.DB.batch(["edl_matches", "player_matches"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    await env.DB.batch([1, 2, 3].map((id) => env.DB.prepare("INSERT INTO edl_matches (match_id, event, series) VALUES (?, 'ev', 's1')").bind(id)));
  });
  afterEach(() => vi.restoreAllMocks());

  it("uma chamada lê várias partidas, converte para o info_json de sempre e marca as ausentes como lidas", async () => {
    const { cookie } = await login("admvicli");
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url.includes("/v1/matches/metadata?match_ids=3,2,1&match_mode=PrivateLobby")) return Response.json([raw(3), raw(1)]);
      return new Response("", { status: 404 });
    });
    expect((await api("/api/edl/refresh", { method: "POST", cookie })).status).toBe(200);
    expect(calls.filter((u) => u.includes("/v1/matches/metadata"))).toHaveLength(1);
    const rows = (await env.DB.prepare("SELECT match_id, done, info_json FROM edl_matches ORDER BY match_id").all<{ match_id: number; done: number; info_json: string | null }>()).results;
    expect(rows.map((r) => [r.match_id, r.done])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(rows[1].info_json).toBeNull();
    expect(JSON.parse(rows[0].info_json!)).toEqual({
      start: Date.UTC(2026, 10, 15, 9, 21, 56) / 1000, dur: 2831, win: 0,
      players: [{ a: 437080332, t: 0, h: 81, k: 5, d: 6, as: 18, nw: 61319 }, { a: 176622891, t: 1, h: 6, k: 11, d: 8, as: 17, nw: 43359 }],
    });
  });
});

describe("limites da deadlock-api", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'pause:%'"),
      env.DB.prepare("DELETE FROM edl_matches"),
      env.DB.prepare("INSERT INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM') ON CONFLICT(id) DO NOTHING"),
      env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, account_id) VALUES ('p1', 't1', 'Player', 'Abrams', '{}', '#000', '#000', ?)").bind(ACCOUNT),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());
  const sync = async () => api("/api/players/p1/sync", { method: "POST", cookie: (await login("admvicli")).cookie });

  it("503 com Retry-After curto espera e tenta de novo", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (isPubs(url)) return ++n === 1 ? new Response("", { status: 503, headers: { "retry-after": "1" } }) : Response.json([]);
      return new Response("", { status: 404 });
    });
    expect((await sync()).status).toBe(200);
    expect(calls().filter(isPubs)).toHaveLength(2);
    expect(await pauseRow(PUBS_ROUTE)).toBeNull();
  });

  it("sem Retry-After faz 2 retries (1 s, 2 s), desiste e pausa a rota", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 503 }));
    const t0 = Date.now();
    expect((await sync()).status).toBe(200);
    expect(calls().filter(isPubs)).toHaveLength(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
    expect(Number(await pauseRow(PUBS_ROUTE))).toBeGreaterThan(Date.now() / 1000 + 200);
  }, 15000);

  it("429 com Retry-After longo não espera: pausa a rota e a próxima execução a pula", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 429, headers: { "retry-after": "120" } }));
    const t0 = Date.now();
    await sync();
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(calls().filter(isPubs)).toHaveLength(1);
    const until = Number(await pauseRow(PUBS_ROUTE));
    expect(until).toBeGreaterThan(Date.now() / 1000 + 110);
    expect(until).toBeLessThan(Date.now() / 1000 + 130);
    await sync();
    expect(calls().filter(isPubs)).toHaveLength(1);
  });

  it("504 pausa sem retry e a pausa do lote de metadata vale para as próximas leituras", async () => {
    await env.DB.prepare("INSERT INTO edl_matches (match_id, event, series) VALUES (1, 'ev', 's1')").run();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      return new Response("", { status: url.includes("/v1/matches/metadata") ? 504 : 404 });
    });
    const { cookie } = await login("admvicli");
    await api("/api/edl/refresh", { method: "POST", cookie });
    await api("/api/edl/refresh", { method: "POST", cookie });
    expect(calls().filter((u) => u.includes("/v1/matches/metadata"))).toHaveLength(1);
    expect(await pauseRow("/v1/matches/metadata")).not.toBeNull();
    expect(await env.DB.prepare("SELECT done FROM edl_matches WHERE match_id = 1").first("done")).toBe(0);
  });
});

describe("cron de 6 h", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'pause:%'"),
      env.DB.prepare("INSERT INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM') ON CONFLICT(id) DO NOTHING"),
      ...[1, 2].map((n) => env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, account_id) VALUES (?, 't1', ?, 'Abrams', '{}', '#000', '#000', ?)").bind(`p${n}`, `P${n}`, n)),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("atualiza o cache da API e busca os pubs das contas vinculadas numa chamada só", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      return isPubs(url) ? Response.json([]) : new Response("", { status: 404 });
    });
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 */6 * * *" }), env as never, ctx);
    await waitOnExecutionContext(ctx);
    expect(calls().some((u) => u.endsWith("/v1/patches"))).toBe(true);
    expect(calls().filter(isPubs).map((u) => new URL(u).searchParams.get("account_ids"))).toEqual(["1,2"]);
  });
});
