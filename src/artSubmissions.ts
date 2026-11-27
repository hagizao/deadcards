import { currentUser } from "./auth";
import type { Env } from "./worker";
import type { ArtCredit } from "./lib/types";
import { ART_PENDING_MAX, ART_SUBMISSION_MAX_BYTES, type ArtLayout, type ArtSubmission } from "./lib/artSubmissions";

/**
 * Banco de artes: qualquer conta logada envia uma arte (com a camada da frente opcional) já ajustada numa carta especial;
 * só quem enviou e os admins veem as imagens. O admin usa a arte numa carta especial, recusa ou apaga.
 */

type Row = {
  id: string; user_id: string; image_key: string; fg_key: string | null; layout_json: string; credit_name: string; credit_url: string | null;
  status: ArtSubmission["status"]; used_player_id: string | null; created_at: number; user_name?: string | null;
};

const bad = (msg: string, status = 400, code?: string) => Response.json({ error: msg, code }, { status });
const ID_RE = /^[\w-]{1,64}$/;

/** Tipo da imagem pelos primeiros bytes (não pelo nome nem pelo content-type, que quem envia controla). */
export function sniffImage(buf: ArrayBuffer): { ext: string; type: string } | null {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Ajuste da prévia, sempre dentro dos limites dos controles; o resto é descartado. */
export function layoutOf(v: unknown, hasFg: boolean): ArtLayout {
  const l = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const fg = (l.fg && typeof l.fg === "object" ? l.fg : {}) as Record<string, unknown>;
  const out: ArtLayout = { zoom: clamp(l.zoom, 50, 300, 100), x: clamp(l.x, 0, 100, 50), y: clamp(l.y, 0, 100, 50) };
  if (hasFg) out.fg = { zoom: clamp(fg.zoom, 50, 300, 100), x: clamp(fg.x, 0, 100, 50), y: clamp(fg.y, 0, 100, 50) };
  if (typeof l.frame === "string" && /^[a-z-]{1,32}$/.test(l.frame)) out.frame = l.frame;
  if (typeof l.playerId === "string" && ID_RE.test(l.playerId)) out.playerId = l.playerId;
  return out;
}

function creditOf(v: unknown): ArtCredit | null {
  const c = (v && typeof v === "object" ? v : {}) as { name?: unknown; url?: unknown };
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (!name || name.length > 60) return null;
  if (c.url === undefined || c.url === null || c.url === "") return { name };
  if (typeof c.url !== "string" || c.url.length > 300) return null;
  try {
    const u = new URL(c.url);
    return u.protocol === "https:" || u.protocol === "http:" ? { name, url: u.href } : null;
  } catch { return null; }
}

const imageUrl = (id: string, layer: "bg" | "fg") => `/api/art-submissions/${id}/image/${layer}`;

function toSubmission(r: Row, withUser: boolean): ArtSubmission {
  return {
    id: r.id,
    status: r.status,
    image: imageUrl(r.id, "bg"),
    ...(r.fg_key ? { fg: imageUrl(r.id, "fg") } : {}),
    layout: JSON.parse(r.layout_json) as ArtLayout,
    credit: r.credit_url ? { name: r.credit_name, url: r.credit_url } : { name: r.credit_name },
    createdAt: r.created_at,
    ...(r.used_player_id ? { usedPlayerId: r.used_player_id } : {}),
    ...(withUser ? { user: r.user_name ?? "?" } : {}),
  };
}

async function readImage(form: FormData, field: string): Promise<{ buf: ArrayBuffer; ext: string; type: string } | null | "bad"> {
  const f = form.get(field);
  if (f === null || f === "") return null;
  if (typeof f === "string") return "bad";
  const buf = await f.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > ART_SUBMISSION_MAX_BYTES) return "bad";
  const kind = sniffImage(buf);
  return kind ? { buf, ...kind } : "bad";
}

async function create(env: Env, request: Request, userId: string): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return bad("envio inválido");
  let meta: Record<string, unknown>;
  try { meta = JSON.parse(String(form.get("meta") ?? "")) as Record<string, unknown>; } catch { return bad("envio inválido"); }
  // as duas confirmações são obrigatórias: a arte é da pessoa (feita por ela, não por IA) e ela autoriza o uso com crédito
  if (meta.own !== true || meta.consent !== true) return bad("confirme que a arte é sua e autorize o uso", 400, "consent");
  const credit = creditOf(meta.credit);
  if (!credit) return bad("crédito inválido: nome até 60 caracteres e link http(s)", 400, "credit");
  const image = await readImage(form, "image");
  if (!image || image === "bad") return bad("imagem PNG, JPG ou WebP de até 5 MB", 400, "image");
  const fg = await readImage(form, "fg");
  if (fg === "bad") return bad("camada da frente PNG, JPG ou WebP de até 5 MB", 400, "image");

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM art_submissions WHERE user_id = ? AND status = 'pending'").bind(userId).first<number>("n");
  if ((pending ?? 0) >= ART_PENDING_MAX) return bad(`até ${ART_PENDING_MAX} artes em análise por vez`, 409, "limit");

  const id = crypto.randomUUID();
  const key = (img: { ext: string }, layer: string) => `submissions/${id}-${layer}.${img.ext}`;
  await env.ASSETS_BUCKET.put(key(image, "bg"), image.buf, { httpMetadata: { contentType: image.type } });
  if (fg) await env.ASSETS_BUCKET.put(key(fg, "fg"), fg.buf, { httpMetadata: { contentType: fg.type } });
  await env.DB.prepare(
    "INSERT INTO art_submissions (id, user_id, image_key, fg_key, layout_json, credit_name, credit_url, status, created_at) VALUES (?,?,?,?,?,?,?, 'pending', ?)",
  ).bind(id, userId, key(image, "bg"), fg ? key(fg, "fg") : null, JSON.stringify(layoutOf(meta.layout, !!fg)), credit.name, credit.url ?? null, Date.now()).run();
  return Response.json({ id });
}

