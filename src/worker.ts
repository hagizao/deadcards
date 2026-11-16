/// <reference types="@cloudflare/workers-types" />
import { createAuth, currentUser } from "./auth";
import { favorite, profileCard, publicProfile } from "./profile";
import { handleOf } from "./handles";
import { accountLink } from "./link";
import { PROFILE_CARD_PATH } from "./lib/profile";
import type { BackfillCandidate, BackfillResult, EdlImportPreview, EdlImportResult, EdlMatch, EdlRosterEntry, EdlTeam, EdlTeamField, EdlTeamSeries, MatchLookup, MatchLookupPlayer, PlayerMatch } from "./lib/types";

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

// Lê os dois times do cabeçalho da série (teamOne/teamTwo = {slug,name,tag,logo,...}; tag pode ser null) e, por jogo, o vencedor e quem jogou com qual herói.
// Só vale o bloco de cada jogo: no bloco "overall" o heroId é null.
function parseSeries(html: string) {
  const team = (k: string) => {
    const m = html.match(new RegExp(String.raw`${k}:\$R\[\d+\]=\{slug:"([\w-]+)",name:${STR},tag:(?:${STR}|null|void 0)(?:,logo:"([^"]*)")?`));
    return m && { slug: m[1], name: text(m[2]), tag: m[3] === undefined ? null : text(m[3]), logo: m[4] ?? null };
  };
  const games = html.split(/(?=matchNumber:\d+,)/).slice(1).flatMap((g) => {
    const head = g.match(/^matchNumber:(\d+),[^{}]{0,120}?deadlockMatchId:(\d+)/);
    if (!head) return [];
    const players = [...g.matchAll(new RegExp(String.raw`playerSlug:"([\w-]+)",playerAlias:${STR},[^{}]*?teamSlug:"([\w-]+)",team:\$R\[\d+\](?:=\{[^{}]*\})?,heroId:(\d+)`, "g"))]
      .map((p) => ({ slug: p[1], alias: text(p[2]), team: p[3], hero: Number(p[4]) }));
    return [{ game: Number(head[1]), matchId: Number(head[2]), winner: g.match(/^matchNumber:\d+,[^{}]{0,200}?winnerSlug:"([\w-]+)"/)?.[1] ?? null, players }];
  });
  return { one: team("teamOne"), two: team("teamTwo"), games };
}

