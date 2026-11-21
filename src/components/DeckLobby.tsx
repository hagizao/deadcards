import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { FullscreenButton, TagButton } from "./BarButton";
import { CardBack } from "./GameCard";
import { MiniSoul } from "./GameHud";
import { deckFocus, type DeckKit } from "./DeckStrip";
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
export function Label({ tone, ink, tilt = -1, big = false, className = "", children }: {
  tone: string; ink: string; tilt?: 1 | -1; /** 30% maior (cabeçalho). */ big?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <span className={`relative isolate inline-flex items-center font-extrabold ${big ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"} tracking-widest uppercase drop-shadow-[0_2px_0_rgb(0_0_0/0.6)] ${ink} ${className}`}>
      <span aria-hidden="true" className={`absolute inset-0 -z-10 ${CLIP} ${tilt < 0 ? "-rotate-2" : "rotate-2"} ${tone}`} />
      {children}
    </span>
  );
}

/** Cor da ficha por faixa de custo, nas cores da mesa: barato verde, médio azul, caro amarelo, muito caro vermelho (o SVG pinta com currentColor). */
const CHIP = [
  "text-lane-green", "text-lane-green", "text-lane-blue", "text-lane-blue", "text-lane-yellow", "text-lane-yellow", "text-game-ai", "text-game-ai",
] as const;
/** Listras brancas da borda da ficha (x de cada uma na lateral). */
const EDGE = [2.5, 10, 17.5, 25, 32.5];

/**
 * Ficha de cassino vista de cima e de lado: o cilindro com as listras brancas da borda, o topo com o anel tracejado e o
 * miolo, e um brilho de luz do lampião. Lado escurecido para dar volume.
 */
function Chip({ tone }: { tone: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 40 16" className={`block w-full overflow-visible drop-shadow-[0_1px_0_rgb(0_0_0/0.85)] ${tone}`} aria-hidden="true">
      <clipPath id={id}><path d="M1 5v6a19 4.5 0 0 0 38 0V5z" /></clipPath>
      <path d="M1 5v6a19 4.5 0 0 0 38 0V5z" fill="currentColor" />
      <g clipPath={`url(#${id})`}>
        {EDGE.map((x) => <rect key={x} x={x} y="4" width="3" height="12" fill="#f6f1e7" />)}
        <path d="M1 5v6a19 4.5 0 0 0 38 0V5z" fill="#000" opacity="0.32" />
      </g>
      <ellipse cx="20" cy="5" rx="19" ry="4.5" fill="currentColor" />
      <ellipse cx="20" cy="5" rx="15.5" ry="3.5" fill="none" stroke="#f6f1e7" strokeWidth="1.5" strokeDasharray="3.2 3.6" />
      <ellipse cx="20" cy="5" rx="10" ry="2.3" fill="#000" opacity="0.16" stroke="#f6f1e7" strokeOpacity="0.55" strokeWidth="0.6" />
      <ellipse cx="15" cy="3.4" rx="8" ry="1.1" fill="#fff" opacity="0.28" />
    </svg>
  );
}

/**
 * Curva de custo em pilhas de fichas de cassino (uma ficha por carta), levemente desalinhadas como fichas de verdade, com
 * a sombra no feltro; embaixo, o custo numa alma (acesa se há cartas daquele custo). As fichas caem na pilha ao trocar de baralho.
 */
