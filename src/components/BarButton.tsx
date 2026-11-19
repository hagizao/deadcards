// Botões no tema do Cardslock Game: a conta de papel do bar (como o "Fechar a conta") e etiquetas tortas de papel colado (como as placas dos locais).
import type { ReactNode } from "react";
import { sfx } from "../lib/game/sfx";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dl-text";

/** Cor da etiqueta: latão (ação principal secundária), alma (draft, sorte) e papel apagado (ações de apoio). */
const TAG = {
  brass: { bg: "bg-linear-to-b from-amber-200 to-game-brass", ink: "text-zinc-950" },
  soul: { bg: "bg-linear-to-b from-teal-100 to-game-soul", ink: "text-zinc-950" },
  paper: { bg: "bg-linear-to-b from-zinc-200 to-zinc-400", ink: "text-zinc-950" },
  danger: { bg: "bg-linear-to-b from-rose-200 to-rose-400", ink: "text-rose-950" },
} as const;
export type TagTone = keyof typeof TAG;

/**
 * Etiqueta de papel colada torta (o mesmo recorte das placas dos locais). No hover ela se endireita e sobe; no clique afunda.
 * `tilt` alterna o lado da inclinação para etiquetas vizinhas não ficarem iguais.
 */
export function TagButton({ tone = "brass", tilt = -1, size = "md", className = "", children, onClick, disabled, title, pressed, label }: {
  tone?: TagTone; tilt?: 1 | -1; size?: "sm" | "md" | "lg"; className?: string; children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; pressed?: boolean; label?: string;
}) {
  const pad = size === "lg" ? "min-h-14 px-7 text-sm" : size === "sm" ? "min-h-11 px-3 text-[11px] sm:min-h-9" : "min-h-12 px-5 text-xs";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={pressed} aria-label={label}
      onPointerEnter={(e) => { if (e.pointerType === "mouse" && !disabled) sfx("paper"); }}
      className={`group relative isolate inline-flex cursor-pointer items-center justify-center gap-1.5 font-extrabold tracking-widest uppercase drop-shadow-[0_3px_0_rgb(0_0_0/0.6)] transition duration-150 enabled:hover:-translate-y-0.5 enabled:active:translate-y-0.5 enabled:active:drop-shadow-[0_1px_0_rgb(0_0_0/0.6)] disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale motion-reduce:transition-none ${pad} ${TAG[tone].ink} ${focus} ${className}`}>
      <span aria-hidden="true"
        className={`absolute inset-0 -z-10 transition-transform duration-150 [clip-path:polygon(2%_8%,99%_0,100%_90%,0_100%)] group-enabled:group-hover:rotate-0 motion-reduce:transition-none ${tilt < 0 ? "-rotate-2" : "rotate-2"} ${pressed ? "brightness-110" : ""} ${TAG[tone].bg}`} />
      {children}
    </button>
  );
}

/**
 * Jogar como a conta do bar: papel creme com a borda serrilhada, o carimbo vermelho e a luz quente por trás, que pulsa quando
 * o baralho está pronto. Desligada, o papel fica apagado e a linha de baixo diz o que falta.
 */
export function ReceiptButton({ label, note, onClick, disabled, className = "" }: { label: string; note?: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      onPointerEnter={(e) => { if (e.pointerType === "mouse" && !disabled) sfx("paper"); }}
      className={`group relative isolate flex min-w-44 cursor-pointer flex-col items-stretch transition duration-150 enabled:hover:-translate-y-1 enabled:hover:-rotate-2 enabled:active:translate-y-0 enabled:active:scale-95 disabled:cursor-not-allowed motion-reduce:transition-none ${focus} ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -inset-4 -z-10 rounded-full bg-radial from-rose-500/60 via-game-brass/35 to-transparent to-70% blur-lg transition-opacity duration-300 group-disabled:opacity-0 motion-safe:group-enabled:animate-pulse" />
      <span className="flex flex-col items-center gap-1.5 bg-comanda-paper px-5 pt-3 pb-5 text-comanda-ink shadow-[inset_0_0_1.5rem_rgb(90_60_20/0.3)] receipt-edge group-disabled:brightness-60 group-disabled:grayscale">
        <span className="-rotate-3 rounded-sm px-2 py-1 text-center text-2xl leading-none font-extrabold text-rose-700 uppercase ring-2 ring-rose-700/80 transition-transform duration-150 group-enabled:group-hover:rotate-0 motion-reduce:transition-none">{label}</span>
        {note && <span className="w-full border-t-2 border-dashed border-comanda-ink/40 pt-1 text-center text-[10px] font-extrabold tracking-widest uppercase">{note}</span>}
      </span>
    </button>
  );
}
