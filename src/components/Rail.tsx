import type { useRail } from "../lib/rail";
import { arrowBtn as arrow } from "../lib/ui";
import { Icon } from "./Icon";

/** Setas de anterior e próximo de uma faixa; somem quando tudo já cabe na tela. */
export function RailArrows({ rail, prev, next }: { rail: ReturnType<typeof useRail>; prev: string; next: string }) {
  if (rail.last === 0) return null;
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => rail.go(-rail.visible)} disabled={rail.at === 0} aria-label={prev} className={arrow}><Icon name="chevron-left" className="size-5" /></button>
      <button type="button" onClick={() => rail.go(rail.visible)} disabled={rail.at === rail.last} aria-label={next} className={arrow}><Icon name="chevron-right" className="size-5" /></button>
    </div>
  );
}
