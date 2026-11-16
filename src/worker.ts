/// <reference types="@cloudflare/workers-types" />
import { createAuth, currentUser } from "./auth";
import { favorite, profileCard, publicProfile } from "./profile";
import { handleOf } from "./handles";
import { accountLink } from "./link";
import { PROFILE_CARD_PATH } from "./lib/profile";
import type { BackfillCandidate, BackfillResult, EdlMatch, MatchLookup, MatchLookupPlayer, PlayerMatch } from "./lib/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ASSETS_BUCKET: R2Bucket;
  DEADLOCK_API_BASE: string;
  BETTER_AUTH_SECRET: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ADMINS: string;
  GITHUB_TOKEN: string;
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const UPLOAD_FOLDERS = ["players", "teams", "heroes", "bg", "home"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PLAYER_EXTRA = ["footer", "footerSize", "footerColor", "special", "specialText", "frame", "variantOf", "inactive", "art"];
const ID_RE = /^[\w-]{1,64}$/;

const keyOf = (url: unknown) => (typeof url === "string" && url.startsWith("/img/") ? url.slice(5) : null);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
// `code` é opcional: rotas que o front traduz mandam um código estável além da mensagem em pt.
const bad = (msg: string, status = 400, code?: string) => Response.json({ error: msg, code }, { status });

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const ALLOWED_PATHS = ["/v1/assets/heroes", "/v1/analytics/hero-stats", "/v1/patches"];
const UPSERT_CACHE =
  "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at";

const imgUrl = (key: string | null) => (key ? `/img/${key}` : undefined);
const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

async function cachedFetch(env: Env, path: string): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT body, fetched_at FROM api_cache WHERE cache_key = ?")
    .bind(path)
    .first<{ body: string; fetched_at: number }>();
  if (row && now - row.fetched_at < CACHE_TTL_SECONDS) {
    return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "hit" } });
  }
  const upstream = await fetch(env.DEADLOCK_API_BASE + path);
  if (!upstream.ok) {
    if (row) return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "stale" } });
    return upstream;
  }
  const body = await upstream.text();
  await env.DB.prepare(UPSERT_CACHE).bind(path, body, now).run();
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

async function syncFromDeadlockApi(env: Env): Promise<void> {
  for (const path of ALLOWED_PATHS) {
    const res = await fetch(env.DEADLOCK_API_BASE + path);
    if (!res.ok) continue;
    await env.DB.prepare(UPSERT_CACHE).bind(path, await res.text(), Math.floor(Date.now() / 1000)).run();
  }
}

const PUB_HISTORY_LIMIT = 100;
// Limite de subrequests externos por execução do Worker no plano Free (50), com folga.
const SUBREQUESTS = 45;
// /v1/matches/metadata (lote): 30 req/min por IP e até 1000 ids por chamada. Poucas chamadas grandes: ~56 KB por partida, 30 ids = ~1,7 MB de JSON.
const BULK_IDS = 30;
const BULK_CALLS = 2;
// Pubs: /v1/matches/metadata filtrado por account_ids (os mesmos 30 req/min por IP), uma chamada para todas as contas do lote.
// A API leva de ~1 s a ~12 s conforme a janela e o limite (504 acima de ~20 s): ~5 KB por partida, 150 partidas = ~0,7 MB.
const PUB_ACCOUNTS = 30;
const PUB_LIMIT = 150;
// Janela dos pubs: só os últimos 14 dias, mais recentes primeiro (shortcut: o que passar de PUB_LIMIT partidas na janela fica de fora, guardar a última leitura por conta se isso importar).
const PUB_LOOKBACK_S = 14 * 86400;
// 429/503: espera o Retry-After se for curto (ou 1 s, 2 s sem o header), no máximo MAX_RETRIES vezes. Retry-After longo, 504 ou tentativas
// esgotadas colocam a rota em pausa (api_cache `pause:<rota>`) e os próximos lotes a pulam até a hora marcada.
const MAX_RETRIES = 2;
const RETRY_CAP_S = 8;
const PAUSE_MIN_S = 60;
const PAUSE_DEFAULT_S = 300;
const PAUSE_MAX_S = 6 * 3600;
const EDL = "https://edl.gg";
// Resposta travada seguraria o sync e o cron inteiros; vira erro e é tentada no próximo ciclo.
const FETCH_TIMEOUT_MS = 8000;
// Identifica o deadcards para quem opera a deadlock-api e o edl.gg (robots.txt do EDL libera User-agent *).
const OUT_INIT = () => ({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "deadcards-site (+https://github.com/hagizao/deadcards)" } });

// Orçamento de subrequests externos da execução; cada tentativa (inclusive retry) gasta um.
type Budget = { left: number };
const newBudget = (): Budget => ({ left: SUBREQUESTS });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nowS = () => Math.floor(Date.now() / 1000);

// Rota em pausa = até quando (unix s), ou 0.
async function pausedUntil(env: Env, route: string): Promise<number> {
  const until = Number(await env.DB.prepare("SELECT body FROM api_cache WHERE cache_key = ?").bind(`pause:${route}`).first<string>("body"));
  return until > nowS() ? until : 0;
}

