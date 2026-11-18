// HUD do Cardslock Game: orbe de almas (como as almas que saem dos tropas no Deadlock) e o botão de fim do turno com o contador.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import soulsIcon from "../assets/game/souls.png";
import { setAudio, useAudio } from "../lib/game/sfx";

/** Posição pseudoaleatória estável para as partículas (sem Math.random no render). */
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Orbe de almas: as almas ganhas no começo do turno voam para dentro do orbe (como no Deadlock, quando você
 * coleta as almas de uma tropa), e as gastas saem dele. Sem almas, o orbe apaga.
 */
export function SoulOrb({ n, label, big }: { n: number; label: string; /** Na lateral da tela larga. */ big?: boolean }) {
  const [prev, setPrev] = useState(n);
  const [burst, setBurst] = useState<{ id: number; d: number } | null>(null);
  if (n !== prev) {
    setPrev(n);
    setBurst((b) => ({ id: (b?.id ?? 0) + 1, d: n - prev }));
  }
  const empty = n === 0;
  const count = burst ? Math.min(8, Math.abs(burst.d) * 2 + 1) : 0;
  return (
    <div role="status" aria-label={label} className={`relative grid shrink-0 place-items-center ${big ? "size-28" : "size-16 sm:size-20"}`}>
      {/* brilho que respira enquanto há almas */}
      <motion.span aria-hidden="true" className="absolute inset-0 rounded-full bg-game-soul/35 blur-lg"
        animate={empty ? { opacity: 0 } : { opacity: [0.45, 0.9, 0.45] }} transition={empty ? { duration: 0.3 } : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
      <span aria-hidden="true" className={`absolute inset-1 overflow-hidden rounded-full bg-radial-[at_50%_35%] from-teal-700 via-teal-950 to-zinc-950 shadow-[inset_0_-0.5rem_1rem_rgb(0_0_0/0.7),0_0_0_2px_var(--color-game-soul)] transition-[filter] duration-300 ${empty ? "brightness-50 grayscale" : ""}`}>
        <img src={soulsIcon} alt="" className="absolute inset-0 m-auto h-3/4 opacity-30" draggable={false} />
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.b key={n} aria-hidden="true" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className={`relative font-display leading-none font-extrabold drop-shadow-[0_0_6px_var(--color-game-soul)] ${big ? "text-5xl" : "text-3xl sm:text-4xl"} ${empty ? "text-zinc-400" : "text-white"}`}>
          {n}
        </motion.b>
      </AnimatePresence>
      {/* almas entrando (ganho) ou saindo (gasto) */}
      {burst && Array.from({ length: count }, (_, i) => {
        const a = rnd(burst.id * 31 + i) * Math.PI * 2;
        const r = 40 + rnd(burst.id * 17 + i) * 24;
        const far = { x: Math.cos(a) * r, y: Math.sin(a) * r - 18 };
        const gain = burst.d > 0;
        return (
          <motion.span key={`${burst.id}-${i}`} aria-hidden="true" className="pointer-events-none absolute size-2 rounded-full bg-game-soul shadow-[0_0_8px_2px_var(--color-game-soul)]"
            initial={gain ? { ...far, opacity: 0, scale: 0.6 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={gain ? { x: 0, y: 0, opacity: [0, 1, 0], scale: 1 } : { ...far, y: far.y - 30, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.55, delay: i * 0.04, ease: gain ? "easeIn" : "easeOut" }}
            onAnimationComplete={i === count - 1 ? () => setBurst((b) => (b?.id === burst.id ? null : b)) : undefined} />
        );
      })}
    </div>
  );
}

type EndProps = {
  label: string;
  turn: number;
  total: number;
  /** Revelando: mostra o texto de espera e trava o botão. */
  busy: boolean;
  busyLabel: string;
  /** Nada mais para jogar: o botão pulsa chamando o fim do turno. */
  ready: boolean;
  disabled: boolean;
  describedBy?: string;
  /** Na lateral da tela larga: ocupa a largura da coluna. */
  big?: boolean;
  onClick: () => void;
};

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";

/** Botão de fim do turno com o contador (o número vira como uma placa quando o turno muda). */
export function EndTurnButton({ label, turn, total, busy, busyLabel, ready, disabled, describedBy, big, onClick }: EndProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-describedby={describedBy} aria-label={`${busy ? busyLabel : label} · ${turn}/${total}`}
      className={`group relative flex shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-2xl bg-linear-to-b from-amber-200 to-game-brass p-2 text-dl-black shadow-[0_0.4rem_1rem_rgb(0_0_0/0.6)] transition duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:from-zinc-500 disabled:to-zinc-700 disabled:text-zinc-200 ${big ? "w-full max-w-40 py-4" : "w-20 sm:w-24"} ${focus}`}>
      {ready && !disabled && (
        <motion.span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-2xl ring-4 ring-game-brass"
          animate={{ opacity: [0.2, 0.9, 0.2], scale: [1, 1.04, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
      )}
      <span className={`leading-tight font-extrabold tracking-widest uppercase ${big ? "text-sm" : "text-[10px] sm:text-xs"}`}>{busy ? busyLabel : label}</span>
      <span className={`relative flex items-center overflow-hidden font-display leading-none font-extrabold perspective-[20rem] ${big ? "h-12 text-5xl" : "h-8 text-2xl sm:h-9 sm:text-3xl"}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={turn} initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }} transition={{ duration: 0.28 }}>
            {Math.min(turn, total)}
          </motion.span>
        </AnimatePresence>
        <span className={`opacity-70 ${big ? "text-2xl" : "text-base sm:text-lg"}`}>/{total}</span>
      </span>
    </button>
  );
}

type AudioText = { title: string; sfx: string; music: string; mute: (what: string, on: boolean) => string; volume: (what: string) => string; credit: string };

/** Botão de áudio com o painel de volume: efeitos e música separados, cada um com mudo. */
export function AudioMenu({ t }: { t: AudioText }) {
  const a = useAudio();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", out);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", out); window.removeEventListener("keydown", key); };
  }, [open]);
  const silent = (!a.sfxOn || !a.sfx) && (!a.musicOn || !a.music);
  const row = (name: string, v: number, on: boolean, set: (p: { v?: number; on?: boolean }) => void) => (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => set({ on: !on })} aria-pressed={!on} aria-label={t.mute(name, on)} title={t.mute(name, on)}
        className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-base transition-colors hover:bg-white/10 active:bg-white/20 sm:size-8 ${focus}`}>
        <span aria-hidden="true">{on && v ? (name === t.music ? "🎵" : "🔊") : "🔇"}</span>
      </button>
      <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
        {name}
        <input type="range" min={0} max={100} step={5} value={Math.round(v * 100)} aria-label={t.volume(name)}
          onChange={(e) => set({ v: Number(e.target.value) / 100, on: true })}
          className={`h-6 w-full cursor-pointer accent-game-me disabled:cursor-not-allowed ${on ? "" : "opacity-50"} ${focus}`} />
      </label>
    </div>
  );
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} aria-haspopup="dialog" aria-label={t.title} title={t.title}
        className={`grid size-11 cursor-pointer place-items-center rounded-full text-base transition-colors hover:bg-white/10 active:bg-white/20 sm:size-8 ${focus}`}>
        <span aria-hidden="true">{silent ? "🔇" : "🔊"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label={t.title} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
            className="noir-glass-strong absolute top-full right-0 z-80 flex w-64 flex-col gap-2 rounded-xl p-3 text-left normal-case shadow-2xl">
            {row(t.sfx, a.sfx, a.sfxOn, ({ v, on }) => setAudio({ ...(v !== undefined && { sfx: v }), ...(on !== undefined && { sfxOn: on }) }))}
            {row(t.music, a.music, a.musicOn, ({ v, on }) => setAudio({ ...(v !== undefined && { music: v }), ...(on !== undefined && { musicOn: on }) }))}
            <p className="text-[10px] leading-snug text-zinc-400">
              <a href="https://opengameart.org/content/midnight-on-miller-street" target="_blank" rel="noreferrer" className={`underline-offset-2 hover:text-zinc-200 hover:underline ${focus}`}>{t.credit}</a>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
