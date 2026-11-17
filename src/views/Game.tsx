import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CardBack, GameCard, TipBoxes } from "../components/GameCard";
import { GameHand } from "../components/GameHand";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { pageTitle, pill, primaryBtn } from "../lib/ui";
import { ABILITIES, ITEMS, ITEM_OFFER_TURN, ITEM_REVEAL_TURN, gameConfig, type ItemKey, type ItemSlot, type StatKey } from "../lib/game/config";
import { MIN_POOL, Match, TURNS, cardPool, type GCard, type Loc, type LogEntry, type PlayError, type Result, type Side, type Token } from "../lib/game/engine";
import { GAME_TEXT } from "../lib/game/text";
import { useItemIcons } from "../lib/game/useItemIcons";

const REVEAL_MS = 650;
const END_MS = 750;
const TOAST_MS = 1300;
const TOKEN_GLYPH: Record<Token, string> = { pigeon: "🐦", ghoul: "💀", turret: "⚙️", rat: "🐀", illusion: "👤" };

// placar da sessão: sobrevive à troca de aba, zera ao recarregar a página
const record = { w: 0, l: 0 };
let toastSeq = 0;

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
// cor de cada categoria de item, como na loja do Deadlock
const SLOT_RING: Record<ItemSlot, string> = { weapon: "ring-item-weapon", vitality: "ring-item-vitality", spirit: "ring-item-spirit" };
const SLOT_TEXT: Record<ItemSlot, string> = { weapon: "text-item-weapon", vitality: "text-item-vitality", spirit: "text-item-spirit" };

export function Game() {
  const { players, settings } = useData();
  const t = useT(GAME_TEXT);
  const cfg = useMemo(() => gameConfig(settings.game), [settings.game]);
  const pool = useMemo(() => cardPool(players), [players]);
  if (pool.length < MIN_POOL) return <p className="text-sm text-zinc-300">{t.ui.needCards(MIN_POOL)}</p>;
  return <Board key={JSON.stringify(cfg)} newMatch={() => new Match(cfg, pool)} />;
}