/** Leva a arte para uma carta especial: copia as imagens para players/ (públicas) e grava arte, ajuste e crédito na carta. */
async function applyToCard(env: Env, row: Row, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null;
  const playerId = body?.playerId;
  if (typeof playerId !== "string" || !ID_RE.test(playerId)) return bad("carta inválida");
  const player = await env.DB.prepare("SELECT extra_json FROM players WHERE id = ?").bind(playerId).first<{ extra_json: string | null }>();
  if (!player) return bad("carta não encontrada", 404);
  const extra = JSON.parse(player.extra_json || "{}") as Record<string, unknown>;
  // artes do banco só vão em cartas especiais
  if (extra.special !== true) return bad("as artes do banco só vão em cartas especiais", 400, "not_special");

  const copy = async (key: string) => {
    const obj = await env.ASSETS_BUCKET.get(key);
    if (!obj) return null;
    const dest = `players/${crypto.randomUUID()}.${key.split(".").pop()}`;
    await env.ASSETS_BUCKET.put(dest, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
    return `/img/${dest}`;
  };
  const url = await copy(row.image_key);
  if (!url) return bad("imagem da arte não encontrada", 404);
  const fgUrl = row.fg_key ? await copy(row.fg_key) : null;
  const layout = JSON.parse(row.layout_json) as ArtLayout;
  const credit: ArtCredit = row.credit_url ? { name: row.credit_name, url: row.credit_url } : { name: row.credit_name };
  extra.art = { url, zoom: layout.zoom, x: layout.x, y: layout.y, credit, ...(fgUrl && layout.fg ? { fg: { url: fgUrl, ...layout.fg } } : {}) };
  await env.DB.batch([
    env.DB.prepare("UPDATE players SET extra_json = ? WHERE id = ?").bind(JSON.stringify(extra), playerId),
    env.DB.prepare("UPDATE art_submissions SET status = 'used', used_player_id = ? WHERE id = ?").bind(playerId, row.id),
  ]);
  return Response.json({ ok: true });
}

export async function artSubmissions(env: Env, request: Request, rest: string): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return bad("entre para enviar artes", 401, "login");
  const url = new URL(request.url);

  if (rest === "") {
    if (request.method === "POST") return create(env, request, user.id);
    if (request.method !== "GET") return bad("método não suportado", 405);
    const all = url.searchParams.get("all") === "1";
    if (all && !user.admin) return bad("sem permissão", 403);
    const rows = all
      ? await env.DB.prepare(`SELECT s.*, u.name AS user_name FROM art_submissions s LEFT JOIN "user" u ON u.id = s.user_id ORDER BY s.status = 'pending' DESC, s.created_at DESC`).all<Row>()
      : await env.DB.prepare("SELECT * FROM art_submissions WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all<Row>();
    return Response.json(rows.results.map((r) => toSubmission(r, all)), { headers: { "cache-control": "private, no-store" } });
  }

  const m = rest.match(/^([\w-]{1,64})(?:\/(image\/(bg|fg)|use))?$/);
  if (!m) return bad("rota inválida", 404);
  const row = await env.DB.prepare("SELECT * FROM art_submissions WHERE id = ?").bind(m[1]).first<Row>();
  // de outra pessoa: responde como se não existisse
  if (!row || (row.user_id !== user.id && !user.admin)) return bad("arte não encontrada", 404);

  if (m[3]) {
    if (request.method !== "GET") return bad("método não suportado", 405);
    const key = m[3] === "fg" ? row.fg_key : row.image_key;
    const obj = key ? await env.ASSETS_BUCKET.get(key) : null;
    if (!obj) return new Response("not found", { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=300");
    headers.set("x-content-type-options", "nosniff");
    return new Response(obj.body, { headers });
  }

  if (m[2] === "use") {
    if (!user.admin) return bad("sem permissão", 403);
    return request.method === "POST" ? applyToCard(env, row, request) : bad("método não suportado", 405);
  }

  if (request.method === "DELETE") {
    // quem enviou só apaga enquanto está em análise; o admin apaga qualquer uma (a carta que já usa a arte fica com a cópia dela)
    if (!user.admin && row.status !== "pending") return bad("só dá para apagar arte em análise", 409, "not_pending");
    await env.ASSETS_BUCKET.delete([row.image_key, ...(row.fg_key ? [row.fg_key] : [])]);
    await env.DB.prepare("DELETE FROM art_submissions WHERE id = ?").bind(row.id).run();
    return Response.json({ ok: true });
  }
  if (request.method === "PATCH") {
    if (!user.admin) return bad("sem permissão", 403);
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    if (body?.status !== "rejected" && body?.status !== "pending") return bad("status inválido");
    await env.DB.prepare("UPDATE art_submissions SET status = ? WHERE id = ?").bind(body.status, row.id).run();
    return Response.json({ ok: true });
  }
  return bad("método não suportado", 405);
}