// null = sem orçamento ou erro de rede/timeout (sem retry); rota em pausa devolve um 429 sintético, sem gastar fetch.
async function outFetch(env: Env, url: string, route: string, budget: Budget): Promise<Response | null> {
  if (await pausedUntil(env, route)) return new Response(null, { status: 429 });
  for (let attempt = 0; ; attempt++) {
    if (budget.left <= 0) return null;
    budget.left--;
    let r: Response;
    try { r = await fetch(url, OUT_INIT()); } catch { return null; }
    if (r.status !== 429 && r.status !== 503 && r.status !== 504) return r;
    const header = r.headers.get("retry-after");
    const after = header !== null && Number.isFinite(Number(header)) ? Math.max(Number(header), 0) : 0;
    if (r.status !== 504 && attempt < MAX_RETRIES && after <= RETRY_CAP_S) {
      await r.body?.cancel();
      await sleep((after || 2 ** attempt) * 1000);
      continue;
    }
    const secs = Math.min(after ? Math.max(after, PAUSE_MIN_S) : PAUSE_DEFAULT_S, PAUSE_MAX_S);
    await env.DB.prepare(UPSERT_CACHE).bind(`pause:${route}`, String(nowS() + secs), nowS()).run();
    return r;
  }
}

// Rota de pausa de um caminho da deadlock-api: sem a query e com os ids numéricos trocados por :id.
const dlRoute = (path: string) => path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id");

// 429/503 e erros de rede viram status sem dados: quem chama pula e tenta no próximo ciclo.
async function dlGet<T>(env: Env, path: string, budget = newBudget()): Promise<{ status: number; data?: T }> {
  const r = await outFetch(env, env.DEADLOCK_API_BASE + path, dlRoute(path), budget);
  if (!r) return { status: 502 };
  try { return r.ok ? { status: 200, data: (await r.json()) as T } : { status: r.status }; } catch { return { status: 502 }; }
}

type MetaPlayer = { account_id: number; team: number; hero_id: number; kills: number; deaths: number; assists: number; net_worth: number };
type MetaInfo = { start_time: number; duration_s: number; winning_team: number; players: MetaPlayer[] };
type RawMeta = Omit<MetaInfo, "start_time" | "winning_team" | "players"> & { match_id: number; start_time: string; winning_team: string; players: (Omit<MetaPlayer, "team"> & { team: string })[] };
const toInfo = (m: RawMeta): MetaInfo => ({
  start_time: Date.parse(m.start_time.replace(" ", "T") + "Z") / 1000, duration_s: m.duration_s, winning_team: m.winning_team === "Team1" ? 1 : 0,
  players: m.players.map((p) => ({ ...p, team: p.team === "Team1" ? 1 : 0 })),
});
// Metadata de várias partidas numa chamada. As do EDL são lobbies privados e só aparecem com PrivateLobby; ids ausentes da resposta não existem.
// status 404 = nenhuma encontrada; os dois (200 e 404) são respostas definitivas, o resto é falha para tentar depois.
async function metadata(env: Env, ids: (number | string)[], budget: Budget, mode = "PrivateLobby") {
  const r = await dlGet<RawMeta[]>(env, `/v1/matches/metadata?match_ids=${ids.join(",")}${mode ? `&match_mode=${mode}` : ""}&include_info=true&include_player_info=true&include_player_kda=true&limit=${ids.length}`, budget);
  const infos = new Map((Array.isArray(r.data) ? r.data : []).map((m): [number, MetaInfo] => [m.match_id, toInfo(m)]));
  return { status: r.status, infos };
}

async function matchLookup(env: Env, matchId: string): Promise<Response> {
  const key = `match-lookup:${matchId}`;
  const cached = await env.DB.prepare("SELECT body FROM api_cache WHERE cache_key = ?").bind(key).first<string>("body");
  if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
  const budget = newBudget();
  let found = await metadata(env, [matchId], budget);
  if (found.status === 404) found = await metadata(env, [matchId], budget, "");
  const { status } = found, info = found.infos.get(Number(matchId));
  if (!info) return status === 429 ? bad("a deadlock-api limitou as consultas, tente de novo em alguns minutos", 429)
    : bad(status === 404 ? "partida não encontrada" : "deadlock-api indisponível, tente de novo", status === 404 ? 404 : 502);
  const steam = await dlGet<{ account_id: number; personaname?: string; avatar?: string }[]>(env, `/v1/players/steam?account_ids=${info.players.map((p) => p.account_id).join(",")}`);
  const names = new Map((steam.data ?? []).map((s) => [s.account_id, s]));
  const players: MatchLookupPlayer[] = info.players.map((p) => ({
    accountId: p.account_id, team: p.team, heroId: p.hero_id, kills: p.kills, deaths: p.deaths, assists: p.assists, netWorth: p.net_worth,
    name: names.get(p.account_id)?.personaname, avatar: names.get(p.account_id)?.avatar,
  }));
  const body = JSON.stringify({ matchId: Number(matchId), startTime: info.start_time, durationS: info.duration_s, winningTeam: info.winning_team, players } satisfies MatchLookup);
  // partida terminada não muda; sem nomes (steam fora do ar) não guarda, para tentar de novo
  if (steam.data) await env.DB.prepare(UPSERT_CACHE).bind(key, body, Math.floor(Date.now() / 1000)).run();
  return new Response(body, { headers: { "content-type": "application/json" } });
}

