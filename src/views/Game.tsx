import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { pageTitle, pill, primaryBtn } from "../lib/ui";
import { ABILITIES, ITEMS, ITEM_OFFER_TURN, ITEM_REVEAL_TURN, gameConfig, itemCost, type ItemKey, type ItemSlot } from "../lib/game/config";
import { MIN_POOL, Match, TURNS, cardPool, type GCard, type Loc, type LogEntry, type PlayError, type Result, type Side, type Token } from "../lib/game/engine";
import { GAME_TEXT } from "../lib/game/text";
import { useItemIcons } from "../lib/game/useItemIcons";

const REVEAL_MS = 650;
const END_MS = 750;
const TOAST_MS = 1300;
const TOKEN_GLYPH: Record<Token, string> = { pigeon: "🐦", ghoul: "💀", turret: "⚙️", rat: "🐀" };

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
  const { heroIcon, heroArt } = useData();
  const [m, setM] = useState(newMatch);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const icons = useItemIcons();
  const [sel, setSel] = useState<GCard | null>(null);
  const [look, setLook] = useState<GCard | null>(null);
  const [lookItem, setLookItem] = useState<ItemKey | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(() => ({ id: 0, text: t.ui.toast.turn(1) }));
  const [result, setResult] = useState<Result | null>(null);
  const [showEnd, setShowEnd] = useState(false);
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
  const art = (hero: string | null) => (hero ? heroIcon(hero) ?? heroArt(hero)?.url ?? "" : "");
  const name = (c: GCard) => (c.p.token ? t.tokens[c.p.token] : c.p.name);
  const logName = (n: LogEntry["c"]) => (n === undefined ? "" : typeof n === "string" ? n : t.tokens[n.token]);
  const logLine = m.log[0] ? t.log[m.log[0].k](m.log[0], logName, (k) => t.abilities[k].name) : "";
  const shopOpen = m.t === ITEM_OFFER_TURN && !!m.offer && !result;
  const errText: Record<PlayError, string> = { souls: t.ui.toast.souls, frozen: t.ui.toast.frozen, full: t.ui.toast.full };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setM(newMatch());
    setSel(null);
    setLook(null);
    setLookItem(null);
    setResult(null);
    setShowEnd(false);
    say(t.ui.toast.turn(1));
  };

  const endTurn = () => {
    if (m.busy || result) return;
    if (m.needsPick) return say(t.shop.pickFirst);
    const queue = m.endTurn();
    setSel(null);
    setLook(null);
    setLookItem(null);
    bump();
    let i = 0;
    const step = () => {
      if (i < queue.length) {
        const [c, l] = queue[i++];
        m.reveal(c, l);
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
    setSel((s) => (s === c ? null : c));
    setLook(null);
    setLookItem(null);
  };
  const pickBoard = (c: GCard) => {
    if (c.staged && c.side === "p" && !m.busy) { m.unstage(c); bump(); return; }
    setLook((x) => (x === c ? null : c));
    setLookItem(null);
  };
  const pickItem = (k: ItemKey) => { m.pick(k); bump(); };
  const showItem = (k: ItemKey) => { setLookItem((x) => (x === k ? null : k)); setSel(null); setLook(null); };
  const playAt = (l: Loc) => {
    if (!sel) return;
    const err = m.play(sel, l);
    if (err) return say(errText[err]);
    setSel(null);
    bump();
  };

  const focused = sel ?? look;
  const canPlayAt = (l: Loc) => !!sel && !m.busy && !result && sel.cost <= m.E && m.room(l, "p") && l.lock.p < m.t;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-dl-text">
      <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className={pageTitle}>{t.ui.title}</h1>
        <p className="text-sm text-zinc-300">{t.ui.you} · {t.ui.ai} · {t.ui.turn(Math.min(m.t, TURNS), TURNS)} · {t.ui.record(record.w, record.l)}</p>
      </div>

      <section aria-label={t.ui.arena} className="flex w-full gap-1.5 sm:gap-2">
        {m.loc.map((l, i) => (
          <Location key={l.L.id + i} m={m} l={l} i={i} t={t} canPlay={canPlayAt(l)} onPlay={() => playAt(l)}
            card={(c) => <BoardCard key={`${c.id}-${c.rev}`} c={c} m={m} t={t} name={name(c)} art={art(c.p.hero)} looking={look === c} onClick={() => pickBoard(c)} />} />
        ))}
      </section>

      <p className="min-h-5 w-full text-center text-xs text-zinc-300" aria-live="polite">{logLine}</p>

      {m.offer && <ItemSlots m={m} t={t} icons={icons} looking={lookItem} onLook={showItem} />}

      {shopOpen && m.offer && (
        <section aria-labelledby="game-shop" className="noir-glass flex w-full flex-col gap-2 rounded-xl p-3">
          <h2 id="game-shop" className="font-display text-lg font-extrabold tracking-wider">{t.shop.title}</h2>
          <p className="text-xs text-zinc-400">{t.shop.hint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {m.offer.p.map((k) => (
              <ItemOption key={k} k={k} m={m} t={t} icon={icons[k]} picked={m.picked.p === k} disabled={m.busy} onPick={() => pickItem(k)} />
            ))}
          </div>
        </section>
      )}

      <section aria-label={t.ui.hand} className="flex min-h-36 max-w-full scrollbar-none gap-2 overflow-x-auto px-1.5 pt-4 pb-1">
        {m.hand.map((c) => (
          <HandCard key={c.id} c={c} t={t} name={name(c)} art={art(c.p.hero)} selected={sel === c} affordable={c.cost <= m.E} disabled={m.busy || !!result} onClick={() => pickHand(c)} />
        ))}
      </section>

      <div className="noir-glass min-h-12 w-full rounded-xl px-3 py-2 text-sm/snug">
        {lookItem ? <ItemDetail k={lookItem} m={m} t={t} />
          : focused ? <Detail c={focused} t={t} name={name(focused)} />
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
  );
}

type T = (typeof GAME_TEXT)["pt"];

function Location({ m, l, i, t, canPlay, onPlay, card }: { m: Match; l: Loc; i: number; t: T; canPlay: boolean; onPlay: () => void; card: (c: GCard) => React.ReactNode }) {
  const a = m.total(l, "a"), p = m.total(l, "p");
  const nm = l.rev ? l.L.name : t.ui.hiddenLoc;
  const chips = [
    l.lock.p >= m.t && `❄️ ${t.ui.chips.frozenMe}`,
    l.lock.a >= m.t && `❄️ ${t.ui.chips.frozenAi}`,
    m.hook.p === i && `🪝 ${t.ui.chips.hookMe}`,
    m.hook.a === i && `🪝 ${t.ui.chips.hookAi}`,
    l.trap.p > 0 && `🪤 ${t.ui.chips.trapMe}`,
    l.trap.a > 0 && `🪤 ${t.ui.chips.trapAi}`,
  ].filter(Boolean) as string[];
  const side = "grid min-h-[clamp(7.9rem,34vw,12.4rem)] auto-rows-min grid-cols-[repeat(2,clamp(2.75rem,12vw,4.375rem))] gap-0.5";
  return (
    <div className="noir-glass flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl p-1 sm:p-1.5">
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
    </div>
  );
}

function statusIcons(c: GCard, m: Match, t: T): [string, string][] {
  const s = c.st;
  return ([
    [!!s.burn, "🔥", t.ui.status.burn], [(s.stun ?? 0) >= m.t, "💫", t.ui.status.stun], [!!s.immune, "🛡️", t.ui.status.immune],
    [!!s.chained, "⛓️", t.ui.status.chained], [!!s.burrow && !m.final, "⛏️", t.ui.status.burrow], [!!s.poison, "☠️", t.ui.status.poison],
    [s.tmp.some((x) => m.t <= x.u), "💤", t.ui.status.sleep], [!!s.riposte, "⚔️", t.ui.status.riposte], [!!s.wolf, "🐺", t.ui.status.wolf],
  ] as const).filter((x) => x[0]).map((x) => [x[1], x[2]]);
}

function Art({ c, art }: { c: GCard; art: string }) {
  if (c.p.token) return <span className="absolute inset-x-0 top-0 bottom-[30%] flex items-center justify-center text-2xl" aria-hidden="true">{TOKEN_GLYPH[c.p.token]}</span>;
  return art ? <img src={art} alt="" className="absolute inset-x-0 top-0 h-[68%] w-full object-cover" /> : null;
}

const badge = "absolute top-0.5 flex size-5 items-center justify-center rounded-full border border-white font-display text-xs font-extrabold not-italic";

function BoardCard({ c, m, t, name, art, looking, onClick }: { c: GCard; m: Match; t: T; name: string; art: string; looking: boolean; onClick: () => void }) {
  const size = "relative aspect-5/7 w-[clamp(2.75rem,12vw,4.375rem)] overflow-hidden rounded-md";
  if (c.side === "a" && !c.rev) return <div className={`${size} ring-1 ring-game-ai game-card-back`} role="img" aria-label={t.ui.facedown} />;
  const pw = c.rev ? m.pow(c) : c.base;
  const hidden = !!c.st.burrow && !m.final && c.rev;
  const icons = statusIcons(c, m, t);
  return (
    <motion.button type="button" onClick={onClick} aria-pressed={looking}
      aria-label={`${t.ui.cardLabel(name, c.cost, hidden ? 0 : pw)}${icons.length ? ` (${icons.map((x) => x[1]).join(", ")})` : ""}`}
      initial={c.rev ? { scale: 1.4, rotate: -4, filter: "brightness(2)" } : false} animate={{ scale: 1, rotate: 0, filter: "brightness(1)" }} transition={{ duration: 0.25 }}
      className={`${size} cursor-pointer text-white ring-1 ring-white/30 ${c.staged ? "opacity-70 outline-1 outline-white outline-dashed" : ""} ${looking ? "outline-2 outline-dl-text" : ""} ${focus}`}
      style={{ background: `linear-gradient(160deg, ${c.p.c1}, ${c.p.c2})` }}>
      <Art c={c} art={art} />
      <i className={`${badge} left-0.5 bg-blue-600`}>{c.cost}</i>
      <b className={`${badge} right-0.5 ${pw > c.base ? "bg-emerald-300" : pw < c.base ? "bg-red-300" : "bg-game-brass"} text-dl-black`}>{hidden ? "?" : pw}</b>
      <span className="absolute bottom-4 left-0.5 text-[10px] leading-none drop-shadow-sm" aria-hidden="true">{icons.map((x) => x[0]).join("")}</span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-px py-0.5 text-center text-[9px]">{name}</span>
    </motion.button>
  );
}

function HandCard({ c, t, name, art, selected, affordable, disabled, onClick }: { c: GCard; t: T; name: string; art: string; selected: boolean; affordable: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={t.ui.cardLabel(name, c.cost, c.base)}
      className={`relative h-30 w-22 flex-none cursor-pointer overflow-hidden rounded-md text-white ring-1 ring-white/30 transition-transform duration-150 hover:-translate-y-1 disabled:cursor-not-allowed ${selected ? "-translate-y-3 outline-2 outline-game-brass" : ""} ${affordable ? "" : "opacity-45"} ${focus}`}
      style={{ background: `linear-gradient(160deg, ${c.p.c1}, ${c.p.c2})` }}>
      <Art c={c} art={art} />
      <i className={`${badge} left-0.5 size-6 bg-blue-600 text-sm`}>{c.cost}</i>
      <b className={`${badge} right-0.5 size-6 bg-game-brass text-sm text-dl-black`}>{c.base}</b>
      <span className="absolute inset-x-0 bottom-5 truncate bg-black/80 p-0.5 text-center text-[11px]">{name}</span>
      <small className="absolute inset-x-0 bottom-0 h-5 truncate bg-black/90 px-1 text-center text-[10px]/5 text-game-brass">{t.abilities[c.ab].name}</small>
    </button>
  );
}

function Detail({ c, t, name }: { c: GCard; t: T; name: string }) {
  const key = c.st.silenced ? "none" : c.ab;
  const a = t.abilities[key];
  const kind = t.kinds[ABILITIES[key].kind];
  const text = c.st.silenced ? t.ui.noAbility : c.tok && c.ab === "none" ? t.ui.tokenDesc : c.desc || a.text(c.v);
  return (
    <>
      <b className="font-display tracking-wide">{name}</b> · {t.ui.cost} {c.cost} · {t.ui.power} {c.base}
      {c.st.silenced && <> · <span className="text-game-brass">{t.ui.silenced}</span></>}
      <br />
      <span className="text-game-brass">{a.name}{kind ? ` (${kind})` : ""}:</span> {text}
    </>
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
        <span className="text-[11px] text-game-brass">{t.shop.price(itemCost(it.tier))}</span>
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
