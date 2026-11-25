import type { TierBand } from "./types";

/**
 * Faixas de raridade por overall, sem React e sem cores: o worker usa para sortear packs.
 * O mínimo de cada faixa pode ser trocado no Editor (tierConfig, pela letra em `tierKey`).
 */
export const RARITY_BANDS = [
  { key: "eternus", tierKey: "SS", name: "Eternus", min: 93 },
  { key: "ascendant", tierKey: "S", name: "Ascendant", min: 88 },
  { key: "oracle", tierKey: "A", name: "Oracle", min: 83 },
  { key: "archon", tierKey: "B", name: "Archon", min: 77 },
  { key: "arcanist", tierKey: "C", name: "Arcanist", min: 70 },
  { key: "initiate", tierKey: "D", name: "Initiate", min: 1 },
] as const;

export type RarityKey = (typeof RARITY_BANDS)[number]["key"];
export const RARITY_KEYS: RarityKey[] = RARITY_BANDS.map((b) => b.key);

/** Mínimo de overall da faixa, com o ajuste do Editor quando existe. */
export function bandMin(band: { tierKey: string; min: number }, cfg: TierBand[] = []): number {
  const tc = cfg.find((x) => x.key === band.tierKey);
  return tc && Number.isFinite(tc.min) ? tc.min : band.min;
}

/** Raridade de um overall. */
export function rarityKeyOf(ovr: number, cfg: TierBand[] = []): RarityKey {
  return (RARITY_BANDS.find((b) => ovr >= bandMin(b, cfg)) ?? RARITY_BANDS[RARITY_BANDS.length - 1]).key;
}