// Pubs em lote: um JSON de linhas num único bind (nunca rebaixa uma partida 'edl' já gravada).
const INSERT_MATCH_JSON =
  `INSERT INTO player_matches (account_id, match_id, source, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won)
   SELECT value ->> 'a', value ->> 'm', 'pub', value ->> 'h', value ->> 's', value ->> 'd', value ->> 'k', value ->> 'de', value ->> 'as', value ->> 'nw', value ->> 'w'
   FROM json_each(?) WHERE true `;

const matchCount = (env: Env) => env.DB.prepare("SELECT COUNT(*) AS n FROM player_matches").first<number>("n").then((n) => n ?? 0);

// Só as partidas dos últimos 14 dias de várias contas numa chamada (modo padrão = ranked + unranked, os pubs), mais recentes primeiro.
// Resposta 200 ou 404 (nenhuma partida) é definitiva; qualquer outra (limite, erro, rede) deixa tudo como estava para tentar no próximo ciclo.
// shortcut: guarda só as 100 partidas mais recentes por jogador, subir PUB_HISTORY_LIMIT se o histórico completo importar
async function syncPubs(env: Env, ids: number[], budget: Budget): Promise<void> {
  const idsJson = JSON.stringify(ids);
  const { status, data } = await dlGet<RawMeta[]>(env, `/v1/matches/metadata?account_ids=${ids.join(",")}&min_unix_timestamp=${nowS() - PUB_LOOKBACK_S}`
    + `&include_info=true&include_player_info=true&include_player_kda=true&only_filtered_players=true&order_by=start_time&order_direction=desc&limit=${PUB_LIMIT}`, budget);
  if (status !== 200 && status !== 404) return;
  const wanted = new Set(ids);
  const rows = (Array.isArray(data) ? data : []).filter((m) => Number.isInteger(m.match_id)).flatMap((m) => {
    const info = toInfo(m);
    return info.players.filter((p) => wanted.has(p.account_id)).map((p) => ({
      a: p.account_id, m: m.match_id, h: num(p.hero_id, 0), s: num(info.start_time, 0), d: num(info.duration_s, 0),
      k: num(p.kills, 0), de: num(p.deaths, 0), as: num(p.assists, 0), nw: num(p.net_worth, 0), w: p.team === info.winning_team ? 1 : 0,
    }));
  });
  await env.DB.batch([
    env.DB.prepare(INSERT_MATCH_JSON + "ON CONFLICT(account_id, match_id) DO NOTHING").bind(JSON.stringify(rows)),
    env.DB.prepare(
      `DELETE FROM player_matches WHERE rowid IN (SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY start_time DESC) AS n
         FROM player_matches WHERE source = 'pub' AND account_id IN (SELECT value FROM json_each(?))) WHERE n > ?)`,
    ).bind(idsJson, PUB_HISTORY_LIMIT),
  ]);
}

async function edlText(env: Env, path: string, budget = newBudget()): Promise<string | null> {
  const r = await outFetch(env, EDL + path, "edl.gg", budget);
  try { return r?.ok ? await r.text() : null; } catch { return null; }
}

const uniq = (html: string, re: RegExp) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];

// Liga as partidas EDL já lidas a todos os jogadores cadastrados, só com SQL (sem fetch).
const linkEdl = (env: Env) => env.DB.prepare(
  `INSERT INTO player_matches (account_id, match_id, source, event, series, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won)
   SELECT p.value ->> 'a', m.match_id, 'edl', m.event, m.series, p.value ->> 'h', m.info_json ->> 'start', m.info_json ->> 'dur',
     p.value ->> 'k', p.value ->> 'd', p.value ->> 'as', p.value ->> 'nw', (p.value ->> 't') = (m.info_json ->> 'win')
   FROM edl_matches m, json_each(m.info_json, '$.players') p
   WHERE m.info_json IS NOT NULL AND (p.value ->> 'a') IN (SELECT account_id FROM players WHERE account_id IS NOT NULL)
   ON CONFLICT(account_id, match_id) DO UPDATE SET source = excluded.source, event = excluded.event, series = excluded.series`,
).run();

const text = (s: string) => { try { return JSON.parse(`"${s}"`) as string; } catch { return s; } };
const STR = String.raw`"((?:[^"\\]|\\.)*)"`;

// Lê os dois times do cabeçalho da série (teamOne/teamTwo = {slug,name,...}) e o número e o id de cada jogo.
function parseSeries(html: string) {
  const team = (k: string) => html.match(new RegExp(String.raw`${k}:\$R\[\d+\]=\{slug:"[\w-]+",name:${STR}`))?.[1];
  const games = [...html.matchAll(/matchNumber:(\d+),[^{}]{0,120}?deadlockMatchId:(\d+)/g)].map((g) => ({ game: Number(g[1]), matchId: Number(g[2]) }));
  const [one, two] = [team("teamOne"), team("teamTwo")];
  return { teams: one && two ? `${text(one)} vs ${text(two)}` : null, games };
}

