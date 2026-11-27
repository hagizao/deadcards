import type { Player } from "./types";

export const STAT_KEYS = ["MIR", "MAC", "SUP", "MOV", "POL", "CON"] as const;

export function calculateOVR(stats: Player["stats"]): number {
  const sum = STAT_KEYS.reduce((acc, k) => acc + (Number(stats[k]) || 0), 0);
  return Math.round(sum / STAT_KEYS.length);
}

export function getPlayerOvr(p: Player): number {
  const v = Number(p.ovr);
  if (p.ovr !== undefined && p.ovr !== null && Number.isFinite(v)) return Math.min(99, Math.max(1, Math.round(v)));
  return calculateOVR(p.stats);
}

export function isMainCard(p: Player): boolean {
  return !p.variantOf || p.variantOf === p.id;
}

/** Carta de herói jogado: todos os atributos e o OVR ficam isso abaixo da carta de assinatura. */
export const ALT_HERO_DROP = 2;

/** Atributos e OVR de uma carta de herói jogado: tudo ALT_HERO_DROP abaixo da principal. */
export function playedStats(main: Player): Pick<Player, "stats" | "ovr"> {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(1, (Number(main.stats[k]) || 0) - ALT_HERO_DROP)])) as Player["stats"];
  return { stats, ovr: Math.max(1, getPlayerOvr(main) - ALT_HERO_DROP) };
}

/**
 * Versão comum (não especial) do jogador, no mesmo time e com outro herói, é carta de herói jogado:
 * ganha a marca e fica tudo ALT_HERO_DROP abaixo da principal. Se deixou de ser (mesmo herói, outro time ou especial), perde a marca.
 */
export function asPlayedHero(p: Player, players: Player[]): Player {
  const main = isMainCard(p) ? undefined : players.find((x) => x.id === p.variantOf);
  if (main && !p.special && main.teamId === p.teamId && main.hero !== p.hero) return { ...p, ...playedStats(main), altHero: true };
  return p.altHero ? { ...p, altHero: undefined } : p;
}

/** Carta de herói jogado: versão do jogador com outro herói, fora do herói de assinatura. */
export function isAltHero(p: Player): boolean {
  return !isMainCard(p) && !!p.altHero;
}

/**
 * Herói jogado aposentado: o herói saiu da lista do jogador, mas alguém já tinha a carta.
 * Quem tem continua com ela; para o resto ela some e não pode mais ser dada.
 */
export function isRetired(p: Player): boolean {
  return isAltHero(p) && !!p.inactive;
}
