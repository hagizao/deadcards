import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";

const ACCOUNT = 437080332;
const api = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  SELF.fetch(`http://test${path}`, { ...init, headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) } });

const playerBody = (extra: Record<string, unknown>) =>
  JSON.stringify({ name: "Player", teamId: "t1", hero: "Abrams", stats: { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 }, ...extra });

// Partida EDL já lida: o vínculo tem que sair só do info_json, sem baixar o metadata de novo.
const seedEdlMatch = () =>
  env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, done, game, teams, info_json) VALUES (137842621, 'evolution-cup-4', 'finals-1', 1, 1, 'Full of Ego vs Dog6', ?)")
    .bind(JSON.stringify({ start: 1794734516, dur: 2831, win: 1, players: [
      { a: ACCOUNT, t: 1, h: 19, k: 13, d: 6, as: 8, nw: 44098 },
      { a: 1, t: 0, h: 50, k: 1, d: 9, as: 2, nw: 20000 },
    ] })).run();

describe("partidas dos jogadores", () => {
  beforeEach(async () => {
    await seedPlayer();
    await env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, extra_json) VALUES ('p1-v', 't1', 'Player', 'Abrams', '{}', '#000', '#000', ?)")
      .bind(JSON.stringify({ variantOf: "p1" })).run();
    await env.DB.batch(["player_matches", "edl_matches", "edl_scanned"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  });
  afterEach(() => vi.restoreAllMocks());

  it("rotas de admin exigem admin", async () => {
    const { cookie } = await login("fan");
    for (const [path, method] of [["/api/match-lookup/137842621", "GET"], ["/api/players/p1/sync", "POST"], ["/api/edl/matches", "GET"], ["/api/edl/refresh", "POST"]]) {
      expect((await api(path, { method })).status).toBe(403);
      expect((await api(path, { method, cookie })).status).toBe(403);
    }
  });

  it("valida o accountId e desvincula com null", async () => {
    const { cookie } = await login("admvicli");
    for (const accountId of ["x", 0, -1, 1.5, 2 ** 32, true]) {
      expect((await api("/api/players/p1", { method: "PUT", cookie, body: playerBody({ accountId }) })).status).toBe(400);
    }
    expect((await api("/api/players/p1", { method: "PUT", cookie, body: playerBody({ accountId: ACCOUNT }) })).status).toBe(200);
    expect(await env.DB.prepare("SELECT account_id FROM players WHERE id = 'p1'").first("account_id")).toBe(ACCOUNT);
    await api("/api/players/p1", { method: "PUT", cookie, body: playerBody({ accountId: null }) });
    expect(await env.DB.prepare("SELECT account_id FROM players WHERE id = 'p1'").first("account_id")).toBeNull();
  });

  it("sync liga partidas EDL já lidas e guarda pubs; a variante herda da carta base", async () => {
    const { cookie } = await login("admvicli");
    await env.DB.prepare("UPDATE players SET account_id = ? WHERE id = 'p1'").bind(ACCOUNT).run();
    await seedEdlMatch();
    const pub = { match_id: 1, start_time: "2026-11-01 12:00:00", winning_team: "Team0", duration_s: 1800,
      players: [{ account_id: ACCOUNT, team: "Team0", hero_id: 7, kills: 1, deaths: 2, assists: 3, net_worth: 1000 }] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes(`/v1/matches/metadata?account_ids=${ACCOUNT}&`)) return Response.json([pub]);
      return new Response("", { status: 404 });
    });

    const res = await api("/api/players/p1/sync", { method: "POST", cookie });
    expect(await res.json()).toEqual({ added: 2 });

    const edl = await (await api("/api/players/p1-v/matches?source=edl")).json();
    expect(edl).toEqual([{ matchId: 137842621, source: "edl", event: "evolution-cup-4", series: "finals-1", heroId: 19, startTime: 1794734516, durationS: 2831, kills: 13, deaths: 6, assists: 8, netWorth: 44098, won: true }]);
    const pubs = (await (await api("/api/players/p1/matches?source=pub")).json()) as { matchId: number; won: boolean }[];
    expect(pubs.map((m) => [m.matchId, m.won])).toEqual([[1, true]]);
  });

  it("lista partidas do EDL para o admin escolher", async () => {
    const { cookie } = await login("admvicli");
    await seedEdlMatch();
    expect(await (await api("/api/edl/matches", { cookie })).json()).toEqual([
      { matchId: 137842621, event: "evolution-cup-4", series: "finals-1", game: 1, teams: "Full of Ego vs Dog6", startTime: 1794734516 },
    ]);
  });
});