// Baixa uma série e grava os jogos; false = página indisponível (tenta de novo depois).
async function scanSeries(env: Env, event: string, series: string, budget: Budget): Promise<boolean> {
  const html = await edlText(env, `/events/${event}/series/${series}`, budget);
  if (!html) return false;
  const { teams, games } = parseSeries(html);
  await env.DB.batch([
    ...games.map((g) => env.DB.prepare(
      `INSERT INTO edl_matches (match_id, event, series, game, teams) VALUES (?,?,?,?,?)
       ON CONFLICT(match_id) DO UPDATE SET game = excluded.game, teams = excluded.teams, event = excluded.event, series = excluded.series`,
    ).bind(g.matchId, event, series, g.game, teams)),
    env.DB.prepare("INSERT OR IGNORE INTO edl_scanned (key) VALUES (?)").bind(`${event}/${series}`),
  ]);
  return true;
}

// Grava o resumo dos 12 jogadores (info_json); partida que a API não conhece fica done sem info.
// Lê no máximo BULK_CALLS lotes de BULK_IDS ids, um de cada vez; resposta que não seja 200/404 deixa o resto para a próxima.
async function readMatches(env: Env, ids: number[], budget: Budget): Promise<void> {
  for (let i = 0; i < BULK_CALLS * BULK_IDS && i < ids.length; i += BULK_IDS) {
    const chunk = ids.slice(i, i + BULK_IDS);
    const { status, infos } = await metadata(env, chunk, budget);
    if (status !== 200 && status !== 404) return;
    await env.DB.batch(chunk.map((id) => {
      const info = infos.get(id);
      const summary = info && {
        start: info.start_time, dur: info.duration_s, win: info.winning_team,
        players: info.players.map((p) => ({ a: p.account_id, t: p.team, h: p.hero_id, k: p.kills, d: p.deaths, as: p.assists, nw: p.net_worth })),
      };
      return env.DB.prepare("UPDATE edl_matches SET done = 1, info_json = ? WHERE match_id = ?").bind(summary ? JSON.stringify(summary) : null, id);
    }));
  }
}

// shortcut: lê o HTML serializado do edl.gg, trocar se o EDL publicar API.
// Só vê os 20 eventos mais recentes da lista (a paginação é carregada por JS) e gasta no máximo o orçamento da execução;
// o backlog é consumido aos poucos a cada lote.
// Descobre eventos e séries novos reservando `reserve` subrequests para a leitura de metadata; true = chegou ao fim da lista.
async function discoverEdl(env: Env, budget: Budget, reserve: number): Promise<boolean> {
  if (budget.left <= reserve) return false;
  const list = await edlText(env, "/events", budget);
  if (!list) return false;
  const scanned = new Set((await env.DB.prepare("SELECT key FROM edl_scanned").all<{ key: string }>()).results.map((r) => r.key));
  for (const event of uniq(list, /slug:"([\w-]+)",status:"completed"/g).filter((e) => !scanned.has(e))) {
    if (budget.left <= reserve) return false;
    const page = await edlText(env, `/events/${event}`, budget);
    if (!page) continue;
    let complete = true;
    for (const series of uniq(page, new RegExp(`href:"/events/${event}/series/([\\w-]+)"`, "g")).filter((s) => !scanned.has(`${event}/${s}`))) {
      if (budget.left <= reserve) return false;
      if (!(await scanSeries(env, event, series, budget))) complete = false;
    }
    if (complete) await env.DB.prepare("INSERT OR IGNORE INTO edl_scanned (key) VALUES (?)").bind(event).run();
  }
  return true;
}

// Descoberta, leitura do metadata pendente em lote e vínculo com os jogadores cadastrados; devolve se a descoberta terminou.
async function syncEdl(env: Env, budget: Budget): Promise<boolean> {
  const discovered = await discoverEdl(env, budget, BULK_CALLS);
  const pending = await env.DB.prepare("SELECT match_id FROM edl_matches WHERE done = 0 ORDER BY match_id DESC LIMIT ?").bind(BULK_CALLS * BULK_IDS).all<{ match_id: number }>();
  await readMatches(env, pending.results.map((m) => m.match_id), budget);
  await linkEdl(env);
  return discovered;
}

async function edlMatches(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT match_id, event, series, game, teams, info_json ->> 'start' AS start FROM edl_matches ORDER BY match_id DESC LIMIT 300",
  ).all<{ match_id: number; event: string; series: string; game: number | null; teams: string | null; start: number | null }>();
  return Response.json(rows.results.map((r): EdlMatch => ({
    matchId: r.match_id, event: r.event, series: r.series,
    ...(r.game ? { game: r.game } : {}), ...(r.teams ? { teams: r.teams } : {}), ...(r.start ? { startTime: r.start } : {}),
  })));
}

