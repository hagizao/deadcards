import { POSITIONS, activeRoster, cardVersions, getPlayerOvr, isAltHero, isMainCard, isRetired } from "./cards";
import type { Player, Team } from "./types";

export type AchievementLevel = "easy" | "medium" | "hard" | "team";
export type AchievementId =
  | "first-card" | "five-cards" | "profile-card" | "first-favorite"
  | "twenty-five" | "all-roles" | "five-teams" | "ovr-90" | "played-10" | "special-1"
  | "hundred" | "world" | "elite" | "specials-3" | "full-player" | "first-roster" | "half"
  | "team";

export type Achievement = { key: string; id: AchievementId; level: AchievementLevel; value: number; goal: number; done: boolean; team?: Team };

/** Região "Sem Time" não conta para volta ao mundo nem ganha conquista de elenco. */
const NO_TEAM = "Sem Time";
const ELITE_OVR = 93;
const MIN_ROSTER = 3;
const MIN_VERSIONS = 3;

/** Conquistas do perfil, calculadas só com a coleção pública: nada novo é guardado no banco. */
export function achievementsFor(players: Player[], teams: Team[], ownedIds: string[], extra: { profileCard: boolean; favorites: number }): Achievement[] {
  const owned = new Set(ownedIds);
  const cards = players.filter((p) => owned.has(p.id));
  const count = (f: (p: Player) => boolean) => cards.filter(f).length;
  const regionOf = new Map(teams.map((t) => [t.id, t.region]));
  const worldRegions = new Set(teams.filter((t) => t.region !== NO_TEAM).map((t) => t.region));
  const myRegions = new Set(cards.map((p) => regionOf.get(p.teamId)).filter((r): r is string => !!r && worldRegions.has(r)));

  // elencos que valem conquista: times de verdade com pelo menos MIN_ROSTER cartas no elenco
  const rosters = teams
    .filter((t) => t.region !== NO_TEAM)
    .map((team) => ({ team, roster: activeRoster(players, team.id) }))
    .filter((r) => r.roster.length >= MIN_ROSTER);
  const rosterDone = (r: { roster: Player[] }) => r.roster.filter((p) => owned.has(p.id)).length;
  const bestRoster = Math.max(0, ...rosters.map((r) => rosterDone(r) / r.roster.length));

  // jogador completo: todas as versões ainda ativas de um jogador com pelo menos MIN_VERSIONS cartas
  const groups = players.filter(isMainCard).map((m) => cardVersions(players, m).filter((p) => !isRetired(p))).filter((g) => g.length >= MIN_VERSIONS);
  const bestGroup = groups.reduce<{ value: number; goal: number }>((best, g) => {
    const value = g.filter((p) => owned.has(p.id)).length;
    return value / g.length > best.value / best.goal ? { value, goal: g.length } : best;
  }, { value: 0, goal: MIN_VERSIONS });

  const list: Omit<Achievement, "done" | "key">[] = [
    { id: "first-card", level: "easy", value: cards.length, goal: 1 },
    { id: "profile-card", level: "easy", value: Number(extra.profileCard), goal: 1 },
    { id: "first-favorite", level: "easy", value: extra.favorites, goal: 1 },
    { id: "five-cards", level: "easy", value: cards.length, goal: 5 },
    { id: "twenty-five", level: "medium", value: cards.length, goal: 25 },
    { id: "all-roles", level: "medium", value: new Set(cards.map((p) => p.position).filter((r) => POSITIONS.includes(r))).size, goal: POSITIONS.length },
    { id: "five-teams", level: "medium", value: new Set(cards.map((p) => p.teamId)).size, goal: 5 },
    { id: "ovr-90", level: "medium", value: count((p) => getPlayerOvr(p) >= 90), goal: 1 },
    { id: "played-10", level: "medium", value: count(isAltHero), goal: 10 },
    { id: "special-1", level: "medium", value: count((p) => !!p.special), goal: 1 },
    { id: "hundred", level: "hard", value: cards.length, goal: 100 },
    { id: "half", level: "hard", value: cards.length, goal: Math.max(1, Math.ceil(players.length / 2)) },
    { id: "world", level: "hard", value: myRegions.size, goal: Math.max(1, worldRegions.size) },
    { id: "elite", level: "hard", value: count((p) => getPlayerOvr(p) >= ELITE_OVR), goal: 5 },
    { id: "specials-3", level: "hard", value: count((p) => !!p.special), goal: 3 },
    { id: "full-player", level: "hard", ...bestGroup },
    { id: "first-roster", level: "hard", value: bestRoster >= 1 ? 1 : 0, goal: 1 },
    ...rosters.map(({ team, roster }) => ({ id: "team" as const, level: "team" as const, team, value: rosterDone({ roster }), goal: roster.length })),
  ];
  return list.map((a) => ({ ...a, key: a.team ? `team:${a.team.id}` : a.id, value: Math.min(a.value, a.goal), done: a.value >= a.goal }));
}
