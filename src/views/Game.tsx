import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CardBack, GameCard, TipBoxes } from "../components/GameCard";
import { GameHand } from "../components/GameHand";
import { TargetArrow } from "../components/TargetArrow";
import { AudioMenu, EndTurnButton, SoulOrb } from "../components/GameHud";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { pill, primaryBtn } from "../lib/ui";
import { ABILITIES, ITEMS, gameConfig, phaseOf, type ItemKey, type ItemSlot, type PoolCard } from "../lib/game/config";
import { DeckBuilder } from "../components/DeckBuilder";
import { DeckPile } from "../components/DeckPile";
import { versionPlayer, type DeckLook } from "../lib/game/deck";
import { MIN_POOL, Match, TURNS, cardPool, cardVersions, type Bought, type GCard, type Loc, type LogEntry, type PlayError, type Result, type Side, type Token } from "../lib/game/engine";
import { duckMusic, sfx, startMusic, stopMusic, thump } from "../lib/game/sfx";
import { GAME_TEXT } from "../lib/game/text";
import { useItemIcons } from "../lib/game/useItemIcons";

const REVEAL_MS = 650;
const END_MS = 750;
const TOAST_MS = 1300;
/** Peso da carta pelo custo: 1 cai perto, 2 cai do alto, 3 vem do céu e treme a mesa. */
const weight = (c: GCard) => (c.cost >= 6 ? 3 : c.cost >= 3 ? 2 : 1);
/** Quanto a queda leva até tocar a mesa, por peso (ms). */
const FALL_MS = { 1: 200, 2: 260, 3: 340 } as const;
const TOKEN_GLYPH: Record<Token, string> = { pigeon: "🐦", ghoul: "💀", turret: "⚙️", rat: "🐀", illusion: "👤" };

// placar da sessão: sobrevive à troca de aba, zera ao recarregar a página
const record = { w: 0, l: 0 };
let toastSeq = 0;

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
// cor de cada categoria de item, como na loja do Deadlock
const SLOT_RING: Record<ItemSlot, string> = { weapon: "ring-item-weapon", vitality: "ring-item-vitality", spirit: "ring-item-spirit" };
const SLOT_TEXT: Record<ItemSlot, string> = { weapon: "text-item-weapon", vitality: "text-item-vitality", spirit: "text-item-spirit" };
/** Cor do selo de cada fase da partida (early, mid, late). */
const PHASE_TONE = ["bg-emerald-500/20 text-emerald-300", "bg-amber-500/20 text-amber-300", "bg-rose-500/20 text-rose-300"] as const;

export function Game() {
  const { players, settings } = useData();
  const t = useT(GAME_TEXT);
  const cfg = useMemo(() => gameConfig(settings.game), [settings.game]);
  const versions = useMemo(() => cardVersions(players), [players]);
  const pool = useMemo(() => cardPool(players), [players]);
  // deck escolhido na tela de deck; null = mostrar a tela
  const [deck, setDeck] = useState<{ cards: PoolCard[]; look?: DeckLook } | null>(null);
  if (pool.length < MIN_POOL) return <p className="text-sm text-zinc-300">{t.ui.needCards(MIN_POOL)}</p>;
  if (!deck) return <DeckBuilder versions={versions} cfg={cfg} onPlay={(cards, look) => setDeck({ cards, look })} />;
  return <Board key={JSON.stringify(cfg)} newMatch={() => new Match(cfg, pool, Math.random, { p: deck.cards })} deckLook={deck.look} onDeck={() => setDeck(null)} />;
}