type CardRow = { id: string; team_id: string; name: string; account_id: number | null; extra_json: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Versões do mesmo jogador são cartas separadas (variantOf ou só o mesmo nome); o backfill copia o account da carta de origem para elas, sempre manual.
// shortcut: lê todas as outras cartas e filtra em JS, trocar por SQL se o número de cartas passar de alguns milhares
async function backfillCandidates(env: Env, id: string): Promise<{ accountId: number; list: BackfillCandidate[] } | Response> {
  const src = await env.DB.prepare("SELECT name, account_id FROM players WHERE id = ?").bind(id).first<{ name: string; account_id: number | null }>();
  if (!src) return bad("carta não encontrada", 404);
  if (!src.account_id) return bad("vincule e salve o perfil antes", 409);
  const rows = (await env.DB.prepare("SELECT id, team_id, name, account_id, extra_json FROM players WHERE id != ?").bind(id).all<CardRow>()).results;
  const list = rows.flatMap((r): BackfillCandidate[] => {
    const extra = parse<{ variantOf?: string; inactive?: boolean }>(r.extra_json, {});
    const by = extra.variantOf === id ? "variant" : norm(r.name) === norm(src.name) ? "name" : null;
    if (!by || r.account_id === src.account_id) return [];
    return [{ playerId: r.id, name: r.name, teamId: r.team_id, ...(extra.inactive ? { inactive: true } : {}), ...(r.account_id ? { accountId: r.account_id } : {}), by }];
  });
  return { accountId: src.account_id, list };
}

async function backfillApply(env: Env, request: Request, id: string): Promise<Response> {
  const b = (await request.json().catch(() => null)) as { playerIds?: unknown } | null;
  const ids = b?.playerIds;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((i) => typeof i !== "string" || !ID_RE.test(i))) return bad("playerIds inválido");
  const found = await backfillCandidates(env, id);
  if (found instanceof Response) return found;
  const byId = new Map(found.list.map((c) => [c.playerId, c]));
  const result: BackfillResult = { updated: [], skipped: [] };
  const stmts: D1PreparedStatement[] = [];
  for (const pid of new Set(ids as string[])) {
    const c = byId.get(pid);
    if (!c) result.skipped.push({ item: pid, reason: "não é outra carta deste jogador ou já tem essa conta" });
    else if (c.accountId) result.skipped.push({ item: pid, reason: "carta já vinculada a outra conta" });
    else {
      result.updated.push(pid);
      stmts.push(env.DB.prepare("UPDATE players SET account_id = ? WHERE id = ? AND account_id IS NULL").bind(found.accountId, pid));
    }
  }
  if (stmts.length) { await env.DB.batch(stmts); await linkEdl(env); }
  return Response.json(result);
}

async function accountOf(env: Env, id: string): Promise<number | null> {
  const p = await env.DB.prepare("SELECT account_id, extra_json FROM players WHERE id = ?").bind(id).first<{ account_id: number | null; extra_json: string }>();
  if (!p) return null;
  if (p.account_id) return p.account_id;
  const base = parse<{ variantOf?: string }>(p.extra_json, {}).variantOf;
  return base ? await env.DB.prepare("SELECT account_id FROM players WHERE id = ?").bind(base).first<number | null>("account_id") : null;
}

async function playerMatches(env: Env, id: string, source: string | null): Promise<Response> {
  if (source !== null && source !== "edl" && source !== "pub") return bad("source inválido");
  const accountId = await accountOf(env, id);
  if (!accountId) return Response.json([]);
  const rows = await env.DB.prepare(
    `SELECT match_id, source, event, series, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won FROM player_matches
     WHERE account_id = ?1 AND (?2 IS NULL OR source = ?2) ORDER BY start_time DESC LIMIT 50`,
  ).bind(accountId, source).all<Record<string, string | number | null>>();
  return Response.json(rows.results.map((r): PlayerMatch => ({
    matchId: r.match_id as number, source: r.source as PlayerMatch["source"],
    ...(r.event ? { event: r.event as string } : {}), ...(r.series ? { series: r.series as string } : {}),
    heroId: r.hero_id as number, startTime: r.start_time as number, durationS: r.duration_s as number,
    kills: r.kills as number, deaths: r.deaths as number, assists: r.assists as number, netWorth: r.net_worth as number, won: r.won === 1,
  })));
}

async function syncPlayer(env: Env, id: string): Promise<Response> {
  const accountId = await accountOf(env, id);
  if (!accountId) return bad("jogador sem account_id", 409);
  const before = await matchCount(env);
  const budget = newBudget();
  await syncPubs(env, [accountId], budget);
  await syncEdl(env, budget);
  return Response.json({ added: (await matchCount(env)) - before });
}

// Cron: pubs das contas vinculadas (até metade do orçamento, um lote de contas por chamada) e o EDL com o resto.
// shortcut: sem rodízio, as contas que passam do que cabe no orçamento só sincronizam pelo botão de cada jogador.
async function syncLinked(env: Env): Promise<void> {
  const budget = newBudget();
  const ids = (await env.DB.prepare("SELECT DISTINCT account_id FROM players WHERE account_id IS NOT NULL ORDER BY account_id").all<{ account_id: number }>()).results.map((r) => r.account_id);
  for (let i = 0; i < ids.length && budget.left > SUBREQUESTS / 2; i += PUB_ACCOUNTS) await syncPubs(env, ids.slice(i, i + PUB_ACCOUNTS), budget);
  await syncEdl(env, budget);
}

