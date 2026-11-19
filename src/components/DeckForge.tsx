import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FullscreenButton, TagButton } from "./BarButton";
import { CardBack } from "./GameCard";
import { DeckCurve, DeckPips, DeckStrip, deckFocus, type DeckKit } from "./DeckStrip";
import { HoldButton } from "./HoldButton";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { field, pill } from "../lib/ui";
import { ALT_MALUS, ALT_POL, type PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { DECK_LOOKS, DECK_NAME_MAX, MAX_DECKS, heroTaken, type DeckLook, type SavedDeck } from "../lib/game/deck";
import { sfx } from "../lib/game/sfx";
import { GAME_TEXT } from "../lib/game/text";

const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Heróis diferentes entre as versões do jogador (duas cartas do mesmo herói contam uma vez). */
const heroCount = (l: PoolCard[]) => new Set(l.map((c) => c.hero)).size;

/** Cartas por página do fichário: 4×2 a partir de sm, 3×2 no celular. */
function usePageSize() {
  const wide = useSyncExternalStore(
    (cb) => { const m = matchMedia("(min-width: 640px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia("(min-width: 640px)").matches,
    () => true,
  );
  return wide ? 8 : 6;
}

type Props = {
  cur: SavedDeck; deck: PoolCard[]; versions: Map<string, PoolCard[]>; look: DeckLook; cover?: PoolCard; kit: DeckKit; deckCount: number;
  /** Versão mostrada no fichário de quem ainda não está no baralho. */
  current: (l: PoolCard[]) => PoolCard;
  onBack: () => void; onPlay: () => void; onOpen: (key: string) => void; onToggle: (c: PoolCard) => void;
  onPatch: (p: Partial<SavedDeck>) => void; onRandom: () => void; onClear: () => void; onDuplicate: () => void; onRemove: () => void;
};

/**
 * Oficina: montar à mão. A coleção vira um fichário com páginas (como o Hearthstone), filtrado por custo e nome; tocar numa
 * carta põe ou tira do baralho e o "i" abre os detalhes. O baralho fica num trilho de tiras ao lado (no celular, numa barra
 * embaixo que abre a lista).
 */
export function DeckForge({ cur, deck, versions, look, cover, kit, deckCount, current, onBack, onPlay, onOpen, onToggle, onPatch, onRandom, onClear, onDuplicate, onRemove }: Props) {
  const t = useT(GAME_TEXT);
  const still = useReducedMotion();
  const size = usePageSize();
  const [query, setQuery] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  // página guardada junto com o filtro em que foi aberta: filtro novo volta para a primeira
  const [page, setPage] = useState({ n: 0, dir: 0, k: "" });
  const [sheet, setSheet] = useState(false);
  const inDeck = new Map(deck.map((c) => [c.key, c]));
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const sorted = [...deck].sort((a, b) => kit.stats(a).cost - kit.stats(b).cost || a.name.localeCompare(b.name));
  const costOf = (c: PoolCard) => Math.min(8, Math.max(1, kit.stats(c).cost));

  const q = query.trim().toLowerCase();
  const list = [...versions.values()]
    .filter((l) => !q || l.some((v) => v.name.toLowerCase().includes(q) || v.hero.toLowerCase().includes(q)))
    .filter((l) => cost === null || costOf(current(l)) === cost)
    .sort((a, b) => kit.stats(current(a)).cost - kit.stats(current(b)).cost || b[0].ovr - a[0].ovr || a[0].name.localeCompare(b[0].name));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const fk = `${q}|${cost}|${size}`;
  const n = page.k === fk ? Math.min(page.n, pages - 1) : 0;
  const shown = list.slice(n * size, n * size + size);
  const go = (d: number) => setPage({ n: Math.max(0, Math.min(pages - 1, n + d)), dir: d, k: fk });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [role=dialog]")) return;
      if (e.key === "ArrowRight") setPage((p) => ({ n: Math.min(pages - 1, (p.k === fk ? p.n : 0) + 1), dir: 1, k: fk }));
      if (e.key === "ArrowLeft") setPage((p) => ({ n: Math.max(0, (p.k === fk ? p.n : 0) - 1), dir: -1, k: fk }));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pages, fk]);
  const swipe = (_: unknown, i: PanInfo) => { if (Math.abs(i.offset.x) > 60) go(i.offset.x < 0 ? 1 : -1); };

  const strips = (
    <ul aria-label={t.deck.list} className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {sorted.map((c) => (
          <motion.li key={c.key} layout={!still} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            <DeckStrip c={c} kit={kit} cover={c.id === cover?.id} onOpen={() => onOpen(c.key)} onRemove={() => onToggle(c)} openLabel={t.deck.open(c.name)} removeLabel={t.deck.take(c.name)} />
          </motion.li>
        ))}
      </AnimatePresence>
      {!deck.length && <li className="py-6 text-center text-sm text-zinc-500">{t.deck.emptyDeck}</li>}
    </ul>
  );
  const status = (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-xs text-zinc-400" aria-live="polite">
        <b className={`text-base font-extrabold ${full ? "text-game-me" : "text-zinc-100"}`}>{t.deck.count(deck.length, DECK_SIZE)}</b>
        {deck.length > 0 && <span>{t.deck.avg(avg)}</span>}
      </span>
      <DeckPips n={deck.length} max={DECK_SIZE} />
    </div>
  );
  const play = <TagButton tone="yellow" call={full} disabled={!full} onClick={onPlay}>{t.deck.play}</TagButton>;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-28 text-dl-text lg:pb-0">
      {/* barra de cima: voltar, nome, verso e ações do baralho */}
      <header className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className={`${pill(false)} active:scale-95`}><Icon name="chevron-left" />{t.deck.back}</button>
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.25em] text-game-brass uppercase">{t.deck.workshop} · {t.deck.rename}</span>
          <input className={`${field} font-display text-lg font-extrabold tracking-wider uppercase`} maxLength={DECK_NAME_MAX} value={cur.name}
            onChange={(e) => onPatch({ name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) onPatch({ name: t.deck.defaultName(1) }); }} />
        </label>
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">{t.deck.look}</legend>
          {DECK_LOOKS.map((k) => (
            <button key={k} type="button" onClick={() => onPatch({ look: k })} aria-pressed={k === look} aria-label={t.deck.looks[k]} title={t.deck.looks[k]}
              className={`w-9 cursor-pointer rounded-md p-0.5 transition hover:-translate-y-0.5 active:scale-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-8 ${deckFocus} ${k === look ? "bg-dl-text/80" : "opacity-60 hover:opacity-100"}`}>
              <CardBack look={k} />
            </button>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={full} onClick={onRandom}><Icon name="shuffle" />{t.deck.random}</button>
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!deck.length} onClick={onClear}>{t.deck.clear}</button>
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={deckCount >= MAX_DECKS} onClick={onDuplicate}>{t.deck.duplicate}</button>
          <HoldButton className={`${pill(false)} text-rose-300`} label={`${t.deck.remove}: ${cur.name}`} onConfirm={onRemove}>{t.deck.remove}</HoldButton>
        </div>
        <FullscreenButton label={t.ui.fullscreen} className="ml-auto" />
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* fichário */}
        <section aria-label={t.deck.search} className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-1 basis-56">
              <span className="sr-only">{t.deck.search}</span>
              <input type="search" className={`${field} w-full`} placeholder={t.deck.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {/* filtro de custo em orbes, como os cristais de mana do Hearthstone */}
            <div role="group" aria-label={t.deck.costFilter} className="flex max-w-full items-center gap-1 overflow-x-auto py-1">
              <button type="button" onClick={() => setCost(null)} aria-pressed={cost === null}
                className={`min-h-11 shrink-0 cursor-pointer rounded-full px-3 text-xs font-bold tracking-wider uppercase transition active:scale-95 motion-reduce:transition-none sm:min-h-9 ${deckFocus} ${cost === null ? "bg-dl-text text-dl-black" : "text-zinc-300 hover:bg-white/8"}`}>
                {t.deck.costAll}
              </button>
              {COSTS.map((c) => (
                <button key={c} type="button" onClick={() => setCost((x) => (x === c ? null : c))} aria-pressed={cost === c} aria-label={`${t.deck.costFilter} ${c === 8 ? "8+" : c}`}
                  className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-sm font-extrabold transition active:scale-90 motion-reduce:transition-none sm:size-9 ${deckFocus} ${cost === c
                    ? "bg-radial-[at_50%_35%] from-teal-300 via-teal-600 to-teal-900 text-white shadow-[0_0_0_2px_var(--color-game-soul),0_0_14px_var(--color-game-soul)]"
                    : "bg-radial-[at_50%_35%] from-teal-800/80 to-teal-950/80 text-teal-100/70 hover:text-white"}`}>
                  {c === 8 ? "8+" : c}
                </button>
              ))}
            </div>
          </div>

          {list.length ? (
            <>
              <div className="relative">
                <AnimatePresence mode="popLayout" initial={false} custom={page.dir}>
                  <motion.ul key={`${n}-${q}-${cost}-${size}`} custom={page.dir}
                    initial={still ? { opacity: 0 } : { opacity: 0, x: page.dir * 80, rotateY: page.dir * -8 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    exit={still ? { opacity: 0 } : { opacity: 0, x: page.dir * -80, rotateY: page.dir * 8 }}
                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                    drag={still ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={swipe}
                    className="grid touch-pan-y grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-x-5">
                    {shown.map((l) => {
                      const c = current(l);
                      const on = inDeck.has(c.key);
                      const taken = !on && heroTaken(deck, c);
                      const blocked = !on && (taken || full);
                      const more = heroCount(l) - 1;
                      return (
                        <li key={c.key} className="flex flex-col gap-1.5" data-tile={c.key}>
                          <motion.button type="button" onClick={() => (taken ? onOpen(c.key) : !blocked || on ? onToggle(c) : undefined)}
                            aria-pressed={on} aria-disabled={blocked && !taken} aria-label={on ? t.deck.take(c.name) : taken ? t.deck.dupHero(c.hero) : t.deck.add(t.deck.version(c.name, c.hero))}
                            title={taken ? t.deck.dupHero(c.hero) : blocked ? t.deck.full(DECK_SIZE) : undefined}
                            whileHover={still || blocked ? undefined : { y: -6 }} onPointerEnter={(e) => { if (e.pointerType === "mouse" && !blocked) sfx("hover"); }} whileTap={blocked ? undefined : { scale: 0.95 }} transition={{ duration: 0.15 }}
                            className={`relative block w-full rounded-xl ${deckFocus} ${blocked && !taken ? "cursor-not-allowed" : "cursor-pointer"}`}>
                            <span className={`block transition-[filter,opacity] duration-200 motion-reduce:transition-none ${on ? "opacity-45 saturate-50" : taken ? "opacity-60 grayscale" : blocked ? "opacity-50" : "drop-shadow-[0_8px_12px_rgb(0_0_0/0.55)]"}`}>
                              {kit.face(c)}
                            </span>
                            {on && (
                              <span className="absolute inset-x-0 top-[38%] flex justify-center">
                                <span className="rounded-full bg-game-me px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-dl-black uppercase shadow-[0_0_16px_var(--color-game-me)]">✓ {t.deck.inDeckTag}</span>
                              </span>
                            )}
                            {taken && (
                              <span className="absolute inset-x-1 top-[38%] flex justify-center">
                                <span className="rounded-full bg-rose-950/90 px-2 py-1 text-center text-[10px] leading-tight font-bold text-rose-200">{t.deck.dupHero(c.hero)}</span>
                              </span>
                            )}
                          </motion.button>
                          <button type="button" onClick={() => onOpen(c.key)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))}
                            className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-1 text-[11px] font-bold text-zinc-400 transition hover:bg-white/6 hover:text-zinc-100 active:scale-95 motion-reduce:transition-none sm:min-h-8 ${deckFocus}`}>
                            <Icon name="info" className="size-3.5 shrink-0" />
                            <span className="truncate">{more > 0 ? t.deck.moreHeroes(more) : c.alt ? ((c.stats?.POL ?? 0) >= ALT_POL ? t.deck.cardKind.alt : `−${ALT_MALUS}`) : c.hero}</span>
                          </button>
                        </li>
                      );
                    })}
                  </motion.ul>
                </AnimatePresence>
              </div>
              <nav aria-label={t.deck.page(n + 1, pages)} className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => go(-1)} disabled={n === 0} aria-label={t.deck.prev}
                  className={`grid size-11 cursor-pointer place-items-center rounded-full bg-white/6 text-zinc-200 transition hover:bg-white/12 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none ${deckFocus}`}>
                  <Icon name="chevron-left" className="size-5" />
                </button>
                <span className="flex items-center gap-1.5" aria-hidden="true">
                  {Array.from({ length: pages }, (_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === n ? "w-6 bg-dl-text" : "w-1.5 bg-white/20"}`} />
                  ))}
                </span>
                <span className="sr-only" aria-live="polite">{t.deck.page(n + 1, pages)}</span>
                <button type="button" onClick={() => go(1)} disabled={n >= pages - 1} aria-label={t.deck.next}
                  className={`grid size-11 cursor-pointer place-items-center rounded-full bg-white/6 text-zinc-200 transition hover:bg-white/12 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none ${deckFocus}`}>
                  <Icon name="chevron-right" className="size-5" />
                </button>
              </nav>
            </>
          ) : <p className="py-10 text-center text-sm text-zinc-400">{t.deck.empty}</p>}
        </section>

        {/* trilho do baralho (desktop) */}
        <aside data-deck-target aria-label={cur.name} className="noir-glass sticky top-2 hidden w-80 shrink-0 flex-col gap-3 rounded-2xl p-3 lg:flex">
          {status}
          <DeckCurve cards={deck} kit={kit} label={t.deck.curve} />
          <div className="max-h-[calc(100dvh-20rem)] overflow-y-auto pr-1">{strips}</div>
          {play}
        </aside>
      </div>

      {/* barra do baralho no celular e tablet: abre a lista por cima */}
      <div className="noir-glass-strong fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <AnimatePresence initial={false}>
          {sheet && (
            <motion.div id="deck-sheet" key="sheet" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
              className="flex flex-col gap-3 overflow-y-auto">
              <div className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto pt-1">
                <DeckCurve cards={deck} kit={kit} label={t.deck.curve} className="h-8" />
                {strips}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSheet((x) => !x)} aria-expanded={sheet} aria-controls="deck-sheet"
            className={`flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 rounded-lg px-2 text-left transition hover:bg-white/5 active:scale-[0.98] motion-reduce:transition-none ${deckFocus}`}>
            <span className="flex items-center justify-between gap-2 text-xs">
              <b className={full ? "text-game-me" : "text-zinc-100"}>{t.deck.showList(deck.length)}</b>
              <Icon name={sheet ? "chevron-down" : "chevron-up"} className="size-4 text-zinc-400" />
            </span>
            <span data-deck-target className="block"><DeckPips n={deck.length} max={DECK_SIZE} /></span>
          </button>
          {play}
        </div>
      </div>
    </div>
  );
}
