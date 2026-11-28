import type { ArtCredit, Player } from "./lib/types";

/** Linhas do D1 para os tipos do app; usado pelo worker e pelos packs. */
export const imgUrl = (key: string | null) => (key ? `/img/${key}` : undefined);

export const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export function playerFromRow(p: Record<string, string | number | null>): Player {
  return {
    ...parse<Partial<Player>>(p.extra_json as string, {}),
    id: p.id as string, teamId: p.team_id as string, name: p.name as string, position: p.position as string, hero: p.hero as string,
    stats: parse(p.stats_json as string, {} as Player["stats"]), ...(p.ovr !== null ? { ovr: p.ovr as number } : {}),
    c1: p.c1 as string, c2: p.c2 as string, history: parse(p.history_json as string, []),
  };
}

/** Crédito da arte: nome até 60 caracteres e link http(s) opcional; undefined se não veio, null se inválido. */
export function artCredit(v: unknown): ArtCredit | null | undefined {
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
