import { currentUser } from "./auth";
import type { Env } from "./worker";
import { DEFAULT_PACK_ODDS, PACK_NAME_MAX, drawCard, packKind, packPool, parseOdds, type InventoryPack, type PackType } from "./lib/packs";
import { imgUrl, parse, playerFromRow } from "./rows";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const bad = (error: string, status = 400, code?: string) => json({ error, code }, status);
const ID_RE = /^[\w-]{1,64}$/;
/** Prefixo do pack de teste do admin: sempre no inventário, abre sem gastar e sem gravar nada. */
export const TEST_PACK = "test:";

type TypeRow = { id: string; name: string; art_key: string | null; cards: number; odds_json: string; teams_json: string };

function typeFromRow(r: TypeRow): PackType {
  return {
    id: r.id, name: r.name, ...(r.art_key ? { art: imgUrl(r.art_key) } : {}), cards: r.cards,
    odds: parseOdds(parse(r.odds_json, null)) ?? DEFAULT_PACK_ODDS, teams: parse<string[]>(r.teams_json, []),
  };
}

const short = (t: PackType): InventoryPack["type"] => ({ id: t.id, name: t.name, ...(t.art ? { art: t.art } : {}) });

/** GET /api/packs: packs fechados do usuário; admin ganha também um pack de teste de cada tipo. */
async function inventory(env: Env, userId: string, admin: boolean): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT up.id AS pack_id, up.created_at, pt.* FROM user_packs up JOIN pack_types pt ON pt.id = up.pack_type_id
    WHERE up.user_id = ? AND up.opened_at IS NULL ORDER BY up.created_at, up.id`).bind(userId).all<TypeRow & { pack_id: string; created_at: number }>();
  const packs: InventoryPack[] = results.map((r) => ({ id: r.pack_id, type: short(typeFromRow(r)), createdAt: r.created_at }));
  if (admin) {
    const types = await env.DB.prepare("SELECT * FROM pack_types ORDER BY created_at, id").all<TypeRow>();
    const now = Math.floor(Date.now() / 1000);
    packs.push(...types.results.map((r) => ({ id: `${TEST_PACK}${r.id}`, type: short(typeFromRow(r)), createdAt: now, test: true })));
  }
  return json({ packs });
}

/** POST /api/packs/:id/open: sorteia no servidor e grava carta, registro e pack aberto de uma vez só. */
async function open(env: Env, user: { id: string; admin: boolean }, id: string): Promise<Response> {
  const test = id.startsWith(TEST_PACK);
  let row: TypeRow | null;
  if (test) {
    if (!user.admin) return bad("sem permissão", 403);
    row = await env.DB.prepare("SELECT * FROM pack_types WHERE id = ?").bind(id.slice(TEST_PACK.length)).first<TypeRow>();
  } else {
    const r = await env.DB.prepare("SELECT up.opened_at, pt.* FROM user_packs up JOIN pack_types pt ON pt.id = up.pack_type_id WHERE up.id = ? AND up.user_id = ?")
      .bind(id, user.id).first<TypeRow & { opened_at: number | null }>();
    if (r?.opened_at) return bad("esse pack já foi aberto", 409, "opened");
    row = r;
  }
  if (!row) return bad("pack não encontrado", 404, "not_found");
  const type = typeFromRow(row);

  const [players, owned] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM players"),
    env.DB.prepare("SELECT player_id FROM user_cards WHERE user_id = ?").bind(user.id),
  ]);
  const pool = packPool((players.results as Record<string, string | number | null>[]).map(playerFromRow), type,
    new Set((owned.results as { player_id: string }[]).map((r) => r.player_id)));
  const card = drawCard(pool, type.odds);
  // sem repetidas: se você já tem tudo o que pode sair, o pack continua fechado
  if (!card) return bad("você já tem todas as cartas que podem sair neste pack", 409, "exhausted");
  const kind = packKind(card);
  if (test) return json({ cards: [{ id: card.id, kind }], test: true });

  try {
    await env.DB.batch([
      // a chave (pack, slot) faz um segundo clique cair aqui e desfazer o lote inteiro
      env.DB.prepare("INSERT INTO pack_openings (user_pack_id, slot, user_id, player_id, kind) VALUES (?, 0, ?, ?, ?)").bind(id, user.id, card.id, kind),
      env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(user.id, card.id),
      env.DB.prepare("UPDATE user_packs SET opened_at = unixepoch() WHERE id = ? AND opened_at IS NULL").bind(id),
    ]);
  } catch (e) {
    if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(e))) return bad("esse pack já foi aberto", 409, "opened");
    throw e;
  }
  return json({ cards: [{ id: card.id, kind }] });
}

export async function packs(env: Env, request: Request, rest: string): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return bad("entre para ver seus packs", 401, "login");
  if (request.method === "GET" && !rest) return inventory(env, user.id, user.admin);
  const m = rest.match(/^([^/]+)\/open$/);
  if (request.method === "POST" && m) {
    let id = "";
    try { id = decodeURIComponent(m[1]); } catch { /* id malformado: pack não existe */ }
    return open(env, user, id);
  }
  return bad("rota inválida", 404);
}

/** Admin: /api/pack-types (GET lista; PUT/DELETE /:id). */
export async function packTypes(env: Env, request: Request, rest: string): Promise<Response> {
  if (request.method === "GET" && !rest) {
    const { results } = await env.DB.prepare("SELECT * FROM pack_types ORDER BY created_at, id").all<TypeRow>();
    return json(results.map(typeFromRow));
  }
  let id = "";
  try { id = decodeURIComponent(rest); } catch { /* id malformado */ }
  if (!ID_RE.test(id)) return bad("id inválido");
  if (request.method === "DELETE") {
    const used = await env.DB.prepare("SELECT 1 FROM user_packs WHERE pack_type_id = ? UNION ALL SELECT 1 FROM redeem_codes WHERE pack_type_id = ? LIMIT 1").bind(id, id).first();
    if (used) return bad("esse pack já tem códigos ou foi resgatado; não dá para apagar", 409, "in_use");
    await env.DB.prepare("DELETE FROM pack_types WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (request.method !== "PUT") return bad("método não suportado", 405);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name || name.length > PACK_NAME_MAX) return bad(`nome de 1 a ${PACK_NAME_MAX} letras`);
  const odds = parseOdds(b?.odds);
  if (!odds) return bad("as chances devem ser inteiros de 0 a 100 somando 100");
  const teams = Array.isArray(b?.teams) ? b.teams : [];
  if (teams.length > 100 || !teams.every((t) => typeof t === "string" && ID_RE.test(t))) return bad("times inválidos");
  const art = b?.art;
  if (art !== undefined && art !== null && art !== "" && !(typeof art === "string" && /^\/img\/packs\/[\w.-]+$/.test(art))) return bad("arte inválida");
  const artKey = typeof art === "string" && art ? art.slice(5) : null;
  // 1 carta por pack por enquanto; o campo existe para crescer depois
  await env.DB.prepare(`INSERT INTO pack_types (id, name, art_key, cards, odds_json, teams_json) VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, art_key = excluded.art_key, odds_json = excluded.odds_json, teams_json = excluded.teams_json`)
    .bind(id, name, artKey, JSON.stringify(odds), JSON.stringify(teams)).run();
  return json({ ok: true });
}