function Board({ newMatch, deckLook, onDeck }: { newMatch: () => Match; deckLook?: DeckLook; onDeck: () => void }) {
  const t = useT(GAME_TEXT);
  const { players } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [m, setM] = useState(newMatch);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const icons = useItemIcons();
  const [sel, setSel] = useState<GCard | null>(null);
  const [look, setLook] = useState<GCard | null>(null);
  const [shopHidden, setShopHidden] = useState(false);
  // tela cheia: a partida cobre o site (e pede tela cheia ao navegador quando dá); os locais viram 2x2
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // saiu da tela cheia do navegador (Esc): sai do modo também
    const off = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", off);
    return () => { document.body.style.overflow = prev; document.removeEventListener("fullscreenchange", off); };
  }, [full]);
  const toggleFull = () => {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  // música: começa no primeiro gesto na partida (o navegador bloqueia som automático) e sai em fade ao deixar a tela
  useEffect(() => {
    const go = () => startMusic();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); stopMusic(); };
  }, []);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(() => ({ id: 0, text: t.ui.toast.turn(1) }));
  const [result, setResult] = useState<Result | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  // a música abaixa por baixo do resultado da partida
  useEffect(() => { duckMusic(showEnd); }, [showEnd]);
  // escolha de alvo ao jogar, movimento ou marca do Shiv em andamento
  const [mode, setMode] = useState<Mode | null>(null);
  /** Item da loja escolhido, esperando a carta alvo (mirado com a seta). */
  const [aim, setAim] = useState<ItemKey | null>(null);
  // carta sendo arrastada da mão e o local sob o cursor
  const [drag, setDrag] = useState<{ c: GCard; over: number | null } | null>(null);
  // carta da mesa ampliada no hover
  const [peek, setPeek] = useState<{ c: GCard; r: DOMRect } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [arena, shake] = useAnimate<HTMLDivElement>();
  const still = useReducedMotion();

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((x) => (x?.id === toast.id ? null : x)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const say = (text: string) => setToast({ id: ++toastSeq, text });
  const name = (c: GCard) => (c.p.token ? t.tokens[c.p.token] : c.p.name);
  const logName = (n: LogEntry["c"]) => (n === undefined ? "" : typeof n === "string" ? n : t.tokens[n.token]);
  const logLine = m.log[0] ? t.log[m.log[0].k](m.log[0], logName, (k) => t.abilities[k].name) : "";
  const shopOpen = !!m.offer && !result && !m.busy;
  const errText: Record<PlayError, string> = { souls: t.ui.toast.souls, frozen: t.ui.toast.frozen, full: t.ui.toast.full };

  /** Carta desenhada a partir da carta da coleção; `text` mostra a habilidade (mão e zoom), `fx` liga partículas e brilho. */
  const face = (c: GCard, text: boolean, fx = false) => {
    const key = m.abilityOf(c);
    const a = t.abilities[key];
    const body = key === "none" && c.ab !== "none" ? t.ui.noAbility : c.tok && c.ab === "none" ? t.ui.tokenDesc : c.desc || a.text(c.v);
    const ms = t.abilities[c.ab].master();
    const icons = c.rev ? statusIcons(c, m, t) : [];
    return (
      <GameCard player={c.p.token ? null : versionPlayer(byId, c.p)} name={name(c)} cost={c.cost} power={c.rev ? m.pow(c) : c.base} base={c.base}
        glyph={c.p.token ? TOKEN_GLYPH[c.p.token] : undefined} master={c.lvl === 2 ? t.levels[2] : undefined} fx={fx}
        status={icons.map((x) => x[0]).join("") || undefined}
        text={text ? { name: a.name, kind: t.kinds[ABILITIES[key].kind], body, master: c.lvl === 2 && key === c.ab && ms ? ms : undefined, masterLabel: t.ui.masterLine } : null} />
    );
  };
  /** Caixas ao lado da carta ampliada: selo de momento e status. */
  const tipsOf = (c: GCard) => [
    ...(ABILITIES[m.abilityOf(c)].kind !== "-" ? [{ title: t.kinds[ABILITIES[m.abilityOf(c)].kind], text: t.kindTips[ABILITIES[m.abilityOf(c)].kind] }] : []),
    ...(c.rev ? statusIcons(c, m, t).map(([icon, nm, k]) => ({ title: `${icon} ${nm}`, text: t.ui.statusTip[k] })) : []),
  ];

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setM(newMatch());
    sfx("shuffle");
    setSel(null);
    setLook(null);
    setResult(null);
    setShowEnd(false);
    setMode(null);
    setShopHidden(false);
    setAim(null);
    say(t.ui.toast.turn(1));
  };

  const endTurn = () => {
    if (m.busy || result) return;
    setAim(null);
    const queue = m.endTurn();
    sfx("endTurn");
    setSel(null);
    setMode(null);
    setLook(null);
    bump();
    let i = 0;
    const step = () => {
      if (i < queue.length) {
        const a = queue[i++];
        m.act(a);
        bump();
        if (!a.exec) land(a.c);
        return later(step, REVEAL_MS);
      }
      m.endOfTurn();
      bump();
      later(() => {
        if (m.over) {
          const r = m.finish();
          if (r.outcome === "win") record.w++;
          else if (r.outcome === "loss") record.l++;
          setResult(r);
          setShowEnd(true);
          if (r.outcome !== "draw") sfx(r.outcome === "win" ? "win" : "loss");
        } else {
          m.nextTurn();
          say(t.ui.toast.turn(m.t));
          sfx("draw");
          later(() => sfx("soul", 0.8), 180);
        }
        bump();
      }, END_MS);
    };
    step();
  };

  /** Som (e tremor, nas pesadas) quando a carta revelada toca a mesa. */
  const land = (c: GCard) => {
    const w = weight(c);
    later(() => {
      if (w === 1) return sfx("land", 0.8);
      sfx("slam", w === 3 ? 1 : 0.7);
      thump(w === 3 ? 1 : 0.5);
      if (w === 3 && !still && arena.current) shake(arena.current, { x: [0, -7, 6, -4, 3, 0], y: [0, 3, -2, 1, 0, 0] }, { duration: 0.35 });
    }, FALL_MS[w]);
  };

  const pickHand = (c: GCard) => {
    if (m.busy || result) return;
    setMode(null);
    setSel((s) => (s === c ? null : c));
    setLook(null);
  };
  const pickBoard = (c: GCard) => {
    if (aim) {
      if (targets.includes(c) && m.buy(aim, c)) { sfx("target"); setShopHidden(false); }
      setAim(null);
      bump();
      return;
    }
    if (mode && targets.includes(c)) return hitCard(c);
    if (mode) setMode(null);
    if (c.staged && c.side === "p" && !m.busy) {
      // carta com escolha: clicar de novo reabre a mira; sem escolha, volta para a mão
      const spec = m.choiceOf(c);
      if (spec?.card && m.choiceCards(c).length) return setMode({ k: "card", c });
      if (spec?.loc) return setMode({ k: "loc", c });
      m.unstage(c); bump(); return;
    }
    setLook((x) => (x === c ? null : c));
  };
  /** Item da loja: escolher abre a mira; escolher o já comprado desfaz a compra. */
  const pickItem = (k: ItemKey) => {
    if (m.buying.p?.k === k) { m.unbuy(); bump(); return; }
    if (!m.canBuy(k)) return;
    setMode(null);
    setAim(k);
    setShopHidden(true);
  };
  const playCard = (c: GCard, l: Loc) => {
    if (m.busy || result) return;
    const err = m.play(c, l);
    if (err) { sfx("error"); return say(errText[err]); }
    sfx("place");
    const spec = m.choiceOf(c);
    if (spec?.card && m.choiceCards(c).length) setMode({ k: "card", c });
    else if (spec?.loc) setMode({ k: "loc", c });
    else setMode(null);
    setSel(null);
    setLook(null);
    bump();
  };
  const playAt = (l: Loc) => { if (sel) playCard(sel, l); };

  const targets = aim ? m.itemTargets("p", aim) : !mode ? [] : mode.k === "card" ? m.choiceCards(mode.c) : mode.k === "mark" ? m.markOptions(mode.c) : [];
  const dests = !mode ? [] : mode.k === "loc" ? m.choiceLocs(mode.c) : mode.k === "move" ? m.moveOptions(mode.c) : [];
  const hitCard = (x: GCard) => {
    if (!mode) return;
    sfx("target");
    if (mode.k === "mark") { m.mark(mode.c, x); setMode(null); }
    else {
      m.choose(mode.c, { card: x });
      setMode(m.choiceOf(mode.c)?.loc ? { k: "loc", c: mode.c } : null);
    }
    bump();
  };
  const hitLoc = (l: Loc) => {
    if (!mode) return;
    if (mode.k === "move") { if (!m.moveCard(mode.c, l)) return; setLook(null); sfx("place"); }
    else { m.choose(mode.c, { loc: l }); sfx("target"); }
    setMode(null);
    bump();
  };
  const undoPlay = () => { if (mode && mode.c.staged) m.unstage(mode.c); setMode(null); bump(); };
  const startMode = (k: "move" | "mark", c: GCard) => setMode({ k, c });
  const modeHint = !mode ? "" : mode.k === "card" ? t.ui.act.pickFoe(name(mode.c)) : mode.k === "loc" ? t.ui.act.pickLoc(name(mode.c))
    : mode.k === "move" ? t.ui.act.moveHint(name(mode.c)) : t.ui.act.markHint(name(mode.c));

  // linhas das escolhas já feitas no turno (alvo do Vindicta, local da Holliday, marca do Shiv...)
  const aimLines = m.loc.flatMap((l) => l.s.p).flatMap((c) => {
    const from = `[data-card="${c.id}"]`;
    const out: { from: string; to: string }[] = [];
    if (c.staged && c.ch?.card !== undefined) out.push({ from, to: `[data-card="${c.ch.card}"]` });
    if (c.staged && c.ch?.loc !== undefined) out.push({ from, to: `[data-drop="${c.ch.loc}"]` });
    if (c.st.exec?.u === m.t && c.st.exec.target !== undefined) out.push({ from, to: `[data-card="${c.st.exec.target}"]` });
    return out;
  }).concat(m.buying.p ? [{ from: '[data-item-slot="p"]', to: `[data-card="${m.buying.p.target}"]` }] : []);
  /** Nome do alvo de um item comprado (para a caixa do item). */
  const boughtOn = (b: Bought) => {
    const c = m.loc.flatMap((l) => [...l.s.p, ...l.s.a]).find((x) => x.id === b.target);
    return c ? name(c) : logName(b.name);
  };
  const handReady = !m.busy && !result && !m.hand.some((c) => m.loc.some((l) => !m.canPlay(c, l)));
  /** Mover e marcar: botões sobre a carta da mesa escolhida. */
  const actsOf = (c: GCard) => {
    if (look !== c || c.side !== "p" || m.busy || result) return [];
    return [
      m.moveOptions(c).length > 0 && { label: t.ui.act.move, run: () => startMode("move", c) },
      m.markOptions(c).length > 0 && { label: t.ui.act.mark, run: () => startMode("mark", c) },
    ].filter(Boolean) as { label: string; run: () => void }[];
  };
  const canPlayAt = (l: Loc) => !!sel && !m.busy && !result && sel.cost <= m.E && m.room(l, "p") && l.lock.p < m.t;

  return (
    <MotionConfig reducedMotion="user">
    <div className={full ? "game-full fixed inset-0 z-50 overflow-hidden bg-dl-black/90 px-3 pt-1 backdrop-blur-xl sm:px-6" : "contents"}>
    <div className={`mx-auto flex flex-col gap-1.5 text-dl-text ${full ? "h-full max-w-7xl" : "h-[calc(100dvh-5.5rem)] min-h-120 max-w-7xl sm:h-[calc(100dvh-7.5rem)]"}`}>
      <div className="grid w-full grid-cols-[1fr_auto] items-start gap-x-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col items-start gap-1 pt-1">
          <h1 className="font-display text-sm font-extrabold tracking-[0.11em] uppercase sm:text-xl">{t.ui.title}</h1>
          <abbr title={t.ui.phaseHint} className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-widest uppercase no-underline sm:text-xs ${PHASE_TONE[phaseOf(Math.min(m.t, TURNS))]}`}>
            {t.ui.phase(phaseOf(Math.min(m.t, TURNS)))}
          </abbr>
        </div>
        <div className="order-last col-span-2 flex items-start justify-center gap-2 sm:order-0 sm:col-span-1">
          <ItemSlot s="a" m={m} t={t} icons={icons} on={boughtOn} />
          <AiHand n={m.ahand.length} t={t} />
        </div>
        <div className="flex items-start justify-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-x-2 text-xs text-zinc-300">
          <abbr title={t.ui.prioHint} className={`no-underline ${m.prio === "p" ? "text-game-me" : "text-game-ai"}`}>{t.ui.prio(m.prio === "p")}</abbr>
          <span aria-hidden="true">·</span>
          <span>{t.ui.record(record.w, record.l)}</span>
          <span className="flex">
            <AudioMenu t={t.ui.audio} />
            <button type="button" onClick={toggleFull} aria-label={t.ui.fullscreen(full)} aria-pressed={full} title={t.ui.fullscreen(full)}
              className={`grid size-11 cursor-pointer place-items-center rounded-full text-base transition-colors hover:bg-white/10 active:bg-white/20 sm:size-8 ${focus}`}>
              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
                <path d={full ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
        <DeckPile n={m.adeck.length} tone="ai" label={t.deck.aiLeft(m.adeck.length)} tipSide="left" out={{ x: -80, y: -10 }} className="w-8 sm:w-11" />
        </div>
      </div>

      <div ref={arena} className="relative flex min-h-0 w-full flex-1 flex-col justify-center">
        <section aria-label={t.ui.arena} className="flex w-full gap-1.5 sm:gap-2">
          {m.loc.map((l, i) => (
            <Location key={l.L.id + i} m={m} l={l} i={i} t={t} grid={full} canPlay={canPlayAt(l)} onPlay={() => playAt(l)} dest={dests.includes(l)} onDest={() => hitLoc(l)}
              drop={!drag || m.canPlay(drag.c, l) ? "off" : drag.over === i ? "over" : "ok"}
              card={(c) => (
                <BoardCard key={`${c.id}-${c.rev}`} c={c} m={m} t={t} name={name(c)} face={face(c, false)} looking={look === c} target={targets.includes(c)} acts={actsOf(c)}
                  onClick={(r) => { pickBoard(c); setPeek(r && look !== c ? { c, r } : null); }}
                  onPeek={(r) => setPeek(r && !drag ? { c, r } : null)} />
              )} />
          ))}
        </section>

        <AnimatePresence>
          {shopOpen && m.offer && !shopHidden && (
            <motion.section aria-labelledby="game-shop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}
              className="noir-glass-strong absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 rounded-xl p-3 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h2 id="game-shop" className="font-display text-lg font-extrabold tracking-wider">{t.shop.title}</h2>
                <button type="button" className={pill(false)} onClick={() => setShopHidden(true)}>{t.ui.viewBoard}</button>
              </div>
              <p className="text-xs text-zinc-400">{t.shop.hint}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {m.offer.p.map((k) => (
                  <ItemOption key={k} k={k} m={m} t={t} icon={icons[k]} picked={m.buying.p?.k === k} disabled={m.busy || (m.buying.p?.k !== k && !m.canBuy(k))} onPick={() => pickItem(k)} />
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-6 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs" role="status" aria-live="polite">
        {aim ? (
          <>
            <span className="font-bold text-game-me">{t.shop.aim(aim)}</span>
            <button type="button" className={pill(false)} onClick={() => { setAim(null); setShopHidden(false); }}>{t.ui.act.cancel}</button>
          </>
        ) : mode ? (
          <>
            <span className="font-bold text-game-me">{modeHint}</span>
            <span className="hidden text-zinc-400 sm:inline">{t.ui.aim}</span>
            {(mode.k === "card" || mode.k === "loc") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.auto}</button>}
            {(mode.k === "card" || mode.k === "loc") && mode.c.staged && <button type="button" className={pill(false)} onClick={undoPlay}>{t.ui.act.undo}</button>}
            {(mode.k === "move" || mode.k === "mark") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.cancel}</button>}
          </>
        ) : shopOpen && shopHidden ? (
          <button type="button" className={pill(false)} onClick={() => setShopHidden(false)}>{t.shop.title}</button>
        ) : <span className="line-clamp-1 text-zinc-300">{logLine || t.ui.hint}</span>}
      </div>

      <div className="flex w-full flex-wrap items-end justify-between gap-x-2 sm:flex-nowrap">
        <div className="flex shrink-0 flex-col items-center gap-1 pb-1">
          <ItemSlot s="p" m={m} t={t} icons={icons} on={boughtOn} />
          <SoulOrb n={m.E} label={t.ui.souls(m.E)} />
        </div>
        <section aria-label={t.ui.hand} className="relative z-10 order-last w-full min-w-0 sm:order-0 sm:w-auto sm:flex-1">
          <GameHand cards={m.hand} selected={sel} disabled={m.busy || !!result}
            playable={(c) => !m.busy && !result && m.loc.some((l) => !m.canPlay(c, l))}
            label={(c) => t.ui.cardLabel(name(c), c.cost, c.base)} tips={tipsOf} render={(c, zoomed) => face(c, true, zoomed)}
            onSelect={pickHand} onDrop={(c, i) => playCard(c, m.loc[i])} onDrag={(c, over) => { if (c && !drag) sfx("grab", 0.7); setDrag(c ? { c, over } : null); }} />
        </section>
        <div className="flex shrink-0 items-end gap-2 pb-1">
          <DeckPile n={m.deck.length} look={deckLook} label={t.deck.left(m.deck.length)} tipSide="top" out={{ x: -120, y: 0 }} className="w-10 sm:w-14" />
          {result && !showEnd
            ? <button type="button" className={primaryBtn} onClick={restart}>{t.ui.newMatch}</button>
            : <EndTurnButton label={t.ui.endTurn} turn={m.t} total={TURNS} busy={m.busy} busyLabel={t.ui.revealing} ready={handReady}
                disabled={m.busy || !!result} onClick={endTurn} />}
        </div>
      </div>

      <AnimatePresence>
        {peek && !drag && <Peek key={peek.c.id} r={peek.r} card={face(peek.c, true, true)} tips={tipsOf(peek.c)} />}
      </AnimatePresence>

      <TargetArrow from={aim ? '[data-item-slot="p"]' : mode ? `[data-card="${mode.c.id}"]` : null} lines={result ? [] : aimLines}
        onCancel={() => { setMode(null); if (aim) { setAim(null); setShopHidden(false); } }} />

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="pointer-events-none fixed top-1/4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/85 px-5 py-2 text-center font-display text-xl font-extrabold tracking-wider text-white">
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && showEnd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="game-end">
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 id="game-end" className="font-display text-4xl font-extrabold text-game-brass">{result.outcome === "win" ? t.ui.win : result.outcome === "loss" ? t.ui.loss : t.ui.draw}</h2>
              <p className="text-sm text-zinc-200">{t.ui.summary(result.won, result.lost, result.myPower, result.aiPower)}{result.patron ? ` · ${t.ui.patron}` : ""}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- foco vai para a ação principal do diálogo que acabou de abrir */}
                <button type="button" autoFocus className={primaryBtn} onClick={restart}>{t.ui.again}</button>
                <button type="button" className={pill(false)} onClick={() => setShowEnd(false)}>{t.ui.viewBoard}</button>
                <button type="button" className={pill(false)} onClick={onDeck}>{t.deck.change}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
    </MotionConfig>
  );
}

type T = (typeof GAME_TEXT)["pt"];
type Mode = { k: "card" | "loc" | "move" | "mark"; c: GCard };

function Location({ m, l, i, t, grid, canPlay, onPlay, dest, onDest, drop, card }: {
  grid: boolean; m: Match; l: Loc; i: number; t: T; canPlay: boolean; onPlay: () => void; dest: boolean; onDest: () => void; drop: "off" | "ok" | "over"; card: (c: GCard) => React.ReactNode;
}) {
  const a = m.total(l, "a"), p = m.total(l, "p");
  const nm = l.rev ? l.L.name : t.ui.hiddenLoc;
  const chips = ([
    [l.lock.p >= m.t, "❄️", t.ui.chips.frozenMe],
    [l.lock.a >= m.t, "❄️", t.ui.chips.frozenAi],
    [m.hook.p?.i === i, "🪝", t.ui.chips.hookMe],
    [m.hook.a?.i === i, "🪝", t.ui.chips.hookAi],
    [l.trap.p > 0, "🪤", t.ui.chips.trapMe],
    [l.trap.a > 0, "🪤", t.ui.chips.trapAi],
    [l.shield.p >= m.t, "🧊", t.ui.chips.shieldMe],
    [l.shield.a >= m.t, "🧊", t.ui.chips.shieldAi],
    [!!l.petri.p, "🗿", t.ui.chips.petriMe],
    [!!l.petri.a, "🗿", t.ui.chips.petriAi],
    [m.portals.some((x) => x.t >= m.t && (x.a === i || x.b === i)), "🚪", t.ui.chips.portal],
  ] as [boolean, string, string][]).filter((x) => x[0]);
  const desc = l.rev ? l.L.desc || t.locs[l.L.type].text(l.L) : t.ui.revealsOn(i + 1);
  // uma fileira por lado: até 2 cartas lado a lado; com mais, elas se sobrepõem como um leque (cada vaga encolhe, a última fica inteira)
  const side = grid
    // tela cheia (sm para cima): 2x2 sem sobrepor; no celular continua a fileira
    ? "flex h-[calc(var(--spacing-gc)*1.46)] w-full justify-center gap-1 sm:grid sm:h-[calc(var(--spacing-gc)*2.92+0.25rem)] sm:grid-cols-[repeat(2,var(--spacing-gc))] sm:content-center"
    : "flex h-[calc(var(--spacing-gc)*1.46)] w-full justify-center gap-1";
  const ring = drop === "over" ? "bg-game-me/15 outline-2 outline-game-me" : drop === "ok" ? "outline-2 outline-game-me/50 outline-dashed" : "";
  return (
    <div data-drop={i} aria-label={drop === "over" ? t.ui.dropHere(nm) : undefined}
      className={`noir-glass relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl p-1 transition-colors duration-150 sm:p-1.5 ${ring}`}>
      <div className={side} aria-label={t.ui.aiSide(nm)} role="group">{l.s.a.map(card)}</div>
      <LocTile nm={nm} desc={desc} chips={chips} a={a} p={p} />
      <div className={`relative ${side}`} aria-label={t.ui.yourSide(nm)} role="group">
        {l.s.p.map(card)}
        {canPlay && (
          <button type="button" onClick={onPlay} aria-label={t.ui.playHere(nm)}
            className={`absolute inset-0 cursor-pointer rounded-md outline-2 outline-offset-2 outline-game-me outline-dashed hover:bg-game-me/10 active:bg-game-me/20 ${focus}`} />
        )}
      </div>
      {dest && (
        <button type="button" onClick={onDest} aria-label={t.ui.act.dest(nm)} data-target=""
          className={`absolute inset-0 z-10 cursor-pointer rounded-xl outline-2 -outline-offset-2 outline-game-me outline-dashed hover:bg-game-me/15 active:bg-game-me/25 ${focus}`} />
      )}
    </div>
  );
}

type StatusKey = keyof T["ui"]["status"];

function statusIcons(c: GCard, m: Match, t: T): [string, string, StatusKey][] {
  const s = c.st, now = (u?: number) => (u ?? 0) >= m.t;
  const list: [boolean, string, StatusKey][] = [
    [!!s.burn || !!s.tburn?.some((x) => x.u >= m.t), "🔥", "burn"], [now(s.stun), "💫", "stun"], [m.immune(c), "🛡️", "immune"],
    [!!s.chained, "⛓️", "chained"], [!!s.burrow && !m.final, "⛏️", "burrow"], [now(s.sleep), "💤", "sleep"],
    [(s.rip ?? 0) > 0, "⚔️", "riposte"], [!!s.wolf, "🐺", "wolf"], [now(s.vuln), "🎯", "vuln"],
    [!!s.petri, "🗿", "petri"], [!!s.unstop, "⚡", "unstop"], [now(s.chan?.u), "🌩️", "chan"],
    [now(s.root), "📌", "root"], [s.exec?.u === m.t, "🗡️", "exec"],
  ];
  return list.filter((x) => x[0]).map((x) => [x[1], t.ui.status[x[2]], x[2]]);
}

/** Vaga da carta na fileira do local: encolhe quando não cabe (a carta transborda e fica por baixo da seguinte). */
const slot = "min-w-0 max-w-gc flex-1 last:w-gc last:flex-none hover:z-10 focus-within:z-10";

function BoardCard({ c, m, t, name, face, looking, target, acts, onClick, onPeek }: {
  c: GCard; m: Match; t: T; name: string; face: React.ReactNode; looking: boolean; target: boolean; acts: { label: string; run: () => void }[];
  /** Clique; no toque vem o retângulo da carta para ampliar (no mouse, o hover já amplia). */
  onClick: (r: DOMRect | null) => void; onPeek: (r: DOMRect | null) => void;
}) {
  const touch = useRef(false);
  if (c.side === "a" && !c.rev) return <div role="img" aria-label={t.ui.facedown} className={slot}><CardBack className="w-gc" /></div>;
  const pw = c.rev ? m.pow(c) : c.base;
  const icons = statusIcons(c, m, t);
  const w = weight(c);
  return (
    <div className={`relative perspective-[40rem] ${slot}`} data-card={c.id} data-target={target ? "" : undefined}>
    <motion.button type="button" onClick={(e) => onClick(touch.current ? e.currentTarget.getBoundingClientRect() : null)} aria-pressed={looking}
      onPointerDown={(e) => { touch.current = e.pointerType !== "mouse"; }}
      aria-label={`${target ? `${t.ui.act.target(name)}: ` : ""}${t.ui.cardLabel(name, c.cost, pw)}${icons.length ? ` (${icons.map((x) => x[1]).join(", ")})` : ""}`}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onPeek(e.currentTarget.getBoundingClientRect()); }} onPointerLeave={() => onPeek(null)} onBlur={() => onPeek(null)}
      initial={c.rev ? { ...FALL[w], opacity: 0, rotateY: c.side === "a" ? 100 : 0 } : { y: 24, scale: 1.08, opacity: 0 }}
      animate={{ scale: 1, y: 0, rotate: 0, rotateY: 0, opacity: 1 }}
      transition={c.rev ? { duration: FALL_MS[w] / 1000, ease: "easeIn", opacity: { duration: 0.1 } } : { type: "spring", stiffness: 420, damping: 26 }}
      className={`relative block w-gc cursor-pointer rounded-lg ${c.staged ? "opacity-60" : ""} ${looking ? "outline-2 outline-offset-2 outline-dl-text" : ""} ${target ? "outline-2 outline-offset-2 outline-game-me" : ""} ${focus}`}>
      {face}
    </motion.button>
    {c.rev && <Impact w={w} />}
    {acts.length > 0 && (
      <div className="absolute inset-x-0 bottom-1 z-20 flex flex-col items-center gap-1">
        {acts.map((x) => (
          <button key={x.label} type="button" onClick={x.run}
            className={`min-h-7 cursor-pointer rounded-full bg-game-me px-2 text-[10px] font-extrabold tracking-wider text-dl-black uppercase shadow-lg transition hover:brightness-110 active:scale-95 ${focus}`}>
            {x.label}
          </button>
        ))}
      </div>
    )}
    </div>
  );
}

/** De onde a carta cai, por peso. */
const FALL = {
  1: { y: -26, scale: 1.15, rotate: 0 },
  2: { y: -90, scale: 1.4, rotate: 3 },
  3: { y: -220, scale: 1.8, rotate: -6 },
} as const;

/** Poeira (e sombra que cresce antes do impacto) quando a carta toca a mesa; anel de choque nas pesadas. */
function Impact({ w }: { w: 1 | 2 | 3 }) {
  const fall = FALL_MS[w] / 1000;
  const dust = w === 1 ? 4 : w === 2 ? 6 : 10;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {w > 1 && (
        <motion.span className="absolute inset-x-[5%] -bottom-1 h-3 rounded-full bg-black/70 blur-sm"
          initial={{ scaleX: 0.3, opacity: 0 }} animate={{ scaleX: [0.3, 1, 1.1], opacity: [0, 0.8, 0] }} transition={{ duration: fall + 0.3, times: [0, 0.55, 1] }} />
      )}
      {Array.from({ length: dust }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const k = (i >> 1) / Math.max(1, dust / 2 - 1);
        return (
          <motion.span key={i} className="absolute bottom-0 left-1/2 size-2.5 rounded-full bg-stone-300/60 blur-[2px]"
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{ x: side * (14 + k * 26 * w), y: -(4 + k * 10 + w * 3), scale: 1.2 + w * 0.5, opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.5 + w * 0.08, delay: fall, ease: "easeOut" }} />
        );
      })}
      {w === 3 && (
        <motion.span className="absolute inset-0 rounded-xl ring-4 ring-game-brass/80"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1, 1.6] }} transition={{ duration: 0.45, delay: fall, ease: "easeOut" }} />
      )}
      {w < 3 && (
        <motion.span className="absolute inset-0 rounded-xl ring-2 ring-dl-text/70"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1, 1.3] }} transition={{ duration: 0.4, delay: fall, ease: "easeOut" }} />
      )}
    </span>
  );
}

const PEEK_W = 208;
const TIP_W = 192;

/** Carta da mesa ampliada ao lado dela, com as caixas do selo de momento e de status. */
function Peek({ r, card, tips }: { r: DOMRect; card: React.ReactNode; tips: { title: string; text: string }[] }) {
  const h = (PEEK_W * 430) / 295;
  const extra = tips.length ? TIP_W + 8 : 0;
  const right = r.right + 12 + PEEK_W + extra <= window.innerWidth;
  const left = Math.max(8, right ? r.right + 12 : r.left - 12 - PEEK_W - extra);
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2));
  return (
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
      className={`pointer-events-none fixed z-60 flex items-start gap-2 ${right ? "" : "flex-row-reverse"}`} style={{ left, top }} aria-hidden="true">
      <div style={{ width: PEEK_W }}>{card}</div>
      <TipBoxes tips={tips} />
    </motion.div>
  );
}

/** Mão da IA: versos de carta em leque no topo. */
/** Mão da IA: versos em leque afundados na borda de cima (menores que a sua mão, mas à vista). */
function AiHand({ n, t }: { n: number; t: T }) {
  const mid = (n - 1) / 2;
  return (
    <div role="img" aria-label={t.ui.aiHand(n)} className="relative h-12 w-32 [clip-path:inset(0_-100vw_-100vh_-100vw)] sm:h-16 sm:w-56">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="absolute top-0 left-1/2 w-9 origin-bottom sm:w-13"
          style={{ transform: `translate(-50%, -38%) translateX(${(i - mid) * 62}%) rotate(${(mid - i) * 6}deg) translateY(${-Math.abs(i - mid) * 4}%)` }}>
          <CardBack />
        </div>
      ))}
    </div>
  );
}

function ItemIconBox({ k, icon, size }: { k: ItemKey; icon?: string; size: string }) {
  const slot = ITEMS[k].slot;
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-950/80 ring-2 ${SLOT_RING[slot]}`}>
      {icon ? <img src={icon} alt="" className="size-full object-contain p-0.5" /> : <span className={`font-display text-xs font-extrabold ${SLOT_TEXT[slot]}`} aria-hidden="true">T{ITEMS[k].tier}</span>}
    </span>
  );
}

