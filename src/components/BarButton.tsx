// Botões no tema do Cardslock Game: etiquetas tortas de papel colado na mesa (como as placas dos locais) e o botão de tela cheia.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { sfx } from "../lib/game/sfx";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dl-text";

/**
 * Cor da etiqueta, a mesma paleta da mesa: as três faixas dos locais (amarela para Jogar, azul para editar, verde para o
 * draft), o papel da comanda (neutro) e o vermelho da IA (perigo).
 */
const TAG = {
  yellow: { bg: "bg-lane-yellow", ink: "text-zinc-950", glow: "from-lane-yellow/60 via-lane-yellow/20" },
  blue: { bg: "bg-lane-blue", ink: "text-zinc-950", glow: "from-lane-blue/60 via-lane-blue/20" },
  green: { bg: "bg-lane-green", ink: "text-zinc-950", glow: "from-lane-green/60 via-lane-green/20" },
  paper: { bg: "bg-comanda-paper", ink: "text-comanda-ink", glow: "from-comanda-paper/50 via-comanda-paper/15" },
  danger: { bg: "bg-game-ai", ink: "text-zinc-950", glow: "from-game-ai/60 via-game-ai/20" },
} as const;
export type TagTone = keyof typeof TAG;

const SIZE = {
  sm: "min-h-11 px-3 text-[11px] sm:min-h-9",
  md: "min-h-12 px-5 text-xs",
  /** Jogar: o dobro das vizinhas. */
  xl: "min-h-20 px-12 text-2xl tracking-[0.18em] sm:min-h-24 sm:px-16 sm:text-3xl",
} as const;

/**
 * Etiqueta de papel colada torta na mesa (o mesmo recorte das placas dos locais).
 * - entra caindo e se colando na mesa (`delay` escalona as vizinhas);
 * - no hover se endireita, sobe e faz o som de papel; no clique afunda;
 * - `call`: está pronta para ser usada, então o papel dá o tique seco a cada segundo, como a placa dos locais na partida
 *   (tag-tick; o texto fica parado), com uma luz por trás. No hover o tique para e ela se endireita.
 */
export function TagButton({ tone = "yellow", tilt = -1, size = "md", delay = 0, call = false, className = "", children, onClick, disabled, title, label }: {
  tone?: TagTone; tilt?: 1 | -1; size?: keyof typeof SIZE; delay?: number; call?: boolean; className?: string; children: ReactNode;
  onClick?: () => void; disabled?: boolean; title?: string; label?: string;
}) {
  const still = useReducedMotion();
  const live = call && !disabled;
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={label}
      onPointerEnter={(e) => { if (e.pointerType === "mouse" && !disabled) sfx("paper"); }}
      initial={still ? false : { opacity: 0, y: -26, rotate: tilt * 8, scale: 1.12 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 22, delay }}
      whileHover={disabled || still ? undefined : { y: -4, scale: 1.05, rotate: 0, transition: { type: "spring", stiffness: 600, damping: 20 } }}
      whileTap={disabled ? undefined : { y: 2, scale: 0.95 }}
      className={`group relative isolate inline-flex cursor-pointer items-center justify-center gap-1.5 font-extrabold tracking-widest uppercase drop-shadow-[0_4px_0_rgb(0_0_0/0.6)] disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale ${SIZE[size]} ${TAG[tone].ink} ${focus} ${className}`}>
      {/* luz por trás quando está pronta */}
      {live && (
        <span aria-hidden="true" className={`pointer-events-none absolute -inset-5 -z-20 rounded-full bg-radial ${TAG[tone].glow} to-transparent to-70% blur-lg motion-safe:animate-pulse`} />
      )}
      <span aria-hidden="true"
        className={`absolute inset-0 -z-10 transition-transform duration-150 [clip-path:polygon(2%_8%,99%_0,100%_90%,0_100%)] group-enabled:group-hover:rotate-0 group-enabled:group-hover:animate-none motion-reduce:transition-none ${live ? "tag-tick motion-reduce:-rotate-2" : tilt < 0 ? "-rotate-2" : "rotate-2"} ${TAG[tone].bg}`} />
      {children}
    </motion.button>
  );
}

/** A página está em tela cheia? (segue o Esc e o botão do navegador). */
function useFullscreen() {
  const [on, setOn] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  return on;
}

/** Botão discreto de tela cheia (o mesmo ícone da partida). */
export function FullscreenButton({ label, className = "" }: { label: (on: boolean) => string; className?: string }) {
  const on = useFullscreen();
  if (typeof document !== "undefined" && !document.fullscreenEnabled) return null;
  const toggle = () => (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return (
    <button type="button" onClick={toggle} aria-label={label(on)} aria-pressed={on} title={label(on)}
      className={`grid size-11 cursor-pointer place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 active:scale-90 active:bg-white/20 motion-reduce:transition-none sm:size-9 ${focus} ${className}`}>
      <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
        <path d={on ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
