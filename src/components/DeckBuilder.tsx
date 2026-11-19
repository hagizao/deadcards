import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CardFocus } from "./CardFocus";
import { DeckDraft } from "./DeckDraft";
import { DeckForge } from "./DeckForge";
import { DeckLobby } from "./DeckLobby";
import type { DeckKit } from "./DeckStrip";
import { GameCard } from "./GameCard";
import { playerArt } from "../lib/cards";
import { getCardTier, getRarity } from "../lib/rarity";
import { sfx } from "../lib/game/sfx";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { ABILITIES, cardStats, type GameConfig, type PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import {
  DECK_NAME_MAX, MAX_DECKS, fillDeck, heroHolder, heroTaken, loadBook, newDeck, resolveDeck, saveBook, swapHero, versionPlayer, type DeckBook, type DeckLook, type SavedDeck,
} from "../lib/game/deck";
import { simulate, type SimResult } from "../lib/game/sim";
import { GAME_TEXT } from "../lib/game/text";

const FLY_S = 0.3;
/** Intervalo entre as cartas do aleatório. */
const DEAL_MS = 170;
/** Saída da tela de baralhos para a mesa: a câmera desce, o leque deita na mesa e a tela escurece. */
const LEAVE_MS = 650;
type Flight = { id: number; from: DOMRect; to: DOMRect; card: ReactNode };
let flightSeq = 0;
type Mode = "lobby" | "forge" | "draft";

/** Partidas simuladas por baralho (em pedaços, para não travar a tela) e o tamanho de cada pedaço. */
export const SIM_GAMES = 200;
const SIM_STEP = 20;

/**
 * Chance de vitória do baralho completo contra a IA: simula SIM_GAMES partidas em pedaços, depois de uma pausa (para não
 * rodar a cada carta trocada às pressas). Sementes fixas: o mesmo baralho sempre dá o mesmo número. null enquanto roda.
 */
function useOdds(cfg: GameConfig, pool: PoolCard[], deck: PoolCard[]): SimResult | null {
  const key = deck.length >= DECK_SIZE ? deck.map((c) => c.id).join() : "";
  const [res, setRes] = useState<{ key: string; r: SimResult } | null>(null);
  useEffect(() => {
    if (!key) return;
    const acc: SimResult = { n: 0, win: 0, loss: 0, draw: 0 };
    let id = 0;
    const step = () => {
      simulate(cfg, pool, deck, SIM_STEP, acc.n + 1, acc);
      if (acc.n < SIM_GAMES) id = window.setTimeout(step, 0);
      else setRes({ key, r: acc });
    };
    id = window.setTimeout(step, 300);
    return () => window.clearTimeout(id);
  }, [key, cfg, pool, deck]);
  return res && res.key === key ? res.r : null;
}

/**
 * Antes da partida, três telas:
 * - **baralhos** (lobby): o baralho escolhido em leque, Jogar e a prateleira de baralhos;
 * - **oficina**: montar à mão, com a coleção num fichário paginado e o baralho em tiras;
 * - **draft**: doze rodadas de 1 entre 3.
 * A coleção inteira nunca fica na tela principal.
 */
export function DeckBuilder({ versions, pool, cfg, onPlay }: { versions: Map<string, PoolCard[]>; pool: PoolCard[]; cfg: GameConfig; onPlay: (deck: PoolCard[], look: DeckLook) => void }) {
  const t = useT(GAME_TEXT);
  const { players, heroArt, settings } = useData();
  const still = useReducedMotion();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [book, setBook] = useState<DeckBook>(() => loadBook(t.deck.defaultName));
  useEffect(() => saveBook(book), [book]);
  const [mode, setMode] = useState<Mode>("lobby");
  const cur = book.decks.find((d) => d.id === book.current) ?? book.decks[0];
  const deck = useMemo(() => resolveDeck(cur.cards, versions), [cur.cards, versions]);
  const look: DeckLook = cur.look ?? "noir";
  const odds = useOdds(cfg, pool, deck);
  // versão mostrada de quem ainda não está no baralho
  const [shown, setShown] = useState<Record<string, string>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // versão vista na carta em destaque: pode ser uma de herói repetido, só para ver e trocar
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  // aleatório distribuindo: os relógios de cada carta (cancelados ao limpar ou sair)
  const deals = useRef<number[]>([]);
  const [dealing, setDealing] = useState(false);
  const stopDeal = useCallback(() => { deals.current.forEach((id) => window.clearTimeout(id)); deals.current = []; setDealing(false); }, []);
  useEffect(() => stopDeal, [stopDeal]);

  const stats = useCallback((c: PoolCard) => cardStats(c, cfg.cards, cfg.heroes), [cfg]);
  const kit: DeckKit = useMemo(() => ({
    stats,
    tier: (c) => { const p = versionPlayer(byId, c); return p ? getCardTier(p, settings.tierConfig ?? []) : getRarity(c.ovr, settings.tierConfig ?? []); },
    face: (c) => {
      const s = stats(c);
      return <GameCard player={versionPlayer(byId, c)} name={c.name} cost={s.cost} power={s.power} base={s.power} text={null} />;
    },
    full: (c) => {
      const s = stats(c);
      const a = t.abilities[s.ab];
      return <GameCard player={versionPlayer(byId, c)} name={c.name} cost={s.cost} power={s.power} base={s.power} fx
        text={{ name: a.name, kind: t.kinds[ABILITIES[s.ab].kind], body: s.desc || a.text(s.v), masterLabel: t.ui.masterLine }} />;
    },
    art: (c) => {
      const p = versionPlayer(byId, c);
      const a = p && playerArt(p, heroArt);
      return a ? { url: a.url, x: a.x, y: a.y } : null;
    },
  }), [stats, byId, heroArt, t, settings.tierConfig]);

  const inDeck = new Map(deck.map((c) => [c.key, c]));
  const full = deck.length >= DECK_SIZE;
  const coverOf = (cards: PoolCard[], id?: string) => cards.find((c) => c.id === id) ?? [...cards].sort((a, b) => stats(b).cost - stats(a).cost || b.ovr - a.ovr)[0];
  const cover = coverOf(deck, cur.cover);
  const current = (l: PoolCard[]) => inDeck.get(l[0].key) ?? l.find((c) => c.id === shown[l[0].key]) ?? l[0];

  const setCards = (fn: (d: PoolCard[]) => PoolCard[]) =>
    setBook((b) => ({ ...b, decks: b.decks.map((d) => (d.id === b.current ? { ...d, cards: fn(resolveDeck(d.cards, versions)).map((c) => c.id) } : d)) }));
  const patchCur = (patch: Partial<SavedDeck>) => setBook((b) => ({ ...b, decks: b.decks.map((d) => (d.id === b.current ? { ...d, ...patch } : d)) }));
  const addDeck = (cards: string[] = [], name = t.deck.defaultName(book.decks.length + 1)) => {
    if (book.decks.length >= MAX_DECKS) return false;
    const d = newDeck(name.slice(0, DECK_NAME_MAX), cards);
    setBook((b) => ({ decks: [...b.decks, d], current: d.id }));
    return true;
  };
  const removeDeck = () => {
    setBook((b) => {
      const decks = b.decks.filter((d) => d.id !== b.current);
      if (!decks.length) decks.push(newDeck(t.deck.defaultName(1)));
      return { decks, current: decks[0].id };
    });
    setMode("lobby");
  };

  /** Carta voando entre o fichário e o baralho (o trilho no desktop, a barra no celular). */
  const target = () => [...document.querySelectorAll<HTMLElement>("[data-deck-target]")].find((e) => e.offsetParent)?.getBoundingClientRect() ?? null;
  const tileRect = (key: string) => document.querySelector(`[data-tile="${CSS.escape(key)}"]`)?.getBoundingClientRect() ?? null;
  const fly = (c: PoolCard, from: DOMRect | null, to: DOMRect | null) => {
    if (still || !from || !to) return;
    const id = ++flightSeq;
    setFlights((f) => [...f, { id, from, to, card: kit.face(c) }]);
  };
  /**
   * Aleatório: completa o baralho distribuindo uma carta de cada vez, cada uma voando do botão para o baralho e fazendo o
   * som de carta comprada ao chegar. Sem movimento, entram todas de uma vez.
   */
  const deal = () => {
    const add = fillDeck(deck, versions).slice(deck.length);
    if (still || !add.length) { setCards((d) => fillDeck(d, versions)); return; }
    stopDeal();
    setDealing(true);
    const from = document.querySelector("[data-deal-from]")?.getBoundingClientRect() ?? null;
    add.forEach((c, i) => {
      deals.current.push(window.setTimeout(() => fly(c, from, target()), i * DEAL_MS));
      deals.current.push(window.setTimeout(() => {
        sfx("draw", 0.7);
        // o jogador pode ter mexido no baralho no meio: não repete carta, herói nem passa de 12
        setCards((d) => (d.length >= DECK_SIZE || d.some((x) => x.key === c.key) || heroTaken(d, c) ? d : [...d, c]));
        if (i === add.length - 1) { deals.current = []; setDealing(false); }
      }, i * DEAL_MS + FLY_S * 1000));
    });
  };
  const toggle = (c: PoolCard, from: DOMRect | null = tileRect(c.key)) => {
    const on = inDeck.has(c.key);
    if (!on && (full || heroTaken(deck, c))) return;
    if (on) fly(c, target(), from);
    else fly(c, from, target());
    setCards((d) => (on ? d.filter((x) => x.key !== c.key) : [...d, c]));
  };
  const choose = (c: PoolCard) => {
    // trocar a versão de quem está no baralho para um herói que outro jogador já usa repetiria o herói
    if (inDeck.has(c.key) && heroTaken(deck, c)) return;
    setShown((s) => ({ ...s, [c.key]: c.id }));
    setCards((d) => d.map((x) => (x.key === c.key ? c : x)));
  };
  const focusList = focusKey ? versions.get(focusKey) : undefined;
  const focusShown = focusList && (focusList.find((v) => v.id === focusId) ?? current(focusList));
  const openFocus = (key: string) => { setFocusKey(key); setFocusId(null); };
  const closeFocus = useCallback(() => setFocusKey(null), []);
  const showVersion = (v: PoolCard) => {
    setFocusId(v.id);
    if (!heroTaken(deck, v)) choose(v);
  };
  /** Troca a carta do baralho que usa o herói de v por v. */
  const swap = (v: PoolCard, from: DOMRect | null) => {
    const holder = heroHolder(deck, v);
    if (!holder) return;
    fly(v, from, target());
    setShown((s) => ({ ...s, [v.key]: v.id }));
    setCards((d) => swapHero(d, v));
  };

  /** O draft enche o baralho atual se ele estiver vazio; senão vira um baralho novo. */
  const saveDraft = (cards: PoolCard[]) => {
    const ids = cards.map((c) => c.id);
    if (!deck.length) patchCur({ cards: ids });
    else if (!addDeck(ids, t.deck.draftName(book.decks.length + 1))) return;
    setMode("lobby");
  };
  /**
   * Jogar: pede a tela cheia ainda dentro do clique (o navegador só deixa assim) e, vindo da tela de baralhos, espera as
   * o leque deitar na mesa (LEAVE_MS) antes de abrir a mesa.
   */
  const play = (cards = deck, wait = 0) => {
    document.documentElement.requestFullscreen?.()?.catch(() => {});
    if (!wait || still) return onPlay(cards, look);
    sfx("shuffle", 0.6);
    window.setTimeout(() => onPlay(cards, look), wait);
  };

  const view = mode === "forge" ? (
    <DeckForge cur={cur} deck={deck} versions={versions} look={look} cover={cover} kit={kit} deckCount={book.decks.length} current={current}
      onBack={() => { stopDeal(); setMode("lobby"); }} onPlay={() => play()} onOpen={openFocus} onToggle={(c) => toggle(c)} onPatch={patchCur}
      dealing={dealing} onRandom={deal} onClear={() => { stopDeal(); setCards(() => []); }}
      onDuplicate={() => addDeck(cur.cards, `${cur.name} 2`)} onRemove={removeDeck} />
  ) : mode === "draft" ? (
    <DeckDraft versions={versions} look={look} kit={kit} onLeave={() => setMode("lobby")} onSave={saveDraft}
      onPlay={(cards) => { saveDraft(cards); play(cards); }} />
  ) : (
    <DeckLobby book={book} versions={versions} deck={deck} look={look} kit={kit} coverOf={coverOf} odds={odds}
      onPick={(id) => setBook((b) => ({ ...b, current: id }))} onNew={() => { if (addDeck()) setMode("forge"); }}
      onEdit={() => setMode("forge")} onDraft={() => setMode("draft")} onOpen={openFocus} onPlay={() => play(deck, LEAVE_MS)} />
  );

  return (
    <div className="w-full">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {view}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {focusList && (
          <CardFocus key="focus" versions={focusList} shown={focusShown ?? focusList[0]} cfg={cfg} inDeck={inDeck.has(focusList[0].key)} full={full}
            isCover={focusShown?.id === cover?.id} taken={(v) => heroTaken(deck, v)} holder={focusShown && heroHolder(deck, focusShown)}
            onShow={showVersion} onSwap={swap} onCover={(v) => patchCur({ cover: v.id })} onClose={closeFocus} onToggle={(v, from) => toggle(v, from)} />
        )}
      </AnimatePresence>

      {/* cartas voando entre o fichário e o baralho */}
      <div className="pointer-events-none fixed inset-0 z-90" aria-hidden="true">
        {flights.map((f) => (
          <motion.div key={f.id} className="absolute top-0 left-0 origin-top-left" style={{ width: f.from.width }}
            initial={{ x: f.from.left, y: f.from.top, scale: 1, opacity: 1, rotate: 0 }}
            animate={{ x: f.to.left + f.to.width / 2 - f.from.width * 0.15, y: f.to.top, scale: 0.3, opacity: 0.2, rotate: f.to.left > f.from.left ? 10 : -10 }}
            transition={{ duration: FLY_S, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={() => setFlights((x) => x.filter((y) => y.id !== f.id))}>
            {f.card}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
