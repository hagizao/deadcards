import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CardFocus } from "./CardFocus";
import { DeckPile } from "./DeckPile";
import { GameCard } from "./GameCard";
import { HoldButton } from "./HoldButton";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { field, pill, primaryBtn } from "../lib/ui";
import { ALT_MALUS, ALT_POL, cardStats, type GameConfig, type PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { DECK_NAME_MAX, MAX_DECKS, fillDeck, loadBook, newDeck, resolveDeck, saveBook, versionPlayer, type DeckBook } from "../lib/game/deck";
import { GAME_TEXT } from "../lib/game/text";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const FLY_S = 0.3;

type Flight = { id: number; from: DOMRect; to: DOMRect; card: ReactNode };
let flightSeq = 0;

/**
 * Tela antes da partida: os baralhos salvos (como no Marvel Snap), o baralho escolhido como uma pilha de verdade e a coleção.
 * Tocar numa carta abre a carta em destaque; o botão do canto põe ou tira do baralho, com a carta voando até a pilha.
 */
export function DeckBuilder({ versions, cfg, onPlay }: { versions: Map<string, PoolCard[]>; cfg: GameConfig; onPlay: (deck: PoolCard[]) => void }) {
  const t = useT(GAME_TEXT);
  const { players } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [book, setBook] = useState<DeckBook>(() => loadBook(t.deck.defaultName));
  useEffect(() => saveBook(book), [book]);
  const cur = book.decks.find((d) => d.id === book.current) ?? book.decks[0];
  const deck = useMemo(() => resolveDeck(cur.cards, versions), [cur.cards, versions]);
  // versão mostrada de quem ainda não está no baralho
  const [shown, setShown] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const pile = useRef<HTMLButtonElement>(null);
  const still = useReducedMotion();

  const stats = useCallback((c: PoolCard) => cardStats(c, cfg.cards, cfg.heroes), [cfg]);
  const inDeck = new Map(deck.map((c) => [c.key, c]));
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const curve = COSTS.map((n) => deck.filter((c) => Math.min(8, Math.max(1, stats(c).cost)) === n).length);
  const peak = Math.max(1, ...curve);
  const list = [...versions.values()]
    .filter((l) => l[0].name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b[0].ovr - a[0].ovr || a[0].name.localeCompare(b[0].name));
  const sorted = [...deck].sort((a, b) => stats(a).cost - stats(b).cost || a.name.localeCompare(b.name));
  const coverOf = (cards: PoolCard[], id?: string) => cards.find((c) => c.id === id) ?? [...cards].sort((a, b) => stats(b).cost - stats(a).cost || b.ovr - a.ovr)[0];
  const cover = coverOf(deck, cur.cover);

  const current = (l: PoolCard[]) => inDeck.get(l[0].key) ?? l.find((c) => c.id === shown[l[0].key]) ?? l[0];
  const setCards = (fn: (d: PoolCard[]) => PoolCard[]) =>
    setBook((b) => ({ ...b, decks: b.decks.map((d) => (d.id === b.current ? { ...d, cards: fn(resolveDeck(d.cards, versions)).map((c) => c.id) } : d)) }));
  const face = (c: PoolCard) => {
    const s = stats(c);
    return <GameCard player={versionPlayer(byId, c)} name={c.name} cost={s.cost} power={s.power} base={s.power} text={null} />;
  };
  /** Carta voando entre a coleção e a pilha. */
  const fly = (c: PoolCard, from: DOMRect | null, to: DOMRect | null) => {
    if (still || !from || !to) return;
    const id = ++flightSeq;
    setFlights((f) => [...f, { id, from, to, card: face(c) }]);
  };
  const tileRect = (key: string) => document.querySelector(`[data-tile="${CSS.escape(key)}"]`)?.getBoundingClientRect() ?? null;
  const toggle = (c: PoolCard, from: DOMRect | null = tileRect(c.key)) => {
    const on = inDeck.has(c.key);
    if (!on && full) return;
    const p = pile.current?.getBoundingClientRect() ?? null;
    if (on) fly(c, p, from);
    else fly(c, from, p);
    setCards((d) => (on ? d.filter((x) => x.key !== c.key) : [...d, c]));
  };
  const choose = (c: PoolCard) => {
    setShown((s) => ({ ...s, [c.key]: c.id }));
    setCards((d) => d.map((x) => (x.key === c.key ? c : x)));
  };
  const patchCur = (patch: Partial<DeckBook["decks"][number]>) => setBook((b) => ({ ...b, decks: b.decks.map((d) => (d.id === b.current ? { ...d, ...patch } : d)) }));
  const addDeck = (cards: string[] = [], name = t.deck.defaultName(book.decks.length + 1)) => {
    if (book.decks.length >= MAX_DECKS) return;
    const d = newDeck(name.slice(0, DECK_NAME_MAX), cards);
    setBook((b) => ({ decks: [...b.decks, d], current: d.id }));
  };
  const removeDeck = () => setBook((b) => {
    const decks = b.decks.filter((d) => d.id !== b.current);
    if (!decks.length) decks.push(newDeck(t.deck.defaultName(1)));
    return { decks, current: decks[0].id };
  });
  const focusList = focusKey ? versions.get(focusKey) : undefined;
  const closeFocus = useCallback(() => setFocusKey(null), []);

  const playBar = (
    <button type="button" className={`${primaryBtn} min-h-12 px-8 text-sm`} disabled={!full} onClick={() => onPlay(deck)}>{t.deck.play}</button>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-dl-text">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-extrabold tracking-[0.11em] uppercase sm:text-2xl">{t.deck.title}</h1>
        <p className="text-sm text-zinc-300">{t.deck.hint} {t.deck.aiNote}</p>
      </header>

      {/* baralhos salvos */}
      <section aria-labelledby="deck-shelf" className="flex flex-col gap-2">
        <h2 id="deck-shelf" className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{t.deck.decks}</h2>
        <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
          {book.decks.map((d) => {
            const cards = resolveDeck(d.cards, versions);
            const cv = coverOf(cards, d.cover);
            const on = d.id === book.current;
            return (
              <li key={d.id} className="w-24 shrink-0 snap-start sm:w-28">
                <button type="button" onClick={() => setBook((b) => ({ ...b, current: d.id }))} aria-pressed={on} aria-label={`${d.name} · ${t.deck.cards(cards.length)}`}
                  className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 text-left transition active:scale-95 ${focus} ${on ? "bg-white/12" : "opacity-75 hover:bg-white/6 hover:opacity-100"}`}>
                  {/* o brilho da moldura (pseudo-elementos da carta) vaza para baixo e criava rolagem vertical na prateleira: corta só na miniatura */}
                  <span className={`block overflow-clip rounded-lg ${on ? "ring-2 ring-game-me" : ""}`}>
                    {cv ? face(cv) : <span className="flex aspect-295/430 items-center justify-center rounded-lg bg-black/30 text-xs text-zinc-500">{t.deck.emptyDeck}</span>}
                  </span>
                  <span className="truncate text-xs font-bold">{d.name}</span>
                  <span className={`text-[10px] ${cards.length === DECK_SIZE ? "text-game-me" : "text-zinc-400"}`}>{cards.length}/{DECK_SIZE}</span>
                </button>
              </li>
            );
          })}
          <li className="w-24 shrink-0 snap-start sm:w-28">
            <button type="button" onClick={() => addDeck()} disabled={book.decks.length >= MAX_DECKS} title={book.decks.length >= MAX_DECKS ? t.deck.maxDecks(MAX_DECKS) : undefined}
              className={`flex aspect-295/430 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-black/30 text-zinc-300 transition hover:bg-white/8 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${focus}`}>
              <span className="font-display text-3xl leading-none" aria-hidden="true">+</span>
              <span className="text-center text-xs font-bold">{t.deck.newDeck}</span>
            </button>
          </li>
        </ul>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* baralho atual: pilha, nome, curva, lista e jogar */}
        <aside aria-label={cur.name} className="noir-glass sticky top-2 z-20 flex flex-col gap-3 rounded-2xl p-3 lg:order-last lg:w-80 lg:shrink-0">
          <div className="flex items-center gap-3">
            <DeckPile ref={pile} n={deck.length} label={t.deck.left(DECK_SIZE - deck.length)} tipSide="bottom" className="w-11 sm:w-14" out={{ x: 0, y: -40 }} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-display text-base font-extrabold">{cur.name}</span>
              <span className="text-xs text-zinc-400" aria-live="polite">{t.deck.count(deck.length, DECK_SIZE)}{deck.length ? ` · ${t.deck.avg(avg)}` : ""}</span>
            </div>
            <div className="lg:hidden">{playBar}</div>
          </div>
          <button type="button" className={`${pill(listOpen)} justify-center lg:hidden`} aria-expanded={listOpen} aria-controls="deck-panel" onClick={() => setListOpen((x) => !x)}>
            {t.deck.showList(deck.length)}
          </button>

          <div id="deck-panel" className={`${listOpen ? "flex" : "hidden"} max-h-[60dvh] flex-col gap-3 overflow-y-auto lg:flex lg:max-h-[calc(100dvh-9rem)]`}>
            <label className="flex flex-col gap-1 text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
              {t.deck.rename}
              <input className={field} maxLength={DECK_NAME_MAX} value={cur.name}
                onChange={(e) => patchCur({ name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) patchCur({ name: t.deck.defaultName(1) }); }} />
            </label>
            <figure className="flex flex-col gap-1" aria-label={`${t.deck.curve}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
              <div className="flex h-10 items-end gap-1.5" aria-hidden="true">
                {curve.map((n, i) => (
                  <span key={COSTS[i]} className="h-full flex-1 origin-bottom rounded-sm bg-game-me/70 transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleY(${Math.max(0.06, n / peak)})`, opacity: n ? 1 : 0.25 }} />
                ))}
              </div>
              <figcaption className="flex gap-1.5 text-[10px] text-zinc-500" aria-hidden="true">
                {COSTS.map((n) => <span key={n} className="flex-1 text-center">{n}</span>)}
              </figcaption>
            </figure>

            <ul aria-label={t.deck.list} className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {sorted.map((c) => {
                  const s = stats(c);
                  return (
                    <motion.li key={c.key} layout={!still} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}
                      className="flex items-center gap-1 rounded-lg bg-black/30">
                      <button type="button" onClick={() => setFocusKey(c.key)} aria-label={t.deck.open(c.name)}
                        className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:bg-white/8 active:bg-white/12 sm:min-h-9 ${focus}`}>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-display text-xs font-extrabold text-white">{s.cost}</span>
                        <span className="min-w-0 flex-1 truncate font-bold">{c.name}</span>
                        <span className="truncate text-[10px] text-zinc-400">{c.hero}{c.id === cover?.id ? " ★" : ""}</span>
                        <span className="w-5 text-right font-display text-xs font-extrabold text-amber-200">{s.power}</span>
                      </button>
                      <button type="button" onClick={() => toggle(c)} aria-label={t.deck.take(c.name)}
                        className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-zinc-400 transition hover:bg-white/8 hover:text-rose-300 active:bg-white/12 sm:size-9 ${focus}`}>×</button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={full}
                onClick={() => setCards((d) => fillDeck(d, versions))}>{t.deck.random}</button>
              <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!deck.length} onClick={() => setCards(() => [])}>{t.deck.clear}</button>
              <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={book.decks.length >= MAX_DECKS}
                onClick={() => addDeck(cur.cards, `${cur.name} 2`)}>{t.deck.duplicate}</button>
              <HoldButton className={`${pill(false)} text-rose-300`} label={`${t.deck.remove}: ${cur.name}`} onConfirm={removeDeck}>{t.deck.remove}</HoldButton>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">{playBar}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <label className="flex max-w-sm flex-col">
            <span className="sr-only">{t.deck.search}</span>
            <input type="search" className={field} placeholder={t.deck.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>

          {list.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
              {list.map((l) => {
                const c = current(l);
                const on = inDeck.has(c.key);
                return (
                  <li key={c.key} className="flex flex-col gap-1.5">
                    <div className="relative" data-tile={c.key}>
                      <motion.button type="button" onClick={() => setFocusKey(c.key)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))} whileTap={{ scale: 0.96 }}
                        className={`block w-full cursor-pointer rounded-xl transition-[filter,opacity] duration-150 hover:brightness-110 ${focus} ${on ? "" : "opacity-80"}`}>
                        <span className={`block rounded-xl ${on ? "ring-3 ring-game-me" : ""}`}>{face(c)}</span>
                      </motion.button>
                      <button type="button" onClick={() => toggle(c)} aria-pressed={on} aria-label={on ? t.deck.take(c.name) : t.deck.add(t.deck.version(c.name, c.hero))}
                        disabled={!on && full} title={!on && full ? t.deck.full(DECK_SIZE) : undefined}
                        className={`absolute -right-2 -bottom-2 z-10 grid size-11 cursor-pointer place-items-center rounded-full font-display text-lg font-black shadow-lg transition hover:brightness-110 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 sm:size-8 sm:text-base ${focus} ${on ? "bg-game-me text-dl-black" : "bg-dl-text text-dl-black"}`}>
                        {on ? "✓" : "+"}
                      </button>
                    </div>
                    {c.alt && <span className="text-center text-[10px] leading-tight text-zinc-400">{(c.stats?.POL ?? 0) >= ALT_POL ? t.deck.altPro : t.deck.alt(ALT_MALUS)}</span>}
                    {l.length > 1 && <VersionChips list={l} shown={c} onPick={(v) => { choose(v); setFocusKey(v.key); }} />}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-zinc-400">{t.deck.empty}</p>}
        </div>
      </div>

      <AnimatePresence>
        {focusList && (
          <CardFocus key="focus" versions={focusList} shown={current(focusList)} cfg={cfg} inDeck={inDeck.has(focusList[0].key)} full={full}
            isCover={current(focusList).id === cover?.id} onShow={choose} onCover={(v) => patchCur({ cover: v.id })} onClose={closeFocus}
            onToggle={(v, from) => toggle(v, from)} />
        )}
      </AnimatePresence>

      {/* cartas voando entre a coleção e a pilha */}
      <div className="pointer-events-none fixed inset-0 z-90" aria-hidden="true">
        {flights.map((f) => (
          <motion.div key={f.id} className="absolute top-0 left-0 origin-top-left" style={{ width: f.from.width }}
            initial={{ x: f.from.left, y: f.from.top, scale: 1, opacity: 1, rotate: 0 }}
            animate={{ x: f.to.left, y: f.to.top, scale: f.to.width / f.from.width, opacity: 0.4, rotate: f.to.left > f.from.left ? 8 : -8 }}
            transition={{ duration: FLY_S, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={() => setFlights((x) => x.filter((y) => y.id !== f.id))}>
            {f.card}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Heróis do jogador embaixo da carta: escolher um abre a carta em destaque nessa versão. */
function VersionChips({ list, shown, onPick }: { list: PoolCard[]; shown: PoolCard; onPick: (v: PoolCard) => void }) {
  const t = useT(GAME_TEXT);
  const { heroIcon } = useData();
  return (
    <div role="group" aria-label={`${t.deck.versions}: ${shown.name}`} className="flex flex-wrap justify-center gap-1">
      {list.map((v) => {
        const icon = heroIcon(v.hero);
        return (
          <button key={v.id} type="button" onClick={() => onPick(v)} aria-pressed={v.id === shown.id} title={t.deck.version(v.name, v.hero)} aria-label={t.deck.version(v.name, v.hero)}
            className={`size-11 cursor-pointer overflow-hidden rounded-md bg-zinc-900 transition hover:brightness-125 active:scale-95 sm:size-8 ${focus} ${v.id === shown.id ? "ring-2 ring-dl-text" : "opacity-60"}`}>
            {icon ? <img src={icon} alt="" className="size-full object-cover" loading="lazy" /> : <span className="text-[9px]">{v.hero.slice(0, 3)}</span>}
          </button>
        );
      })}
    </div>
  );
}