function Board({ newMatch }: { newMatch: () => Match }) {
  const t = useT(GAME_TEXT);
  const { players } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [m, setM] = useState(newMatch);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const icons = useItemIcons();
  const [sel, setSel] = useState<GCard | null>(null);
  const [look, setLook] = useState<GCard | null>(null);
  const [lookItem, setLookItem] = useState<ItemKey | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(() => ({ id: 0, text: t.ui.toast.turn(1) }));
  const [result, setResult] = useState<Result | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  // escolha de alvo ao jogar, movimento ou marca do Shiv em andamento
  const [mode, setMode] = useState<Mode | null>(null);
  // carta sendo arrastada da mão e o local sob o cursor
  const [drag, setDrag] = useState<{ c: GCard; over: number | null } | null>(null);
  // carta da mesa ampliada no hover
  const [peek, setPeek] = useState<{ c: GCard; r: DOMRect } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  const shopOpen = m.t === ITEM_OFFER_TURN && !!m.offer && !result;
  const errText: Record<PlayError, string> = { souls: t.ui.toast.souls, frozen: t.ui.toast.frozen, full: t.ui.toast.full };

  /** Carta desenhada a partir da carta da coleção; `text` mostra a habilidade (mão e zoom), `fx` liga partículas e brilho. */
  const face = (c: GCard, text: boolean, fx = false) => {
    const key = m.abilityOf(c);
    const a = t.abilities[key];
    const body = key === "none" && c.ab !== "none" ? t.ui.noAbility : c.tok && c.ab === "none" ? t.ui.tokenDesc : c.desc || a.text(c.v);
    const ms = t.abilities[c.ab].master();
    const icons = c.rev ? statusIcons(c, m, t) : [];
    return (
      <GameCard player={c.p.token || !c.p.id ? null : byId.get(c.p.id) ?? null} name={name(c)} cost={c.cost} power={c.rev ? m.pow(c) : c.base} base={c.base}
        glyph={c.p.token ? TOKEN_GLYPH[c.p.token] : undefined} master={c.lvl === 2 ? t.levels[2] : undefined} fx={fx}
        status={icons.map((x) => x[0]).join("") || undefined}
        text={text ? { name: a.name, kind: t.kinds[ABILITIES[key].kind], body, master: c.lvl === 2 && key === c.ab && ms ? ms : undefined, masterLabel: t.ui.masterLine } : null} />
    );
  };
  /** Caixas ao lado da carta ampliada: palavras-chave e status. */
  const tipsOf = (c: GCard) => [
    ...c.kw.map((k) => ({ title: t.keywords[k].name, text: t.keywords[k].text })),
    ...(c.rev ? statusIcons(c, m, t).map(([icon, nm, k]) => ({ title: `${icon} ${nm}`, text: t.ui.statusTip[k] })) : []),
  ];

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setM(newMatch());
    setSel(null);
    setLook(null);
    setLookItem(null);
    setResult(null);
    setShowEnd(false);
    setMode(null);
    say(t.ui.toast.turn(1));
  };

  const endTurn = () => {
    if (m.busy || result) return;
    if (m.needsPick) return say(t.shop.pickFirst);
    const queue = m.endTurn();
    setSel(null);
    setMode(null);
    setLook(null);
    setLookItem(null);
    bump();
    let i = 0;
    const step = () => {
      if (i < queue.length) {
        m.act(queue[i++]);
        bump();
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
        } else {
          m.nextTurn();
          say(t.ui.toast.turn(m.t));
        }
        bump();
      }, END_MS);
    };
    step();
  };

  const pickHand = (c: GCard) => {
    if (m.busy || result) return;
    setMode(null);
    setSel((s) => (s === c ? null : c));
    setLook(null);
    setLookItem(null);
  };
  const pickBoard = (c: GCard) => {
    if (mode && targets.includes(c)) return hitCard(c);
    if (mode) setMode(null);
    if (c.staged && c.side === "p" && !m.busy) { m.unstage(c); bump(); return; }
    setLook((x) => (x === c ? null : c));
    setLookItem(null);
  };
  const pickItem = (k: ItemKey) => { m.pick(k); bump(); };
  const showItem = (k: ItemKey) => { setLookItem((x) => (x === k ? null : k)); setSel(null); setLook(null); };
  const playCard = (c: GCard, l: Loc) => {
    if (m.busy || result) return;
    const err = m.play(c, l);
    if (err) return say(errText[err]);
    const spec = m.choiceOf(c);
    if (spec?.card && m.choiceCards(c).length) setMode({ k: "card", c });
    else if (spec?.loc) setMode({ k: "loc", c });
    else setMode(null);
    setSel(null);
    setLook(null);
    bump();
  };
  const playAt = (l: Loc) => { if (sel) playCard(sel, l); };

  const targets = !mode ? [] : mode.k === "card" ? m.choiceCards(mode.c) : mode.k === "mark" ? m.markOptions(mode.c) : [];
  const dests = !mode ? [] : mode.k === "loc" ? m.choiceLocs(mode.c) : mode.k === "move" ? m.moveOptions(mode.c) : [];
  const hitCard = (x: GCard) => {
    if (!mode) return;
    if (mode.k === "mark") { m.mark(mode.c, x); setMode(null); }
    else {
      m.choose(mode.c, { card: x });
      setMode(m.choiceOf(mode.c)?.loc ? { k: "loc", c: mode.c } : null);
    }
    bump();
  };
  const hitLoc = (l: Loc) => {
    if (!mode) return;
    if (mode.k === "move") { if (!m.moveCard(mode.c, l)) return; setLook(null); }
    else m.choose(mode.c, { loc: l });
    setMode(null);
    bump();
  };
  const undoPlay = () => { if (mode && mode.c.staged) m.unstage(mode.c); setMode(null); bump(); };
  const startMode = (k: "move" | "mark", c: GCard) => setMode({ k, c });
  const modeHint = !mode ? "" : mode.k === "card" ? t.ui.act.pickFoe(name(mode.c)) : mode.k === "loc" ? t.ui.act.pickLoc(name(mode.c))
    : mode.k === "move" ? t.ui.act.moveHint(name(mode.c)) : t.ui.act.markHint(name(mode.c));

  const focused = sel ?? look;
  const canPlayAt = (l: Loc) => !!sel && !m.busy && !result && sel.cost <= m.E && m.room(l, "p") && l.lock.p < m.t;

  return (
    <MotionConfig reducedMotion="user">
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-dl-text">
      <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className={pageTitle}>{t.ui.title}</h1>
        <p className="text-sm text-zinc-300">{t.ui.you} · {t.ui.ai} · {t.ui.turn(Math.min(m.t, TURNS), TURNS)} · <abbr title={t.ui.prioHint} className={`no-underline ${m.prio === "p" ? "text-game-me" : "text-game-ai"}`}>{t.ui.prio(m.prio === "p")}</abbr> · {t.ui.record(record.w, record.l)}</p>
      </div>

      <AiHand n={m.ahand.length} t={t} />

      <section aria-label={t.ui.arena} className="flex w-full gap-1.5 sm:gap-2">
        {m.loc.map((l, i) => (
          <Location key={l.L.id + i} m={m} l={l} i={i} t={t} canPlay={canPlayAt(l)} onPlay={() => playAt(l)} dest={dests.includes(l)} onDest={() => hitLoc(l)}
            drop={!drag || m.canPlay(drag.c, l) ? "off" : drag.over === i ? "over" : "ok"}
            card={(c) => (
              <BoardCard key={`${c.id}-${c.rev}`} c={c} m={m} t={t} name={name(c)} face={face(c, false)} looking={look === c} target={targets.includes(c)} onClick={() => pickBoard(c)}
                onPeek={(r) => setPeek(r && !drag ? { c, r } : null)} />
            )} />
        ))}
      </section>

      {mode ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-2 rounded-xl bg-game-me/10 px-3 py-2 text-sm" role="status">
          <span className="font-bold text-game-me">{modeHint}</span>
          {(mode.k === "card" || mode.k === "loc") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.auto}</button>}
          {(mode.k === "card" || mode.k === "loc") && mode.c.staged && <button type="button" className={pill(false)} onClick={undoPlay}>{t.ui.act.undo}</button>}
          {(mode.k === "move" || mode.k === "mark") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.cancel}</button>}
        </div>
      ) : <p className="min-h-5 w-full text-center text-xs text-zinc-300" aria-live="polite">{logLine}</p>}

      {m.offer && <ItemSlots m={m} t={t} icons={icons} looking={lookItem} onLook={showItem} />}

      {shopOpen && m.offer && (
        <section aria-labelledby="game-shop" className="noir-glass flex w-full flex-col gap-2 rounded-xl p-3">
          <h2 id="game-shop" className="font-display text-lg font-extrabold tracking-wider">{t.shop.title}</h2>
          <p className="text-xs text-zinc-400">{t.shop.hint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {m.offer.p.map((k) => (
              <ItemOption key={k} k={k} m={m} t={t} icon={icons[k]} picked={m.picked.p === k} disabled={m.busy || !m.canBuy(k)} onPick={() => pickItem(k)} />
            ))}
          </div>
        </section>
      )}

      <section aria-label={t.ui.hand} className="w-full">
        <GameHand cards={m.hand} selected={sel} disabled={m.busy || !!result}
          playable={(c) => !m.busy && !result && m.loc.some((l) => !m.canPlay(c, l))}
          label={(c) => t.ui.cardLabel(name(c), c.cost, c.base)} tips={tipsOf} render={(c, zoomed) => face(c, true, zoomed)}
          onSelect={pickHand} onDrop={(c, i) => playCard(c, m.loc[i])} onDrag={(c, over) => setDrag(c ? { c, over } : null)} />
      </section>

      <div className="noir-glass min-h-12 w-full rounded-xl px-3 py-2 text-sm/snug">
        {lookItem ? <ItemDetail k={lookItem} m={m} t={t} />
          : focused ? <Detail c={focused} m={m} t={t} name={name(focused)} onAct={result ? undefined : startMode} />
          : <span className="text-zinc-400">{t.ui.hint}</span>}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <span className="font-display text-xl font-extrabold tracking-widest">{t.ui.souls(m.E)}</span>
          {result && !showEnd
            ? <button type="button" className={primaryBtn} onClick={restart}>{t.ui.newMatch}</button>
            : <button type="button" className={primaryBtn} onClick={endTurn} disabled={m.busy || !!result || m.needsPick} aria-describedby={m.needsPick ? "game-pick-first" : undefined}>{t.ui.endTurn}</button>}
        </div>
        {m.needsPick && <p id="game-pick-first" className="text-xs text-game-brass">{t.shop.pickFirst}</p>}
      </div>

      <AnimatePresence>
        {peek && !drag && <Peek key={peek.c.id} r={peek.r} card={face(peek.c, true, true)} tips={tipsOf(peek.c)} />}
      </AnimatePresence>

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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

type T = (typeof GAME_TEXT)["pt"];
type Mode = { k: "card" | "loc" | "move" | "mark"; c: GCard };

function Location({ m, l, i, t, canPlay, onPlay, dest, onDest, drop, card }: {
  m: Match; l: Loc; i: number; t: T; canPlay: boolean; onPlay: () => void; dest: boolean; onDest: () => void; drop: "off" | "ok" | "over"; card: (c: GCard) => React.ReactNode;
}) {
  const a = m.total(l, "a"), p = m.total(l, "p");
  const nm = l.rev ? l.L.name : t.ui.hiddenLoc;
  const chips = [
    l.lock.p >= m.t && `❄️ ${t.ui.chips.frozenMe}`,
    l.lock.a >= m.t && `❄️ ${t.ui.chips.frozenAi}`,
    m.hook.p?.i === i && `🪝 ${t.ui.chips.hookMe}`,
    m.hook.a?.i === i && `🪝 ${t.ui.chips.hookAi}`,
    l.trap.p > 0 && `🪤 ${t.ui.chips.trapMe}`,
    l.trap.a > 0 && `🪤 ${t.ui.chips.trapAi}`,
    l.shield.p >= m.t && `🧊 ${t.ui.chips.shieldMe}`,
    l.shield.a >= m.t && `🧊 ${t.ui.chips.shieldAi}`,
    !!l.petri.p && `🗿 ${t.ui.chips.petriMe}`,
    !!l.petri.a && `🗿 ${t.ui.chips.petriAi}`,
    m.portals.some((x) => x.t >= m.t && (x.a === i || x.b === i)) && `🚪 ${t.ui.chips.portal}`,
  ].filter(Boolean) as string[];
  const side = "grid min-h-[calc(var(--spacing-gc)*2.95)] auto-rows-min grid-cols-[repeat(2,var(--spacing-gc))] gap-1";
  const ring = drop === "over" ? "bg-game-me/15 outline-2 outline-game-me" : drop === "ok" ? "outline-2 outline-game-me/50 outline-dashed" : "";
  return (
    <div data-drop={i} aria-label={drop === "over" ? t.ui.dropHere(nm) : undefined}
      className={`noir-glass relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl p-1 transition-colors duration-150 sm:p-1.5 ${ring}`}>
      <div className={side} aria-label={t.ui.aiSide(nm)} role="group">{l.s.a.map(card)}</div>
      <div className="flex min-h-19 w-full flex-col items-center gap-0.5 text-center leading-tight">
        <strong className="font-display text-xs tracking-wide sm:text-sm">{nm}</strong>
        <span className="text-[11px] text-zinc-400">{l.rev ? l.L.desc || t.locs[l.L.type].text(l.L) : t.ui.revealsOn(i + 1)}</span>
        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {chips.map((c) => <span key={c} className="rounded-full bg-dl-text/10 px-1.5 text-[10px]">{c}</span>)}
          </div>
        )}
        <div className="mt-auto flex w-full justify-between font-display text-lg font-extrabold">
          <em className={`rounded-md px-1.5 text-game-ai not-italic ${a > p ? "bg-dl-text/15" : ""}`}>{a}</em>
          <em className={`rounded-md px-1.5 text-game-me not-italic ${p > a ? "bg-dl-text/15" : ""}`}>{p}</em>
        </div>
      </div>
      <div className={`relative ${side}`} aria-label={t.ui.yourSide(nm)} role="group">
        {l.s.p.map(card)}
        {canPlay && (
          <button type="button" onClick={onPlay} aria-label={t.ui.playHere(nm)}
            className={`absolute inset-0 cursor-pointer rounded-md outline-2 outline-offset-2 outline-game-me outline-dashed hover:bg-game-me/10 active:bg-game-me/20 ${focus}`} />
        )}
      </div>
      {dest && (
        <button type="button" onClick={onDest} aria-label={t.ui.act.dest(nm)}
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

function BoardCard({ c, m, t, name, face, looking, target, onClick, onPeek }: {
  c: GCard; m: Match; t: T; name: string; face: React.ReactNode; looking: boolean; target: boolean; onClick: () => void; onPeek: (r: DOMRect | null) => void;
}) {
  if (c.side === "a" && !c.rev) return <div role="img" aria-label={t.ui.facedown}><CardBack className="w-gc" /></div>;
  const pw = c.rev ? m.pow(c) : c.base;
  const icons = statusIcons(c, m, t);
  return (
    <motion.button type="button" onClick={onClick} aria-pressed={looking}
      aria-label={`${target ? `${t.ui.act.target(name)}: ` : ""}${t.ui.cardLabel(name, c.cost, pw)}${icons.length ? ` (${icons.map((x) => x[1]).join(", ")})` : ""}`}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onPeek(e.currentTarget.getBoundingClientRect()); }} onPointerLeave={() => onPeek(null)} onBlur={() => onPeek(null)}
      initial={c.rev ? { scale: 1.5, y: -18, opacity: 0 } : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={`relative block w-gc cursor-pointer rounded-lg ${c.staged ? "opacity-60" : ""} ${looking ? "outline-2 outline-offset-2 outline-dl-text" : ""} ${target ? "outline-2 outline-offset-2 outline-game-me" : ""} ${focus}`}>
      {face}
      {c.rev && (
        <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-dl-text/70"
          initial={{ opacity: 0.9, scale: 0.9 }} animate={{ opacity: 0, scale: 1.35 }} transition={{ duration: 0.4, delay: 0.12, ease: "easeOut" }} />
      )}
    </motion.button>
  );
}

const PEEK_W = 208;
const TIP_W = 192;

/** Carta da mesa ampliada ao lado dela, com as caixas de palavra-chave e status. */
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
function AiHand({ n, t }: { n: number; t: T }) {
  const mid = (n - 1) / 2;
  return (
    <div role="img" aria-label={t.ui.aiHand(n)} className="relative h-12 w-full">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="absolute top-0 w-8 origin-top" style={{ left: `calc(50% - 1rem + ${(i - mid) * 18}px)`, transform: `rotate(${(mid - i) * 5}deg) translateY(${Math.abs(i - mid) * 2}px)` }}>
          <CardBack />
        </div>
      ))}
    </div>
  );
}

