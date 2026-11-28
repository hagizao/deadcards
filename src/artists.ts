import { currentUser } from "./auth";
import type { ArtistAdmin, ArtistInfo } from "./lib/artists";
import type { CardLikes } from "./lib/likes";
import type { Env } from "./worker";

const ID_RE = /^[\w-]{1,64}$/;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return null; } };

/** Curtidas do perfil: as das cartas com a arte da pessoa mais as do próprio perfil. */
const totalLikes = (env: Env, userId: string) => env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM card_likes l JOIN card_artists c ON c.player_id = l.player_id WHERE c.user_id = ?1)
  + (SELECT COUNT(*) FROM profile_likes WHERE artist_id = ?1) AS n`).bind(userId);

const linkedCards = (env: Env, userId: string) =>
  env.DB.prepare("SELECT player_id FROM card_artists WHERE user_id = ? ORDER BY created_at DESC, rowid DESC").bind(userId);

/** A área de artista do perfil público; `null` quando a conta não é artista. */
export async function artistInfo(env: Env, userId: string): Promise<ArtistInfo | null> {
  const [artist, cards, likes] = await env.DB.batch<{ player_id?: string; n?: number }>([
    env.DB.prepare("SELECT 1 AS n FROM artists WHERE user_id = ?").bind(userId),
    linkedCards(env, userId),
    totalLikes(env, userId),
  ]);
  if (!artist.results.length) return null;
  return { cards: cards.results.map((r) => r.player_id!), likes: likes.results[0]?.n ?? 0 };
}

/** Carta → perfil do artista (o @ quando tem, senão o id), para o "Arte por" levar ao perfil no site. */
export async function artistsByCard(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(`SELECT c.player_id, COALESCE(h.handle, c.user_id) AS profile FROM card_artists c
    JOIN artists a ON a.user_id = c.user_id LEFT JOIN profile_handles h ON h.user_id = c.user_id`).all<{ player_id: string; profile: string }>();
  return Object.fromEntries(results.map((r) => [r.player_id, r.profile]));
}

async function adminView(env: Env, userId: string): Promise<ArtistAdmin> {
  const [artist, cards] = await env.DB.batch<{ player_id?: string }>([
    env.DB.prepare("SELECT 1 FROM artists WHERE user_id = ?").bind(userId),
    linkedCards(env, userId),
  ]);
  return { artist: artist.results.length > 0, cards: cards.results.map((r) => r.player_id!) };
}

/**
 * Só admin. /api/artists/<conta>: GET lê, PUT marca como artista, DELETE tira o selo (as cartas vinculadas ficam guardadas).
 * /api/artists/<conta>/cards/<carta>: PUT vincula a arte da carta à conta (e dá a carta para ela), DELETE desvincula (a carta fica na coleção).
 */
export async function artists(env: Env, request: Request, rest: string): Promise<Response> {
  const like = /^([^/]+)\/likes$/.exec(rest);
  if (like) return artistLikes(env, request, decode(like[1]) ?? "");
  if (!(await currentUser(env, request))?.admin) return json({ code: "forbidden" }, 403);
  const parts = rest.split("/").map(decode);
  const [userId, sub, playerId] = parts;
  const card = parts.length === 3 && sub === "cards";
  if (!(parts.length === 1 || card) || !userId || !ID_RE.test(userId) || (card && (!playerId || !ID_RE.test(playerId)))) return json({ code: "not_found" }, 404);
  if (request.method !== "GET" && request.method !== "PUT" && request.method !== "DELETE") return json({ code: "method" }, 405);
  if (!(await env.DB.prepare(`SELECT 1 FROM "user" WHERE id = ?`).bind(userId).first())) return json({ code: "no_user" }, 404);

  if (!card) {
    if (request.method === "PUT") await env.DB.prepare("INSERT OR IGNORE INTO artists (user_id) VALUES (?)").bind(userId).run();
    if (request.method === "DELETE") await env.DB.prepare("DELETE FROM artists WHERE user_id = ?").bind(userId).run();
  } else if (request.method === "PUT") {
    if (!(await env.DB.prepare("SELECT 1 FROM players WHERE id = ?").bind(playerId).first())) return json({ code: "no_card" }, 404);
    // vincular já marca como artista, troca o dono da arte se a carta era de outra conta e dá a carta (sem duplicar)
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO artists (user_id) VALUES (?)").bind(userId),
      env.DB.prepare(`INSERT INTO card_artists (player_id, user_id) VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET user_id = excluded.user_id, created_at = unixepoch() WHERE card_artists.user_id <> excluded.user_id`).bind(playerId, userId),
      env.DB.prepare("INSERT OR IGNORE INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(userId, playerId),
    ]);
  } else if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM card_artists WHERE player_id = ? AND user_id = ?").bind(playerId, userId).run();
  }
  return json(await adminView(env, userId));
}

/**
 * /api/artists/<conta>/likes: curtir o artista. GET é público (total do perfil e se você curtiu);
 * PUT curte e DELETE descurte, com login. Ninguém curte o próprio perfil.
 */
async function artistLikes(env: Env, request: Request, artistId: string): Promise<Response> {
  if (!ID_RE.test(artistId)) return json({ code: "not_found" }, 404);
  if (request.method !== "GET" && request.method !== "PUT" && request.method !== "DELETE") return json({ code: "method" }, 405);
  if (!(await env.DB.prepare("SELECT 1 FROM artists WHERE user_id = ?").bind(artistId).first())) return json({ code: "not_artist" }, 404);
  const user = await currentUser(env, request);
  if (request.method !== "GET") {
    if (!user) return json({ code: "login" }, 401);
    if (user.id === artistId) return json({ code: "self" }, 400);
    await env.DB.prepare(request.method === "PUT"
      ? "INSERT OR IGNORE INTO profile_likes (user_id, artist_id) VALUES (?, ?)"
      : "DELETE FROM profile_likes WHERE user_id = ? AND artist_id = ?").bind(user.id, artistId).run();
  }
  const [count, mine] = await env.DB.batch<{ n: number }>([
    totalLikes(env, artistId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM profile_likes WHERE user_id = ? AND artist_id = ?").bind(user?.id ?? "", artistId),
  ]);
  return json({ count: count.results[0]?.n ?? 0, liked: !!mine.results[0]?.n } satisfies CardLikes);
}
