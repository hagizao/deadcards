/// <reference types="@cloudflare/workers-types" />
import { createAuth, currentUser } from "./auth";
import { favorite, profileCard, publicProfile } from "./profile";
import { handleOf } from "./handles";
import { accountLink } from "./link";
import { PROFILE_CARD_PATH } from "./lib/profile";
import { HOME_FEATURED_MAX, SCHEDULE_LABEL_MAX, TOURNAMENT_DESC_MAX, TOURNAMENT_NAME_MAX, type ArtCredit } from "./lib/types";
import { imgUrl, parse, playerFromRow } from "./rows";
import { packTypes, packs } from "./packs";

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
const UPLOAD_FOLDERS = ["players", "teams", "heroes", "bg", "home", "packs", "events"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PLAYER_EXTRA = ["footer", "footerSize", "footerColor", "special", "specialText", "frame", "variantOf", "altHero", "inactive", "exclusive", "art"];
const ID_RE = /^[\w-]{1,64}$/;

const IMG_KEY = /^[a-z0-9/_.-]+$/i;
const validKey = (key: string) => IMG_KEY.test(key) && !key.includes("..");
const keyOf = (url: unknown) => (typeof url === "string" && url.startsWith("/img/") && validKey(url.slice(5)) ? url.slice(5) : null);
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return null; } };
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
// `code` é opcional: rotas que o front traduz mandam um código estável além da mensagem em pt.
const bad = (msg: string, status = 400, code?: string) => Response.json({ error: msg, code }, { status });

function crossSite(request: Request, url: URL) {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (origin) return origin !== url.origin;
  return request.headers.get("sec-fetch-site") === "cross-site";
}

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const ALLOWED_PATHS = ["/v1/assets/heroes", "/v1/analytics/hero-stats", "/v1/patches"];
const UPSERT_CACHE =
  "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at";

// calendário: datas entre 2024 e 2100 (segundos UTC); o site recebe do mês passado em diante
const SCHEDULE_MIN = Date.UTC(2024, 0, 1) / 1000;
const SCHEDULE_MAX = Date.UTC(2100, 0, 1) / 1000;
const SCHEDULE_PAST_DAYS = 31;
// logo de campeonato: enviada pelo Editor (R2, /img/...) ou arquivo do site em public/tournaments/
const STATIC_LOGO = /^\/tournaments\/[\w-]{1,64}\.(png|webp|svg|jpg)$/;
const tournamentLogo = (v: unknown) => keyOf(v) ?? (typeof v === "string" && STATIC_LOGO.test(v) ? v : null);

/** Link http(s) de até 200 caracteres, normalizado; null se não servir. */
function httpUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 200) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

function artCredit(v: unknown): ArtCredit | null | undefined {
  if (v === undefined || v === null) return undefined;
  const c = v as { name?: unknown; url?: unknown };
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (!name || name.length > 60) return null;
  if (c.url === undefined || c.url === "") return { name };
  if (typeof c.url !== "string" || c.url.length > 300) return null;
  try {
    const u = new URL(c.url);
    return u.protocol === "https:" || u.protocol === "http:" ? { name, url: u.href } : null;
  } catch { return null; }
}


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
    return Response.json({ error: "upstream unavailable" }, { status: 502 });
  }
  const body = await upstream.text();
  await env.DB.prepare(UPSERT_CACHE).bind(path, body, now).run();
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

async function syncFromDeadlockApi(env: Env): Promise<void> {
  for (const path of ALLOWED_PATHS) {
    try {
      const res = await fetch(env.DEADLOCK_API_BASE + path);
      if (!res.ok) continue;
      await env.DB.prepare(UPSERT_CACHE).bind(path, await res.text(), Math.floor(Date.now() / 1000)).run();
    } catch (e) {
      console.error("deadlock sync failed", path, e);
    }
  }
}

