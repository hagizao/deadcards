import { motion, useReducedMotion } from "motion/react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ReceiptButton, TagButton } from "./BarButton";
import { CardBack } from "./GameCard";
import { deckFocus, type DeckKit } from "./DeckStrip";
import { useT } from "../lib/i18n";
import type { PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { MAX_DECKS, resolveDeck, type DeckBook, type DeckLook } from "../lib/game/deck";
import { GAME_TEXT } from "../lib/game/text";

const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Etiqueta de papel colada torta, só para ler (o mesmo recorte das placas dos locais). */
function Label({ tone, ink, tilt = -1, className = "", children }: { tone: string; ink: string; tilt?: 1 | -1; className?: string; children: ReactNode }) {
  return (
    <span className={`relative isolate inline-flex items-center px-2.5 py-1 text-[11px] font-extrabold tracking-widest uppercase drop-shadow-[0_2px_0_rgb(0_0_0/0.6)] ${ink} ${className}`}>
      <span aria-hidden="true" className={`absolute inset-0 -z-10 [clip-path:polygon(2%_8%,99%_0,100%_90%,0_100%)] ${tilt < 0 ? "-rotate-2" : "rotate-2"} ${tone}`} />
      {children}
    </span>
  );
}

/** As 12 vagas como almas: acesas na cor das almas, apagadas como um encaixe vazio. */
function SoulPips({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5">
      {Array.from({ length: DECK_SIZE }, (_, i) => (
        <span key={i} className={`size-3 rounded-full transition duration-200 motion-reduce:transition-none ${i < n
          ? "bg-radial-[at_50%_35%] from-teal-100 via-game-soul to-teal-700 shadow-[0_0_8px_var(--color-game-soul)]"
          : "bg-zinc-950/80 shadow-[inset_0_1px_3px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.08)]"}`} />
      ))}
    </span>
  );
}

/** Curva de custo em pilhas de fichas de cassino (uma ficha por carta), como as apostas na mesa. */
function ChipCurve({ cards, kit, label }: { cards: PoolCard[]; kit: DeckKit; label: string }) {
  const curve = COSTS.map((n) => cards.filter((c) => Math.min(8, Math.max(1, kit.stats(c).cost)) === n).length);
  return (
    <figure className="flex flex-col items-center gap-1" aria-label={`${label}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
      <div className="flex h-16 items-end gap-2" aria-hidden="true">
        {curve.map((n, i) => (
          <span key={COSTS[i]} className="flex w-6 flex-col-reverse items-center gap-px">
            {Array.from({ length: n }, (_, j) => (
              <span key={j} className="h-1.5 w-full rounded-full bg-linear-to-r from-amber-700 via-amber-200 to-amber-700 shadow-[0_1px_0_rgb(0_0_0/0.7)] even:from-teal-800 even:via-teal-200 even:to-teal-800" />
            ))}
            {!n && <span className="h-1 w-full rounded-full bg-white/8" />}
          </span>
        ))}
      </div>
      <figcaption className="flex gap-2 text-[10px] font-bold text-zinc-500" aria-hidden="true">
        {COSTS.map((n) => <span key={n} className="w-6 text-center">{n === 8 ? "8+" : n}</span>)}
      </figcaption>
    </figure>
  );
}

/**
 * Tela de baralhos: o baralho escolhido aberto em leque sob a luz do bar (as vagas vazias aparecem viradas), os números dele,
 * Jogar (a conta do bar) e a prateleira dos baralhos salvos, de pé na mesa. A coleção não fica aqui: ela abre na oficina
 * (montar à mão) ou no draft (1 de 3). Passar o mouse numa carta do leque abre espaço, endireita e amplia a carta com o
 * texto da habilidade.
 */
export function DeckLobby({ book, versions, deck, look, kit, onPick, onNew, onEdit, onDraft, onOpen, onPlay, coverOf }: {
  book: DeckBook; versions: Map<string, PoolCard[]>; deck: PoolCard[]; look: DeckLook; kit: DeckKit;
  onPick: (id: string) => void; onNew: () => void; onEdit: () => void; onDraft: () => void; onOpen: (key: string) => void; onPlay: () => void;
  coverOf: (cards: PoolCard[], id?: string) => PoolCard | undefined;
}) {
  const t = useT(GAME_TEXT);
  const still = useReducedMotion();
  const [hot, setHot] = useState<number | null>(null);
  const cur = book.decks.find((d) => d.id === book.current) ?? book.decks[0];
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const sorted = [...deck].sort((a, b) => kit.stats(a).cost - kit.stats(b).cost || a.name.localeCompare(b.name));
  const mid = (DECK_SIZE - 1) / 2;
  // o draft escreve no baralho atual se ele estiver vazio; senão abre um baralho novo
  const draftBlocked = deck.length > 0 && book.decks.length >= MAX_DECKS;
  const bookFull = book.decks.length >= MAX_DECKS;

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 text-dl-text">
      {/* luz do lampião sobre o leque */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-144 bg-radial-[ellipse_60%_55%_at_50%_45%] from-amber-200/12 via-amber-500/5 to-transparent to-70%" />

      <header className="relative flex flex-col items-center gap-3 text-center">
        <Label tone="bg-linear-to-b from-amber-200 to-game-brass" ink="text-zinc-950">{t.ui.title}</Label>
        <h1 className="font-display text-3xl font-extrabold tracking-[0.08em] text-balance uppercase drop-shadow-[0_4px_18px_rgb(0_0_0/0.8)] sm:text-5xl">{cur.name}</h1>
        <p className="flex flex-wrap items-center justify-center gap-2" aria-live="polite">
          <Label tone={full ? "bg-linear-to-b from-teal-100 to-game-soul" : "bg-linear-to-b from-rose-200 to-rose-400"} ink={full ? "text-zinc-950" : "text-rose-950"} tilt={1}>
            {full ? t.deck.ready : t.deck.missing(DECK_SIZE - deck.length)}
          </Label>
          {deck.length > 0 && <Label tone="bg-comanda-paper" ink="text-comanda-ink">{t.deck.avg(avg)}</Label>}
          <Label tone="bg-zinc-800" ink="text-zinc-200" tilt={1}>{t.deck.looks[look]}</Label>
        </p>
      </header>

      {/* o leque: 12 posições em arco; vaga vazia é o verso do baralho apagado */}
      <ol aria-label={t.deck.list} onPointerLeave={() => setHot(null)}
        className="relative h-[calc(var(--w)*1.46+4.5rem)] w-full max-w-4xl [--gap:min(4.4rem,6.5vw)] [--w:clamp(4.6rem,14vw,9.5rem)]">
        {Array.from({ length: DECK_SIZE }, (_, i) => {
          const c = sorted[i];
          const k = i - mid;
          const on = hot === i;
          // as vizinhas abrem espaço para a carta em destaque
          const push = hot === null || on ? 0 : i > hot ? 1 : -1;
          const pos = { "--k": k, "--push": push, zIndex: on ? 50 : i + 1 } as CSSProperties;
          return (
            <li key={c?.key ?? `gap${i}`} style={pos}
              className="absolute top-0 left-1/2 w-(--w) transform-[translateX(calc(-50%+var(--k)*var(--gap)+var(--push)*min(2.6rem,4vw)))_translateY(calc(var(--k)*var(--k)*0.13rem+0.6rem))_rotate(calc(var(--k)*3deg))] transition-transform duration-200 ease-out motion-reduce:transition-none">
              <motion.div key={`${cur.id}-${c?.id ?? i}`} initial={still ? false : { y: 90, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.28, delay: still ? 0 : i * 0.03, ease: [0.23, 1, 0.32, 1] }}>
                {c ? (
                  <motion.button type="button" onClick={() => onOpen(c.key)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))}
                    onHoverStart={() => setHot(i)} onFocus={() => setHot(i)} onBlur={() => setHot((h) => (h === i ? null : h))}
                    animate={on ? { y: "-18%", scale: 1.6, rotate: -k * 3 } : { y: 0, scale: 1, rotate: 0 }}
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                    className={`block w-full cursor-pointer rounded-xl ${on ? "drop-shadow-[0_18px_30px_rgb(0_0_0/0.85)]" : "drop-shadow-[0_10px_14px_rgb(0_0_0/0.6)]"} ${deckFocus}`}>
                    {on ? kit.full(c) : kit.face(c)}
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
      <div className="relative flex w-full max-w-xl flex-col items-center gap-5">
        <SoulPips n={deck.length} />
        {deck.length > 0 ? <ChipCurve cards={deck} kit={kit} label={t.deck.curve} /> : <p className="max-w-sm text-center text-sm text-zinc-400">{t.deck.emptyHint}</p>}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <TagButton tone="brass" onClick={onEdit}>{t.deck.edit}</TagButton>
          <ReceiptButton label={t.deck.play} note={full ? t.deck.avg(avg) : t.deck.missing(DECK_SIZE - deck.length)} disabled={!full} onClick={onPlay} className="order-first sm:order-0" />
          <TagButton tone="soul" tilt={1} onClick={onDraft} disabled={draftBlocked} title={draftBlocked ? t.deck.maxDecks(MAX_DECKS) : t.deck.draftHint}>{t.deck.draft}</TagButton>
        </div>
      </div>

      {/* prateleira: os baralhos de pé na mesa, com o nome numa etiqueta; o escolhido fica sob a luz */}
      <section aria-labelledby="deck-shelf" className="relative flex w-full flex-col items-center gap-3">
        <h2 id="deck-shelf"><Label tone="bg-zinc-800" ink="text-zinc-300">{t.deck.decks}</Label></h2>
        <ul className="flex w-full snap-x gap-4 overflow-x-auto px-2 pt-6 pb-3 sm:justify-center-safe">
          {book.decks.map((d) => {
            const cards = resolveDeck(d.cards, versions);
            const cv = coverOf(cards, d.cover);
            const on = d.id === book.current;
            return (
              <li key={d.id} className="w-24 shrink-0 snap-start sm:w-28">
                <button type="button" onClick={() => onPick(d.id)} aria-pressed={on} aria-label={`${d.name} · ${t.deck.cards(cards.length)}`}
                  className={`group relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl text-left transition active:scale-95 motion-reduce:transition-none ${deckFocus} ${on ? "" : "opacity-70 hover:opacity-100"}`}>
                  {/* luz na mesa embaixo do baralho escolhido */}
                  <span aria-hidden="true" className={`pointer-events-none absolute inset-x-[-25%] bottom-6 h-1/2 bg-radial from-game-brass/45 to-transparent to-70% blur-md transition-opacity duration-200 motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
                  <span className={`relative block w-full pt-10 transition-transform duration-200 motion-reduce:transition-none sm:pt-12 ${on ? "-translate-y-1.5" : "group-hover:-translate-y-1"}`}>
                    {cv && (
                      // o brilho da moldura da carta vaza para baixo: corta só na capa
                      <span className="absolute inset-x-3 top-0 block origin-bottom -rotate-6 overflow-clip rounded-lg transition-transform duration-200 group-hover:-translate-y-1.5 motion-reduce:transition-none">{kit.face(cv)}</span>
                    )}
                    <CardBack look={d.look ?? "noir"} className="absolute inset-x-0 bottom-0 origin-bottom rotate-3 brightness-50" />
                    <CardBack look={d.look ?? "noir"} className={`relative drop-shadow-[0_0.4rem_0.6rem_rgb(0_0_0/0.6)] ${on ? "" : "brightness-75"}`} />
                  </span>
                  <Label tone={on ? "bg-comanda-paper" : "bg-zinc-800"} ink={on ? "text-comanda-ink" : "text-zinc-300"} tilt={on ? -1 : 1} className="max-w-full">
                    <span className="line-clamp-2 text-center wrap-break-word">{d.name}</span>
                  </Label>
                  <span className={`text-[10px] font-bold ${cards.length === DECK_SIZE ? "text-game-me" : "text-zinc-500"}`}>{cards.length}/{DECK_SIZE}</span>
                </button>
              </li>
            );
          })}
          {/* baralho novo: um verso fantasma esperando as cartas */}
          <li className="w-24 shrink-0 snap-start sm:w-28">
            <button type="button" onClick={onNew} disabled={bookFull} title={bookFull ? t.deck.maxDecks(MAX_DECKS) : undefined}
              className={`group flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${deckFocus}`}>
              <span className="relative block w-full pt-10 transition-transform duration-200 group-enabled:group-hover:-translate-y-1 motion-reduce:transition-none sm:pt-12">
                <CardBack look={look} className="opacity-20 grayscale transition-opacity duration-200 group-enabled:group-hover:opacity-40 motion-reduce:transition-none" />
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 grid aspect-295/430 place-items-center text-4xl font-black text-zinc-300 drop-shadow-[0_2px_0_rgb(0_0_0/0.8)]">+</span>
              </span>
              <Label tone="bg-linear-to-b from-amber-200 to-game-brass" ink="text-zinc-950" tilt={1}>{t.deck.newDeck}</Label>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
