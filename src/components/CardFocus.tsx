import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameCard } from "./GameCard";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { pill, primaryBtn } from "../lib/ui";
import {
  ABILITIES, HABILITY_AT, ROLE_ABILITY, cardStats, heroCard, heroStat, isAbility, mastery, powerParts,
  type AbilityKey, type GameConfig, type PoolCard, type PowerPart,
} from "../lib/game/config";
import { versionPlayer } from "../lib/game/deck";
import { DECK_SIZE } from "../lib/game/engine";
import { GAME_TEXT } from "../lib/game/text";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

type Props = {
  /** Versões do jogador (a principal primeiro). */
  versions: PoolCard[];
  /** Versão mostrada. */
  shown: PoolCard;
  cfg: GameConfig;
  inDeck: boolean;
  full: boolean;
  isCover: boolean;
  /** O herói da versão já está no baralho em outro jogador. */
  taken: (v: PoolCard) => boolean;
  /** Carta do baralho que já usa o herói da versão mostrada. */
  holder?: PoolCard;
  onSwap: (v: PoolCard, from: DOMRect | null) => void;
  onShow: (v: PoolCard) => void;
  onToggle: (v: PoolCard, from: DOMRect | null) => void;
  onCover: (v: PoolCard) => void;
  onClose: () => void;
};

/**
 * Carta em destaque na montagem do baralho: a carta grande com o texto da habilidade, os heróis do jogador para trocar de versão
 * (o texto troca junto) e, em letra pequena, de onde vem o poder dela.
 */
