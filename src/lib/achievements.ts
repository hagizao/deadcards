import { POSITIONS, activeRoster, cardVersions, getPlayerOvr, isAltHero, isMainCard, isRetired } from "./cards";
import { MAX_FAVORITES } from "./profile";
import type { Player, Team } from "./types";

/** Raridade da conquista, da iniciante (bronze) à mais difícil (diamante). */
export type AchievementRarity = "bronze" | "silver" | "gold" | "diamond";
export const ACHIEVEMENT_RARITIES: AchievementRarity[] = ["bronze", "silver", "gold", "diamond"];

export type AchievementId =
  | "first-card" | "profile-card" | "first-favorite" | "five-cards" | "first-played" | "ovr-85"
  | "twenty-five" | "all-roles" | "five-teams" | "ovr-90" | "played-10" | "favorites-max" | "same-hero" | "roster-1"
  | "fifty" | "world" | "special-1" | "full-player" | "heroes-20" | "elite" | "roster-2"
  | "hundred" | "half" | "specials-3" | "ovr-95" | "roster-3";

export type Achievement = { id: AchievementId; rarity: AchievementRarity; value: number; goal: number; done: boolean };

/** Região "Sem Time" não conta para volta ao mundo nem como time a completar. */
const NO_TEAM = "Sem Time";
const MIN_ROSTER = 3;
const MIN_VERSIONS = 3;
const SAME_HERO = 5;

/** Conquistas do perfil, calculadas só com a coleção pública: nada novo é guardado no banco. */
export function achievementsFor(players: Player[], teams: Team[], ownedIds: string[], extra: { profileCard: boolean; favorites: number }): Achievement[] {
  const owned = new Set(ownedIds);
  const cards = players.filter((p) => owned.has(p.id));
  const count = (f: (p: Player) => boolean) => cards.filter(f).length;
  const ovrAtLeast = (n: number) => count((p) => getPlayerOvr(p) >= n);
  const regionOf = new Map(teams.map((t) => [t.id, t.region]));
  const worldRegions = new Set(teams.filter((t) => t.region !== NO_TEAM).map((t) => t.region));
  const myRegions = new Set(cards.map((p) => regionOf.get(p.teamId)).filter((r): r is string => !!r && worldRegions.has(r)));

  // times completos: todas as cartas do elenco de um time de verdade (com pelo menos MIN_ROSTER cartas)
  const fullRosters = teams
    .filter((t) => t.region !== NO_TEAM)
    .map((t) => activeRoster(players, t.id))
    .filter((r) => r.length >= MIN_ROSTER && r.every((p) => owned.has(p.id))).length;

  // jogador completo: todas as versões ainda ativas de um jogador com pelo menos MIN_VERSIONS cartas
  const groups = players.filter(isMainCard).map((m) => cardVersions(players, m).filter((p) => !isRetired(p))).filter((g) => g.length >= MIN_VERSIONS);
  const bestGroup = groups.reduce<{ value: number; goal: number }>((best, g) => {
    const value = g.filter((p) => owned.has(p.id)).length;
    return value / g.length > best.value / best.goal ? { value, goal: g.length } : best;
  }, { value: 0, goal: MIN_VERSIONS });

  const byHero = new Map<string, number>();
  for (const p of cards) byHero.set(p.hero, (byHero.get(p.hero) ?? 0) + 1);

  const list: Omit<Achievement, "done">[] = [
    { id: "first-card", rarity: "bronze", value: cards.length, goal: 1 },
    { id: "profile-card", rarity: "bronze", value: Number(extra.profileCard), goal: 1 },
    { id: "first-favorite", rarity: "bronze", value: extra.favorites, goal: 1 },
    { id: "five-cards", rarity: "bronze", value: cards.length, goal: 5 },
    { id: "first-played", rarity: "bronze", value: count(isAltHero), goal: 1 },
    { id: "ovr-85", rarity: "bronze", value: ovrAtLeast(85), goal: 1 },

    { id: "twenty-five", rarity: "silver", value: cards.length, goal: 25 },
    { id: "all-roles", rarity: "silver", value: new Set(cards.map((p) => p.position).filter((r) => POSITIONS.includes(r))).size, goal: POSITIONS.length },
    { id: "five-teams", rarity: "silver", value: new Set(cards.map((p) => p.teamId)).size, goal: 5 },
    { id: "ovr-90", rarity: "silver", value: ovrAtLeast(90), goal: 1 },
    { id: "played-10", rarity: "silver", value: count(isAltHero), goal: 10 },
    { id: "favorites-max", rarity: "silver", value: extra.favorites, goal: MAX_FAVORITES },
    { id: "same-hero", rarity: "silver", value: Math.max(0, ...byHero.values()), goal: SAME_HERO },
    { id: "roster-1", rarity: "silver", value: fullRosters, goal: 1 },

    { id: "fifty", rarity: "gold", value: cards.length, goal: 50 },
    { id: "world", rarity: "gold", value: myRegions.size, goal: Math.max(1, worldRegions.size) },
    { id: "special-1", rarity: "gold", value: count((p) => !!p.special), goal: 1 },
    { id: "full-player", rarity: "gold", ...bestGroup },
    { id: "heroes-20", rarity: "gold", value: byHero.size, goal: 20 },
    { id: "elite", rarity: "gold", value: ovrAtLeast(93), goal: 5 },
    { id: "roster-2", rarity: "gold", value: fullRosters, goal: 2 },

    { id: "hundred", rarity: "diamond", value: cards.length, goal: 100 },
    { id: "half", rarity: "diamond", value: cards.length, goal: Math.max(1, Math.ceil(players.length / 2)) },
    { id: "specials-3", rarity: "diamond", value: count((p) => !!p.special), goal: 3 },
    { id: "ovr-95", rarity: "diamond", value: ovrAtLeast(95), goal: 1 },
    { id: "roster-3", rarity: "diamond", value: fullRosters, goal: 3 },
  ];
  return list.map((a) => ({ ...a, value: Math.min(a.value, a.goal), done: a.value >= a.goal }));
}
