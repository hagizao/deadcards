// Mão do Cardslock Game, no estilo do Hearthstone: leque em arco, carta que sobe e amplia no hover,
// arrastar até um local para jogar (a carta balança conforme a velocidade) e caixas de palavra-chave ao lado.
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { GCard } from "../lib/game/engine";
import { sfx, slideSpeed, slideStart, slideStop } from "../lib/game/sfx";
import { TipBoxes, type Tip } from "./GameCard";
type Props = {
  cards: GCard[];
  selected: GCard | null;
  disabled: boolean;
  playable: (c: GCard) => boolean;
  label: (c: GCard) => string;
  tips: (c: GCard) => Tip[];
  render: (c: GCard, zoomed: boolean) => ReactNode;
  onSelect: (c: GCard) => void;
  /** Soltou a carta sobre o local `i` (atributo `data-drop` no local). */
  onDrop: (c: GCard, i: number) => void;
  /** Carta sendo arrastada e o local sob o cursor, para acender os locais. */
  onDrag: (c: GCard | null, over: number | null) => void;
  /** Abertura da mesa: as cartas sobem da borda de baixo uma a uma, a partir de `at` segundos, a cada `step`. */
  deal?: { at: number; step: number };
};

const RATIO = 430 / 295;
const TIP_W = 192;
/** Parte da carta que fica à mostra; o resto afunda abaixo da borda e sobe no hover. */
const SHOW = 0.62;
const TOP = 8;

/** Local (`data-drop`) sob o ponto da tela. */
function dropAt(x: number, y: number): number | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const v = (el as HTMLElement).dataset?.drop;
    if (v !== undefined) return Number(v);
  }
  return null;
}
const pointOf = (e: MouseEvent | TouchEvent | PointerEvent) => ("clientX" in e ? { x: e.clientX, y: e.clientY } : { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });

export function GameHand(p: Props) {
  const [cw, setCw] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [vh, setVh] = useState(() => window.innerHeight);
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => { setVh(window.innerHeight); setVw(window.innerWidth); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = p.cards.length;
  const W = Math.round(Math.max(84, Math.min(168, cw * 0.22, vh * 0.16)));
  const H = W * RATIO;
  const boxH = Math.round(H * SHOW + TOP);
  // a ampliada usa a tela, não só a faixa da mão (no celular a mão divide a linha com o orbe e o botão)
  const zoomW = Math.max(W, Math.min(325, vw * 0.75, vh * 0.52));
  const scale = Math.max(1, zoomW / W);
  const mid = (n - 1) / 2;
  const spacing = n > 1 ? Math.min(W * 0.78, (cw - W - 8) / (n - 1)) : 0;
  const step = Math.min(7, Math.max(3, 30 / Math.max(1, n)));
  const liftedId = drag === null ? hover ?? p.selected?.id ?? null : null;
  const li = p.cards.findIndex((c) => c.id === liftedId);
  // a carta ampliada não sai da tela: o centro dela fica a meia largura das bordas
  const edge = Math.max(0, cw / 2 - (W * scale) / 2);
  const pose = (i: number) => {
    const d = i - mid;
    let x = d * spacing;
    if (li >= 0 && i !== li && spacing < W) x += (i < li ? -1 : 1) * Math.min(W * 0.32, W - spacing);
    if (i === li) return { x: Math.max(-edge, Math.min(edge, x)), y: boxH - TOP - H - 4, rotate: 0, scale };
    return { x, y: d * d * 2.4, rotate: d * step, scale: 1 };
  };
  const lifted = li >= 0 ? p.cards[li] : null;
  const tips = lifted ? p.tips(lifted) : [];
  const lx = li >= 0 ? cw / 2 + pose(li).x : 0;
  const zw = W * scale;
  const tipLeft = lx + zw / 2 + 8 + TIP_W <= cw ? lx + zw / 2 + 8 : lx - zw / 2 - 8 - TIP_W >= 0 ? lx - zw / 2 - 8 - TIP_W : null;

  return (
    // corta só embaixo: a carta afunda na borda, mas a ampliada pode subir por cima da mesa
    <div ref={measure} className="relative w-full [clip-path:inset(-100vh_-100vw_0_-100vw)]" style={{ height: boxH }}>
      {cw > 0 && (
        <AnimatePresence initial={!!p.deal}>
          {p.cards.map((c, i) => (
            <motion.div key={c.id} className="absolute origin-bottom" style={{ top: TOP, left: cw / 2 - W / 2, width: W, zIndex: c.id === drag ? 60 : i === li ? 50 : i + 1 }}
              initial={p.deal ? { x: pose(i).x, y: boxH + H, rotate: 0, opacity: 0 } : { x: cw / 2, y: -H, rotate: 25, opacity: 0 }}
              animate={{ ...pose(i), opacity: 1 }} exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.18 } }}
              transition={p.deal ? { type: "spring", stiffness: 140, damping: 20, delay: p.deal.at + i * p.deal.step } : { type: "spring", stiffness: 380, damping: 30 }}>
              <HandCard c={c} p={p} zoomed={i === li} dragging={c.id === drag}
                onHover={(on) => setHover((h) => (on ? c.id : h === c.id ? null : h))}
                onDragState={(on) => { setDrag(on ? c.id : null); if (on) setHover(null); }} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      <AnimatePresence>
        {lifted && tipLeft !== null && tips.length > 0 && (
          <motion.div key={lifted.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-70" style={{ left: tipLeft, bottom: 8 }}>
            <TipBoxes tips={tips} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HandCard({ c, p, zoomed, dragging, onHover, onDragState }: {
  c: GCard; p: Props; zoomed: boolean; dragging: boolean; onHover: (on: boolean) => void; onDragState: (on: boolean) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // balanço ao arrastar: inclina para o lado do movimento, como se o ar segurasse a carta
  const tilt = useSpring(useTransform(useVelocity(x), [-1600, 1600], [-22, 22], { clamp: true }), { stiffness: 320, damping: 22 });
  const [moved, setMoved] = useState(false);
  const can = p.playable(c);
  const end = (e: MouseEvent | TouchEvent | PointerEvent) => {
    const { x: px, y: py } = pointOf(e);
    const i = dropAt(px, py);
    onDragState(false);
    p.onDrag(null, null);
    if (i !== null) p.onDrop(c, i);
  };
  return (
    <motion.button type="button" aria-label={p.label(c)} aria-pressed={p.selected === c} disabled={p.disabled}
      drag={!p.disabled} dragSnapToOrigin dragMomentum={false} dragElastic={1} style={{ x, y, rotate: tilt }}
      whileDrag={{ scale: 0.82 }}
      onDragStart={() => { setMoved(true); onDragState(true); slideStart(); }}
      onDrag={(e, info) => { const pt = pointOf(e); p.onDrag(c, dropAt(pt.x, pt.y)); slideSpeed(Math.hypot(info.velocity.x, info.velocity.y)); }}
      onDragEnd={(e) => { slideStop(); end(e); }}
      onClick={() => { if (moved) { setMoved(false); return; } p.onSelect(c); }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") { onHover(true); if (!dragging) sfx("hover"); } }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(false); }}
      onFocus={() => onHover(true)} onBlur={() => onHover(false)}
      className={`block w-full cursor-grab touch-none rounded-lg transition-[filter] duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dl-text active:cursor-grabbing disabled:cursor-not-allowed ${
        can ? "drop-shadow-[0_0_10px_var(--color-game-me)]" : "brightness-50 saturate-50"} ${dragging ? "cursor-grabbing" : ""}`}>
      {p.render(c, zoomed)}
    </motion.button>
  );
}
