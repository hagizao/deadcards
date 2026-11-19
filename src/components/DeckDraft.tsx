import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FullscreenButton, TagButton } from "./BarButton";
import { CardBack } from "./GameCard";
import { DeckCurve, DeckPips, DeckStrip, deckFocus, type DeckKit } from "./DeckStrip";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { pill } from "../lib/ui";
import type { PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { draftOffer, type DeckLook } from "../lib/game/deck";
import { sfx } from "../lib/game/sfx";
import { GAME_TEXT } from "../lib/game/text";

/**
 * Draft (como a Arena do Hearthstone): doze rodadas, cada uma com 3 jogadores de OVR parecido saindo do baralho virados. Você
 * escolhe 1, ele vai para a lista ao lado e a próxima rodada vem. No fim, salva o baralho ou já joga. As cartas vêm com o
 * texto da habilidade; no hover a carta cresce para ler, e o "i" abre ela grande (no celular, onde a carta é pequena).
 * As teclas 1, 2 e 3 escolhem.
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
  const [hot, setHot] = useState<string | null>(null);
  // carta aberta grande para ler (com Escolher)
  const [zoom, setZoom] = useState<PoolCard | null>(null);
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
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (zoom) { if (e.key === "Escape") setZoom(null); return; }
      if (e.target instanceof Element && e.target.closest("input, textarea")) return;
      const c = offer[Number(e.key) - 1];
      if (c && !done) pick(c);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

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
        {/* tela cheia no canto, do tamanho do botão da esquerda para o título ficar no centro */}
        <span className="flex justify-end sm:w-32"><FullscreenButton label={t.ui.fullscreen} className="absolute top-0 right-0 sm:static" /></span>
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
                    const on = hot === c.id && !chosen;
                    return (
                      <motion.li key={`${picks.length}-${c.id}`} className={`relative flex w-[clamp(6.2rem,28vw,14rem)] flex-col items-center gap-2 ${on ? "z-20" : "z-0"}`}
                        initial={still ? { opacity: 0 } : { opacity: 0, y: 60, rotateY: 180 }}
                        animate={still ? { opacity: gone ? 0.2 : 1, scale: on ? 1.3 : 1 } : { opacity: gone ? 0 : 1, y: me ? -30 : gone ? 40 : on ? -24 : 0, rotateY: 0, scale: me ? 1.06 : on ? 1.3 : 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: hot ? 0.18 : 0.34, delay: chosen || still || hot ? 0 : 0.1 + i * 0.12, ease: [0.23, 1, 0.32, 1] }}
                        onHoverStart={() => setHot(c.id)} onPointerEnter={(e) => { if (e.pointerType === "mouse" && !chosen) sfx("hover"); }} onHoverEnd={() => setHot((h) => (h === c.id ? null : h))}>
                        <button type="button" onClick={() => pick(c)} disabled={chosen !== null} aria-label={`${i + 1}: ${t.deck.pick(t.deck.version(c.name, c.hero))}`}
                          onFocus={() => setHot(c.id)} onBlur={() => setHot((h) => (h === c.id ? null : h))}
                          className={`group relative block w-full cursor-pointer rounded-xl transform-3d active:scale-95 disabled:cursor-default ${deckFocus}`}>
                          {/* o verso por trás: aparece enquanto a carta gira */}
                          <span aria-hidden="true" className="absolute inset-0 transform-[rotateY(180deg)] backface-hidden"><CardBack look={look} /></span>
                          <span className={`block backface-hidden ${me ? "drop-shadow-[0_0_24px_var(--color-game-me)]" : "drop-shadow-[0_12px_18px_rgb(0_0_0/0.6)] group-hover:drop-shadow-[0_0_18px_rgb(255_239_215/0.35)]"}`}>
                            {kit.full(c)}
                          </span>
                        </button>
                        <button type="button" onClick={() => setZoom(c)} aria-label={t.deck.open(t.deck.version(c.name, c.hero))}
                          className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11px] text-zinc-400 transition hover:bg-white/8 hover:text-zinc-100 active:scale-95 motion-reduce:transition-none sm:min-h-8 ${deckFocus} ${on ? "opacity-0" : ""}`}>
                          <Icon name="info" className="size-3.5 shrink-0" />
                          <span>{c.hero} · OVR {c.ovr} · {s.cost}/{s.power}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            <motion.div initial={still ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
              <DeckCurve cards={picks} kit={kit} label={t.deck.curve} className="h-10 w-64" />
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                <TagButton tone="yellow" size="xl" call disabled={picks.length < DECK_SIZE} onClick={() => onPlay(picks)}>{t.deck.playNow}</TagButton>
                <TagButton tone="blue" tilt={1} delay={0.1} onClick={() => onSave(picks)}>{t.deck.save}</TagButton>
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
      <AnimatePresence>
        {zoom && (
          <motion.div key="zoom" className="fixed inset-0 z-80 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={(e) => { if (e.target === e.currentTarget) setZoom(null); }}>
            <motion.div role="dialog" aria-modal="true" aria-label={t.deck.version(zoom.name, zoom.hero)} className="flex w-full max-w-xs flex-col items-center gap-5"
              initial={still ? false : { scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="w-full">{kit.full(zoom)}</div>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <TagButton tone="paper" onClick={() => setZoom(null)}>{t.deck.close}</TagButton>
                <TagButton tone="yellow" tilt={1} call onClick={() => { const c = zoom; setZoom(null); pick(c); }}>{t.deck.pick(zoom.name)}</TagButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