function ChipCurve({ cards, kit, label, still }: { cards: PoolCard[]; kit: DeckKit; label: string; still: boolean | null }) {
  const curve = COSTS.map((n) => cards.filter((c) => Math.min(8, Math.max(1, kit.stats(c).cost)) === n).length);
  return (
    <figure className="flex flex-col items-center gap-2" aria-label={`${label}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
      <div className="flex h-16 items-end gap-1.5 [--step:0.34rem] sm:h-20 sm:gap-2 sm:[--step:0.42rem]" aria-hidden="true">
        {curve.map((n, i) => (
          <span key={COSTS[i]} className="relative h-full w-8 sm:w-10">
            <span className="absolute inset-x-0 -bottom-0.5 h-2.5 rounded-[50%] bg-black/55 blur-[2px]" />
            {Array.from({ length: n }, (_, j) => (
              // posição na pilha e o desalinhado de cada ficha são calculados
              <motion.span key={j} className="absolute inset-x-0" style={{ bottom: `calc(${j} * var(--step))` }}
                initial={still ? false : { y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1, x: Math.round(Math.sin((i + 1) * (j + 3) * 1.7) * 2) }}
                transition={{ type: "spring", stiffness: 650, damping: 24, delay: still ? 0 : i * 0.04 + j * 0.06 }}>
                <Chip tone={CHIP[i]} />
              </motion.span>
            ))}
            {!n && <span className="absolute inset-x-0 bottom-0 h-3 rounded-[50%] bg-white/5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.9)]" />}
          </span>
        ))}
      </div>
      <figcaption className="flex gap-1.5 sm:gap-2" aria-hidden="true">
        {COSTS.map((n, i) => (
          <span key={n} className="flex w-8 justify-center sm:w-10">
            <MiniSoul lit={curve[i] > 0} i={i + 20} className="size-7 text-xs sm:size-8 sm:text-sm">{n === 8 ? "8+" : n}</MiniSoul>
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
  // saída para a partida: a câmera desce para a mesa (o leque deita para trás e se fecha, o lampião sobe e some)
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    if (leaving) return;
    setHot(null);
    if (!still) setLeaving(true);
    onPlay();
  };
  /** Tudo que não é o leque some quando as cartas saem. */
  const fade = leaving ? "opacity-0 transition-opacity duration-300" : "transition-opacity duration-300";
  const cur = book.decks.find((d) => d.id === book.current) ?? book.decks[0];
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const sorted = [...deck].sort((a, b) => kit.stats(a).cost - kit.stats(b).cost || a.name.localeCompare(b.name));
  const mid = (DECK_SIZE - 1) / 2;
  /** Queda de cada carta na saída: quando solta (fora de ordem, estável) e quanto gira caindo. */
  const drop = Array.from({ length: DECK_SIZE }, (_, i) => {
    const r = (n: number) => { const x = Math.sin((i + 1) * n) * 43758.5453; return x - Math.floor(x); };
    return { at: r(12.9898) * 0.22, spin: (r(78.233) - 0.5) * 40 };
  });
  const rate = odds ? winRate(odds) : 0;
  // o draft escreve no baralho atual se ele estiver vazio; senão abre um baralho novo
  const draftBlocked = deck.length > 0 && book.decks.length >= MAX_DECKS;
  const bookFull = book.decks.length >= MAX_DECKS;

  return (
    // altura da tela menos o menu do site e o respiro da página: tudo cabe sem rolar
    <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 text-dl-text lg:h-[calc(100dvh-10rem)] lg:min-h-128 lg:flex-row lg:gap-6 2xl:max-w-400">
      <FullscreenButton label={t.ui.fullscreen} className={`absolute top-0 right-0 z-30 ${fade}`} />
      {/* calha vazia do tamanho da prateleira de baralhos, para o centro do lobby ficar no centro da tela */}
      <div aria-hidden="true" className="hidden xl:block xl:w-60 xl:shrink-0" />

      <div className="@container relative flex min-w-0 flex-1 flex-col items-center justify-between gap-3 lg:min-h-0">
        {/* luz do lampião sobre o leque */}
        {/* ao jogar, a luz do lampião sobe e some (a câmera está descendo) */}
        <motion.span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full bg-radial-[ellipse_60%_45%_at_50%_40%] from-amber-200/12 via-amber-500/5 to-transparent to-70%"
          animate={leaving ? { opacity: 0, y: "-35%" } : { opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeIn" }} />
        {/* as bordas escurecem: a mesa vai sair desse escuro */}
        {leaving && <motion.span aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 bg-radial from-black/40 to-black"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.65, ease: "easeIn" }} />}

        <header className={`relative flex flex-col items-center gap-3 text-center ${fade}`}>
          <Label big tone="bg-lane-yellow" ink="text-zinc-950">{t.ui.title}</Label>
          <h1 className="font-display text-4xl font-extrabold tracking-[0.08em] text-balance uppercase drop-shadow-[0_4px_18px_rgb(0_0_0/0.8)] sm:text-5xl xl:text-6xl">{cur.name}</h1>
          <p className="flex flex-wrap items-center justify-center gap-2.5" aria-live="polite">
            <Label big tone={full ? "bg-lane-green" : "bg-game-ai"} ink="text-zinc-950" tilt={1}>
              {full ? t.deck.ready : t.deck.missing(DECK_SIZE - deck.length)}
            </Label>
            {deck.length > 0 && <Label big tone="bg-comanda-paper" ink="text-comanda-ink">{t.deck.avg(avg)}</Label>}
            {/* chance de vitória medida em partidas simuladas, na cor das faixas: verde favorito, amarelo parelho, vermelho azarão */}
            {full && (odds
              ? <span title={t.deck.oddsHint(odds.n)}><Label big tone={rate >= 55 ? "bg-lane-green" : rate >= 45 ? "bg-lane-yellow" : "bg-game-ai"} ink="text-zinc-950">{t.deck.odds(rate)}</Label></span>
              : <Label big tone="bg-zinc-800" ink="text-zinc-300" className="motion-safe:animate-pulse">{t.deck.oddsWait}</Label>)}
            <Label big tone="bg-zinc-800" ink="text-zinc-200" tilt={1}>{t.deck.looks[look]}</Label>
          </p>
        </header>

        {/* o leque: 12 posições em arco; vaga vazia é o verso do baralho apagado. A largura da carta vem da altura que sobra. */}
        {/* na saída, as cartas despencam em queda livre até a borda de baixo da tela, por cima do escuro */}
        <ol aria-label={t.deck.list} onPointerLeave={() => setHot(null)}
          className={`relative h-[calc(var(--w)*1.46+3.5rem)] w-full max-w-4xl shrink-0 [--gap:min(4.4rem,6.5vw)] lg:[--gap:min(4.4rem,calc((100cqw-var(--w))/12))] ${leaving ? "pointer-events-none z-50" : ""} [--w:clamp(4.4rem,min(14vw,calc((100dvh-41rem)/1.46)),10rem)]`}>
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = sorted[i];
            const k = i - mid;
            const on = hot === i;
            // as vizinhas abrem espaço para a carta em destaque
            const push = hot === null || on ? 0 : i > hot ? 1 : -1;
            const pos = { "--k": k, "--push": push, zIndex: on ? 50 : i + 1 } as CSSProperties;
            return (
              <li key={c?.key ?? `gap${i}`} style={pos} data-hot={on || undefined}
                className="absolute top-0 left-1/2 w-(--w) transform-[translateX(calc(-50%+var(--k)*var(--gap)+var(--push)*min(2.6rem,4vw)))_translateY(calc(var(--k)*var(--k)*0.11rem+0.4rem))_rotate(calc(var(--k)*3deg))] transition-transform duration-200 ease-out motion-reduce:transition-none">
                {/* a luz do lampião cai no centro do leque: as pontas ficam na penumbra (a carta em destaque sobe para a luz) */}
                <motion.div key={`${cur.id}-${c?.id ?? i}`} initial={still ? false : { y: 90, opacity: 0, rotate: -8 }}
                  style={on ? undefined : { filter: `brightness(${(1 - Math.min(0.24, Math.abs(k) * 0.045)).toFixed(3)})` }}
                  animate={leaving ? { y: "110vh", rotate: drop[i].spin } : { y: 0, opacity: 1, rotate: 0 }}
                  transition={leaving
                    // gravidade: começa parada e acelera (cada carta solta num instante, fora de ordem)
                    ? { duration: 0.55, delay: drop[i].at, ease: [0.55, 0, 1, 0.45] }
                    : { duration: 0.28, delay: still ? 0 : i * 0.03, ease: [0.23, 1, 0.32, 1] }}>
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
          {/* brilho quente do lampião por cima do leque, balançando junto com a luz do bar */}
          <span aria-hidden="true" className={`pointer-events-none absolute inset-x-[-10%] inset-y-[-15%] z-60 lamp-sheen bg-radial-[ellipse_40%_60%_at_50%_30%] from-amber-200/30 to-transparent to-70% mix-blend-soft-light transition-opacity duration-300 ${leaving ? "opacity-0" : ""}`} />
        </ol>

        {/* números: as vagas em almas e a curva em fichas, lado a lado */}
        <div className={`relative flex flex-wrap items-end justify-center gap-x-10 gap-y-3 ${fade}`}>
          {deck.length > 0 ? <ChipCurve key={cur.id} cards={deck} kit={kit} label={t.deck.curve} still={still} /> : <p className="max-w-xs text-center text-xs text-zinc-400">{t.deck.emptyHint}</p>}
        </div>

        {/* ações: Jogar no meio, o dobro das vizinhas; no celular ele fica sozinho na primeira linha */}
        <div className={`relative flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pb-2 ${fade}`}>
          <TagButton tone="blue" delay={0.1} onClick={onEdit}>{t.deck.edit}</TagButton>
          <TagButton tone="yellow" size="xl" tilt={1} delay={0} call={full} disabled={!full} title={full ? undefined : t.deck.missing(DECK_SIZE - deck.length)}
            onClick={leave} className="order-first basis-full sm:order-0 sm:basis-auto">
            {t.deck.play}
          </TagButton>
          <TagButton tone="green" tilt={1} delay={0.2} call={!deck.length} onClick={onDraft} disabled={draftBlocked} title={draftBlocked ? t.deck.maxDecks(MAX_DECKS) : t.deck.draftHint}>{t.deck.draft}</TagButton>
        </div>
      </div>

      {/* baralhos salvos: coluna à direita (como a lista de decks do Hearthstone); no celular, uma fileira que rola de lado */}
      <section aria-labelledby="deck-shelf" className={`relative flex flex-col gap-3 lg:min-h-0 lg:w-60 lg:shrink-0 lg:pt-12 ${fade}`}>
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
