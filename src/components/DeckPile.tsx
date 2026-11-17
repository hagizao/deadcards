import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useState } from "react";
import { CardBack } from "./GameCard";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
/** Mais que isso de camadas não muda a leitura da pilha. */
const MAX_LAYERS = 14;

type Props = {
  /** Cartas no baralho. */
  n: number;
  /** Texto da caixa no hover/foco (quantas faltam). */
  label: string;
  tone?: "me" | "ai";
  /** Para onde a carta de cima sai ao ser comprada (px): na partida, na direção da mão. */
  out?: { x: number; y: number };
  className?: string;
  /** Lado em que a caixa de contagem abre. */
  tipSide?: "left" | "top" | "bottom";
};

/**
 * Baralho físico: versos empilhados, um por carta, com a espessura caindo a cada compra. A carta de cima sai voando ao ser
 * comprada e uma nova cai na pilha ao entrar. Hover, foco ou toque mostram quantas cartas faltam.
 */
export const DeckPile = forwardRef<HTMLButtonElement, Props>(function DeckPile({ n, label, tone = "me", out = { x: -60, y: 0 }, className = "w-14", tipSide = "left" }, ref) {
  const [open, setOpen] = useState(false);
  const layers = Math.min(n, MAX_LAYERS);
  const tip = { left: "top-1/2 right-full -translate-x-2 -translate-y-1/2", top: "bottom-full left-1/2 -translate-x-1/2 -translate-y-2", bottom: "top-full left-1/2 -translate-x-1/2 translate-y-2" }[tipSide];
  return (
    <button ref={ref} type="button" aria-label={label} onClick={() => setOpen((x) => !x)} onBlur={() => setOpen(false)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}
      className={`relative shrink-0 cursor-pointer rounded-lg transition hover:brightness-110 active:scale-95 ${focus} ${className}`}>
      {/* a base fica sempre lá, mesmo vazia: marca o lugar do baralho */}
      <div className="aspect-295/430 w-full rounded-lg bg-black/30 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.06)]" />
      <AnimatePresence initial={false}>
        {Array.from({ length: layers }, (_, i) => (
          <motion.div key={i} className="absolute inset-x-0 top-0" style={{ zIndex: i + 1 }}
            initial={{ y: -28, x: 0, opacity: 0, rotate: -6 }}
            animate={{ y: -i * 1.6, x: -i * 0.6, opacity: 1, rotate: 0, transition: { duration: 0.22, ease: "easeOut" } }}
            exit={{ x: out.x, y: out.y, opacity: 0, rotate: out.x < 0 ? -12 : 12, transition: { duration: 0.28, ease: "easeIn" } }}>
            <CardBack tone={tone} className={i === layers - 1 ? "drop-shadow-[0_0.3rem_0.5rem_rgb(0_0_0/0.6)]" : ""} />
          </motion.div>
        ))}
      </AnimatePresence>
      <span aria-hidden="true" style={{ zIndex: MAX_LAYERS + 2 }}
        className={`absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full font-display text-xs font-extrabold text-dl-black shadow-sm ${tone === "me" ? "bg-game-me" : "bg-game-ai"}`}>
        {n}
      </span>
      <AnimatePresence>
        {open && (
          <motion.span role="status" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            style={{ zIndex: MAX_LAYERS + 3 }}
            className={`pointer-events-none absolute w-max max-w-48 rounded-lg bg-black/90 px-2.5 py-1.5 text-left text-xs font-bold text-zinc-100 shadow-lg ${tip}`}>
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
});
