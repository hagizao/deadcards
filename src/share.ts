import type { Env } from "./worker";
import { getPlayerOvr } from "./lib/cardKinds";
import { CARD_RE, PROFILE_RE, SQUAD_RE, TEAM_RE, squadName, teamByKey } from "./lib/route";
import { imgUrl, parse, playerFromRow } from "./rows";

/**
 * Links compartilhados (/c/<carta>, /t/<time>, /u/<perfil>, /lab/elenco/<cartas>): o Worker devolve o mesmo index.html do site,
 * com título, descrição e imagem da carta, do time ou do perfil, para a prévia do Discord, X e WhatsApp.
 */

export type ShareMeta = { title: string; description: string; image?: string; large?: boolean };

const SITE = "Cardslock";

export const isSharePath = (path: string) => CARD_RE.test(path) || TEAM_RE.test(path) || PROFILE_RE.test(path) || !!SQUAD_RE.exec(path)?.[1];

export async function shareMeta(env: Env, path: string, origin: string, search = ""): Promise<ShareMeta | null> {
  const abs = (u?: string | null) => (u ? new URL(u, origin).href : undefined);

  const squad = SQUAD_RE.exec(path)?.[1];
  if (squad) {
    // até 6 cartas; a ordem é a das vagas, e carta que não existe mais fica de fora
    const ids = squad.split(".");
    const { results } = await env.DB.prepare(`SELECT * FROM players WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Record<string, string | number | null>>();
    const byId = new Map(results.map((row) => [String(row.id), playerFromRow(row)]));
    const cards = ids.map((id) => byId.get(id)).filter((p) => !!p);
    if (!cards.length) return null;
    const ovr = Math.round(cards.reduce((a, p) => a + getPlayerOvr(p), 0) / cards.length);
    const first = cards[0];
    const hero = first.art?.url ? null : await env.DB.prepare("SELECT image_key FROM heroes WHERE name = ?").bind(first.hero).first<string>("image_key");
    return {
      title: `${squadName(new URLSearchParams(search).get("n")) || "Elenco dos sonhos"} · ${SITE}`,
      description: `OVR ${ovr} · ${cards.map((p) => `${p.name} (${p.hero})`).join(", ")}`,
      image: abs(first.art?.url ?? imgUrl(hero)),
      large: true,
    };
  }

  const card = CARD_RE.exec(path)?.[1];
  if (card) {
    const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(card).first<Record<string, string | number | null>>();
    if (!row) return null;
    const p = playerFromRow(row);
    const team = await env.DB.prepare("SELECT tag FROM teams WHERE id = ?").bind(p.teamId).first<string>("tag");
    const hero = await env.DB.prepare("SELECT image_key FROM heroes WHERE name = ?").bind(p.hero).first<string>("image_key");
    const credit = p.art?.credit?.name ? ` · Arte por ${p.art.credit.name}` : "";
    return {
      title: `${p.name}${team ? ` (${team})` : ""} · ${SITE}`,
      description: `OVR ${getPlayerOvr(p)} · ${p.position || "Flex"} · ${p.hero}${p.special && p.specialText ? ` · ${p.specialText}` : ""}${credit}`,
      image: abs(p.art?.url ?? imgUrl(hero)),
      large: true,
    };
  }

  const key = TEAM_RE.exec(path)?.[1];
  if (key) {
    // o link traz a sigla (ou o id): os times são poucos, então resolve com a lista inteira, igual ao site
    const { results } = await env.DB.prepare("SELECT id, name, tag, region, logo_key FROM teams")
      .all<{ id: string; name: string; tag: string; region: string | null; logo_key: string | null }>();
    const row = teamByKey(results, key);
    if (!row) return null;
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ?").bind(row.id).first<number>("n");
    return {
      title: `${row.name} (${row.tag}) · ${SITE}`,
      description: `${row.region || "Europa"} · ${count ?? 0} ${count === 1 ? "carta" : "cartas"} no ${SITE}`,
      image: abs(imgUrl(row.logo_key)),
    };
  }

  const profile = PROFILE_RE.exec(path)?.[1];
  if (profile) {
    const handle = profile.replace(/^(@|%40)/, "");
    const userId = await env.DB.prepare("SELECT user_id FROM profile_handles WHERE handle = ?").bind(handle).first<string>("user_id") ?? handle;
    const user = await env.DB.prepare(`SELECT name, image FROM "user" WHERE id = ?`).bind(userId).first<{ name: string; image: string | null }>();
    if (!user) return null;
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_cards WHERE user_id = ?").bind(userId).first<number>("n");
    // sem foto da conta, a imagem do herói da carta de perfil
    const card = parse<{ hero?: string } | null>(
      await env.DB.prepare("SELECT snapshot FROM profile_cards WHERE user_id = ?").bind(userId).first<string>("snapshot"), null);
    const hero = card?.hero ? await env.DB.prepare("SELECT image_key FROM heroes WHERE name = ?").bind(card.hero).first<string>("image_key") : null;
    return {
      title: `${user.name} · ${SITE}`,
      description: `A coleção de ${user.name} no ${SITE}: ${count ?? 0} ${count === 1 ? "carta" : "cartas"}.`,
      image: abs(user.image ?? imgUrl(hero)),
    };
  }
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** As tags da prévia, já escapadas: Open Graph (Discord, WhatsApp, Facebook) e Twitter/X. */
export function metaTags(m: ShareMeta, url: string): string {
  const tags: [string, string, string][] = [
    ["property", "og:site_name", SITE],
    ["property", "og:type", "website"],
    ["property", "og:url", url],
    ["property", "og:title", m.title],
    ["property", "og:description", m.description],
    ["name", "description", m.description],
    ["name", "twitter:card", m.image && m.large ? "summary_large_image" : "summary"],
    ["name", "twitter:title", m.title],
    ["name", "twitter:description", m.description],
  ];
  if (m.image) tags.push(["property", "og:image", m.image], ["name", "twitter:image", m.image]);
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}" />`).join("");
}

/** O index.html do site com a prévia do link; sem a carta, o time ou o perfil, devolve o site como está. */
export async function sharePage(env: Env, request: Request, url: URL): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), request));
  const meta = await shareMeta(env, url.pathname, url.origin, url.search).catch(() => null);
  if (!meta || !page.headers.get("content-type")?.includes("text/html")) return page;
  const res = new HTMLRewriter()
    .on("title", { element: (el) => { el.setInnerContent(meta.title); } })
    // tira a prévia padrão do index.html antes de pôr a do link: sem tag repetida
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', { element: (el) => { el.remove(); } })
    .on("head", { element: (el) => { el.append(metaTags(meta, url.href), { html: true }); } })
    .transform(page);
  const headers = new Headers(res.headers);
  // a prévia muda quando a carta muda; os robôs das redes guardam o resto por conta própria
  headers.set("cache-control", "public, max-age=300");
  return new Response(res.body, { status: res.status, headers });
}
