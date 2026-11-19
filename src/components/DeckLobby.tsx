import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { CardBack } from "./GameCard";
import { DeckCurve, DeckPips, deckFocus, type DeckKit } from "./DeckStrip";
import { useT } from "../lib/i18n";
import { pill, primaryBtn } from "../lib/ui";
import type { PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { MAX_DECKS, resolveDeck, type DeckBook, type DeckLook } from "../lib/game/deck";
import { GAME_TEXT } from "../lib/game/text";

/**
 * Tela de baralhos: o baralho escolhido aberto em leque sob a luz do bar (as vagas vazias aparecem viradas), os números dele,
 * Jogar, e a prateleira dos baralhos salvos. A coleção não fica aqui: ela abre na oficina (montar à mão) ou no draft (1 de 3).
 */
export function DeckLobby({ book, versions, deck, look, kit, onPick, onNew, onEdit, onDraft, onOpen, onPlay, coverOf }: {
  book: DeckBook; versions: Map<string, PoolCard[]>; deck: PoolCard[]; look: DeckLook; kit: DeckKit;
  onPick: (id: string) => void; onNew: () => void; onEdit: () => void; onDraft: () => void; onOpen: (key: string) => void; onPlay: () => void;
  coverOf: (cards: PoolCard[], id?: string) => PoolCard | undefined;
}) {
  const t = useT(GAME_TEXT);
  const still = useReducedMotion();
  const cur = book.decks.find((d) => d.id === book.current) ?? book.decks[0];
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const sorted = [...deck].sort((a, b) => kit.stats(a).cost - kit.stats(b).cost || a.name.localeCompare(b.name));
  const mid = (DECK_SIZE - 1) / 2;
  // o draft escreve no baralho atual se ele estiver vazio; senão abre um baralho novo
  const draftBlocked = deck.length > 0 && book.decks.length >= MAX_DECKS;

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 text-dl-text">
      {/* luz do lampião sobre o leque */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-144 bg-radial-[ellipse_60%_55%_at_50%_45%] from-amber-200/12 via-amber-500/5 to-transparent to-70%" />

      <header className="relative flex flex-col items-center gap-2 text-center">
        <span className="text-[11px] font-bold tracking-[0.3em] text-game-brass uppercase">{t.ui.title}</span>
        <h1 className="font-display text-3xl font-extrabold tracking-[0.08em] text-balance uppercase drop-shadow-[0_4px_18px_rgb(0_0_0/0.8)] sm:text-5xl">{cur.name}</h1>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-300" aria-live="polite">
          <span className={full ? "font-bold text-game-me" : ""}>{full ? t.deck.ready : t.deck.missing(DECK_SIZE - deck.length)}</span>
          {deck.length > 0 && <><span aria-hidden="true" className="text-zinc-600">•</span><span>{t.deck.avg(avg)}</span></>}
          <span aria-hidden="true" className="text-zinc-600">•</span><span>{t.deck.looks[look]}</span>
        </p>
      </header>

      {/* o leque: 12 posições em arco; vaga vazia é o verso do baralho apagado */}
      <ol aria-label={t.deck.list} className="relative h-[calc(var(--w)*1.46+4.5rem)] w-full max-w-4xl [--gap:min(4.4rem,6.5vw)] [--w:clamp(4.6rem,14vw,9.5rem)]">
        {Array.from({ length: DECK_SIZE }, (_, i) => {
          const c = sorted[i];
          const k = i - mid;
          const pos = { "--k": k, zIndex: i + 1 } as CSSProperties;
          return (
            <li key={c?.key ?? `gap${i}`} style={pos}
              className="absolute top-0 left-1/2 w-(--w) transform-[translateX(calc(-50%+var(--k)*var(--gap)))_translateY(calc(var(--k)*var(--k)*0.13rem+0.6rem))_rotate(calc(var(--k)*3deg))]">
              <motion.div key={`${cur.id}-${c?.id ?? i}`} initial={still ? false : { y: 90, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.28, delay: still ? 0 : i * 0.03, ease: [0.23, 1, 0.32, 1] }}>
                {c ? (
                  <motion.button type="button" onClick={() => onOpen(c.key)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))}
                    whileHover={still ? undefined : { y: -22, scale: 1.06 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.16 }}
                    className={`block w-full cursor-pointer rounded-xl drop-shadow-[0_10px_14px_rgb(0_0_0/0.6)] ${deckFocus}`}>
                    {kit.face(c)}
                  </motion.button>
                ) : (
                  <CardBack look={look} className="opacity-25 grayscale" />
                )}
              </motion.div>
            </li>
          );
        })}
      </ol>

      {/* números e ações */}
      <div className="relative flex w-full max-w-xl flex-col items-center gap-4">
        <DeckPips n={deck.length} max={DECK_SIZE} className="w-full max-w-xs" />
        {deck.length > 0 && <div className="w-full max-w-xs"><DeckCurve cards={deck} kit={kit} label={t.deck.curve} className="h-8" /></div>}
        {!deck.length && <p className="max-w-sm text-center text-sm text-zinc-400">{t.deck.emptyHint}</p>}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className={`${primaryBtn} min-h-14 px-12 text-base shadow-[0_0_28px_rgb(255_239_215/0.25)] active:scale-95`} disabled={!full} onClick={onPlay}>
            {t.deck.play}
          </button>
          <button type="button" className={`${pill(false)} min-h-14 active:scale-95`} onClick={onEdit}>{t.deck.edit}</button>
          <button type="button" className={`${pill(false)} min-h-14 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50`} onClick={onDraft}
            disabled={draftBlocked} title={draftBlocked ? t.deck.maxDecks(MAX_DECKS) : t.deck.draftHint}>
            {t.deck.draft}
          </button>
        </div>
      </div>

      {/* prateleira de baralhos */}
      <section aria-labelledby="deck-shelf" className="relative flex w-full flex-col gap-2">
        <h2 id="deck-shelf" className="text-center text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{t.deck.decks}</h2>
        <ul className="flex snap-x gap-3 overflow-x-auto px-2 pt-4 pb-3 sm:justify-center-safe">
          {book.decks.map((d) => {
            const cards = resolveDeck(d.cards, versions);
            const cv = coverOf(cards, d.cover);
            const on = d.id === book.current;
            return (
              <li key={d.id} className="w-24 shrink-0 snap-start sm:w-28">
                <button type="button" onClick={() => onPick(d.id)} aria-pressed={on} aria-label={`${d.name} · ${t.deck.cards(cards.length)}`}
                  className={`group flex w-full cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 text-left transition active:scale-95 motion-reduce:transition-none ${deckFocus} ${on ? "bg-white/10" : "opacity-70 hover:bg-white/5 hover:opacity-100"}`}>
                  <span className="relative block pt-10 sm:pt-12">
                    {cv && (
                      // o brilho da moldura da carta vaza para baixo: corta só na capa
                      <span className="absolute inset-x-3 top-0 block origin-bottom -rotate-6 overflow-clip rounded-lg transition-transform duration-200 group-hover:-translate-y-1.5 motion-reduce:transition-none">{kit.face(cv)}</span>
                    )}
                    <CardBack look={d.look ?? "noir"} className={`relative drop-shadow-[0_0.4rem_0.6rem_rgb(0_0_0/0.6)] ${on ? "" : "brightness-75"}`} />
                  </span>
                  <span className="truncate text-xs font-bold">{d.name}</span>
                  <span className={`text-[10px] ${cards.length === DECK_SIZE ? "text-game-me" : "text-zinc-400"}`}>{cards.length}/{DECK_SIZE}</span>
                </button>
              </li>
            );
          })}
          <li className="flex w-24 shrink-0 snap-start sm:w-28">
            <button type="button" onClick={onNew} disabled={book.decks.length >= MAX_DECKS} title={book.decks.length >= MAX_DECKS ? t.deck.maxDecks(MAX_DECKS) : undefined}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-black/30 text-zinc-300 transition hover:bg-white/8 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${deckFocus}`}>
              <span className="text-3xl leading-none" aria-hidden="true">+</span>
              <span className="text-center text-xs font-bold">{t.deck.newDeck}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
