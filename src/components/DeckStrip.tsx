import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";
import type { CardStats, PoolCard } from "../lib/game/config";
import type { Tier } from "../lib/rarity";

export const deckFocus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";

/** O que as telas de baralho precisam saber de cada carta: números, a carta desenhada e a arte do herói. */
export type DeckKit = {
  stats: (c: PoolCard) => CardStats;
  /** Raridade da carta (cor da moldura). */
  tier: (c: PoolCard) => Tier;
  face: (c: PoolCard) => ReactNode;
  /** A carta com o texto da habilidade e as animações da moldura, para ler (hover do leque). */
  full: (c: PoolCard) => ReactNode;
  art: (c: PoolCard) => { url: string; x: number; y: number } | null;
};

/** Selo de custo pequeno: a mesma orbe de almas da carta, em tamanho de lista. */
export function CostDot({ cost, className = "size-7 text-sm" }: { cost: number; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-radial-[at_50%_35%] from-teal-400 via-teal-800 to-teal-950 font-extrabold text-white shadow-[0_0_0_2px_var(--color-game-soul),0_0_10px_var(--color-game-soul)] ${className}`}>
      {cost}
    </span>
  );
}

/**
 * Tira do baralho (como a lista de deck do Hearthstone): custo, nome e poder sobre um recorte da arte do herói, que some
 * para a esquerda. A borda tem a cor da raridade da carta (a mesma da moldura), com um filete de metal à esquerda.
 * Tocar abre a carta; o × tira do baralho.
 */
export function DeckStrip({ c, kit, cover, onOpen, onRemove, openLabel, removeLabel }: {
  c: PoolCard; kit: DeckKit; cover?: boolean; onOpen?: () => void; onRemove?: () => void; openLabel: string; removeLabel: string;
}) {
  const s = kit.stats(c);
  const art = kit.art(c);
  const tier = kit.tier(c);
  // cor da raridade é dado da carta: vai por variável
  const rk = { "--rk-c": tier.c, "--rk-hi": tier.hi, "--rk-lo": tier.lo } as CSSProperties;
  const body = (
    <>
      {art && (
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-3/4 mask-l-from-35% mask-l-to-100% bg-cover opacity-80 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
          style={{ backgroundImage: `url(${art.url})`, backgroundPosition: `${art.x}% ${Math.max(0, art.y - 15)}%` }} />
      )}
      <CostDot cost={s.cost} />
      <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
        <b className="truncate text-sm font-extrabold tracking-wide text-white uppercase [text-shadow:0_1px_2px_rgb(0_0_0)]">{c.name}</b>
        <span className="truncate text-[11px] text-zinc-300 [text-shadow:0_1px_2px_rgb(0_0_0)]">{cover ? "★ " : ""}{c.hero}</span>
      </span>
      <b className="relative grid size-7 shrink-0 place-items-center rounded-full bg-zinc-950/80 text-sm font-extrabold text-amber-200">{s.power}</b>
    </>
  );
  return (
    <div style={rk} title={tier.name} className="group relative flex items-center overflow-clip rounded-lg bg-zinc-900/90 shadow-[inset_0_0_0_1.5px_var(--rk-c),0_0_12px_-3px_var(--rk-c),0_2px_8px_rgb(0_0_0/0.45)]">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 z-10 w-1 bg-linear-to-b from-(--rk-hi) via-(--rk-c) to-(--rk-lo)" />
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={openLabel}
          className={`relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 text-left transition active:scale-[0.98] motion-reduce:transition-none ${deckFocus}`}>
          {body}
        </button>
      ) : (
        <span className="relative flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2">{body}</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel}
          className={`relative grid size-11 shrink-0 cursor-pointer place-items-center bg-zinc-950/70 text-zinc-400 transition hover:bg-rose-950/80 hover:text-rose-200 active:scale-90 motion-reduce:transition-none ${deckFocus}`}>
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  );
}

/** As 12 vagas do baralho como fichas: cheias na cor do jogador, vazias apagadas. */
export function DeckPips({ n, max, className = "" }: { n: number; max: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex gap-1 ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none ${i < n ? "bg-game-me shadow-[0_0_6px_var(--color-game-me)]" : "bg-white/10"}`} />
      ))}
    </span>
  );
}

const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Curva de custo em barras (8 = 8 ou mais). */
export function DeckCurve({ cards, kit, label, className = "h-10" }: { cards: PoolCard[]; kit: DeckKit; label: string; className?: string }) {
  const curve = COSTS.map((n) => cards.filter((c) => Math.min(8, Math.max(1, kit.stats(c).cost)) === n).length);
  const peak = Math.max(1, ...curve);
  return (
    <figure className="flex flex-col gap-1" aria-label={`${label}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
      <div className={`flex items-end gap-1.5 ${className}`} aria-hidden="true">
        {curve.map((n, i) => (
          <span key={COSTS[i]} className="h-full flex-1 origin-bottom rounded-sm bg-game-me/70 transition-transform duration-200 motion-reduce:transition-none"
            style={{ transform: `scaleY(${Math.max(0.06, n / peak)})`, opacity: n ? 1 : 0.25 }} />
        ))}
      </div>
      <figcaption className="flex gap-1.5 text-[10px] text-zinc-500" aria-hidden="true">
        {COSTS.map((n) => <span key={n} className="flex-1 text-center">{n === 8 ? "8+" : n}</span>)}
      </figcaption>
    </figure>
  );
}