// Baixa uma série e grava jogos, quem jogou e os times; false = página indisponível (tenta de novo depois).
async function scanSeries(env: Env, event: string, series: string, budget: Budget): Promise<boolean> {
  const html = await edlText(env, `/events/${event}/series/${series}`, budget);
  if (!html) return false;
  const { one, two, games } = parseSeries(html);
  await env.DB.batch([
    ...[one, two].flatMap((t) => (t ? [env.DB.prepare(
      "INSERT INTO edl_teams (slug, name, tag, logo_url) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name, tag = excluded.tag, logo_url = excluded.logo_url",
    ).bind(t.slug, t.name, t.tag, t.logo)] : [])),
    ...games.flatMap((g) => [
      env.DB.prepare(
        `INSERT INTO edl_matches (match_id, event, series, game, teams, team1_slug, team2_slug, winner_slug) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(match_id) DO UPDATE SET game = excluded.game, teams = excluded.teams, event = excluded.event, series = excluded.series,
           team1_slug = excluded.team1_slug, team2_slug = excluded.team2_slug, winner_slug = excluded.winner_slug`,
      ).bind(g.matchId, event, series, g.game, one && two ? `${one.name} vs ${two.name}` : null, one?.slug ?? null, two?.slug ?? null, g.winner),
      ...g.players.map((p) => env.DB.prepare(
        `INSERT INTO edl_match_players (match_id, player_slug, alias, team_slug, hero_id) VALUES (?,?,?,?,?)
         ON CONFLICT(match_id, player_slug) DO UPDATE SET alias = excluded.alias, team_slug = excluded.team_slug, hero_id = excluded.hero_id`,
      ).bind(g.matchId, p.slug, p.alias, p.team, p.hero)),
    ]),
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

// Região do EDL (EU/NA/SA/APAC) -> REGIONS do site. O EDL não tem "Brasil": times do Brasil vêm como SA com countryCode BR.
const EDL_REGIONS: Record<string, string> = { EU: "Europa", NA: "América do Norte", SA: "América do Sul", APAC: "Ásia" };
const edlRegion = (region?: string, country?: string) => (country === "BR" ? "Brasil" : region ? EDL_REGIONS[region] : undefined);

// Os campos de cada time da masterlist vêm numa linha só: team:$R[23]={tag:"LEV",name:"Leviathan",slug:"leviathan",region:"EU",logoUrl:"...",countryCode:"RU",...}
function parseTeams(html: string): EdlTeam[] {
  const prop = (o: string, k: string) => { const m = o.match(new RegExp(String.raw`(?:^|,)${k}:${STR}`)); return m ? text(m[1]) : undefined; };
  const teams = new Map<string, EdlTeam>();
  for (const m of html.matchAll(/team:\$R\[\d+\]=\{([^{}]*\bregion:"[^{}]*)\}/g)) {
    const slug = prop(m[1], "slug"), name = prop(m[1], "name");
    if (!slug || !name || !/^[\w-]+$/.test(slug)) continue;
    const country = prop(m[1], "countryCode");
    teams.set(slug, { slug, name, tag: prop(m[1], "tag"), region: edlRegion(prop(m[1], "region"), country), countryCode: country, logoUrl: prop(m[1], "logoUrl") });
  }
  return [...teams.values()];
}

// A masterlist vem inteira numa página só (total:33); cacheada como a deadlock-api, com a cópia velha de reserva se o EDL cair.
async function edlTeams(env: Env): Promise<EdlTeam[] | null> {
  const row = await env.DB.prepare("SELECT body, fetched_at FROM api_cache WHERE cache_key = 'edl-teams'").first<{ body: string; fetched_at: number }>();
  const now = Math.floor(Date.now() / 1000);
  if (row && now - row.fetched_at < CACHE_TTL_SECONDS) return parse<EdlTeam[]>(row.body, []);
  const html = await edlText(env, "/teams");
  const teams = html ? parseTeams(html) : [];
  if (!teams.length) return row ? parse<EdlTeam[]>(row.body, []) : null;
  await env.DB.prepare(UPSERT_CACHE).bind("edl-teams", JSON.stringify(teams), now).run();
  return teams;
}

async function edlTeamList(env: Env, q: string): Promise<Response> {
  const teams = await edlTeams(env);
  if (!teams) return bad("edl.gg indisponível, tente de novo", 502);
  const needle = q.trim().toLowerCase();
  return Response.json(needle ? teams.filter((t) => [t.name, t.tag, t.slug].some((v) => v?.toLowerCase().includes(needle))) : teams);
}

// Elenco (só role "player"; outros papéis, como coach, ficam de fora) e links das séries do time: {href:"/players/cakef",role:"player",slug:"cakef",alias:"Cakef",...,countryCode:"CN",...}
async function edlTeamPage(env: Env, slug: string) {
  const html = await edlText(env, `/teams/${slug}`);
  if (!html) return null;
  const roster = new Map<string, { alias: string; countryCode?: string }>();
  for (const m of html.matchAll(new RegExp(String.raw`role:"player",slug:"([\w-]+)",alias:${STR}(?:,[^{}]*?countryCode:"([A-Z]{2,3})")?`, "g"))) {
    roster.set(m[1], { alias: text(m[2]), countryCode: m[3] });
  }
  // href:"/events/<evento>/series/<série>"; as variantes "?match=match-1" são ignoradas
  const series = [...new Set([...html.matchAll(/\/events\/([\w-]+)\/series\/([\w-]+)"/g)].map((m) => `${m[1]}/${m[2]}`))];
  return { roster, series };
}

type CardRow = { id: string; team_id: string; name: string; account_id: number | null; extra_json: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Cruza o elenco do EDL com o que já está no D1: account_id (via partida + herói), heróis mais jogados e carta existente.
async function edlRoster(env: Env, teamId: string, slug: string, roster: Map<string, { alias: string; countryCode?: string }>, hint: string): Promise<EdlRosterEntry[]> {
  // (partida, herói) -> account_id: só vale quando o herói aparece uma vez na partida; a conta mais frequente por jogador vence
  const [accRows, heroRows] = await env.DB.batch([
    env.DB.prepare(
      `SELECT mp.player_slug AS slug, p.value ->> 'a' AS account, COUNT(*) AS n
       FROM edl_match_players mp JOIN edl_matches m ON m.match_id = mp.match_id AND m.info_json IS NOT NULL, json_each(m.info_json, '$.players') p
       WHERE mp.team_slug = ?1 AND (p.value ->> 'h') = mp.hero_id
         AND (SELECT COUNT(*) FROM json_each(m.info_json, '$.players') q WHERE (q.value ->> 'h') = mp.hero_id) = 1
       GROUP BY slug, account ORDER BY n DESC`).bind(slug),
    env.DB.prepare("SELECT player_slug AS slug, hero_id AS hero, COUNT(*) AS n FROM edl_match_players WHERE team_slug = ? GROUP BY slug, hero ORDER BY n DESC").bind(slug),
  ]);
  const accounts = new Map<string, { id: number; n: number }[]>();
  for (const r of accRows.results as { slug: string; account: number; n: number }[]) accounts.set(r.slug, [...(accounts.get(r.slug) ?? []), { id: r.account, n: r.n }]);
  const heroes = new Map<string, number[]>();
  const played = new Set<string>();
  for (const r of heroRows.results as { slug: string; hero: number }[]) { heroes.set(r.slug, [...(heroes.get(r.slug) ?? []), r.hero]); played.add(r.slug); }

  const resolved = new Map<string, number | "ambiguous">();
  for (const [s, list] of accounts) resolved.set(s, list.length > 1 && list[0].n === list[1].n ? "ambiguous" : list[0].id);
  const ids = [...resolved.values()].filter((v): v is number => v !== "ambiguous");
  // só cartas base; variantes herdam o account da carta base
  const cards = (await env.DB.prepare(
    "SELECT id, team_id, name, account_id, extra_json FROM players WHERE (extra_json ->> '$.variantOf') IS NULL AND (team_id = ?1 OR account_id IN (SELECT value FROM json_each(?2)))",
  ).bind(teamId, JSON.stringify(ids)).all<CardRow>()).results;

  const entries = [...roster].map(([s, r]): EdlRosterEntry => {
    const acc = resolved.get(s);
    const accountId = typeof acc === "number" ? acc : undefined;
    // o mesmo account pode estar em várias cartas quando são versões do mesmo jogador (mesmo nome); a do próprio time vem primeiro
    const byAccount = accountId ? cards.filter((c) => c.account_id === accountId).sort((x, y) => Number(y.team_id === teamId) - Number(x.team_id === teamId))[0] : undefined;
    const byName = cards.find((c) => c.team_id === teamId && norm(c.name) === norm(r.alias));
    const found = byName && (!byAccount || byName.account_id === accountId || norm(byAccount.name) === norm(byName.name)) ? byName : byAccount ?? byName;
    const entry: EdlRosterEntry = {
      slug: s, alias: r.alias, ...(r.countryCode ? { countryCode: r.countryCode } : {}), ...(accountId ? { accountId } : {}),
      heroIds: (heroes.get(s) ?? []).slice(0, 3), action: "create",
      ...(found ? { card: { playerId: found.id, name: found.name, teamId: found.team_id, ...(found.account_id ? { accountId: found.account_id } : {}), by: found === byAccount ? "account" as const : "name" as const } } : {}),
    };
    if (!accountId) {
      entry.action = "unresolved";
      entry.reason = acc === "ambiguous" ? "mais de uma conta empatada para este jogador"
        : hint || (played.has(s) ? "metadata das partidas indisponível na deadlock-api" : "sem partidas deste jogador com herói registrado no EDL");
    } else if (byName && byName.account_id === accountId) entry.action = "linked";
    else if (byName?.account_id) {
      // Troca de conta: carta ativa do time, mesmo nome, outro account, e o account novo não é de outro jogador.
      if (!parse<{ inactive?: boolean }>(byName.extra_json, {}).inactive && !cards.some((c) => c.account_id === accountId && norm(c.name) !== norm(byName.name))) {
        entry.action = "relink";
        entry.card = { playerId: byName.id, name: byName.name, teamId: byName.team_id, accountId: byName.account_id, by: "name" };
      } else {
        entry.action = "conflict";
        entry.reason = `a carta "${byName.name}" já está vinculada a outra conta (${byName.account_id})`;
      }
    } else if (byAccount && byName && norm(byAccount.name) !== norm(byName.name)) {
      entry.action = "conflict";
      entry.reason = `a conta já está na carta "${byAccount.name}" e o time tem outra carta chamada "${byName.name}"`;
    } else if (byName) entry.action = "link";
    else if (byAccount) entry.action = "linked";
    return entry;
  });
  const olds = entries.flatMap((e) => (e.action === "relink" ? [e.card!.accountId!] : []));
  if (olds.length) {
    const rows = (await env.DB.prepare("SELECT account_id, COUNT(*) AS n FROM player_matches WHERE account_id IN (SELECT value FROM json_each(?)) GROUP BY account_id")
      .bind(JSON.stringify(olds)).all<{ account_id: number; n: number }>()).results;
    for (const e of entries) if (e.action === "relink") e.oldMatches = rows.find((r) => r.account_id === e.card!.accountId)?.n ?? 0;
  }
  return entries;
}

// Cartas base ativas do time que não batem com ninguém do elenco do EDL, nem pelo account resolvido nem pelo nome.
// Sem elenco (leitura do EDL falhou) ninguém é considerado como tendo saído.
async function edlLeavers(env: Env, teamId: string, roster: EdlRosterEntry[]): Promise<CardRow[]> {
  if (!roster.length) return [];
  const accounts = new Set(roster.flatMap((r) => (r.accountId ? [r.accountId] : [])));
  const names = new Set(roster.map((r) => norm(r.alias)));
  const rows = (await env.DB.prepare("SELECT id, team_id, name, account_id, extra_json FROM players WHERE team_id = ?").bind(teamId).all<CardRow>()).results;
  return rows.filter((c) => {
    const x = parse<{ variantOf?: string; inactive?: boolean }>(c.extra_json, {});
    return !x.variantOf && !x.inactive && !(c.account_id && accounts.has(c.account_id)) && !names.has(norm(c.name));
  });
}

type TeamRow = { id: string; name: string; tag: string; region: string; logo_key: string | null; edl_slug: string | null };
const teamRow = (env: Env, id: string) => env.DB.prepare("SELECT id, name, tag, region, logo_key, edl_slug FROM teams WHERE id = ?").bind(id).first<TeamRow>();

// Descoberta limitada: varre séries do time ainda não lidas e lê o metadata das partidas pendentes dele, dentro do orçamento de subrequests;
// o que faltar fica para o próximo clique (o aviso vai no `reason` dos jogadores sem conta).
// shortcut: metade do orçamento para séries e o resto para metadata; times com histórico enorme levam alguns cliques para resolver todo o elenco.
async function edlDiscover(env: Env, slug: string, series: string[], budget: Budget): Promise<string> {
  const scanned = new Set((await env.DB.prepare("SELECT key FROM edl_scanned").all<{ key: string }>()).results.map((r) => r.key));
  const todo = series.filter((k) => !scanned.has(k));
  let left = todo.length;
  for (const k of todo.slice(0, Math.ceil(budget.left / 2))) {
    const [event, s] = k.split("/");
    if (await scanSeries(env, event, s, budget)) left--;
  }
  const pending = (await env.DB.prepare("SELECT match_id FROM edl_matches WHERE done = 0 AND (team1_slug = ?1 OR team2_slug = ?1) ORDER BY match_id DESC LIMIT ?2")
    .bind(slug, BULK_CALLS * BULK_IDS).all<{ match_id: number }>()).results;
  await readMatches(env, pending.map((m) => m.match_id), budget);
  const stillPending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM edl_matches WHERE done = 0 AND (team1_slug = ?1 OR team2_slug = ?1)").bind(slug).first<number>("n")) ?? 0;
  return left || stillPending ? `faltam ${left} séries e ${stillPending} partidas do time para ler; gere o preview de novo` : "";
}

async function edlPreview(env: Env, teamId: string): Promise<Response> {
  const t = await teamRow(env, teamId);
  if (!t) return bad("time não encontrado", 404);
  if (!t.edl_slug) return bad("time não está ligado ao EDL", 409);
  const team = (await edlTeams(env))?.find((e) => e.slug === t.edl_slug);
  if (!team) return bad("time não encontrado no edl.gg", 404);
  const page = await edlTeamPage(env, t.edl_slug);
  if (!page) return bad("edl.gg indisponível, tente de novo", 502);
  let roster = await edlRoster(env, t.id, t.edl_slug, page.roster, "");
  if (roster.some((r) => r.action === "unresolved")) {
    const hint = await edlDiscover(env, t.edl_slug, page.series, { left: SUBREQUESTS - 2 });
    roster = await edlRoster(env, t.id, t.edl_slug, page.roster, hint);
  }
  const fields: EdlImportPreview["fields"] = [];
  if (team.name !== t.name) fields.push({ key: "name", current: t.name, edl: team.name });
  if (team.tag && team.tag !== t.tag) fields.push({ key: "tag", current: t.tag, edl: team.tag });
  if (team.region && team.region !== t.region) fields.push({ key: "region", current: t.region, edl: team.region });
  // O logo já salvo está no R2 e não dá para comparar com o do EDL: sempre oferece, o admin decide (vem desmarcado no front).
  if (team.logoUrl) fields.push({ key: "logo", ...(t.logo_key ? { current: imgUrl(t.logo_key) } : {}), edl: team.logoUrl });
  const leavers = (await edlLeavers(env, t.id, roster)).map((c): EdlImportPreview["leavers"][number] => ({ playerId: c.id, name: c.name, ...(c.account_id ? { accountId: c.account_id } : {}) }));
  const freeAgentTeams = (await env.DB.prepare("SELECT id, name, tag FROM teams WHERE region = 'Sem Time' AND id != ? ORDER BY name").bind(t.id).all<{ id: string; name: string; tag: string }>()).results;
  return Response.json({ team, fields, roster, leavers, freeAgentTeams } satisfies EdlImportPreview);
}

const FIELD_COLUMNS: Record<EdlTeamField, string> = { name: "name", tag: "tag", region: "region", logo: "logo_key" };
const MAX_APPLY_ITEMS = 50;

// Baixa o logo do EDL (só media.edl.gg) e grava no R2 pelo mesmo caminho do upload; devolve /img/<key>.
async function importLogo(env: Env, logoUrl: string): Promise<string> {
  const u = new URL(logoUrl);
  if (u.protocol !== "https:" || u.hostname !== "media.edl.gg") throw new Error("logo fora do media.edl.gg");
  const r = await fetch(u, { ...OUT_INIT(), redirect: "manual" });
  const type = r.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!r.ok || !IMAGE_TYPES[type]) throw new Error("logo indisponível ou de tipo não suportado");
  if (Number(r.headers.get("content-length")) > MAX_UPLOAD_BYTES) throw new Error("logo maior que 8 MB");
  const res = await upload(env, new Request("http://upload", { method: "POST", headers: { "content-type": type }, body: await r.arrayBuffer() }), "teams");
  if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
  return ((await res.json()) as { url: string }).url;
}

async function heroName(env: Env, id: number | undefined): Promise<string> {
  const r = await cachedFetch(env, "/v1/assets/heroes");
  const list = r.ok ? ((await r.json().catch(() => [])) as { id: number; name: string }[]) : [];
  return (Array.isArray(list) && list.find((h) => h.id === id)?.name) || "Abrams";
}

async function edlApply(env: Env, request: Request, teamId: string): Promise<Response> {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const isList = (v: unknown): v is unknown[] => Array.isArray(v) && v.length <= MAX_APPLY_ITEMS;
  const relink = b?.relink ?? [], release = b?.release ?? [];
  if (!b || !isList(b.fields) || !isList(b.link) || !isList(b.create) || !isList(relink) || !isList(release)) return bad("corpo inválido");
  const fields = [...new Set(b.fields)] as EdlTeamField[];
  if (fields.some((f) => !(f in FIELD_COLUMNS))) return bad("campo inválido");
  const links = b.link as { playerId?: unknown; accountId?: unknown }[];
  const relinks = relink as typeof links;
  const releases = release as { playerId?: unknown; teamId?: unknown }[];
  const creates = b.create as { slug?: unknown }[];
  if ([...links, ...relinks].some((l) => typeof l?.playerId !== "string" || !ID_RE.test(l.playerId) || !Number.isInteger(l.accountId) || (l.accountId as number) <= 0 || (l.accountId as number) >= 2 ** 32)) return bad("vínculo inválido");
  if (releases.some((r) => typeof r?.playerId !== "string" || !ID_RE.test(r.playerId) || typeof r.teamId !== "string" || !ID_RE.test(r.teamId))) return bad("movimentação inválida");
  if (creates.some((c) => typeof c?.slug !== "string" || !/^[\w-]{1,64}$/.test(c.slug))) return bad("jogador inválido");

  const t = await teamRow(env, teamId);
  if (!t) return bad("time não encontrado", 404);
  if (!t.edl_slug) return bad("time não está ligado ao EDL", 409);
  const skipped: EdlImportResult["skipped"] = [];
  const stmts: D1PreparedStatement[] = [];
  const result: EdlImportResult["applied"] = { fields: [], linked: [], created: [], relinked: [], released: [] };

  if (fields.length) {
    const team = (await edlTeams(env))?.find((e) => e.slug === t.edl_slug);
    const values: Record<EdlTeamField, string | undefined> = { name: team?.name, tag: team?.tag, region: team?.region, logo: team?.logoUrl };
    const set: string[] = [], binds: string[] = [];
    for (const f of fields) {
      try {
        const v = values[f];
        if (!v) throw new Error(team ? "o EDL não tem esse valor" : "time não encontrado no edl.gg");
        const value = f === "logo" ? keyOf(await importLogo(env, v))! : v;
        set.push(`${FIELD_COLUMNS[f]} = ?`);
        binds.push(value);
        result.fields.push(f);
      } catch (e) { skipped.push({ item: f, reason: (e as Error).message }); }
    }
    if (set.length) stmts.push(env.DB.prepare(`UPDATE teams SET ${set.join(", ")} WHERE id = ?`).bind(...binds, t.id));
  }

  if (links.length || creates.length || relinks.length || releases.length) {
    const page = await edlTeamPage(env, t.edl_slug);
    if (!page) return bad("edl.gg indisponível, tente de novo", 502);
    const roster = await edlRoster(env, t.id, t.edl_slug, page.roster, "");
    const claimed = new Map<number, string>(), names = new Set<string>(), touched = new Set<string>();
    for (const l of links as { playerId: string; accountId: number }[]) {
      const skip = (reason: string) => skipped.push({ item: l.playerId, reason });
      const card = await env.DB.prepare("SELECT id, name, account_id, extra_json FROM players WHERE id = ?").bind(l.playerId).first<{ id: string; name: string; account_id: number | null; extra_json: string }>();
      // outras cartas com esse account só atrapalham se tiverem nome diferente (versões do mesmo jogador compartilham o account)
      const others = (await env.DB.prepare("SELECT name FROM players WHERE account_id = ? AND id != ?").bind(l.accountId, l.playerId).all<{ name: string }>()).results;
      if (!roster.some((r) => r.accountId === l.accountId)) skip("conta fora do elenco resolvido do time");
      else if (!card) skip("carta não existe");
      else if (parse<{ variantOf?: string }>(card.extra_json, {}).variantOf) skip("só cartas base podem ser vinculadas");
      else if (card.account_id) skip(card.account_id === l.accountId ? "carta já vinculada a essa conta" : "carta já vinculada a outra conta");
      else if (others.some((o) => norm(o.name) !== norm(card.name)) || (claimed.has(l.accountId) && claimed.get(l.accountId) !== norm(card.name)) || touched.has(l.playerId)) skip("conta já usada em outra carta ou neste pedido");
      else {
        claimed.set(l.accountId, norm(card.name)); touched.add(l.playerId); result.linked.push(l.playerId);
        stmts.push(env.DB.prepare("UPDATE players SET account_id = ? WHERE id = ? AND account_id IS NULL").bind(l.accountId, l.playerId));
      }
    }
    for (const l of relinks as { playerId: string; accountId: number }[]) {
      const skip = (reason: string) => skipped.push({ item: l.playerId, reason });
      const card = await env.DB.prepare("SELECT id, team_id, name, account_id, extra_json FROM players WHERE id = ?").bind(l.playerId).first<CardRow>();
      const entry = roster.find((r) => r.accountId === l.accountId);
      const others = (await env.DB.prepare("SELECT name FROM players WHERE account_id = ? AND id != ? AND (extra_json ->> '$.variantOf') IS NULL").bind(l.accountId, l.playerId).all<{ name: string }>()).results;
      const x = parse<{ variantOf?: string; inactive?: boolean }>(card?.extra_json ?? "{}", {});
      if (!entry) skip("conta fora do elenco resolvido do time");
      else if (!card) skip("carta não existe");
      else if (x.variantOf || x.inactive) skip("só cartas base ativas podem trocar de conta");
      else if (card.team_id !== t.id) skip("carta de outro time");
      else if (norm(card.name) !== norm(entry.alias)) skip("o nome da carta não bate com o jogador do EDL");
      else if (!card.account_id) skip("carta sem conta: use vincular");
      else if (card.account_id === l.accountId) skip("carta já vinculada a essa conta");
      else if (others.some((o) => norm(o.name) !== norm(card.name)) || (claimed.has(l.accountId) && claimed.get(l.accountId) !== norm(card.name)) || touched.has(l.playerId)) skip("conta já usada em outra carta ou neste pedido");
      else {
        claimed.set(l.accountId, norm(card.name)); touched.add(l.playerId); result.relinked.push(l.playerId);
        stmts.push(env.DB.prepare("UPDATE players SET account_id = ? WHERE id = ? AND account_id = ?").bind(l.accountId, l.playerId, card.account_id));
      }
    }
    if (releases.length) {
      const leavers = new Set((await edlLeavers(env, t.id, roster)).map((c) => c.id));
      for (const r of releases as { playerId: string; teamId: string }[]) {
        const skip = (reason: string) => skipped.push({ item: r.playerId, reason });
        if (!leavers.has(r.playerId)) skip("a carta não saiu do elenco do EDL");
        else if (r.teamId === t.id || !(await env.DB.prepare("SELECT 1 FROM teams WHERE id = ? AND region = 'Sem Time'").bind(r.teamId).first())) skip("o destino não é um time com região Sem Time");
        else if (touched.has(r.playerId)) skip("carta já usada neste pedido");
        else {
          touched.add(r.playerId); result.released.push(r.playerId);
          stmts.push(env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ? AND team_id = ?").bind(r.teamId, r.playerId, t.id));
        }
      }
    }
    const stats = { MIR: 88, MAC: 86, SUP: 82, MOV: 87, POL: 85, CON: 86 };
    for (const c of creates as { slug: string }[]) {
      const r = roster.find((e) => e.slug === c.slug);
      const skip = (reason: string) => skipped.push({ item: c.slug, reason });
      if (!r) skip("jogador fora do elenco do EDL");
      else if (!r.accountId) skip(r.reason ?? "conta não resolvida");
      else if (r.action !== "create") skip(r.card ? `já existe a carta "${r.card.name}"` : r.reason ?? "não pode ser criada");
      else if (claimed.has(r.accountId) || names.has(norm(r.alias))) skip("já criado ou vinculado neste pedido");
      else if (await env.DB.prepare("SELECT 1 FROM players WHERE account_id = ?").bind(r.accountId).first()) skip("já existe carta com essa conta");
      else {
        claimed.set(r.accountId, norm(r.alias)); names.add(norm(r.alias));
        const id = `p-${crypto.randomUUID().slice(0, 8)}`;
        result.created.push(id);
        // valores padrão iguais ao blankPlayer do Editor
        stmts.push(env.DB.prepare(
          "INSERT INTO players (id, team_id, name, position, hero, stats_json, ovr, c1, c2, history_json, extra_json, account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(id, t.id, r.alias, "Flex", await heroName(env, r.heroIds[0]), JSON.stringify(stats), Math.round(Object.values(stats).reduce((a, v) => a + v, 0) / 6),
          "#0e7490", "#082f49", "[]", JSON.stringify({ footer: "Deadlock Cards" }), r.accountId));
      }
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (result.linked.length || result.created.length || result.relinked.length) await linkEdl(env);
  return Response.json({ applied: result, skipped } satisfies EdlImportResult);
}

async function edlSeries(env: Env, teamId: string): Promise<Response> {
  const slug = await env.DB.prepare("SELECT edl_slug FROM teams WHERE id = ?").bind(teamId).first<string | null>("edl_slug");
  if (!slug) return Response.json([]);
  const rows = (await env.DB.prepare(
    `SELECT match_id, event, series, game, team1_slug AS one, team2_slug AS two, winner_slug AS winner, info_json ->> 'start' AS start
     FROM edl_matches WHERE (team1_slug = ?1 OR team2_slug = ?1) AND winner_slug IS NOT NULL ORDER BY game`,
  ).bind(slug).all<{ match_id: number; event: string; series: string; game: number | null; one: string; two: string; winner: string; start: number | null }>()).results;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(`${r.event}/${r.series}`, [...(groups.get(`${r.event}/${r.series}`) ?? []), r]);
  const start = (g: typeof rows) => Math.min(...g.map((r) => r.start ?? Infinity));
  const recent = [...groups.values()].sort((a, b) => (Number.isFinite(start(b)) ? start(b) : 0) - (Number.isFinite(start(a)) ? start(a) : 0) || b[0].match_id - a[0].match_id).slice(0, 20);
  const opponents = new Map((await env.DB.prepare("SELECT slug, name, tag, logo_url FROM edl_teams WHERE slug IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(recent.map((g) => (g[0].one === slug ? g[0].two : g[0].one)))).all<{ slug: string; name: string; tag: string | null; logo_url: string | null }>()).results.map((o) => [o.slug, o]));
  return Response.json(recent.map((g): EdlTeamSeries => {
    const opp = g[0].one === slug ? g[0].two : g[0].one;
    const wins = g.filter((r) => r.winner === slug).length;
    const o = opponents.get(opp);
    const first = start(g);
    return {
      event: g[0].event, series: g[0].series,
      opponent: { name: o?.name ?? opp, ...(o?.tag ? { tag: o.tag } : {}), ...(o?.logo_url ? { logoUrl: o.logo_url } : {}) },
      score: [wins, g.length - wins], won: wins > g.length - wins, ...(Number.isFinite(first) ? { startTime: first } : {}),
      games: g.map((r, i) => ({ matchId: r.match_id, game: r.game ?? i + 1, won: r.winner === slug })),
    };
  }));
}

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
      return { id: t.id, name: t.name, tag: t.tag, region: t.region, logo: imgUrl(t.logo_key), ...(t.edl_slug ? { edlSlug: t.edl_slug } : {}), ...(tbg ? { bg: tbg } : {}) };
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
      // edlSlug ausente mantém o valor salvo; null desliga
      const edlSlug = b.edlSlug === undefined ? null : b.edlSlug;
      if (edlSlug !== null && !(typeof edlSlug === "string" && /^[a-z0-9-]{1,64}$/.test(edlSlug))) return bad("edlSlug inválido");
      if (edlSlug && await db.prepare("SELECT 1 FROM teams WHERE edl_slug = ? AND id != ?").bind(edlSlug, id).first()) return bad("esse time do EDL já está ligado a outro time", 409);
      await db.prepare(
        "INSERT INTO teams (id, name, tag, region, logo_key, bg_json, edl_slug) VALUES (?,?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, tag=excluded.tag, region=excluded.region, logo_key=excluded.logo_key, bg_json=excluded.bg_json, edl_slug=CASE WHEN ? THEN excluded.edl_slug ELSE teams.edl_slug END",
      ).bind(id, b.name, b.tag, b.region ?? "Europa", keyOf(b.logo), b.bg ? JSON.stringify(b.bg) : null, edlSlug, b.edlSlug === undefined ? 0 : 1).run();
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
    if (url.pathname === "/api/edl/teams") {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      return request.method === "GET" ? edlTeamList(env, url.searchParams.get("q") ?? "") : bad("método não suportado", 405);
    }
    const teamEdl = url.pathname.match(/^\/api\/teams\/([^/]+)\/(edl-import|edl-series)$/);
    if (teamEdl) {
      const id = decodeURIComponent(teamEdl[1]);
      if (!ID_RE.test(id)) return bad("id inválido");
      if (teamEdl[2] === "edl-series") return request.method === "GET" ? edlSeries(env, id) : bad("método não suportado", 405);
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      if (request.method === "GET") return edlPreview(env, id);
      return request.method === "POST" ? edlApply(env, request, id) : bad("método não suportado", 405);
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
