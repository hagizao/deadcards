import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { strings, useT } from "../lib/i18n";
import { easeOut } from "../lib/ui";

const S = strings({
  pt: { dialog: "Tela de entrada", logo: "Logo do Cardslock", enter: "Clique ou pressione qualquer tecla para entrar" },
  en: { dialog: "Entry screen", logo: "Cardslock logo", enter: "Click or press any key to enter" },
  es: { dialog: "Pantalla de entrada", logo: "Logo de Cardslock", enter: "Haz clic o pulsa cualquier tecla para entrar" },
});

const CARD = "/intro/carta.png";
/** Overshoot leve: as cartas passam um pouco do ponto e assentam. */
const settle = [0.22, 1.05, 0.3, 1] as const;

/** Cartas atrás da central: o ângulo e o deslocamento (em % da própria carta) vêm da arte original do leque. */
const SPREAD = [
  { r: 25.88, x: 42.73, y: 0.22, delay: 1.7, duration: 1.4 },
  { r: 16.06, x: 28.45, y: -1.05, delay: 1.0, duration: 1.3 },
] as const;

const IGNORED_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

/** `onDone` é chamado quando a tela já saiu (depois do fade-out); quem usa só a remove. */
export function Intro({ onDone }: { onDone: () => void }) {
  const t = useT(S);
  const still = !!useReducedMotion();
  const [shown, setShown] = useState(still);
  const [introGone, setIntroGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const enter = useCallback(() => setLeaving(true), []);
  const introRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);

  const reveal = () => {
    setShown(true);
    loopRef.current?.play().catch(() => { /* o poster segue de fundo */ });
  };

  useEffect(() => {
    if (still) return;
    introRef.current?.play().catch(() => {
      setShown(true);
      loopRef.current?.play().catch(() => {});
    });
  }, [still]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (IGNORED_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      enter();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [enter]);

  // fade-out em CSS com prazo fixo: não depende de evento de transição nem de animação do Motion
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(onDone, still ? 0 : 500);
    return () => window.clearTimeout(id);
  }, [leaving, still, onDone]);

  const flash = {
    initial: still ? false : { opacity: 0, scale: 0.92, filter: "brightness(2.4)" },
    animate: shown ? { opacity: 1, scale: 1, filter: "brightness(1)" } : undefined,
    transition: { duration: 1.1, delay: 0.2, ease: easeOut },
  } as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.dialog}
      className={`fixed inset-0 z-100 overflow-hidden bg-zinc-950 transition-opacity duration-500 ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <img src="/intro/poster.jpg" alt="" aria-hidden="true" draggable={false} className="absolute inset-0 size-full object-cover select-none" />
      {!still && (
        <>
          <video
            ref={loopRef}
            src="/intro/loop.mp4"
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            onPlaying={() => setIntroGone(true)}
            className="absolute inset-0 size-full object-cover"
          />
          <video
            ref={introRef}
            src="/intro/intro.mp4"
            muted
            playsInline
            autoPlay
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            onEnded={reveal}
            onError={reveal}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${introGone ? "opacity-0" : "opacity-100"}`}
          />
        </>
      )}
      <div className="absolute inset-0 bg-black/15" />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-4 pb-16">
        <div className="relative aspect-455/350 w-72 max-w-[60vh] drop-shadow-[0_0_6px_rgb(255_236_205/0.55)] sm:w-96 lg:w-md">
          {SPREAD.flatMap(({ r, x, y, delay, duration }) =>
            ([-1, 1] as const).map((side) => (
              <motion.img
                key={`${r}${side}`}
                src={CARD}
                alt=""
                aria-hidden="true"
                draggable={false}
                initial={still ? false : { opacity: 0, x: 0, y: 0, rotate: 0 }}
                animate={shown ? { opacity: 1, x: `${x * side}%`, y: `${y}%`, rotate: r * side } : undefined}
                transition={{ duration, delay, ease: settle, opacity: { duration: 0.01, delay } }}
                className="absolute top-[12.571%] left-[31.209%] w-[38.681%] select-none"
              />
            )),
          )}
          <motion.img
            src={CARD}
            alt={t.logo}
            draggable={false}
            {...flash}
            className="absolute top-[12.571%] left-[31.209%] w-[38.681%] select-none"
          />
        </div>
        <motion.p
          {...flash}
          className="bg-linear-to-b from-dl-text to-emerald-200 bg-clip-text font-display text-4xl font-extrabold tracking-[0.18em] text-transparent uppercase sm:text-6xl lg:text-7xl"
        >
          Cardslock
        </motion.p>
      </div>

      <motion.button
        type="button"
        onClick={enter}
        initial={still ? false : { opacity: 0 }}
        animate={shown ? { opacity: 1 } : undefined}
        transition={{ duration: 0.8, delay: 2.6 }}
        className="absolute inset-0 flex cursor-pointer items-end justify-center pb-[10vh] text-xs font-bold tracking-widest text-zinc-100 uppercase text-shadow-xs focus-visible:outline-2 focus-visible:-outline-offset-8 focus-visible:outline-zinc-100 sm:text-sm"
      >
        <span className="px-4 text-center motion-safe:animate-pulse">{t.enter}</span>
      </motion.button>
    </div>
  );
}
