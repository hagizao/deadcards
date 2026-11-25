import { isAltHero, isMainCard } from "./cardKinds";
import { RARITY_KEYS, type RarityKey } from "./rarityBands";
import type { Player } from "./types";

/** Tipo de carta para as chances do pack: herói jogado, herói de assinatura ou especial (inclui versões de outro time). */
export const PACK_KINDS = ["alt", "signature", "special"] as const;
export type PackKind = (typeof PACK_KINDS)[number];
export type PackOdds = Record<PackKind, number>;

export const DEFAULT_PACK_ODDS: PackOdds = { alt: 80, signature: 15, special: 5 };
export const PACK_NAME_MAX = 40;

/** Chances por raridade dentro de cada tipo. Somam 100; 0 = essa raridade nunca sai. */
export type RarityOdds = Record<RarityKey, number>;
export const DEFAULT_RARITY_ODDS: RarityOdds = { eternus: 2, ascendant: 6, oracle: 12, archon: 20, arcanist: 25, initiate: 35 };
/** Diz a raridade de uma carta (depende das faixas de overall do Editor). */
export type RarityOf = (p: Player) => RarityKey;

export type PackType = {
  id: string;
  name: string;
  art?: string;
  /** Cartas por pack. Hoje sempre 1; o campo já existe para crescer sem migration. */
  cards: number;
  odds: PackOdds;
  /** Chances por raridade; sem isso, toda carta do tipo tem a mesma chance. */
  rarity?: RarityOdds;
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

/**
 * Chance exata de cada carta sair (soma 1, ou mapa vazio se nada pode sair).
 * Primeiro o tipo pelas chances de tipo; dentro do tipo, a raridade pelas chances de raridade
 * (se o pack tiver) e, dentro da raridade, toda carta com a mesma chance.
 * Raridade com 0% nunca sai; tipo ou raridade sem carta disponível sai da conta e a chance dele
 * se divide entre os outros na mesma proporção.
 */
export function cardChances(pool: Player[], type: Pick<PackType, "odds" | "rarity">, rarityOf: RarityOf): Map<string, number> {
  const rarity = type.rarity;
  const eligible = rarity ? pool.filter((p) => rarity[rarityOf(p)] > 0) : pool;
  const kinds = kindChances(eligible, type.odds);
  const out = new Map<string, number>();
  for (const k of PACK_KINDS) {
    const chance = kinds[k].chance;
    if (!chance) continue;
    const cards = eligible.filter((p) => packKind(p) === k);
    if (!rarity) {
      for (const c of cards) out.set(c.id, chance / cards.length);
      continue;
    }
    const byRarity = new Map<RarityKey, Player[]>();
    for (const c of cards) byRarity.set(rarityOf(c), [...(byRarity.get(rarityOf(c)) ?? []), c]);
    const total = [...byRarity.keys()].reduce((a, r) => a + rarity[r], 0);
    for (const [r, list] of byRarity) for (const c of list) out.set(c.id, (chance * rarity[r]) / total / list.length);
  }
  return out;
}

/** Soma as chances das cartas por tipo e por raridade, para mostrar no Editor. */
export function chanceSummary(pool: Player[], chances: Map<string, number>, rarityOf: RarityOf) {
  const kind = Object.fromEntries(PACK_KINDS.map((k) => [k, { chance: 0, cards: 0 }])) as Record<PackKind, { chance: number; cards: number }>;
  const rarity = Object.fromEntries(RARITY_KEYS.map((r) => [r, { chance: 0, cards: 0 }])) as Record<RarityKey, { chance: number; cards: number }>;
  for (const p of pool) {
    const c = chances.get(p.id) ?? 0;
    const k = kind[packKind(p)];
    const r = rarity[rarityOf(p)];
    k.chance += c;
    r.chance += c;
    if (c > 0) { k.cards++; r.cards++; }
  }
  return { kind, rarity };
}

/** Sorteia uma carta pelas chances de `cardChances`. Null se nada pode sair. */
export function drawCard(pool: Player[], type: Pick<PackType, "odds" | "rarity">, rarityOf: RarityOf, rand: () => number = Math.random): Player | null {
  const chances = cardChances(pool, type, rarityOf);
  let r = rand();
  let last: Player | null = null;
  // na ordem dos tipos, para o mesmo `rand` cair sempre no mesmo tipo
  for (const p of PACK_KINDS.flatMap((k) => pool.filter((x) => packKind(x) === k))) {
    const c = chances.get(p.id) ?? 0;
    if (!c) continue;
    if (r < c) return p;
    r -= c;
    last = p;
  }
  // arredondamento: cai na última carta que podia sair
  return last;
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

/** Valida as chances por raridade vindas do Editor: inteiros de 0 a 100 somando 100. */
export function parseRarityOdds(v: unknown): RarityOdds | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = {} as RarityOdds;
  for (const k of RARITY_KEYS) {
    const n = o[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) return null;
    out[k] = n;
  }
  return RARITY_KEYS.reduce((a, k) => a + out[k], 0) === 100 ? out : null;
}
