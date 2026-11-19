import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CardBack } from "./GameCard";
import { DeckCurve, DeckPips, DeckStrip, deckFocus, type DeckKit } from "./DeckStrip";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { pill, primaryBtn } from "../lib/ui";
import type { PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { draftOffer, type DeckLook } from "../lib/game/deck";
import { GAME_TEXT } from "../lib/game/text";

/**
 * Draft (como a Arena do Hearthstone): doze rodadas, cada uma com 3 jogadores de OVR parecido saindo do baralho virados. Você
 * escolhe 1, ele vai para a lista ao lado e a próxima rodada vem. No fim, salva o baralho ou já joga.
 */
export function DeckDraft({ versions, look, kit, onLeave, onSave, onPlay }: {
  versions: Map<string, PoolCard[]>; look: DeckLook; kit: DeckKit;
  onLeave: () => void; onSave: (cards: PoolCard[]) => void; onPlay: (cards: PoolCard[]) => void;
}) {
  const t = useT(GAME_TEXT);
  const still = useReducedMotion();
  const [picks, setPicks] = useState<PoolCard[]>([]);
  const [offer, setOffer] = useState<PoolCard[]>(() => draftOffer([], versions));
  const [chosen, setChosen] = useState<string | null>(null);
  const done = picks.length >= DECK_SIZE || !offer.length;
  const sorted = [...picks].sort((a, b) => kit.stats(a).cost - kit.stats(b).cost || a.name.localeCompare(b.name));

  const pick = (c: PoolCard) => {
    if (chosen) return;
    setChosen(c.id);
    // a escolhida sobe e as outras caem antes da rodada nova
    window.setTimeout(() => {
      const next = [...picks, c];
      setPicks(next);
      setOffer(next.length >= DECK_SIZE ? [] : draftOffer(next, versions));
      setChosen(null);
    }, still ? 0 : 380);
  };

  return (
    <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 text-dl-text">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 h-120 bg-radial-[ellipse_55%_50%_at_50%_50%] from-teal-300/10 via-amber-500/5 to-transparent to-70%" />
      <header className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={onLeave} className={`${pill(false)} self-start active:scale-95 sm:self-center`}><Icon name="chevron-left" />{t.deck.leave}</button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          <span className="text-[11px] font-bold tracking-[0.3em] text-game-brass uppercase">{t.deck.draft}</span>
          <h1 className="font-display text-2xl font-extrabold tracking-[0.08em] uppercase sm:text-4xl" aria-live="polite">
            {done ? t.deck.draftDone : t.deck.round(picks.length + 1, DECK_SIZE)}
          </h1>
        </div>
        {/* espaço do botão da esquerda, para o título ficar no centro */}
        <span aria-hidden="true" className="hidden w-32 sm:block" />
      </header>

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start">
        <section aria-label={t.deck.draftHint} className="flex min-w-0 flex-1 flex-col items-center gap-6">
          <DeckPips n={picks.length} max={DECK_SIZE} className="w-full max-w-sm" />
          {!done ? (
            <>
              <p className="text-center text-sm text-zinc-400">{t.deck.draftHint}</p>
              <ul className="flex w-full max-w-3xl justify-center gap-3 perspective-distant sm:gap-8">
                <AnimatePresence mode="popLayout">
                  {offer.map((c, i) => {
                    const s = kit.stats(c);
                    const me = chosen === c.id;
                    const gone = chosen !== null && !me;
                    return (
                      <motion.li key={`${picks.length}-${c.id}`} className="flex w-[clamp(6.2rem,28vw,13rem)] flex-col items-center gap-2"
                        initial={still ? { opacity: 0 } : { opacity: 0, y: 60, rotateY: 180 }}
                        animate={still ? { opacity: gone ? 0.2 : 1 } : { opacity: gone ? 0 : 1, y: me ? -30 : gone ? 40 : 0, rotateY: 0, scale: me ? 1.06 : 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.34, delay: chosen || still ? 0 : 0.1 + i * 0.12, ease: [0.23, 1, 0.32, 1] }}>
                        <button type="button" onClick={() => pick(c)} disabled={chosen !== null} aria-label={t.deck.pick(t.deck.version(c.name, c.hero))}
                          className={`group relative block w-full cursor-pointer rounded-xl transition-transform duration-200 transform-3d hover:-translate-y-2 active:scale-95 disabled:cursor-default motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${deckFocus}`}>
                          {/* o verso por trás: aparece enquanto a carta gira */}
                          <span aria-hidden="true" className="absolute inset-0 transform-[rotateY(180deg)] backface-hidden"><CardBack look={look} /></span>
                          <span className={`block backface-hidden ${me ? "drop-shadow-[0_0_24px_var(--color-game-me)]" : "drop-shadow-[0_12px_18px_rgb(0_0_0/0.6)] group-hover:drop-shadow-[0_0_18px_rgb(255_239_215/0.35)]"}`}>
                            {kit.face(c)}
                          </span>
                        </button>
                        <span className="flex flex-col items-center text-center leading-tight">
                          <span className="text-[11px] text-zinc-400">{c.hero} · OVR {c.ovr} · {s.cost}/{s.power}</span>
                        </span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            <motion.div initial={still ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
              <DeckCurve cards={picks} kit={kit} label={t.deck.curve} className="h-10 w-64" />
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className={`${primaryBtn} min-h-14 px-10 text-base active:scale-95`} disabled={picks.length < DECK_SIZE} onClick={() => onPlay(picks)}>{t.deck.playNow}</button>
                <button type="button" className={`${pill(false)} min-h-14 active:scale-95`} onClick={() => onSave(picks)}>{t.deck.save}</button>
              </div>
            </motion.div>
          )}
        </section>

        {/* o que já foi escolhido */}
        <aside aria-label={t.deck.list} className="flex w-full flex-col gap-2 lg:w-80 lg:shrink-0">
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            <AnimatePresence initial={false}>
              {sorted.map((c) => (
                <motion.li key={c.key} layout={!still} initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                  <DeckStrip c={c} kit={kit} openLabel={c.name} removeLabel={c.name} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </aside>
      </div>
    </div>
  );
}
