import type { Player } from "./types";

export function isMainCard(p: Player): boolean {
  return !p.variantOf || p.variantOf === p.id;
}

/** Carta de herói jogado: todos os atributos e o OVR ficam isso abaixo da carta de assinatura. */
export const ALT_HERO_DROP = 2;

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