async function appData(env: Env): Promise<Response> {
  const [teams, players, heroes, settings] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM teams ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM players ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM heroes"),
    env.DB.prepare("SELECT * FROM settings"),
  ]);
  const s = Object.fromEntries((settings.results as { key: string; value_json: string }[]).map((r) => [r.key, parse<unknown>(r.value_json, null)]));
  const bg = s.bg as Record<string, unknown> | null;
  return Response.json({
    teams: (teams.results as Record<string, string | null>[]).map((t) => {
      const tbg = parse<Record<string, unknown> | null>(t.bg_json, null);
      return { id: t.id, name: t.name, tag: t.tag, region: t.region, logo: imgUrl(t.logo_key), ...(tbg ? { bg: tbg } : {}) };
    }),
    players: (players.results as Record<string, string | number | null>[]).map((p) => ({
      ...parse(p.extra_json as string, {}),
      id: p.id, teamId: p.team_id, name: p.name, position: p.position, hero: p.hero,
      ...(p.account_id !== null ? { accountId: p.account_id } : {}),
      stats: parse(p.stats_json as string, {}), ...(p.ovr !== null ? { ovr: p.ovr } : {}),
      c1: p.c1, c2: p.c2, history: parse(p.history_json as string, []),
    })),
    heroes: Object.fromEntries((heroes.results as { name: string; image_key: string; zoom: number; x: number; y: number }[])
      .map((h) => [h.name, { name: h.name, url: imgUrl(h.image_key), zoom: h.zoom, x: h.x, y: h.y }])),
    settings: {
      tierConfig: s.tierConfig ?? undefined,
      bg: bg ? { ...bg, imageUrl: imgUrl((s.bgImageKey as string) ?? null) } : undefined,
      homeHero: imgUrl((s.homeHeroKey as string) ?? null),
    },
  });
}

async function serveImage(env: Env, key: string): Promise<Response> {
  const obj = await env.ASSETS_BUCKET.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}

async function upload(env: Env, request: Request, folder: string): Promise<Response> {
  const ext = IMAGE_TYPES[request.headers.get("content-type") ?? ""];
  if (!ext) return bad("tipo de imagem não suportado");
  if (!UPLOAD_FOLDERS.includes(folder)) return bad("pasta inválida");
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_UPLOAD_BYTES) return bad("imagem vazia ou maior que 8 MB");
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await env.ASSETS_BUCKET.put(key, body, { httpMetadata: { contentType: request.headers.get("content-type")! } });
  return Response.json({ url: `/img/${key}` });
}

