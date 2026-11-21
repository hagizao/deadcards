/// <reference types="@cloudflare/workers-types" />
import { createAuth, currentUser } from "./auth";
import { favorite, profileCard, publicProfile } from "./profile";
import { handleOf } from "./handles";
import { accountLink } from "./link";
import { PROFILE_CARD_PATH } from "./lib/profile";
import { sanitizeGameConfig, sanitizeHeroPool, trimItemIcons } from "./lib/game/config";
import type { ArtCredit } from "./lib/types";

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
// efeito sonoro próprio de uma carta: arquivo curto, na pasta "sounds"
const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm" };
const UPLOAD_FOLDERS = ["players", "teams", "heroes", "bg", "home"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SOUND_BYTES = 1024 * 1024;
const PLAYER_EXTRA = ["footer", "footerSize", "footerColor", "special", "specialText", "frame", "variantOf", "inactive", "art", "heroPool"];
const ID_RE = /^[\w-]{1,64}$/;

const keyOf = (url: unknown) => (typeof url === "string" && url.startsWith("/img/") ? url.slice(5) : null);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
// `code` é opcional: rotas que o front traduz mandam um código estável além da mensagem em pt.
const bad = (msg: string, status = 400, code?: string) => Response.json({ error: msg, code }, { status });

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const ALLOWED_PATHS = ["/v1/assets/heroes", "/v1/analytics/hero-stats", "/v1/patches"];
const UPSERT_CACHE =
  "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at";

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

const imgUrl = (key: string | null) => (key ? `/img/${key}` : undefined);
const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

/** Busca na deadlock-api com cache no D1. Com `trim`, guarda só o resultado enxuto, sob a chave `key`. */
async function cachedFetch(env: Env, path: string, trim?: { key: string; fn: (raw: unknown) => unknown }): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const key = trim?.key ?? path;
  const row = await env.DB.prepare("SELECT body, fetched_at FROM api_cache WHERE cache_key = ?")
    .bind(key)
    .first<{ body: string; fetched_at: number }>();
  if (row && now - row.fetched_at < CACHE_TTL_SECONDS) {
    return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "hit" } });
  }
  const upstream = await fetch(env.DEADLOCK_API_BASE + path);
  if (!upstream.ok) {
    if (row) return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "stale" } });
    return upstream;
  }
  const body = trim ? JSON.stringify(trim.fn(await upstream.json())) : await upstream.text();
  await env.DB.prepare(UPSERT_CACHE).bind(key, body, now).run();
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

async function syncFromDeadlockApi(env: Env): Promise<void> {
  for (const path of ALLOWED_PATHS) {
    const res = await fetch(env.DEADLOCK_API_BASE + path);
    if (!res.ok) continue;
    await env.DB.prepare(UPSERT_CACHE).bind(path, await res.text(), Math.floor(Date.now() / 1000)).run();
  }
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
      stats: parse(p.stats_json as string, {}), ...(p.ovr !== null ? { ovr: p.ovr } : {}),
      c1: p.c1, c2: p.c2, history: parse(p.history_json as string, []),
    })),
    heroes: Object.fromEntries((heroes.results as { name: string; image_key: string; zoom: number; x: number; y: number }[])
      .map((h) => [h.name, { name: h.name, url: imgUrl(h.image_key), zoom: h.zoom, x: h.x, y: h.y }])),
    settings: {
      tierConfig: s.tierConfig ?? undefined,
      bg: bg ? { ...bg, imageUrl: imgUrl((s.bgImageKey as string) ?? null) } : undefined,
      homeHero: imgUrl((s.homeHeroKey as string) ?? null),
      gameBg: imgUrl((s.gameBgKey as string) ?? null),
      game: s.game ?? undefined,
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
  if (folder === "sounds") return uploadSound(env, request);
  const ext = IMAGE_TYPES[request.headers.get("content-type") ?? ""];
  if (!ext) return bad("tipo de imagem não suportado");
  if (!UPLOAD_FOLDERS.includes(folder)) return bad("pasta inválida");
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_UPLOAD_BYTES) return bad("imagem vazia ou maior que 8 MB");
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await env.ASSETS_BUCKET.put(key, body, { httpMetadata: { contentType: request.headers.get("content-type")! } });
  return Response.json({ url: `/img/${key}` });
}

async function uploadSound(env: Env, request: Request): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  const ext = AUDIO_TYPES[type];
  if (!ext) return bad("tipo de áudio não suportado: use mp3, ogg, wav ou webm");
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_SOUND_BYTES) return bad("áudio vazio ou maior que 1 MB");
  const key = `sounds/${crypto.randomUUID()}.${ext}`;
  await env.ASSETS_BUCKET.put(key, body, { httpMetadata: { contentType: type } });
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
      const heroPool = sanitizeHeroPool(b.heroPool, typeof b.hero === "string" ? b.hero : "Abrams");
      b.heroPool = heroPool.length ? heroPool : undefined;
      if (b.art && typeof b.art === "object") {
        const credit = artCredit((b.art as { credit?: unknown }).credit);
        if (credit === null) return bad("crédito da arte inválido: nome até 60 caracteres e link http(s)");
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
  } else if (kind === "settings" && !del) {
    const rows: Record<string, unknown> = {};
    if (b.tierConfig !== undefined) rows.tierConfig = b.tierConfig;
    if (b.bg !== undefined) { const bg = b.bg as Record<string, unknown> | null; rows.bg = bg ? { ...bg, imageUrl: "" } : null; rows.bgImageKey = keyOf(bg?.imageUrl); }
    if (b.homeHero !== undefined) rows.homeHeroKey = keyOf(b.homeHero);
    // foto do salão do Cardslock Game: só imagem já enviada ao R2 (/img/...); qualquer outra coisa limpa
    if (b.gameBg !== undefined) rows.gameBgKey = keyOf(b.gameBg);
    if (b.game !== undefined) {
      const game = sanitizeGameConfig(b.game);
      if (!game) return bad("configuração do jogo inválida");
      rows.game = game;
    }
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
    // ícones dos itens da loja (Cardslock Game): a lista completa tem ~6 MB, então só nome, tier, categoria e imagem
    if (url.pathname === "/api/items") return cachedFetch(env, "/v1/assets/items", { key: "items:icons", fn: trimItemIcons });
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
    ctx.waitUntil(syncFromDeadlockApi(env));
    ctx.waitUntil(env.DB.prepare("DELETE FROM api_cache WHERE cache_key LIKE 'feedback:%' AND fetched_at < unixepoch() - ?").bind(FEEDBACK_GAP_SECONDS).run());
  },
} satisfies ExportedHandler<Env>;
