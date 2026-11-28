import { currentUser } from "./auth";
import type { CardLikes } from "./lib/likes";
import type { Env } from "./worker";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

async function read(env: Env, playerId: string, userId: string | undefined): Promise<CardLikes> {
  const [count, mine, own] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM card_likes WHERE player_id = ?").bind(playerId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM card_likes WHERE player_id = ? AND user_id = ?").bind(playerId, userId ?? ""),
    env.DB.prepare("SELECT COUNT(*) AS n FROM card_artists WHERE player_id = ? AND user_id = ?").bind(playerId, userId ?? ""),
  ]);
  return { count: count.results[0]?.n ?? 0, liked: !!mine.results[0]?.n, ...(own.results[0]?.n ? { own: true } : {}) };
}

/**
 * GET: total de curtidas (público) e se você curtiu. PUT curte, DELETE descurte; os dois exigem login e repetir não muda nada.
 * Só carta especial pode ser curtida: é a arte de alguém, e a curtida é a moral para quem fez. O artista não curte a própria arte.
 */
export async function cardLikes(env: Env, request: Request, playerId: string): Promise<Response> {
  const user = await currentUser(env, request);
  if (request.method === "GET") return json(await read(env, playerId, user?.id));
  if (request.method !== "PUT" && request.method !== "DELETE") return json({ code: "method" }, 405);
  if (!user) return json({ code: "login" }, 401);

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM card_likes WHERE user_id = ? AND player_id = ?").bind(user.id, playerId).run();
  } else {
    if (await env.DB.prepare("SELECT 1 FROM card_artists WHERE player_id = ? AND user_id = ?").bind(playerId, user.id).first()) return json({ code: "self" }, 400);
    // a checagem de carta especial vai no próprio insert: carta comum ou inexistente não entra
    const { meta } = await env.DB.prepare(`INSERT OR IGNORE INTO card_likes (user_id, player_id)
      SELECT ?, id FROM players WHERE id = ? AND json_extract(extra_json, '$.special')`).bind(user.id, playerId).run();
    if (!meta.changes && !(await env.DB.prepare("SELECT 1 FROM card_likes WHERE user_id = ? AND player_id = ?").bind(user.id, playerId).first())) {
      return json({ code: "not_special" }, 404);
    }
  }
  return json(await read(env, playerId, user.id));
}
