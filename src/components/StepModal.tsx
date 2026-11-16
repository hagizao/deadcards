import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { ghost, primary } from "../lib/ui";

type Next = { label: string; onClick: () => void; disabled?: boolean };

// Modal admin em etapas. <dialog>.showModal() dá foco preso, Escape e fundo inerte; o resto (foco de volta, trava de rolagem) é aqui.
export function StepModal({ title, steps, step, onStep, onClose, info, next, hideBack, children }: {
  title: string;
  steps: string[];
  step: number;
  /** Só etapas já passadas são clicáveis no indicador. */
  onStep: (i: number) => void;
  onClose: () => void;
  info?: ReactNode;
  next: Next;
  /** Esconde Voltar/Cancelar (ex.: tela de resultado). */
  hideBack?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Direção da transição: guardada em estado (derivado no render) para não ler ref durante o render.
  const [last, setLast] = useState({ step, dir: 1 });
  if (last.step !== step) setLast({ step, dir: step > last.step ? 1 : -1 });
  const dir = last.dir;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Cada etapa devolve o foco ao primeiro campo marcado, ou ao corpo, para o leitor de tela anunciar a mudança.
  const focusBody = () => (bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? bodyRef.current)?.focus({ preventScroll: true });

  return (
    // Clique no fundo fecha; quem usa teclado já tem Escape e o botão Fechar.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // Clique no fundo fecha; quem usa teclado já tem Escape e o botão Fechar.
       
      onClick={(e) => e.target === ref.current && onClose()}
      className="noir-glass-strong m-auto max-h-[min(48rem,92dvh)] w-[min(56rem,calc(100%-2rem))] max-w-none flex-col overflow-hidden rounded-3xl p-0 text-zinc-100 backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:rounded-none"
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="flex min-h-0 flex-1 flex-col">
        <header className="space-y-4 border-b border-zinc-200/10 p-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-display text-lg font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-xl">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="-mt-1.5 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <ol aria-label="Etapas" className="flex items-center gap-2">
            {steps.map((label, i) => {
              const state = i === step ? "current" : i < step ? "done" : "todo";
              const chip = `flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold tabular-nums ${
                state === "current" ? "border-dl-text bg-dl-text text-dl-black" : state === "done" ? "border-emerald-300/60 text-emerald-300" : "border-zinc-200/20 text-zinc-400"}`;
              const text = `text-xs font-bold tracking-wider uppercase ${state === "current" ? "text-dl-text" : state === "done" ? "text-zinc-200" : "text-zinc-400"} ${state === "current" ? "" : "max-sm:sr-only"}`;
              return (
                <li key={label} className={`flex items-center gap-2 ${i < steps.length - 1 ? "flex-1" : ""}`}>
                  {state === "done" ? (
                    <button type="button" onClick={() => onStep(i)} className="-m-1.5 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg p-1.5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                      <span aria-hidden="true" className={chip}><Icon name="check" className="size-3.5" /></span>
                      <span className={text}><span className="sr-only">Voltar para a etapa {i + 1}: </span>{label}</span>
                    </button>
                  ) : (
                    <span aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
                      <span aria-hidden="true" className={chip}>{i + 1}</span>
                      <span className={text}><span className="sr-only">Etapa {i + 1}: </span>{label}</span>
                    </span>
                  )}
                  {i < steps.length - 1 && <span aria-hidden="true" className={`h-px min-w-3 flex-1 ${i < step ? "bg-emerald-300/40" : "bg-zinc-200/15"}`} />}
                </li>
              );
            })}
          </ol>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              ref={bodyRef}
              tabIndex={-1}
              custom={dir}
              variants={{ in: (d: number) => ({ opacity: 0, x: 14 * d }), show: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: -14 * d }) }}
              initial="in"
              animate="show"
              exit="out"
              transition={{ duration: 0.12, ease: "easeOut" }}
              onAnimationComplete={(def) => def === "show" && focusBody()}
              className="space-y-4 p-4 outline-none sm:p-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-200/10 px-4 py-3 sm:px-6">
          <div role="status" aria-live="polite" className="min-w-0 flex-1 basis-40 text-sm text-zinc-300">{info}</div>
          <div className="flex flex-wrap justify-end gap-2 max-sm:w-full">
            {!hideBack && (
              <button type="button" className={`${ghost} min-h-11 max-sm:flex-1`} onClick={step > 0 ? () => onStep(step - 1) : onClose}>{step > 0 ? "Voltar" : "Cancelar"}</button>
            )}
            <button type="button" className={`${primary} min-h-11 max-sm:flex-1`} disabled={next.disabled} onClick={next.onClick}>{next.label}</button>
          </div>
        </footer>
      </motion.div>
    </dialog>
  );
}

/** Dica de campo que recebe o foco ao entrar na etapa: `<input {...AUTOFOCUS} />`. */
export const AUTOFOCUS = { "data-autofocus": "" } as const;