export function CardFocus({ versions, shown, cfg, inDeck, full, isCover, taken, holder, onSwap, onShow, onToggle, onCover, onClose }: Props) {
  const t = useT(GAME_TEXT);
  const { players, heroIcon } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc fecha; o foco entra no diálogo e volta para quem abriu
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); opener?.focus?.(); };
  }, [onClose]);

  const heroes = [...new Set(versions.map((v) => v.hero))];
  const twins = versions.filter((v) => v.hero === shown.hero);
  const ab: AbilityKey = isAbility(shown.hero) ? shown.hero : ROLE_ABILITY[shown.position] ?? "draw";
  const s = cardStats(shown, cfg.cards, cfg.heroes);
  const a = t.abilities[s.ab];
  const why = powerParts(shown, cfg);
  const stat = heroStat(shown.hero, cfg.heroes, shown.stats);
  const statV = shown.stats?.[stat] ?? 0;
  const top = mastery(statV);
  const partLabel = (p: PowerPart) =>
    p.k === "hero" ? t.deck.parts.hero(shown.hero) : p.k === "ovr" ? t.deck.parts.ovr(shown.ovr, why.prof === "H") : p.k === "alt" && !p.n ? t.deck.altPro : t.deck.parts[p.k];

  return (
    <motion.div className="fixed inset-0 z-80 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="focus-name"
        className="noir-glass-strong flex max-h-[92dvh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl p-4 text-dl-text sm:flex-row sm:gap-6 sm:p-6"
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>

        <div ref={cardRef} className="mx-auto w-44 shrink-0 perspective-[60rem] sm:w-64">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={shown.id} initial={{ rotateY: -70, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 70, opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}>
              <GameCard player={versionPlayer(byId, shown)} name={shown.name} cost={s.cost} power={s.power} base={s.power} fx
                master={top === 2 ? t.levels[2] : undefined}
                text={{ name: a.name, kind: t.kinds[ABILITIES[s.ab].kind], body: s.desc || a.text(s.v), masterLabel: t.ui.masterLine }} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <h2 id="focus-name" className="font-display text-2xl font-extrabold tracking-wide uppercase">{shown.name}</h2>
              <span className="text-xs text-zinc-400">{shown.hero} · OVR {shown.ovr}</span>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label={t.deck.close}
              className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-xl text-zinc-300 transition hover:bg-white/10 hover:text-white active:bg-white/20 sm:size-9 ${focus}`}>×</button>
          </header>

          {heroes.length > 1 && (
            <section className="flex flex-col gap-2" aria-labelledby="focus-heroes">
              <h3 id="focus-heroes" className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{t.deck.heroes}</h3>
              <div className="flex flex-wrap gap-1.5">
                {heroes.map((hero) => {
                  const same = versions.filter((x) => x.hero === hero);
                  // herói com mais de uma carta: o botão leva à que já está à mostra ou à primeira
                  const v = same.find((x) => x.id === shown.id) ?? same[0];
                  const vs = cardStats(v, cfg.cards, cfg.heroes);
                  const on = hero === shown.hero;
                  const dup = taken(v);
                  const icon = heroIcon(v.hero);
                  return (
                    <button key={v.id} type="button" onClick={() => onShow(v)} aria-pressed={on} aria-label={t.deck.version(v.name, v.hero)} title={dup ? t.deck.dupHero(v.hero) : undefined}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg py-1 pr-3 pl-1 text-left transition active:scale-95 ${focus} ${on ? "bg-dl-text text-dl-black" : "bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800"}`}>
                      {icon ? <img src={icon} alt="" className="size-8 rounded-md object-cover" /> : <span className="size-8" />}
                      <span className="flex flex-col leading-tight">
                        <span className="text-xs font-bold">{v.hero}{dup && <span className={on ? "text-rose-700" : "text-rose-300"} aria-hidden="true"> ⇄</span>}</span>
                        <span className={`text-[10px] ${on ? "text-dl-black/70" : "text-zinc-400"}`}>{same.length > 1 ? t.deck.cards(same.length) : `${vs.cost} · ${vs.power}`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {twins.length > 1 && (
            <section className="flex flex-col gap-2" aria-labelledby="focus-twins">
              <h3 id="focus-twins" className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{t.deck.whichCard(shown.hero)}</h3>
              <div className="flex flex-wrap gap-2">
                {twins.map((v) => {
                  const vs = cardStats(v, cfg.cards, cfg.heroes);
                  const p = versionPlayer(byId, v);
                  const on = v.id === shown.id;
                  const kind = v.alt ? t.deck.cardKind.alt : p?.special ? t.deck.cardKind.special : t.deck.cardKind.normal;
                  return (
                    <button key={v.id} type="button" onClick={() => onShow(v)} aria-pressed={on} aria-label={`${t.deck.version(v.name, v.hero)} · ${kind}`}
                      className={`flex w-20 cursor-pointer flex-col items-center gap-1 rounded-lg p-1.5 transition active:scale-95 ${focus} ${on ? "bg-dl-text text-dl-black" : "bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800"}`}>
                      <span className="w-full"><GameCard player={p} name={v.name} cost={vs.cost} power={vs.power} base={vs.power} text={null} /></span>
                      <span className="text-[10px] font-bold uppercase">{kind}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-1.5" aria-labelledby="focus-why">
            <h3 id="focus-why" className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{t.deck.why}</h3>
            <dl className="flex flex-col gap-0.5 text-xs text-zinc-400">
              {why.parts.filter((p) => p.n !== 0 || p.k === "hero" || p.k === "alt").map((p) => (
                <div key={p.k} className="flex justify-between gap-3">
                  <dt>{partLabel(p)}</dt>
                  <dd className={`font-bold tabular-nums ${p.k === "hero" ? "text-zinc-200" : p.n > 0 ? "text-emerald-300" : p.n < 0 ? "text-rose-300" : "text-zinc-400"}`}>{p.k === "hero" ? p.n : sign(p.n)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-1 text-sm text-zinc-100">
                <dt className="first-letter:uppercase">{t.ui.power}</dt>
                <dd className="font-display font-extrabold tabular-nums">{why.power}</dd>
              </div>
            </dl>
            <ul className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
              <li>{t.deck.costFrom(shown.hero)}: {heroCard(ab, cfg.heroes).cost === s.cost ? s.cost : `${heroCard(ab, cfg.heroes).cost} → ${s.cost}`}</li>
              {why.vBonus && <li>{t.deck.vBonus(HABILITY_AT)}</li>}
              <li>{t.deck.mastery(stat, statV, t.levels[top])}</li>
              {top === 2 && a.master() && <li className="text-game-brass">★ {t.ui.masterLine}: {a.master()}</li>}
            </ul>
          </section>

          {holder ? <SwapPanel holder={holder} shown={shown} cfg={cfg} onSwap={() => onSwap(shown, cardRef.current?.getBoundingClientRect() ?? null)} /> : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={!inDeck && (full || taken(shown))}
              title={!inDeck && taken(shown) ? t.deck.dupHero(shown.hero) : !inDeck && full ? t.deck.full(DECK_SIZE) : undefined}
              onClick={() => onToggle(shown, cardRef.current?.getBoundingClientRect() ?? null)}>
              {inDeck ? t.deck.takeBtn : t.deck.addBtn}
            </button>
            {inDeck && (
              <button type="button" className={`${pill(isCover)} disabled:cursor-default`} disabled={isCover} onClick={() => onCover(shown)}>
                {isCover ? `★ ${t.deck.isCover}` : t.deck.cover}
              </button>
            )}
          </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Herói repetido: a carta do baralho que usa o herói, uma seta e a carta mostrada. Ao trocar, as duas cruzam de lugar
 * antes de a troca valer (direto, com movimento reduzido).
 */
function SwapPanel({ holder, shown, cfg, onSwap }: { holder: PoolCard; shown: PoolCard; cfg: GameConfig; onSwap: () => void }) {
  const t = useT(GAME_TEXT);
  const { players } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const still = useReducedMotion();
  const [going, setGoing] = useState(false);
  const mini = (c: PoolCard, dx: 1 | -1) => {
    const s = cardStats(c, cfg.cards, cfg.heroes);
    return (
      <motion.figure className="flex w-16 flex-col items-center gap-1 sm:w-20" animate={going ? { x: `${dx * 165}%`, rotate: dx * 6 } : { x: 0, rotate: 0 }}
        transition={{ duration: 0.26, ease: "easeInOut" }}>
        <div className="w-full"><GameCard player={versionPlayer(byId, c)} name={c.name} cost={s.cost} power={s.power} base={s.power} text={null} /></div>
        <figcaption className="max-w-full truncate text-[10px] font-bold text-zinc-300">{c.name}</figcaption>
      </motion.figure>
    );
  };
  const go = () => {
    if (going) return;
    if (still) return onSwap();
    setGoing(true);
    window.setTimeout(onSwap, 280);
  };
  return (
    <section aria-labelledby="swap-title" className="flex flex-col gap-3 rounded-xl bg-rose-950/35 p-3">
      <h3 id="swap-title" className="text-[11px] font-bold tracking-[0.18em] text-rose-200 uppercase">{t.deck.swapTitle} · {t.deck.dupHero(shown.hero)}</h3>
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        {mini(holder, 1)}
        <motion.span aria-hidden="true" className="font-display text-2xl text-rose-200"
          animate={still || going ? { x: 0, opacity: going ? 0 : 1 } : { x: [-4, 4, -4] }} transition={still || going ? { duration: 0.15 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>⇄</motion.span>
        {mini(shown, -1)}
      </div>
      <button type="button" className={primaryBtn} onClick={go} disabled={going}>{t.deck.swapBtn(shown.hero, holder.name)}</button>
      <p className="text-[11px] text-zinc-400">{t.deck.swapNote}</p>
    </section>
  );
}
