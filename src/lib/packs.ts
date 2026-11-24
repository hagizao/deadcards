import { isAltHero, isMainCard } from "./cardKinds";
import type { Player } from "./types";

/** Tipo de carta para as chances do pack: herói jogado, herói de assinatura ou especial (inclui versões de outro time). */
export const PACK_KINDS = ["alt", "signature", "special"] as const;
export type PackKind = (typeof PACK_KINDS)[number];
export type PackOdds = Record<PackKind, number>;

export const DEFAULT_PACK_ODDS: PackOdds = { alt: 80, signature: 15, special: 5 };
export const PACK_NAME_MAX = 40;

export type PackType = {
  id: string;
  name: string;
  art?: string;
  /** Cartas por pack. Hoje sempre 1; o campo já existe para crescer sem migration. */
  cards: number;
  odds: PackOdds;
  /** Times do pool; vazio = todos os times. */
  teams: string[];
};

/** Pack no inventário do usuário. `test` é o pack de teste do admin: abre sem gastar e sem gravar. */
export type InventoryPack = { id: string; type: Pick<PackType, "id" | "name" | "art">; createdAt: number; test?: boolean };

export function packKind(p: Player): PackKind {
  if (isAltHero(p)) return "alt";
  return isMainCard(p) && !p.special ? "signature" : "special";
}

/** Cartas que podem sair: ativas, dos times do pack e que a pessoa ainda não tem (sem repetidas). */
export function packPool(players: Player[], type: Pick<PackType, "teams">, owned: Set<string>): Player[] {
  return players.filter((p) => !p.inactive && !owned.has(p.id) && (!type.teams.length || type.teams.includes(p.teamId)));
}

/**
 * Chance real de cada tipo no pool. Tipo sem carta disponível sai da conta e a chance dele
 * se divide entre os outros na mesma proporção. Soma 1, ou 0 se nada pode sair.
 */
export function kindChances(pool: Player[], odds: PackOdds): Record<PackKind, { chance: number; cards: number }> {
  const count = Object.fromEntries(PACK_KINDS.map((k) => [k, 0])) as Record<PackKind, number>;
  for (const p of pool) count[packKind(p)]++;
  const weight = (k: PackKind) => (count[k] > 0 ? Math.max(0, odds[k]) : 0);
  const total = PACK_KINDS.reduce((a, k) => a + weight(k), 0);
  return Object.fromEntries(PACK_KINDS.map((k) => [k, { chance: total ? weight(k) / total : 0, cards: count[k] }])) as Record<PackKind, { chance: number; cards: number }>;
}

/** Sorteia uma carta: primeiro o tipo pelas chances, depois uma carta do tipo, todas com a mesma chance. Null se o pool esgotou. */
export function drawCard(pool: Player[], odds: PackOdds, rand: () => number = Math.random): Player | null {
  const chances = kindChances(pool, odds);
  let r = rand();
  for (const k of PACK_KINDS) {
    const { chance } = chances[k];
    if (!chance) continue;
    if (r < chance) {
      const cards = pool.filter((p) => packKind(p) === k);
      return cards[Math.min(cards.length - 1, Math.floor(rand() * cards.length))];
    }
    r -= chance;
  }
  // arredondamento: cai no último tipo com chance
  const last = [...PACK_KINDS].reverse().find((k) => chances[k].chance > 0);
  if (!last) return null;
  const cards = pool.filter((p) => packKind(p) === last);
  return cards[Math.floor(rand() * cards.length)];
}

/** Valida as chances vindas do Editor: inteiros de 0 a 100 somando 100. */
export function parseOdds(v: unknown): PackOdds | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = {} as PackOdds;
  for (const k of PACK_KINDS) {
    const n = o[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) return null;
    out[k] = n;
  }
  return PACK_KINDS.reduce((a, k) => a + out[k], 0) === 100 ? out : null;
}