// shortcut: replaced or deleted images stay in R2, add a sweep if the bucket grows
async function write(env: Env, request: Request, kind: string, id: string): Promise<Response> {
  const del = request.method === "DELETE";
  if (!del && request.method !== "PUT") return bad("método não suportado", 405);
  const b = del ? {} : ((await request.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  const db = env.DB;
  if (del && (kind === "players" || kind === "teams")) {
    const col = kind === "players" ? "id" : "team_id";
    const owned = await db.prepare(`SELECT 1 FROM user_cards uc JOIN players p ON p.id = uc.player_id WHERE p.${col} = ? LIMIT 1`).bind(id).first();
    if (owned) return bad("há cartas resgatadas por usuários; marque como inativo em vez de apagar", 409);
  }
  if (kind === "players") {
    if (del) await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
    else {
      if (!b.name || !b.teamId || !b.stats) return bad("jogador incompleto");
      const accountId = b.accountId ?? null;
      if (accountId !== null && !(typeof accountId === "number" && Number.isInteger(accountId) && accountId > 0 && accountId < 2 ** 32)) return bad("accountId inválido");
      const extra = Object.fromEntries(PLAYER_EXTRA.filter((k) => b[k] !== undefined && b[k] !== null).map((k) => [k, b[k]]));
      await db.prepare(
        "INSERT INTO players (id, team_id, name, position, hero, stats_json, ovr, c1, c2, history_json, extra_json, account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, position=excluded.position, hero=excluded.hero, stats_json=excluded.stats_json, ovr=excluded.ovr, c1=excluded.c1, c2=excluded.c2, history_json=excluded.history_json, extra_json=excluded.extra_json, account_id=excluded.account_id",
      ).bind(id, b.teamId, b.name, b.position ?? "Flex", b.hero ?? "Abrams", JSON.stringify(b.stats), typeof b.ovr === "number" && Number.isFinite(b.ovr) ? Math.round(b.ovr) : null,
        b.c1 ?? "#0e7490", b.c2 ?? "#082f49", JSON.stringify(b.history ?? []), JSON.stringify(extra), accountId).run();
    }
  } else if (kind === "teams") {
    if (del) await db.batch([db.prepare("DELETE FROM players WHERE team_id = ?").bind(id), db.prepare("DELETE FROM teams WHERE id = ?").bind(id)]);
    else {
      if (!b.name || !b.tag) return bad("time incompleto");
      await db.prepare(
        "INSERT INTO teams (id, name, tag, region, logo_key, bg_json) VALUES (?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, tag=excluded.tag, region=excluded.region, logo_key=excluded.logo_key, bg_json=excluded.bg_json",
      ).bind(id, b.name, b.tag, b.region ?? "Europa", keyOf(b.logo), b.bg ? JSON.stringify(b.bg) : null).run();
    }
  } else if (kind === "heroes") {
    if (del) await db.prepare("DELETE FROM heroes WHERE name = ?").bind(id).run();
    else {
      const key = keyOf(b.url);
      if (!key) return bad("imagem do herói obrigatória");
      await db.prepare("INSERT INTO heroes (name, image_key, zoom, x, y) VALUES (?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET image_key=excluded.image_key, zoom=excluded.zoom, x=excluded.x, y=excluded.y")
        .bind(id, key, num(b.zoom, 100), num(b.x, 50), num(b.y, 30)).run();
    }
  } else if (kind === "settings" && !del) {
    const rows: Record<string, unknown> = {};
    if (b.tierConfig !== undefined) rows.tierConfig = b.tierConfig;
    if (b.bg !== undefined) { const bg = b.bg as Record<string, unknown> | null; rows.bg = bg ? { ...bg, imageUrl: "" } : null; rows.bgImageKey = keyOf(bg?.imageUrl); }
    if (b.homeHero !== undefined) rows.homeHeroKey = keyOf(b.homeHero);
    await db.batch(Object.entries(rows).map(([k, v]) => db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").bind(k, JSON.stringify(v))));
  } else return bad("rota inválida", 404);
  return Response.json({ ok: true });
}

// shortcut: sem limite de tentativas; o mínimo de 8 caracteres torna o chute inviável, adicionar rate limit se aparecer abuso
const CODE_VALID = "uses < max_uses AND (starts_at IS NULL OR starts_at <= unixepoch()) AND (expires_at IS NULL OR expires_at > unixepoch())";
const INVALID_CODE = "código inválido, expirado ou esgotado";

async function redeem(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return bad("entre para resgatar", 401, "login");
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return bad("código vazio", 400, "empty");
  const row = await env.DB.prepare(`SELECT player_id FROM redeem_codes WHERE code = ? AND ${CODE_VALID}`).bind(code).first<{ player_id: string }>();
  if (!row) return bad(INVALID_CODE, 404, "invalid");
  try {
    const [, consume] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO user_cards (user_id, player_id) SELECT ?, player_id FROM redeem_codes WHERE code = ? AND ${CODE_VALID}`).bind(user.id, code),
      env.DB.prepare(`UPDATE redeem_codes SET uses = uses + 1 WHERE code = ? AND ${CODE_VALID}`).bind(code),
    ]);
    if (!consume.meta.changes) return bad(INVALID_CODE, 404, "invalid");
  } catch (e) {
    if (String(e).includes("UNIQUE")) return bad("essa carta já está na sua coleção", 409, "owned");
    throw e;
  }
  return Response.json({ playerId: row.player_id });
}

const timestamp = (v: unknown) => (v == null ? null : Number.isInteger(v) ? (v as number) : undefined);

async function codes(env: Env, request: Request, rest: string): Promise<Response> {
  if (request.method === "GET" && !rest) {
    const rows = await env.DB.prepare("SELECT code, player_id, max_uses, uses, starts_at, expires_at FROM redeem_codes ORDER BY code").all();
    return Response.json(rows.results);
  }
  if (request.method === "POST" && !rest) {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
    const maxUses = typeof b.maxUses === "number" && Number.isInteger(b.maxUses) && b.maxUses >= 1 ? b.maxUses : 0;
    const startsAt = timestamp(b.startsAt);
    const expiresAt = timestamp(b.expiresAt);
    if (!/^[A-Z0-9-]{8,64}$/.test(code)) return bad("código deve ter de 8 a 64 letras, números ou hífen");
    if (!maxUses) return bad("máximo de usos inválido");
    if (typeof b.playerId !== "string" || !b.playerId) return bad("escolha o jogador");
    if (startsAt === undefined || expiresAt === undefined) return bad("data inválida");
    if (startsAt !== null && expiresAt !== null && expiresAt <= startsAt) return bad("a expiração deve ser depois do início");
    try {
      await env.DB.prepare("INSERT INTO redeem_codes (code, player_id, max_uses, starts_at, expires_at) VALUES (?,?,?,?,?)")
        .bind(code, b.playerId, maxUses, startsAt, expiresAt).run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) return bad("esse código já existe", 409);
      if (String(e).includes("FOREIGN")) return bad("jogador não existe", 404);
      throw e;
    }
    return Response.json({ ok: true });
  }
  if (request.method === "DELETE" && rest) {
    await env.DB.prepare("DELETE FROM redeem_codes WHERE code = ?").bind(decodeURIComponent(rest)).run();
    return Response.json({ ok: true });
  }
  return bad("rota inválida", 404);
}

const FEEDBACK_KINDS = { bug: "Bug", idea: "Ideia" } as const;
const FEEDBACK_GAP_SECONDS = 60;

async function feedback(env: Env, request: Request): Promise<Response> {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (b?.website) return Response.json({ ok: true });
  const kind = b?.kind === "bug" || b?.kind === "idea" ? b.kind : null;
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  const nick = typeof b?.nick === "string" ? b.nick.trim().slice(0, 40) : "";
  if (!kind) return bad("tipo inválido");
  if (title.length < 5 || title.length > 100) return bad("título deve ter de 5 a 100 caracteres");
  if (message.length < 10 || message.length > 3000) return bad("mensagem deve ter de 10 a 3000 caracteres");
  // shortcut: limite por IP reaproveitando api_cache, trocar por Rate Limiting binding se houver spam
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = `feedback:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const last = await env.DB.prepare("SELECT fetched_at FROM api_cache WHERE cache_key = ?").bind(key).first<number>("fetched_at");
  if (last && now - last < FEEDBACK_GAP_SECONDS) return bad("aguarde um minuto antes de enviar de novo", 429);
  const noPing = (t: string) => t.replace(/@/g, "@​");
  const body = `${noPing(message)}

---
Enviado pelo site por **${nick ? noPing(nick) : "anônimo"}**.`;
  const r = await fetch("https://api.github.com/repos/hagizao/deadcards/issues", {
    method: "POST",
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "deadcards-site" },
    body: JSON.stringify({ title: `[${FEEDBACK_KINDS[kind]}] ${noPing(title)}`, body }),
  });
  if (!r.ok) return bad("não foi possível enviar agora, tente mais tarde", 502);
  await env.DB.prepare(UPSERT_CACHE).bind(key, "", now).run();
  const issue = (await r.json()) as { html_url: string };
  return Response.json({ url: issue.html_url });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return createAuth(env, request).handler(request);
    if (url.pathname === "/api/me") {
      const user = await currentUser(env, request);
      if (!user) return Response.json(null);
      const providers = await env.DB.prepare(`SELECT DISTINCT "providerId" AS p FROM "account" WHERE "userId" = ?`).bind(user.id).all<{ p: string }>();
      return Response.json({ ...user, handle: await handleOf(env, user.id), providers: providers.results.map((r) => r.p) });
    }
    if (url.pathname.startsWith("/api/account/link/")) return accountLink(env, request, url.pathname.slice("/api/account/link/".length));
    if (url.pathname === PROFILE_CARD_PATH) return profileCard(env, request);
    const fav = url.pathname.match(/^\/api\/favorites\/([^/]+)$/);
    if (fav) {
      let id = "";
      try { id = decodeURIComponent(fav[1]); } catch { /* malformed escape: no card has this id */ }
      return favorite(env, request, id);
    }
    const profileUser = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (profileUser && request.method === "GET") {
      let key = "";
      try { key = decodeURIComponent(profileUser[1]); } catch { /* malformed escape: treat as not found */ }
      return publicProfile(env, key);
    }
    if (url.pathname === "/api/codes" || url.pathname.startsWith("/api/codes/")) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      return codes(env, request, url.pathname.slice("/api/codes/".length));
    }
    if (url.pathname === "/api/feedback") return request.method === "POST" ? feedback(env, request) : bad("método não suportado", 405);
    if (url.pathname === "/api/redeem") return request.method === "POST" ? redeem(env, request) : bad("método não suportado", 405);
    if (url.pathname === "/api/collection") {
      const user = await currentUser(env, request);
      if (!user) return Response.json([]);
      const rows = await env.DB.prepare("SELECT player_id FROM user_cards WHERE user_id = ?").bind(user.id).all<{ player_id: string }>();
      return Response.json(rows.results.map((r) => r.player_id));
    }
    const sub = url.pathname.match(/^\/api\/players\/([^/]+)\/(matches|sync|backfill)$/);
    if (sub) {
      const id = decodeURIComponent(sub[1]);
      if (!ID_RE.test(id)) return bad("id inválido");
      if (sub[2] === "matches") return request.method === "GET" ? playerMatches(env, id, url.searchParams.get("source")) : bad("método não suportado", 405);
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      if (sub[2] === "backfill") {
        if (request.method === "POST") return backfillApply(env, request, id);
        if (request.method !== "GET") return bad("método não suportado", 405);
        const found = await backfillCandidates(env, id);
        return found instanceof Response ? found : Response.json(found.list);
      }
      return request.method === "POST" ? syncPlayer(env, id) : bad("método não suportado", 405);
    }
    if (url.pathname === "/api/edl/matches" || url.pathname === "/api/edl/refresh") {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      if (url.pathname.endsWith("/matches")) return request.method === "GET" ? edlMatches(env) : bad("método não suportado", 405);
      if (request.method !== "POST") return bad("método não suportado", 405);
      await syncEdl(env, newBudget());
      return Response.json({ total: (await env.DB.prepare("SELECT COUNT(*) AS n FROM edl_matches").first<number>("n")) ?? 0 });
    }
    const lookup = url.pathname.match(/^\/api\/match-lookup\/([^/]+)$/);
    if (lookup) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      return /^\d{1,12}$/.test(lookup[1]) ? matchLookup(env, lookup[1]) : bad("id da partida inválido");
    }
    const admin = url.pathname.match(/^\/api\/(players|teams|heroes|settings|upload)\/([^/]+)$/);
    if (admin) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      const id = decodeURIComponent(admin[2]);
      if (admin[1] === "upload") return request.method === "POST" ? upload(env, request, id) : bad("método não suportado", 405);
      if (admin[1] !== "heroes" && !ID_RE.test(id)) return bad("id inválido");
      return write(env, request, admin[1], id);
    }
    // Só o país (cf.country), para sugerir o idioma na primeira visita; nada é guardado.
    if (url.pathname === "/api/locale") return Response.json({ country: request.cf?.country ?? null }, { headers: { "cache-control": "private, no-store" } });
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    if (url.pathname === "/api/data") return appData(env);
    if (url.pathname === "/api/deadlock") {
      const path = url.searchParams.get("path") ?? "";
      if (!ALLOWED_PATHS.includes(path)) return Response.json({ error: "path not allowed" }, { status: 400 });
      return cachedFetch(env, path);
    }
    if (url.pathname.startsWith("/img/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) return new Response("bad key", { status: 400 });
      return serveImage(env, key);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncFromDeadlockApi(env).then(() => syncLinked(env)));
    ctx.waitUntil(env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'feedback:%' AND fetched_at < unixepoch() - ?").bind(FEEDBACK_GAP_SECONDS).run());
  },
} satisfies ExportedHandler<Env>;