async function appData(env: Env): Promise<Response> {
  const [teams, players, heroes, settings, tournaments, schedule] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM teams ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM players ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM heroes"),
    env.DB.prepare("SELECT * FROM settings"),
    env.DB.prepare("SELECT * FROM tournaments ORDER BY created_at, id"),
    // calendário: do mês passado em diante (o resto do histórico não aparece no site)
    env.DB.prepare(`SELECT * FROM tournament_dates WHERE starts_at >= unixepoch() - ${SCHEDULE_PAST_DAYS} * 86400 ORDER BY starts_at, id`),
  ]);
  const s = Object.fromEntries((settings.results as { key: string; value_json: string }[]).map((r) => [r.key, parse<unknown>(r.value_json, null)]));
  const bg = s.bg as Record<string, unknown> | null;
  return Response.json({
    teams: (teams.results as Record<string, string | null>[]).map((t) => {
      const tbg = parse<Record<string, unknown> | null>(t.bg_json, null);
      return { id: t.id, name: t.name, tag: t.tag, region: t.region, logo: imgUrl(t.logo_key), ...(tbg ? { bg: tbg } : {}) };
    }),
    players: (players.results as Record<string, string | number | null>[]).map(playerFromRow),
    tournaments: (tournaments.results as { id: string; name: string; description: string; logo_key: string | null; url: string | null }[])
      .map((t) => ({ id: t.id, name: t.name, description: t.description, ...(t.logo_key ? { logo: t.logo_key.startsWith("/") ? t.logo_key : imgUrl(t.logo_key) } : {}), ...(t.url ? { url: t.url } : {}) })),
    schedule: (schedule.results as { id: string; tournament_id: string; starts_at: number; label: string; brazil: number }[])
      .map((d) => ({ id: d.id, tournamentId: d.tournament_id, startsAt: d.starts_at, label: d.label, brazil: d.brazil === 1 })),
    heroes: Object.fromEntries((heroes.results as { name: string; image_key: string; zoom: number; x: number; y: number }[])
      .map((h) => [h.name, { name: h.name, url: imgUrl(h.image_key), zoom: h.zoom, x: h.x, y: h.y }])),
    settings: {
      tierConfig: s.tierConfig ?? undefined,
      bg: bg ? { ...bg, imageUrl: imgUrl((s.bgImageKey as string) ?? null) } : undefined,
      homeHero: imgUrl((s.homeHeroKey as string) ?? null),
      homeFeatured: (s.homeFeatured as string[] | null) ?? undefined,
      homeGuide: (s.homeGuide as string | null) ?? undefined,
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
  headers.set("x-content-type-options", "nosniff");
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

async function promote(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT json_extract(extra_json, '$.variantOf') AS main FROM players WHERE id = ?").bind(id).first<{ main: string | null }>();
  if (!row) return bad("carta não encontrada", 404);
  if (!row.main || row.main === id) return bad("esta carta já é a principal");
  await env.DB.batch([
    env.DB.prepare("UPDATE players SET extra_json = json_remove(extra_json, '$.variantOf', '$.inactive') WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE players SET extra_json = json_set(extra_json, '$.variantOf', ?) WHERE id <> ? AND (id = ? OR json_extract(extra_json, '$.variantOf') = ?)")
      .bind(id, id, row.main, row.main),
  ]);
  return Response.json({ ok: true });
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
    if (owned) return bad("há cartas resgatadas por usuários; marque como inativo em vez de apagar", 409, "owned");
  }
  if (del && kind === "teams") {
    const [versions, packs] = await db.batch([
      db.prepare("SELECT 1 FROM players WHERE team_id <> ?1 AND json_extract(extra_json, '$.variantOf') IN (SELECT id FROM players WHERE team_id = ?1) LIMIT 1").bind(id),
      db.prepare("SELECT 1 FROM pack_types, json_each(pack_types.teams_json) WHERE json_each.value = ? LIMIT 1").bind(id),
    ]);
    if (versions.results.length) return bad("jogadores deste time têm versões em outro time; apague ou mova as versões antes", 409, "versions");
    if (packs.results.length) return bad("este time está em um tipo de pack; tire ele do pack antes", 409, "in_pack");
  }
  if (kind === "players") {
    const hasVersions = () => db.prepare("SELECT 1 FROM players WHERE json_extract(extra_json, '$.variantOf') = ? AND id <> ? LIMIT 1").bind(id, id).first();
    if (del) {
      if (await hasVersions()) return bad("esta carta tem versões; apague ou mova as versões antes", 409);
      await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
    } else {
      if (!b.name || !b.teamId || !b.stats) return bad("jogador incompleto");
      if (b.variantOf === "" || b.variantOf === null || b.variantOf === id) delete b.variantOf;
      if (b.variantOf !== undefined) {
        if (typeof b.variantOf !== "string") return bad("versão inválida");
        const main = await db.prepare("SELECT json_extract(extra_json, '$.variantOf') AS v FROM players WHERE id = ?").bind(b.variantOf).first<{ v: string | null }>();
        if (!main) return bad("a carta principal escolhida não existe");
        if (main.v && main.v !== b.variantOf) return bad("escolha a carta principal do jogador, não uma versão");
        if (await hasVersions()) return bad("esta carta é a principal de outras versões; troque a principal antes", 409);
      }
      // herói jogado só existe como versão de um jogador
      if (b.altHero !== true || b.variantOf === undefined) delete b.altHero;
      // exclusiva (fora dos packs) só com true; qualquer outro valor some
      if (b.exclusive !== true) delete b.exclusive;
      if (b.art && typeof b.art === "object") {
        const credit = artCredit((b.art as { credit?: unknown }).credit);
        if (credit === null) return bad("crédito da arte inválido: nome até 60 caracteres e link http(s)");
        const fg = (b.art as { fg?: { url?: unknown } }).fg;
        if (fg != null && (typeof fg !== "object" || typeof fg.url !== "string" || !fg.url.startsWith("/img/"))) return bad("camada da frente inválida");
        b.art = { ...b.art, credit };
      }
      const extra = Object.fromEntries(PLAYER_EXTRA.filter((k) => b[k] !== undefined && b[k] !== null).map((k) => [k, b[k]]));
      await db.prepare(
        "INSERT INTO players (id, team_id, name, position, hero, stats_json, ovr, c1, c2, history_json, extra_json) VALUES (?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, position=excluded.position, hero=excluded.hero, stats_json=excluded.stats_json, ovr=excluded.ovr, c1=excluded.c1, c2=excluded.c2, history_json=excluded.history_json, extra_json=excluded.extra_json",
      ).bind(id, b.teamId, b.name, b.position ?? "Flex", b.hero ?? "Abrams", JSON.stringify(b.stats), typeof b.ovr === "number" && Number.isFinite(b.ovr) ? Math.round(b.ovr) : null,
        b.c1 ?? "#0e7490", b.c2 ?? "#082f49", JSON.stringify(b.history ?? []), JSON.stringify(extra)).run();
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
  } else if (kind === "tournaments") {
    if (del) await db.batch([db.prepare("DELETE FROM tournament_dates WHERE tournament_id = ?").bind(id), db.prepare("DELETE FROM tournaments WHERE id = ?").bind(id)]);
    else {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      const description = typeof b.description === "string" ? b.description.trim() : "";
      const link = b.url === undefined || b.url === null || b.url === "" ? null : httpUrl(b.url);
      if (!name || name.length > TOURNAMENT_NAME_MAX) return bad(`nome do campeonato obrigatório, até ${TOURNAMENT_NAME_MAX} caracteres`);
      if (description.length > TOURNAMENT_DESC_MAX) return bad(`descrição até ${TOURNAMENT_DESC_MAX} caracteres`);
      if (link === null && b.url) return bad("link inválido: use http(s), até 200 caracteres");
      await db.prepare(
        "INSERT INTO tournaments (id, name, description, logo_key, url) VALUES (?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, logo_key=excluded.logo_key, url=excluded.url",
      ).bind(id, name, description, tournamentLogo(b.logo), link).run();
    }
  } else if (kind === "schedule") {
    if (del) await db.prepare("DELETE FROM tournament_dates WHERE id = ?").bind(id).run();
    else {
      const label = typeof b.label === "string" ? b.label.trim() : "";
      if (typeof b.tournamentId !== "string" || !ID_RE.test(b.tournamentId)) return bad("campeonato inválido");
      if (typeof b.startsAt !== "number" || !Number.isInteger(b.startsAt) || b.startsAt < SCHEDULE_MIN || b.startsAt > SCHEDULE_MAX) return bad("data inválida");
      if (label.length > SCHEDULE_LABEL_MAX) return bad(`rótulo até ${SCHEDULE_LABEL_MAX} caracteres`);
      if (b.brazil !== undefined && typeof b.brazil !== "boolean") return bad("brazil deve ser verdadeiro ou falso");
      if (!(await db.prepare("SELECT 1 FROM tournaments WHERE id = ?").bind(b.tournamentId).first())) return bad("campeonato não existe", 404);
      await db.prepare(
        "INSERT INTO tournament_dates (id, tournament_id, starts_at, label, brazil) VALUES (?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET tournament_id=excluded.tournament_id, starts_at=excluded.starts_at, label=excluded.label, brazil=excluded.brazil",
      ).bind(id, b.tournamentId, b.startsAt, label, b.brazil === true ? 1 : 0).run();
    }
  } else if (kind === "settings" && !del) {
    const rows: Record<string, unknown> = {};
    if (b.tierConfig !== undefined) {
      const tc = b.tierConfig;
      if (!Array.isArray(tc) || tc.length > 10 || !tc.every((x) => x && typeof x === "object" && typeof x.key === "string" && Number.isFinite(x.min))) return bad("faixas de raridade inválidas");
      rows.tierConfig = tc;
    }
    if (b.bg !== undefined) { const bg = b.bg as Record<string, unknown> | null; rows.bg = bg ? { ...bg, imageUrl: "" } : null; rows.bgImageKey = keyOf(bg?.imageUrl); }
    if (b.homeHero !== undefined) rows.homeHeroKey = keyOf(b.homeHero);
    if (b.homeFeatured !== undefined) {
      const f = b.homeFeatured;
      if (!Array.isArray(f) || f.length > HOME_FEATURED_MAX || f.some((x) => typeof x !== "string" || !x || x.length > 64) || new Set(f).size !== f.length) return bad("destaques inválidos");
      rows.homeFeatured = f;
    }
    if (b.homeGuide !== undefined) {
      const g = b.homeGuide;
      if (g !== null && (typeof g !== "string" || !g || g.length > 64)) return bad("carta do guia inválida");
      rows.homeGuide = g;
    }
    await db.batch(Object.entries(rows).map(([k, v]) => db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").bind(k, JSON.stringify(v))));
  } else return bad("rota inválida", 404);
  return Response.json({ ok: true });
}

// shortcut: sem limite de tentativas; o mínimo de 8 caracteres torna o chute inviável, adicionar rate limit se aparecer abuso
// herói jogado aposentado (altHero + inactive) não é mais dado por código
const RETIRED = "json_extract(extra_json, '$.altHero') = 1 AND json_extract(extra_json, '$.inactive') = 1";
const CODE_VALID = `uses < max_uses AND (starts_at IS NULL OR starts_at <= unixepoch()) AND (expires_at IS NULL OR expires_at > unixepoch())
  AND NOT EXISTS (SELECT 1 FROM players WHERE players.id = redeem_codes.player_id AND ${RETIRED})`;
const INVALID_CODE = "código inválido, expirado ou esgotado";

async function redeem(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return bad("entre para resgatar", 401, "login");
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return bad("código vazio", 400, "empty");
  const row = await env.DB.prepare(`SELECT player_id, pack_type_id FROM redeem_codes WHERE code = ? AND ${CODE_VALID}`).bind(code)
    .first<{ player_id: string | null; pack_type_id: string | null }>();
  if (!row) return bad(INVALID_CODE, 404, "invalid");
  // código de pack: o pack vai para o inventário fechado, e a pessoa abre quando quiser
  if (row.pack_type_id) {
    const packId = `pk-${crypto.randomUUID()}`;
    try {
      const [, consume] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO user_packs (id, user_id, pack_type_id, code) SELECT ?, ?, pack_type_id, code FROM redeem_codes WHERE code = ? AND pack_type_id IS NOT NULL AND ${CODE_VALID}`)
          .bind(packId, user.id, code),
        env.DB.prepare(`UPDATE redeem_codes SET uses = uses + 1 WHERE code = ? AND ${CODE_VALID}`).bind(code),
      ]);
      if (!consume.meta.changes) return bad(INVALID_CODE, 404, "invalid");
    } catch (e) {
      if (String(e).includes("UNIQUE")) return bad("você já resgatou este pack", 409, "pack_owned");
      throw e;
    }
    return Response.json({ packId, packTypeId: row.pack_type_id });
  }
  try {
    const [, consume] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO user_cards (user_id, player_id) SELECT ?, player_id FROM redeem_codes WHERE code = ? AND player_id IS NOT NULL AND ${CODE_VALID}`).bind(user.id, code),
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
    const rows = await env.DB.prepare("SELECT code, player_id, pack_type_id, max_uses, uses, starts_at, expires_at FROM redeem_codes ORDER BY code").all();
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
    // o código dá uma carta ou um pack, nunca os dois
    const playerId = typeof b.playerId === "string" && b.playerId ? b.playerId : null;
    const packTypeId = typeof b.packTypeId === "string" && b.packTypeId ? b.packTypeId : null;
    if (!playerId === !packTypeId) return bad("escolha uma carta ou um pack");
    if (startsAt === undefined || expiresAt === undefined) return bad("data inválida");
    if (startsAt !== null && expiresAt !== null && expiresAt <= startsAt) return bad("a expiração deve ser depois do início");
    if (playerId && await env.DB.prepare(`SELECT 1 FROM players WHERE id = ? AND ${RETIRED}`).bind(playerId).first()) return bad("esta carta de herói jogado está aposentada");
    try {
      await env.DB.prepare("INSERT INTO redeem_codes (code, player_id, pack_type_id, max_uses, starts_at, expires_at) VALUES (?,?,?,?,?,?)")
        .bind(code, playerId, packTypeId, maxUses, startsAt, expiresAt).run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) return bad("esse código já existe", 409);
      if (String(e).includes("FOREIGN")) return bad(playerId ? "jogador não existe" : "pack não existe", 404);
      throw e;
    }
    return Response.json({ ok: true });
  }
  if (request.method === "DELETE" && rest) {
    const code = decode(rest);
    if (code === null) return bad("código inválido");
    await env.DB.prepare("DELETE FROM redeem_codes WHERE code = ?").bind(code).run();
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
    // não depende do SameSite padrão do Better Auth; sem Origin nem Sec-Fetch-Site não é navegador, logo não é CSRF
    if (url.pathname.startsWith("/api/") && crossSite(request, url)) return bad("origem inválida", 403, "origin");
    if (url.pathname === "/api/me") {
      const user = await currentUser(env, request);
      if (!user) return Response.json(null);
      const providers = await env.DB.prepare(`SELECT DISTINCT "providerId" AS p FROM "account" WHERE "userId" = ?`).bind(user.id).all<{ p: string }>();
      return Response.json({ ...user, handle: await handleOf(env, user.id), providers: providers.results.map((r) => r.p) });
    }
    if (url.pathname.startsWith("/api/account/link/")) return accountLink(env, request, url.pathname.slice("/api/account/link/".length));
    if (url.pathname === PROFILE_CARD_PATH) return profileCard(env, request);
    const fav = url.pathname.match(/^\/api\/favorites\/([^/]+)$/);
    if (fav) return favorite(env, request, decode(fav[1]) ?? "");
    const profileUser = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (profileUser && request.method === "GET") return publicProfile(env, decode(profileUser[1]) ?? "");
    if (url.pathname === "/api/codes" || url.pathname.startsWith("/api/codes/")) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      return codes(env, request, url.pathname.slice("/api/codes/".length));
    }
    if (url.pathname === "/api/packs" || url.pathname.startsWith("/api/packs/")) return packs(env, request, url.pathname.slice("/api/packs/".length));
    if (url.pathname === "/api/pack-types" || url.pathname.startsWith("/api/pack-types/")) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      return packTypes(env, request, url.pathname.slice("/api/pack-types/".length));
    }
    if (url.pathname === "/api/feedback") return request.method === "POST" ? feedback(env, request) : bad("método não suportado", 405);
    if (url.pathname === "/api/redeem") return request.method === "POST" ? redeem(env, request) : bad("método não suportado", 405);
    if (url.pathname === "/api/collection") {
      const user = await currentUser(env, request);
      if (!user) return Response.json([]);
      const rows = await env.DB.prepare("SELECT player_id FROM user_cards WHERE user_id = ?").bind(user.id).all<{ player_id: string }>();
      return Response.json(rows.results.map((r) => r.player_id));
    }
    // quantas contas têm uma carta: público, aparece no destaque das cartas especiais
    const ownersOf = url.pathname.match(/^\/api\/cards\/([^/]+)\/owners$/);
    if (ownersOf) {
      if (request.method !== "GET") return bad("método não suportado", 405);
      let id = "";
      try { id = decodeURIComponent(ownersOf[1]); } catch { /* escape inválido: nenhuma carta tem esse id */ }
      if (!ID_RE.test(id)) return bad("id inválido");
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_cards WHERE player_id = ?").bind(id).first<number>("n");
      return Response.json({ count: count ?? 0 }, { headers: { "cache-control": "public, max-age=60" } });
    }
    // coleção universal (Editor): quantas contas têm cada carta e quantas contas existem
    if (url.pathname === "/api/owners") {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      if (request.method !== "GET") return bad("método não suportado", 405);
      const [rows, accounts] = await env.DB.batch([
        env.DB.prepare("SELECT player_id, COUNT(*) AS n FROM user_cards GROUP BY player_id"),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM "user"`),
      ]);
      const owners = Object.fromEntries((rows.results as { player_id: string; n: number }[]).map((r) => [r.player_id, r.n]));
      return Response.json({ owners, accounts: (accounts.results[0] as { n: number } | undefined)?.n ?? 0 }, { headers: { "cache-control": "private, no-store" } });
    }
    const promoteMatch = url.pathname.match(/^\/api\/players\/([^/]+)\/promote$/);
    if (promoteMatch) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      if (request.method !== "POST") return bad("método não suportado", 405);
      const id = decode(promoteMatch[1]);
      if (id === null || !ID_RE.test(id)) return bad("id inválido");
      return promote(env, id);
    }
    const admin = url.pathname.match(/^\/api\/(players|teams|heroes|settings|tournaments|schedule|upload)\/([^/]+)$/);
    if (admin) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      const id = decode(admin[2]);
      if (id === null) return bad("id inválido");
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
      const key = decode(url.pathname.slice(5));
      if (key === null || !validKey(key)) return new Response("bad key", { status: 400 });
      return serveImage(env, key);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncFromDeadlockApi(env));
    ctx.waitUntil(env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'feedback:%' AND fetched_at < unixepoch() - ?").bind(FEEDBACK_GAP_SECONDS).run());
  },
} satisfies ExportedHandler<Env>;
