import type { useRail } from "../lib/rail";
import { Icon } from "./Icon";

const arrow = "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-900/80 text-zinc-200 transition-[background-color,opacity] hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95 disabled:cursor-default disabled:opacity-30";

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
