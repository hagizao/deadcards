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
      env.DB.prepare("DELETE FROM account_sync"),
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
    expect(await env.DB.prepare("SELECT 1 FROM account_sync WHERE account_id = ?").bind(ACCOUNT).first()).not.toBeNull();
    expect(await pauseRow(PUBS_ROUTE)).toBeNull();
  });

  it("sem Retry-After faz 2 retries (1 s, 2 s), desiste e pausa a rota", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 503 }));
    const t0 = Date.now();
    expect((await sync()).status).toBe(200);
    expect(calls().filter(isPubs)).toHaveLength(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
    expect(await env.DB.prepare("SELECT 1 FROM account_sync").first()).toBeNull();
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

describe("lote de sync", () => {
  const NIGHT = "*/10 6-8 * * *";
  const hours = (h: number) => Math.floor(Date.now() / 1000) - h * 3600;
  // contas pedidas numa chamada de pubs em lote (undefined = outra rota)
  const pubs = (u: string) => (isPubs(u) ? new URL(u).searchParams.get("account_ids")!.split(",").map(Number) : undefined);
  const pubCalls = () => calls().filter(isPubs);
  const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ");
  const pubMatch = (id: number, start: number, players: [number, string][], winning_team = "Team0") => ({
    match_id: id, start_time: iso(start), winning_team, duration_s: 1800, match_mode: "Ranked",
    players: players.map(([account_id, team]) => ({ account_id, team, hero_id: 7, kills: 1, deaths: 2, assists: 3, net_worth: 1000 })),
  });
  const synced = async () => Object.fromEntries((await env.DB.prepare("SELECT account_id, synced_at FROM account_sync").all<{ account_id: number; synced_at: number }>()).results.map((r) => [r.account_id, r.synced_at]));

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'pause:%'"),
      env.DB.prepare("DELETE FROM account_sync"),
      env.DB.prepare("DELETE FROM settings WHERE key = 'syncLastRun'"),
      env.DB.prepare("DELETE FROM edl_matches"),
      env.DB.prepare("DELETE FROM edl_scanned"),
      env.DB.prepare("DELETE FROM player_matches"),
      env.DB.prepare("INSERT INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM') ON CONFLICT(id) DO NOTHING"),
      ...[1, 2, 3, 4, 5].map((n) => env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, account_id) VALUES (?, 't1', ?, 'Abrams', '{}', '#000', '#000', ?)").bind(`p${n}`, `P${n}`, n)),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  // Response criada no teste não pode ser lida dentro do Worker: a resposta sai de uma função
  const mock = (pubs: () => Response = () => Response.json([])) => vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (isPubs(url)) return pubs();
    return new Response("", { status: 404 });
  });
  const limited = () => new Response("", { status: 429, headers: { "retry-after": "120" } });
  const run = async () => api("/api/sync/run", { method: "POST", cookie: (await login("admvicli")).cookie });

  it("rotas de sync exigem admin", async () => {
    const { cookie } = await login("fan");
    for (const [path, method] of [["/api/sync/status", "GET"], ["/api/sync/run", "POST"]]) {
      expect((await api(path, { method })).status).toBe(403);
      expect((await api(path, { method, cookie })).status).toBe(403);
    }
  });

  it("rodízio: uma chamada com as contas nunca sincronizadas e as mais antigas, pulando as de menos de 20 h", async () => {
    await env.DB.batch([[3, 30], [4, 25], [5, 1]].map(([a, h]) => env.DB.prepare("INSERT INTO account_sync (account_id, synced_at) VALUES (?, ?)").bind(a, hours(h))));
    mock();
    const res = (await (await run()).json()) as { status: { accounts: number; staleAccounts: number; lastRunAt: number }; done: boolean };
    expect(pubCalls()).toHaveLength(1);
    expect(new Set(pubs(pubCalls()[0])!.slice(0, 2))).toEqual(new Set([1, 2]));
    expect(pubs(pubCalls()[0])!.slice(2)).toEqual([3, 4]);
    expect(res.status).toMatchObject({ accounts: 5, staleAccounts: 0 });
    expect(res.status.lastRunAt).toBeGreaterThan(hours(1));
    // contas sincronizadas agora não voltam a ser chamadas antes de 20 h
    vi.mocked(globalThis.fetch).mockClear();
    await run();
    expect(pubCalls()).toHaveLength(0);
  });

  it("pubs em lote: URL, min_unix_timestamp, gravação sem rebaixar 'edl' e synced_at só com 200/404", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO player_matches (account_id, match_id, source, event, series, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won) VALUES (1, 10, 'edl', 'ev', 's', 1, 5, 5, 5, 5, 5, 5, 1)").run();
    mock(() => Response.json([
      pubMatch(10, now - 600, [[1, "Team1"], [2, "Team0"]], "Team0"),
      pubMatch(11, now - 300, [[2, "Team1"]], "Team1"),
    ]));
    await run();
    const url = new URL(pubCalls()[0]);
    expect(url.pathname).toBe("/v1/matches/metadata");
    expect(url.searchParams.get("account_ids")).toBe("1,2,3,4,5");
    expect(url.searchParams.get("only_filtered_players")).toBe("true");
    expect(url.searchParams.get("match_mode")).toBeNull();
    expect(url.searchParams.get("limit")).toBe("150");
    // nenhuma conta sincronizada: janela de 14 dias mais 1 h de sobreposição
    expect(Math.abs(Number(url.searchParams.get("min_unix_timestamp")) - (now - 14 * 86400 - 3600))).toBeLessThan(5);
    const rows = (await env.DB.prepare("SELECT account_id, match_id, source, won, kills, start_time FROM player_matches ORDER BY account_id, match_id").all()).results;
    expect(rows).toEqual([
      { account_id: 1, match_id: 10, source: "edl", won: 1, kills: 5, start_time: 5 },
      { account_id: 2, match_id: 10, source: "pub", won: 1, kills: 1, start_time: now - 600 },
      { account_id: 2, match_id: 11, source: "pub", won: 1, kills: 1, start_time: now - 300 },
    ]);
    expect(Object.keys(await synced())).toHaveLength(5);

    // segunda janela começa na conta sincronizada há mais tempo; 404 (nenhuma partida nova) também sincroniza
    await env.DB.prepare("UPDATE account_sync SET synced_at = ?").bind(hours(48)).run();
    await env.DB.prepare("UPDATE account_sync SET synced_at = ? WHERE account_id = 4").bind(hours(30)).run();
    vi.mocked(globalThis.fetch).mockClear();
    mock(() => new Response("No matches found", { status: 404 }));
    await run();
    expect(Number(new URL(pubCalls()[0]).searchParams.get("min_unix_timestamp"))).toBe(hours(48) - 3600);
    expect((await synced())[1]).toBeGreaterThan(hours(1));

    // 500: nada muda
    await env.DB.prepare("UPDATE account_sync SET synced_at = ?").bind(hours(48)).run();
    mock(() => new Response("", { status: 500 }));
    await run();
    expect((await synced())[1]).toBe(hours(48));
  });

  it("resposta cheia avança o sync só até a última partida lida; mantém as 100 pubs mais recentes por conta", async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 5 * 86400;
    await env.DB.batch(Array.from({ length: 100 }, (_, i) => env.DB.prepare("INSERT INTO player_matches (account_id, match_id, source, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won) VALUES (1, ?, 'pub', 1, ?, 1, 1, 1, 1, 1, 0)").bind(1000 + i, 1000 + i)));
    mock(() => Response.json(Array.from({ length: 150 }, (_, i) => pubMatch(i + 1, start + i * 60, [[1, "Team0"]]))));
    await run();
    expect((await synced())[1]).toBe(start + 149 * 60);
    expect((await synced())[2]).toBe(start + 149 * 60);
    const kept = (await env.DB.prepare("SELECT COUNT(*) AS n, MIN(start_time) AS oldest FROM player_matches WHERE account_id = 1 AND source = 'pub'").first<{ n: number; oldest: number }>())!;
    expect(kept.n).toBe(100);
    expect(kept.oldest).toBe(start + 50 * 60);
  });

  it("circuit breaker: o 429 da chamada em lote deixa as contas atrasadas e a rota fica em pausa no status", async () => {
    mock(limited);
    const res = (await (await run()).json()) as { status: { staleAccounts: number; paused: { route: string; until: number }[] }; done: boolean };
    expect(pubCalls()).toHaveLength(1);
    expect(res.status.staleAccounts).toBe(5);
    expect(await synced()).toEqual({});
    expect(res.status.paused).toHaveLength(1);
    expect(res.status.paused[0].route).toBe(PUBS_ROUTE);
    expect(res.done).toBe(false);
    const status = (await (await api("/api/sync/status", { cookie: (await login("admvicli")).cookie })).json()) as { paused: unknown[] };
    expect(status.paused).toHaveLength(1);
    // a próxima execução pula a rota em pausa sem gastar fetch
    vi.mocked(globalThis.fetch).mockClear();
    await run();
    expect(pubCalls()).toHaveLength(0);
  });

  it("status conta partidas pendentes e eventos varridos; done quando não resta nada", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO edl_matches (match_id, event, series) VALUES (1, 'ev', 's1')"),
      env.DB.prepare("INSERT INTO edl_scanned (key) VALUES ('ev'), ('ev/s1')"),
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (isPubs(url)) return Response.json([]);
      if (url === "https://edl.gg/events") return new Response("<html></html>");
      if (url.includes("/v1/matches/metadata")) return Response.json([raw(1)]);
      return new Response("", { status: 404 });
    });
    const { cookie } = await login("admvicli");
    const before = (await (await api("/api/sync/status", { cookie })).json()) as Record<string, unknown>;
    expect(before).toMatchObject({ accounts: 5, staleAccounts: 5, pendingEdlMatches: 1, scannedEvents: 1, paused: [] });
    expect(before.lastRunAt).toBeUndefined();
    const res = (await (await api("/api/sync/run", { method: "POST", cookie })).json()) as { status: Record<string, unknown>; done: boolean };
    expect(res.status).toMatchObject({ staleAccounts: 0, pendingEdlMatches: 0 });
    expect(res.done).toBe(true);
  });

  it("cron da madrugada roda o lote; o de 6 h só atualiza o cache da API", async () => {
    mock();
    for (const cron of ["0 */6 * * *", NIGHT]) {
      const ctx = createExecutionContext();
      await worker.scheduled(createScheduledController({ cron }), env as never, ctx);
      await waitOnExecutionContext(ctx);
      if (cron === NIGHT) expect(pubs(pubCalls()[0])).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
      else {
        expect(pubCalls()).toHaveLength(0);
        expect(calls().some((u) => u.endsWith("/v1/patches"))).toBe(true);
      }
      vi.mocked(globalThis.fetch).mockClear();
    }
  });
});
