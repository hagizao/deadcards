import type { Player } from "./lib/types";

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