function Detail({ c, m, t, name, onAct }: { c: GCard; m: Match; t: T; name: string; onAct?: (k: "move" | "mark", c: GCard) => void }) {
  const key = m.abilityOf(c);
  const a = t.abilities[key];
  const kind = t.kinds[ABILITIES[key].kind];
  const text = key === "none" && c.ab !== "none" ? t.ui.noAbility : c.tok && c.ab === "none" ? t.ui.tokenDesc : c.desc || a.text(c.v);
  const master = t.abilities[c.ab].master();
  const mine = c.side === "p" && !m.busy;
  const canMove = mine && !!onAct && m.moveOptions(c).length > 0;
  const canMark = mine && !!onAct && m.markOptions(c).length > 0;
  const kw = (k: StatKey) => `${t.keywords[k].name}: ${t.keywords[k].text}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="font-display tracking-wide">{name}</b>
        <span>{t.ui.cost} {c.cost} · {t.ui.power} {c.base}</span>
        {c.main && <span className="text-zinc-300">{t.ui.mastery}: <b className="text-game-brass">{t.levels[c.lvl]}</b> · {t.ui.main}: {t.stats[c.main]}{c.stats ? ` ${c.stats[c.main]}` : ""}</span>}
        {key !== c.ab && <span className="text-game-brass">{t.ui.silenced}</span>}
      </div>
      <p><span className="text-game-brass">{a.name}{kind ? ` (${kind})` : ""}:</span> {text}</p>
      {master && key === c.ab && (
        <p className={c.lvl === 2 ? "" : "text-zinc-500"}><span className="text-game-brass">★★ {t.ui.masterLine}:</span> {master}{c.lvl < 2 && ` (${t.ui.locked})`}</p>
      )}
      {c.kw.length > 0 && <p className="text-xs text-zinc-300"><span className="text-game-me">{t.ui.kw}:</span> {c.kw.map(kw).join(" · ")}</p>}
      {(canMove || canMark) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canMove && <button type="button" className={pill(false)} onClick={() => onAct?.("move", c)}>{t.ui.act.move}</button>}
          {canMark && <button type="button" className={pill(false)} onClick={() => onAct?.("mark", c)}>{t.ui.act.mark}</button>}
        </div>
      )}
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
        <span className="text-[11px] text-game-brass">{t.shop.price(m.itemPrice("p", k))}{!picked && !m.canBuy(k) && ` · ${t.shop.noSouls}`}</span>
        {(fit.cards > 0 || fit.loc) && (
          <span className="flex flex-wrap gap-1">
            {fit.cards > 0 && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me">{t.shop.fitCards(fit.cards)}</span>}
            {fit.loc && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me">{t.shop.fitLoc(fit.loc)}</span>}
          </span>
        )}
        {picked && <span className="text-[11px] font-bold tracking-wider text-game-brass uppercase">{t.shop.picked}</span>}
      </span>
    </button>
  );
}

function ItemSlots({ m, t, icons, looking, onLook }: { m: Match; t: T; icons: Record<string, string>; looking: ItemKey | null; onLook: (k: ItemKey) => void }) {
  const slot = (s: Side) => {
    const k = m.picked[s];
    const shown = k && (s === "p" || m.itemsOn);
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-zinc-950/50 p-1.5">
        {shown ? (
          <button type="button" onClick={() => onLook(k)} aria-pressed={looking === k} aria-label={t.shop.label(k, ITEMS[k].tier)}
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left hover:text-white ${focus}`}>
            <ItemIconBox k={k} icon={icons[k]} size="size-8" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[10px] tracking-wider text-zinc-400 uppercase">{s === "p" ? t.shop.mine : t.shop.ai}</span>
              <span className="truncate text-xs font-bold">{k}</span>
              <span className="text-[10px] text-zinc-400">{m.itemsOn ? t.shop.paid(m.paid[s]) : t.shop.hidden}</span>
            </span>
          </button>
        ) : (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 font-display text-sm text-zinc-500" aria-hidden="true">?</span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[10px] tracking-wider text-zinc-400 uppercase">{s === "p" ? t.shop.mine : t.shop.ai}</span>
              <span className="text-[10px] text-zinc-400">{s === "a" && m.t < ITEM_REVEAL_TURN ? t.shop.hidden : "—"}</span>
            </span>
          </>
        )}
      </div>
    );
  };
  return <div className="flex w-full gap-2">{slot("a")}{slot("p")}</div>;
}

function ItemDetail({ k, m, t }: { k: ItemKey; m: Match; t: T }) {
  const it = ITEMS[k];
  return (
    <>
      <b className="font-display tracking-wide">{k}</b> · <span className={SLOT_TEXT[it.slot]}>{t.slots[it.slot]}</span> · {t.shop.tier(it.tier)}
      <br />
      {t.items[k](m.itemV(k))}
    </>
  );
}
