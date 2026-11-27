import type { CSSProperties } from "react";
import { RARITY_TIERS } from "./rarity";
import type { RarityKey } from "./rarityBands";

/** As áreas do site; cada uma tem a cor de uma raridade, da mais rara para a mais comum. */
export type AreaKey = "teams" | "tierlist" | "collection" | "compare" | "redeem";

export const AREA_RARITY: Record<AreaKey, RarityKey> = { teams: "eternus", tierlist: "ascendant", collection: "oracle", compare: "archon", redeem: "arcanist" };

export const areaTier = (area: AreaKey) => RARITY_TIERS.find((r) => r.key === AREA_RARITY[area])!;

/**
 * Tema da área: troca o token `--color-area` (as utilitárias text-area, bg-area, border-area...) pela cor da raridade dela.
 * Fora de uma área o token fica no bege do site (index.css).
 */
export const areaStyle = (area?: AreaKey | null): CSSProperties | undefined =>
  area ? ({ "--color-area": areaTier(area).c } as CSSProperties) : undefined;