function ItemOption({ k, m, t, icon, picked, disabled, onPick }: { k: ItemKey; m: Match; t: T; icon?: string; picked: boolean; disabled: boolean; onPick: () => void }) {
  const it = ITEMS[k];
  const fit = m.itemFit("p", k);
  return (
    <button type="button" onClick={onPick} disabled={disabled} aria-pressed={picked} aria-label={`${t.shop.label(k, it.tier)}: ${t.items[k](m.itemV(k))}`}
      className={`flex flex-1 cursor-pointer items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-zinc-800/60 active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${picked ? "bg-dl-text/10 outline-2 outline-game-brass" : "bg-zinc-950/50"} ${focus}`}>
      <ItemIconBox k={k} icon={icon} size="size-12" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-display tracking-wide">{k}</b>
          <span className={`text-[11px] font-bold tracking-wider uppercase ${SLOT_TEXT[it.slot]}`}>{t.slots[it.slot]} · {t.shop.tier(it.tier)}</span>
        </span>
        <span className="text-xs text-zinc-200">{t.items[k](m.itemV(k))}</span>
        <span className="text-[11px] text-game-brass">{t.shop.price(m.itemPrice("p", k))}{!picked && !m.canBuy(k) && ` · ${m.itemTargets("p", k).length ? t.shop.noSouls : t.shop.noTarget}`}</span>
        {(fit.cards > 0 || fit.loc) && (
          <span className="flex flex-wrap gap-1">
            {fit.cards > 0 && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me">{t.shop.fitCards(fit.cards)}</span>}
            {fit.loc && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me">{t.shop.fitLoc(fit.loc)}</span>}
          </span>
        )}
        {picked && <span className="text-[11px] font-bold tracking-wider text-game-brass uppercase">{t.shop.picked} · {t.shop.undo}</span>}
      </span>
    </button>
  );
}

/** Itens comprados (seus ou da IA): ícones pequenos, com o texto e o alvo numa caixa no hover/foco/toque. A compra da IA só aparece no fim do turno. */
function ItemSlot({ s, m, t, icons, on }: { s: Side; m: Match; t: T; icons: Record<string, string>; on: (b: Bought) => string }) {
  const [open, setOpen] = useState(false);
  const list = [...m.owned[s], ...(s === "p" && m.buying.p ? [m.buying.p] : [])];
  const who = s === "p" ? t.shop.mine : t.shop.ai;
  if (!list.length) {
    return (
      <span data-item-slot={s} title={`${who}: ${t.shop.hidden}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-950/70 font-display text-sm text-zinc-500">?</span>
    );
  }
  const size = list.length > 1 ? "size-7" : "size-9";
  return (
    <span className="relative shrink-0" data-item-slot={s}>
      <button type="button" onClick={() => setOpen((x) => !x)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }} onBlur={() => setOpen(false)}
        aria-expanded={open} aria-label={`${who}: ${list.map((b) => b.k).join(", ")}`}
        className={`flex cursor-pointer gap-0.5 rounded-md transition hover:brightness-125 active:scale-95 ${focus}`}>
        {list.map((b, i) => (
          <span key={`${b.k}-${b.t}-${i}`} className={b === m.buying.p ? "animate-pulse" : ""}><ItemIconBox k={b.k} icon={icons[b.k]} size={size} /></span>
        ))}
      </button>
      {open && (
        <TipBoxes className={`absolute z-70 ${s === "a" ? "top-full left-0 pt-1" : "bottom-full left-0 pb-1"}`}
          tips={list.map((b) => ({ title: `${b.k} · ${t.slots[ITEMS[b.k].slot]} ${t.shop.tier(ITEMS[b.k].tier)}`, text: `${t.items[b.k](m.itemV(b.k))} (${t.shop.on(on(b))})` }))} />
      )}
    </span>
  );
}

/** Placa do local entre os dois lados: placar da IA, nome e placar seu; o efeito embaixo (toque para ler inteiro). */
function LocTile({ nm, desc, chips, a, p }: { nm: string; desc: string; chips: [boolean, string, string][]; a: number; p: number }) {
  const [full, setFull] = useState(false);
  return (
    <div className="flex w-full flex-col items-center gap-0.5 rounded-lg bg-zinc-950/70 p-1 text-center leading-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
      <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:flex-nowrap">
        <Score v={a} lead={a > p} tone="text-game-ai" />
        <strong className="order-first line-clamp-2 w-full min-w-0 font-display text-[11px] tracking-wide sm:order-0 sm:w-auto sm:flex-1 sm:text-sm">{nm}</strong>
        <Score v={p} lead={p > a} tone="text-game-me" />
      </div>
      <button type="button" onClick={() => setFull((x) => !x)} aria-expanded={full} title={desc}
        className={`w-full cursor-pointer rounded-sm text-[10px] text-zinc-400 hover:text-zinc-200 sm:text-[11px] ${full ? "" : "line-clamp-2"} ${focus}`}>
        {desc}
      </button>
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 text-xs">
          {chips.map(([, icon, label]) => <span key={label} role="img" title={label} aria-label={label}>{icon}</span>)}
        </div>
      )}
    </div>
  );
}

function Score({ v, lead, tone }: { v: number; lead: boolean; tone: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.em key={v} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}
        className={`min-w-6 shrink-0 rounded-md px-1 font-display text-base font-extrabold not-italic sm:text-lg ${tone} ${lead ? "bg-dl-text/15" : ""}`}>
        {v}
      </motion.em>
    </AnimatePresence>
  );
}
