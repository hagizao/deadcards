import { motion, useReducedMotion } from "motion/react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { FullscreenButton, TagButton } from "./BarButton";
import { CardBack } from "./GameCard";
import { CostDot, deckFocus, type DeckKit } from "./DeckStrip";
import { useT } from "../lib/i18n";
import type { PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { MAX_DECKS, resolveDeck, type DeckBook, type DeckLook } from "../lib/game/deck";
import { winRate, type SimResult } from "../lib/game/sim";
import { sfx } from "../lib/game/sfx";
import { GAME_TEXT } from "../lib/game/text";

const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const CLIP = "[clip-path:polygon(2%_8%,99%_0,100%_90%,0_100%)]";

/** Etiqueta de papel colada torta, só para ler (o mesmo recorte das placas dos locais). */
export function Label({ tone, ink, tilt = -1, className = "", children }: { tone: string; ink: string; tilt?: 1 | -1; className?: string; children: ReactNode }) {
  return (
    <span className={`relative isolate inline-flex items-center px-2.5 py-1 text-[11px] font-extrabold tracking-widest uppercase drop-shadow-[0_2px_0_rgb(0_0_0/0.6)] ${ink} ${className}`}>
      <span aria-hidden="true" className={`absolute inset-0 -z-10 ${CLIP} ${tilt < 0 ? "-rotate-2" : "rotate-2"} ${tone}`} />
      {children}
    </span>
  );
}

/**
 * As 12 vagas como as orbes de almas da mesa: acesas brilham na cor das almas (cada uma acende com um pulo, em sequência),
 * apagadas são encaixes fundos com aro de latão. Ao lado, a conta em números.
 */
function SoulPips({ n, still }: { n: number; still: boolean | null }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="flex items-center gap-1.5 sm:gap-2">
        {Array.from({ length: DECK_SIZE }, (_, i) => (
          <motion.span key={i} initial={false} animate={i < n && !still ? { scale: [0.6, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.025 }}
            className={`size-4 rounded-full sm:size-5 ${i < n
              ? "bg-radial-[at_50%_30%] from-white via-game-soul to-teal-800 shadow-[0_0_10px_var(--color-game-soul),inset_0_-2px_3px_rgb(0_0_0/0.35)]"
              : "bg-zinc-950 shadow-[inset_0_2px_4px_rgb(0_0_0/0.95)] ring-[1.5px] ring-game-brass/35"}`} />
        ))}
      </span>
      <b className={`font-display text-lg leading-none font-extrabold tabular-nums ${n >= DECK_SIZE ? "text-game-soul" : "text-zinc-300"}`}>{n}<span className="text-sm text-zinc-500">/{DECK_SIZE}</span></b>
    </span>
  );
}

/** Ficha de cassino por faixa de custo, nas cores da mesa: barato verde, médio azul, caro amarelo, muito caro vermelho. */
const CHIP = [
  "bg-lane-green", "bg-lane-green", "bg-lane-blue", "bg-lane-blue", "bg-lane-yellow", "bg-lane-yellow", "bg-game-ai", "bg-game-ai",
] as const;

/**
 * Curva de custo em pilhas de fichas de cassino vistas de lado (uma ficha por carta, com as listras da borda), em cima de
 * uma marca no feltro; embaixo, o custo na orbe de almas da carta. As fichas caem na pilha quando o baralho muda.
 */
function ChipCurve({ cards, kit, label, still }: { cards: PoolCard[]; kit: DeckKit; label: string; still: boolean | null }) {
  const curve = COSTS.map((n) => cards.filter((c) => Math.min(8, Math.max(1, kit.stats(c).cost)) === n).length);
  return (
    <figure className="flex flex-col items-center gap-1.5" aria-label={`${label}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
      <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
        {curve.map((n, i) => (
          <span key={COSTS[i]} className="relative flex w-8 flex-col-reverse items-center gap-px">
            {/* marca da pilha no feltro */}
            <span className="absolute -bottom-1 h-2 w-9 rounded-[50%] bg-black/45 blur-[1px]" />
            {Array.from({ length: n }, (_, j) => (
              <motion.span key={j} initial={still ? false : { y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 700, damping: 26, delay: still ? 0 : i * 0.04 + j * 0.05 }}
                className={`relative h-2.5 w-full rounded-[50%] bg-[repeating-linear-gradient(90deg,transparent_0_5px,rgb(255_255_255/0.85)_5px_8px)] shadow-[inset_0_-2px_0_rgb(0_0_0/0.35),0_1px_0_rgb(0_0_0/0.8)] ${CHIP[i]}`} />
            ))}
            {!n && <span className="relative h-2.5 w-full rounded-[50%] bg-white/6 shadow-[inset_0_1px_2px_rgb(0_0_0/0.8)]" />}
          </span>
        ))}
      </div>
      <figcaption className="flex gap-1.5" aria-hidden="true">
        {COSTS.map((n, i) => (
          <span key={n} className="flex w-8 justify-center">
            <CostDot cost={n} className={`size-5 text-[10px] ${curve[i] ? "" : "opacity-35 grayscale"}`} />
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * Tela de baralhos, feita para caber na tela sem rolar: o baralho escolhido aberto em leque sob a luz do bar (o tamanho das
 * cartas acompanha a altura da tela; as vagas vazias aparecem viradas), os números dele, as ações em etiquetas (Jogar no
 * meio, o dobro das vizinhas) e os baralhos salvos numa coluna à direita (no celular, numa fileira embaixo). A coleção não
 * fica aqui: ela abre na oficina (montar à mão) ou no draft (1 de 3). Passar o mouse numa carta do leque abre espaço,
 * endireita e amplia a carta com o texto da habilidade.
 */
export function DeckLobby({ book, versions, deck, look, kit, odds, onPick, onNew, onEdit, onDraft, onOpen, onPlay, coverOf }: {
  book: DeckBook; versions: Map<string, PoolCard[]>; deck: PoolCard[]; look: DeckLook; kit: DeckKit;
  /** Partidas simuladas contra a IA (null enquanto simula ou com o baralho incompleto). */
  odds: SimResult | null;
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
  const rate = odds ? winRate(odds) : 0;
  // o draft escreve no baralho atual se ele estiver vazio; senão abre um baralho novo
  const draftBlocked = deck.length > 0 && book.decks.length >= MAX_DECKS;
  const bookFull = book.decks.length >= MAX_DECKS;

  return (
    // altura da tela menos o menu do site e o respiro da página: tudo cabe sem rolar
    <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 text-dl-text lg:h-[calc(100dvh-10rem)] lg:min-h-128 lg:flex-row lg:gap-6">
      <FullscreenButton label={t.ui.fullscreen} className="absolute top-0 right-0 z-30" />

      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-between gap-3 lg:min-h-0">
        {/* luz do lampião sobre o leque */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full bg-radial-[ellipse_60%_45%_at_50%_40%] from-amber-200/12 via-amber-500/5 to-transparent to-70%" />

        <header className="relative flex flex-col items-center gap-2 text-center">
          <Label tone="bg-lane-yellow" ink="text-zinc-950">{t.ui.title}</Label>
          <h1 className="font-display text-3xl font-extrabold tracking-[0.08em] text-balance uppercase drop-shadow-[0_4px_18px_rgb(0_0_0/0.8)] sm:text-4xl xl:text-5xl">{cur.name}</h1>
          <p className="flex flex-wrap items-center justify-center gap-2" aria-live="polite">
            <Label tone={full ? "bg-lane-green" : "bg-game-ai"} ink="text-zinc-950" tilt={1}>
              {full ? t.deck.ready : t.deck.missing(DECK_SIZE - deck.length)}
            </Label>
            {deck.length > 0 && <Label tone="bg-comanda-paper" ink="text-comanda-ink">{t.deck.avg(avg)}</Label>}
            {/* chance de vitória medida em partidas simuladas, na cor das faixas: verde favorito, amarelo parelho, vermelho azarão */}
            {full && (odds
              ? <span title={t.deck.oddsHint(odds.n)}><Label tone={rate >= 55 ? "bg-lane-green" : rate >= 45 ? "bg-lane-yellow" : "bg-game-ai"} ink="text-zinc-950">{t.deck.odds(rate)}</Label></span>
              : <Label tone="bg-zinc-800" ink="text-zinc-300" className="motion-safe:animate-pulse">{t.deck.oddsWait}</Label>)}
            <Label tone="bg-zinc-800" ink="text-zinc-200" tilt={1}>{t.deck.looks[look]}</Label>
          </p>
        </header>

        {/* o leque: 12 posições em arco; vaga vazia é o verso do baralho apagado. A largura da carta vem da altura que sobra. */}
        <ol aria-label={t.deck.list} onPointerLeave={() => setHot(null)}
          className="relative h-[calc(var(--w)*1.46+3.5rem)] w-full max-w-4xl shrink-0 [--gap:min(4.4rem,6.5vw)] [--w:clamp(4.4rem,min(14vw,calc((100dvh-38rem)/1.46)),10rem)]">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = sorted[i];
            const k = i - mid;
            const on = hot === i;
            // as vizinhas abrem espaço para a carta em destaque
            const push = hot === null || on ? 0 : i > hot ? 1 : -1;
            const pos = { "--k": k, "--push": push, zIndex: on ? 50 : i + 1 } as CSSProperties;
            return (
              <li key={c?.key ?? `gap${i}`} style={pos}
                className="absolute top-0 left-1/2 w-(--w) transform-[translateX(calc(-50%+var(--k)*var(--gap)+var(--push)*min(2.6rem,4vw)))_translateY(calc(var(--k)*var(--k)*0.11rem+0.4rem))_rotate(calc(var(--k)*3deg))] transition-transform duration-200 ease-out motion-reduce:transition-none">
                <motion.div key={`${cur.id}-${c?.id ?? i}`} initial={still ? false : { y: 90, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.28, delay: still ? 0 : i * 0.03, ease: [0.23, 1, 0.32, 1] }}>
                  {c ? (
                    <motion.button type="button" onClick={() => onOpen(c.key)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))}
                      onHoverStart={() => setHot(i)} onPointerEnter={(e) => { if (e.pointerType === "mouse") sfx("hover"); }} onFocus={() => setHot(i)} onBlur={() => setHot((h) => (h === i ? null : h))}
                      animate={on ? { y: "-14%", scale: 1.6, rotate: -k * 3 } : { y: 0, scale: 1, rotate: 0 }}
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

        {/* números: as vagas em almas e a curva em fichas, lado a lado */}
        <div className="relative flex flex-wrap items-end justify-center gap-x-8 gap-y-2">
          <SoulPips n={deck.length} still={still} />
          {deck.length > 0 ? <ChipCurve key={cur.id} cards={deck} kit={kit} label={t.deck.curve} still={still} /> : <p className="max-w-xs text-center text-xs text-zinc-400">{t.deck.emptyHint}</p>}
        </div>

        {/* ações: Jogar no meio, o dobro das vizinhas; no celular ele fica sozinho na primeira linha */}
        <div className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pb-2">
          <TagButton tone="blue" delay={0.1} onClick={onEdit}>{t.deck.edit}</TagButton>
          <TagButton tone="yellow" size="xl" tilt={1} delay={0} call={full} disabled={!full} title={full ? undefined : t.deck.missing(DECK_SIZE - deck.length)}
            onClick={onPlay} className="order-first basis-full sm:order-0 sm:basis-auto">
            {t.deck.play}
          </TagButton>
          <TagButton tone="green" tilt={1} delay={0.2} call={!deck.length} onClick={onDraft} disabled={draftBlocked} title={draftBlocked ? t.deck.maxDecks(MAX_DECKS) : t.deck.draftHint}>{t.deck.draft}</TagButton>
        </div>
      </div>

      {/* baralhos salvos: coluna à direita (como a lista de decks do Hearthstone); no celular, uma fileira que rola de lado */}
      <section aria-labelledby="deck-shelf" className="relative flex flex-col gap-3 lg:min-h-0 lg:w-60 lg:shrink-0 lg:pt-12">
        <h2 id="deck-shelf" className="flex justify-center lg:justify-start"><Label tone="bg-zinc-800" ink="text-zinc-300">{t.deck.decks}</Label></h2>
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:snap-none lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
          {book.decks.map((d, i) => {
            const cards = resolveDeck(d.cards, versions);
            const cv = coverOf(cards, d.cover);
            const on = d.id === book.current;
            return (
              <motion.li key={d.id} className="w-44 shrink-0 snap-start lg:w-full" initial={still ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: still ? 0 : 0.05 * i }}>
                <button type="button" onClick={() => onPick(d.id)} aria-pressed={on} aria-label={`${d.name} · ${t.deck.cards(cards.length)}`}
                  className={`group relative isolate flex min-h-14 w-full cursor-pointer items-center gap-3 py-1.5 pr-3 pl-2 text-left transition active:scale-[0.97] motion-reduce:transition-none ${deckFocus} ${on ? "text-comanda-ink" : "text-zinc-200"}`}>
                  {/* o escolhido vira uma etiqueta de papel; os outros só ganham papel no hover */}
                  <span aria-hidden="true" className={`absolute inset-0 -z-10 ${CLIP} transition duration-200 motion-reduce:transition-none ${i % 2 ? "rotate-1" : "-rotate-1"} ${on ? "bg-comanda-paper drop-shadow-[0_3px_0_rgb(0_0_0/0.6)]" : "bg-zinc-800/0 group-hover:bg-zinc-800/80"}`} />
                  <span className="relative w-9 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-3 motion-reduce:transition-none">
                    <CardBack look={d.look ?? "noir"} className="drop-shadow-[0_2px_3px_rgb(0_0_0/0.7)]" />
                    {cv && <span className="absolute -top-1 -right-3 w-6 rotate-12 overflow-clip rounded-sm drop-shadow-[0_2px_3px_rgb(0_0_0/0.7)]">{kit.face(cv)}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="truncate text-sm font-extrabold tracking-wide uppercase">{d.name}</b>
                    <span className={`text-[11px] font-bold ${cards.length === DECK_SIZE ? (on ? "text-teal-800" : "text-game-me") : on ? "text-comanda-ink/60" : "text-zinc-500"}`}>{t.deck.cards(cards.length)} · {cards.length}/{DECK_SIZE}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
          <li className="w-44 shrink-0 snap-start lg:w-full">
            <button type="button" onClick={onNew} disabled={bookFull} title={bookFull ? t.deck.maxDecks(MAX_DECKS) : undefined}
              className={`group relative isolate flex min-h-14 w-full cursor-pointer items-center gap-3 py-1.5 pr-3 pl-2 text-left text-zinc-300 transition hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${deckFocus}`}>
              <span aria-hidden="true" className={`absolute inset-0 -z-10 ${CLIP} rotate-1 bg-zinc-800/0 transition duration-200 group-enabled:group-hover:bg-zinc-800/80 motion-reduce:transition-none`} />
              <span className="relative grid w-9 shrink-0 place-items-center">
                <CardBack look={look} className="opacity-25 grayscale" />
                <span aria-hidden="true" className="absolute text-2xl font-black text-zinc-200 drop-shadow-[0_2px_0_rgb(0_0_0/0.8)]">+</span>
              </span>
              <b className="text-sm font-extrabold tracking-wide uppercase">{t.deck.newDeck}</b>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
