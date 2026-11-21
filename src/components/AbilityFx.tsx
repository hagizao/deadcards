// Animações das habilidades do Cardslock Game: um efeito característico de cada herói, saindo da carta que age até as
// cartas que ela mexeu. Tudo numa camada fixa por cima da tela, só com transform e opacity.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { AbilityKey } from "../lib/game/config";

/** Centro e tamanho de uma caixa na tela (carta ou local). */
export type Box = { x: number; y: number; w: number; h: number };

/** O que a animação precisa: a carta que age, as cartas que ela mexeu (`foe` = do outro lado) e o local. */
export type FxScene = { src: Box; dst: { box: Box; foe: boolean }[]; loc: Box | null; me: boolean };

type Base = { delay?: number; d?: number };

/** Raio reto de `a` até `b`: cresce a partir de `a` e some. */
function Beam({ a, b, cls, w = 6, delay = 0, d = 0.3, hold = 0.3 }: Base & { a: Box; b: Box; cls: string; w?: number; hold?: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const total = d + hold + 0.25;
  return (
    <motion.span className={`absolute origin-left rounded-full ${cls}`} style={{ left: a.x, top: a.y - w / 2, width: len, height: w, rotate: ang }}
      initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: [0, 1, 1, 1], opacity: [1, 1, 1, 0] }}
      transition={{ duration: total, delay, times: [0, d / total, (d + hold) / total, 1], ease: "easeOut" }} />
  );
}

/** Algo voando de `a` até `b` (com `arc`, sobe numa parábola), e some ao chegar. */
function Fly({ a, b, children, arc = 0, spin = 0, delay = 0, d = 0.5, size = "text-3xl" }: Base & { a: Box; b: Box; children: ReactNode; arc?: number; spin?: number; size?: string }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - arc;
  const flip = b.x < a.x ? -1 : 1;
  return (
    <motion.span className={`absolute -translate-1/2 leading-none ${size}`} style={{ left: 0, top: 0 }}
      initial={{ x: a.x, y: a.y, opacity: 0, rotate: 0, scaleX: flip }}
      animate={{ x: [a.x, mx, b.x], y: [a.y, my, b.y], opacity: [0, 1, 1, 0], rotate: spin }}
      transition={{ duration: d, delay, ease: "easeInOut", opacity: { duration: d, delay, times: [0, 0.15, 0.85, 1] } }}>
      {children}
    </motion.span>
  );
}

/** Partículas saindo do centro em todas as direções (texto/emoji ou bolinha com a classe `cls`). */
function Burst({ at, n = 8, r = 55, glyph, cls = "size-2 rounded-full bg-white", delay = 0, d = 0.6, inward = false }: Base & { at: Box; n?: number; r?: number; glyph?: string; cls?: string; inward?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
        const dist = r * (0.7 + ((i * 37) % 10) / 30);
        const far = { x: at.x + Math.cos(t) * dist, y: at.y + Math.sin(t) * dist };
        const [from, to] = inward ? [far, at] : [at, far];
        return (
          <motion.span key={i} className={`absolute -translate-1/2 leading-none ${glyph ? "text-lg" : cls}`} style={{ left: 0, top: 0 }}
            initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.5 }}
            animate={{ x: to.x, y: to.y, opacity: [0, 1, 0], scale: inward ? 0.4 : 1.1 }}
            transition={{ duration: d, delay: delay + (i % 3) * 0.03, ease: "easeOut" }}>
            {glyph}
          </motion.span>
        );
      })}
    </>
  );
}

/** Anel que abre (ou fecha, com `implode`) em volta de um ponto. */
function Ring({ at, cls, size = 1, delay = 0, d = 0.5, implode = false }: Base & { at: Box; cls: string; size?: number; implode?: boolean }) {
  const s = Math.max(at.w, 40) * size;
  return (
    <motion.span className={`absolute rounded-full ${cls}`} style={{ left: at.x - s / 2, top: at.y - s / 2, width: s, height: s }}
      initial={{ scale: implode ? 1.8 : 0.3, opacity: 0 }} animate={{ scale: implode ? 0.1 : 1.6, opacity: [0, 1, 0] }}
      transition={{ duration: d, delay, ease: "easeOut" }} />
  );
}

/** Símbolo que surge com um pulo e sobe sumindo. */
function Pop({ at, children, delay = 0, d = 0.9, rise = 30, size = "text-4xl", dy = 0 }: Base & { at: Box; children: ReactNode; rise?: number; size?: string; dy?: number }) {
  return (
    <motion.span className={`absolute -translate-1/2 leading-none drop-shadow-[0_2px_4px_rgb(0_0_0/0.8)] ${size}`} style={{ left: at.x, top: at.y + dy }}
      initial={{ scale: 0.2, opacity: 0, y: 0 }} animate={{ scale: [0.2, 1.25, 1, 1], opacity: [0, 1, 1, 0], y: [0, 0, -rise / 2, -rise] }}
      transition={{ duration: d, delay, times: [0, 0.25, 0.6, 1], ease: "easeOut" }}>
      {children}
    </motion.span>
  );
}

/** Camada pintada por cima da carta (ou do local), que pulsa e some. */
function Over({ box, cls, delay = 0, d = 0.8, wobble = false }: Base & { box: Box; cls: string; wobble?: boolean }) {
  return (
    <motion.span className={`absolute rounded-lg ${cls}`} style={{ left: box.x - box.w / 2, top: box.y - box.h / 2, width: box.w, height: box.h }}
      initial={{ opacity: 0, scale: 1 }}
      animate={{ opacity: [0, 0.9, 0.7, 0], scale: wobble ? [1, 1.06, 0.97, 1.03, 1] : 1 }}
      transition={{ duration: d, delay, ease: "easeInOut" }} />
  );
}

/** Traço a pincel cruzando a carta no ângulo `ang` (corte, corrente, raio, garra). */
function Slash({ box, ang, cls, w = 7, delay = 0, d = 0.5, len = 1.2, dx = 0 }: Base & { box: Box; ang: number; cls: string; w?: number; len?: number; dx?: number }) {
  const L = Math.max(box.w, box.h) * len;
  return (
    <motion.span className={`absolute rounded-full ${cls}`} style={{ left: box.x + dx - L / 2, top: box.y - w / 2, width: L, height: w, rotate: ang }}
      initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
      transition={{ duration: d, delay, times: [0, 0.35, 1], ease: "easeOut" }} />
  );
}

/** Coisas caindo de cima da caixa (moedas, chuva). */
function Rain({ box, glyph, n = 6, delay = 0, d = 0.7 }: Base & { box: Box; glyph: string; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = box.x - box.w / 2 + ((i + 0.5) / n) * box.w;
        return (
          <motion.span key={i} className="absolute -translate-1/2 text-lg leading-none" style={{ left: x, top: 0 }}
            initial={{ y: box.y - box.h / 2, opacity: 0 }} animate={{ y: box.y + box.h / 2, opacity: [0, 1, 1, 0] }}
            transition={{ duration: d, delay: delay + ((i * 7) % 5) * 0.06, ease: "easeIn" }}>
            {glyph}
          </motion.span>
        );
      })}
    </>
  );
}

/** Garras: três riscos paralelos. */
const Claws = ({ box, cls, delay = 0 }: { box: Box; cls: string; delay?: number }) => (
  <>{[-1, 0, 1].map((k) => <Slash key={k} box={box} ang={60} cls={cls} w={5} len={0.9} dx={k * box.w * 0.2} delay={delay + (k + 1) * 0.05} />)}</>
);
/** Um X de dois traços. */
const Cross = ({ box, cls, delay = 0, w = 7 }: { box: Box; cls: string; delay?: number; w?: number }) => (
  <><Slash box={box} ang={45} cls={cls} w={w} delay={delay} /><Slash box={box} ang={-45} cls={cls} w={w} delay={delay + 0.12} /></>
);

const glowRed = "bg-red-200 shadow-[0_0_10px_3px_var(--color-red-500)]";
const brush = (me: boolean) => (me ? "bg-game-me/90 shadow-[0_0_8px_var(--color-game-me)]" : "bg-game-ai/90 shadow-[0_0_8px_var(--color-game-ai)]");

type Recipe = { ms: number; draw: (s: FxScene & { t: Box; foes: Box[]; allies: Box[] }) => ReactNode };

/** A animação de cada habilidade (heróis e genéricas). */
const FX: Partial<Record<AbilityKey, Recipe>> = {
  "Abrams": { ms: 1000, draw: ({ src, t }) => <>
    <Beam a={src} b={t} cls="bg-orange-300/80 shadow-[0_0_12px_var(--color-orange-500)]" w={14} d={0.18} hold={0.1} />
    <Ring at={t} cls="ring-4 ring-stone-300/80" delay={0.2} />
    <Burst at={t} cls="size-3 rounded-full bg-stone-300/70 blur-[1px]" n={10} r={70} delay={0.2} />
    <Slash box={t} ang={-70} cls="bg-zinc-900 ring-1 ring-stone-300" w={4} len={0.8} delay={0.25} />
  </> },
  "Apollo": { ms: 900, draw: ({ src, t }) => <>
    <motion.span className="absolute rounded-full border-6 border-sky-200 border-t-transparent border-l-transparent shadow-[0_0_14px_var(--color-sky-400)]"
      style={{ left: src.x - src.w * 0.6, top: src.y - src.w * 0.6, width: src.w * 1.2, height: src.w * 1.2 }}
      initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 200, opacity: [0, 1, 0] }} transition={{ duration: 0.5, ease: "easeOut" }} />
    <Fly a={src} b={t} delay={0.3} d={0.35} size="text-2xl">✦</Fly>
    <Burst at={t} cls="size-1.5 rounded-full bg-sky-200" delay={0.62} n={8} r={40} d={0.4} />
  </> },
  "Baba": { ms: 1100, draw: ({ t }) => <>
    <Burst at={t} glyph="🪶" n={10} r={80} d={0.9} />
    <Pop at={t} delay={0.25}>🕊️</Pop>
  </> },
  "Bebop": { ms: 1000, draw: ({ src, t, loc }) => <>
    <Beam a={src} b={t === src && loc ? loc : t} cls="bg-[repeating-linear-gradient(90deg,var(--color-zinc-300)_0_8px,transparent_8px_12px)]" w={6} d={0.3} hold={0.35} />
    <Fly a={src} b={t === src && loc ? loc : t} d={0.3} size="text-3xl">🪝</Fly>
  </> },
  "Billy": { ms: 1000, draw: ({ t }) => <>
    <Cross box={t} cls="bg-[repeating-linear-gradient(90deg,var(--color-zinc-300)_0_6px,var(--color-zinc-600)_6px_9px)]" w={8} />
    <Pop at={t} delay={0.35}>🔒</Pop>
  </> },
  "Calico": { ms: 1100, draw: ({ src, foes }) => <>
    <Over box={src} cls="bg-violet-900/70 blur-sm" d={0.9} />
    <Pop at={src} size="text-3xl">🐈‍⬛</Pop>
    {foes.map((b, i) => <Claws key={i} box={b} cls="bg-rose-300 shadow-[0_0_6px_var(--color-rose-500)]" delay={0.35 + i * 0.08} />)}
  </> },
  "Celeste": { ms: 1100, draw: ({ src, foes }) => <>
    {foes[0] && <Beam a={src} b={foes[0]} cls="bg-amber-100 shadow-[0_0_14px_4px_var(--color-amber-300)]" w={7} d={0.2} />}
    {foes[0] && foes[1] && <Beam a={foes[0]} b={foes[1]} cls="bg-amber-100 shadow-[0_0_10px_3px_var(--color-amber-300)]" w={4} delay={0.35} d={0.15} />}
    {foes.slice(0, 2).map((b, i) => <Burst key={i} at={b} cls="size-1.5 rounded-full bg-amber-200" n={10} r={45} delay={0.2 + i * 0.35} d={0.45} />)}
  </> },
  "Deadman Danny": { ms: 1200, draw: ({ src, foes, t }) => <>
    {(foes.length ? foes : [t]).map((b, i) => (
      <span key={i}>
        <Fly a={src} b={b} arc={120} spin={160} delay={i * 0.12} d={0.55} size="text-2xl">🚀</Fly>
        <Ring at={b} cls="bg-orange-500/40 ring-4 ring-orange-400" delay={0.5 + i * 0.12} size={0.8} />
        <Burst at={b} glyph="🔥" n={5} r={35} delay={0.52 + i * 0.12} />
      </span>
    ))}
  </> },
  "Drifter": { ms: 1100, draw: ({ src, t }) => <>
    <Over box={t} cls="bg-black/70 shadow-[0_0_30px_20px_rgb(0_0_0/0.7)]" d={1} />
    <Claws box={t} cls="bg-red-500 shadow-[0_0_8px_var(--color-red-600)]" delay={0.2} />
    <Fly a={t} b={src} delay={0.55} d={0.45} size="text-xl">🩸</Fly>
  </> },
  "Dynamo": { ms: 1200, draw: ({ src, loc, foes }) => <>
    <Ring at={loc ?? src} cls="bg-radial from-black via-violet-950/80 to-violet-500/40 ring-2 ring-violet-400" size={1.6} implode d={1} />
    <Burst at={loc ?? src} cls="size-2 rounded-full bg-violet-300" n={14} r={140} inward d={0.8} />
    {foes.map((b, i) => <Fly key={i} a={b} b={loc ?? src} d={0.7} delay={0.1} size="text-xl">🌀</Fly>)}
  </> },
  "Graves": { ms: 1200, draw: ({ src, dst }) => <>
    <Pop at={src} size="text-5xl" rise={10}>🪦</Pop>
    <Burst at={src} cls="size-2.5 rounded-full bg-stone-400/70 blur-[1px]" n={8} r={45} />
    {dst.map((x, i) => <Pop key={i} at={x.box} delay={0.4} size="text-3xl">🧟</Pop>)}
  </> },
  "Grey Talon": { ms: 1100, draw: ({ src, t }) => <>
    <Fly a={src} b={t} arc={140} d={0.65} size="text-4xl">🦉</Fly>
    <Burst at={t} glyph="🪶" n={7} r={50} delay={0.6} />
  </> },
  "Haze": { ms: 1100, draw: ({ src, t }) => <>
    <Fly a={src} b={t} spin={720} d={0.35} size="text-3xl">🗡️</Fly>
    <Over box={t} cls="bg-sky-300/30 blur-[2px]" delay={0.35} d={0.7} />
    <Pop at={t} delay={0.4} size="text-3xl">💤</Pop>
  </> },
  "Holliday": { ms: 1100, draw: ({ src, dst }) => <>
    <Ring at={src} cls="ring-4 ring-emerald-300 shadow-[0_0_12px_var(--color-emerald-400)]" />
    {dst.map((x, i) => <span key={i}><Ring at={x.box} cls="ring-4 ring-emerald-300" delay={0.3} /><Burst at={x.box} cls="size-1.5 rounded-full bg-emerald-200" delay={0.3} n={8} r={40} /></span>)}
    <Pop at={src} size="text-3xl" delay={0.1}>🤠</Pop>
  </> },
  "Infernus": { ms: 1200, draw: ({ src, t }) => <>
    <Beam a={src} b={t} cls="bg-orange-500 shadow-[0_0_10px_2px_var(--color-red-500)]" w={4} d={0.3} hold={0.5} />
    <Over box={t} cls="bg-linear-to-t from-orange-600/80 via-red-600/40 to-transparent" delay={0.3} d={0.8} />
    <Burst at={t} glyph="🔥" n={6} r={40} delay={0.35} d={0.7} />
  </> },
  "Ivy": { ms: 1100, draw: ({ src, t }) => <>
    <Beam a={src} b={t} cls="bg-[repeating-linear-gradient(90deg,var(--color-emerald-500)_0_10px,var(--color-lime-300)_10px_14px)] shadow-[0_0_8px_var(--color-emerald-500)]" w={6} d={0.45} hold={0.4} />
    <Burst at={src} glyph="🍃" n={5} r={40} delay={0.1} />
    <Burst at={t} glyph="🍃" n={5} r={40} delay={0.45} />
  </> },
  "Kelvin": { ms: 1100, draw: ({ src, allies, t }) => <>
    <Ring at={src} cls="ring-4 ring-cyan-200 shadow-[0_0_14px_var(--color-cyan-300)]" />
    {(allies.length ? allies : [t]).map((b, i) => <span key={i}><Over box={b} cls="bg-cyan-200/40 ring-2 ring-cyan-100" delay={0.15} d={0.9} /><Burst at={b} glyph="❄️" n={5} r={40} delay={0.2} /></span>)}
  </> },
  "Lady Geist": { ms: 1100, draw: ({ src, t }) => <>
    <Fly a={src} b={t} arc={-40} d={0.6} size="text-2xl"><span className="block size-5 rounded-full bg-red-400 shadow-[0_0_14px_4px_var(--color-red-500)]" /></Fly>
    <Fly a={t} b={src} arc={40} d={0.6} size="text-2xl"><span className="block size-5 rounded-full bg-sky-300 shadow-[0_0_14px_4px_var(--color-sky-500)]" /></Fly>
    <Ring at={src} cls="ring-2 ring-red-300" delay={0.55} /><Ring at={t} cls="ring-2 ring-sky-300" delay={0.55} />
  </> },
  "Lash": { ms: 1100, draw: ({ src, foes, t }) => <>
    {(foes.length ? foes : [t]).map((b, i) => (
      <span key={i}>
        <Beam a={src} b={b} cls="bg-amber-200 shadow-[0_0_6px_var(--color-amber-400)]" w={3} d={0.2} hold={0.1} delay={i * 0.1} />
        <Ring at={b} cls="ring-4 ring-amber-200/90" delay={0.35 + i * 0.1} size={1.2} />
        <Burst at={b} cls="size-3 rounded-full bg-stone-300/70 blur-[1px]" n={8} r={60} delay={0.35 + i * 0.1} />
      </span>
    ))}
  </> },
  "McGinnis": { ms: 1100, draw: ({ src, t }) => <>
    <Pop at={src} size="text-3xl">🔧</Pop>
    <Pop at={t} size="text-4xl" delay={0.3} rise={6}>⚙️</Pop>
    <Burst at={t} cls="size-1.5 rounded-full bg-yellow-200" n={10} r={50} delay={0.45} d={0.4} />
  </> },
  "Mina": { ms: 1100, draw: ({ src, t }) => <>
    <Fly a={src} b={t} arc={60} d={0.45} size="text-3xl">🦇</Fly>
    <Beam a={t} b={src} cls="bg-red-500/90 shadow-[0_0_8px_var(--color-red-600)]" w={3} delay={0.45} d={0.35} hold={0.2} />
  </> },
  "Mirage": { ms: 1100, draw: ({ src }) => <>
    <Over box={src} cls="bg-amber-300/40 blur-[3px]" d={1} wobble />
    <Burst at={src} cls="size-2 rounded-full bg-amber-200/80" n={14} r={70} d={0.9} />
  </> },
  "Mo & Krill": { ms: 1100, draw: ({ src }) => <>
    <Ring at={src} cls="ring-4 ring-amber-800" />
    <Burst at={src} cls="size-3 rounded-full bg-amber-900" n={12} r={60} d={0.7} />
    <Pop at={src} delay={0.3} size="text-3xl">⛏️</Pop>
  </> },
  "Nurse Harrow": { ms: 1100, draw: ({ src, foes, allies }) => {
    const from = foes[0] ?? src, to = allies[0] ?? src;
    return <>
      <Beam a={from} b={to} cls="bg-rose-500 shadow-[0_0_8px_var(--color-rose-600)]" w={4} d={0.4} hold={0.3} />
      <Pop at={to} delay={0.4}>✚</Pop>
    </>;
  } },
  "Paige": { ms: 1200, draw: ({ src, loc, allies }) => {
    const L = loc ?? src;
    const a = { ...L, x: L.x - L.w / 2 }, b = { ...L, x: L.x + L.w / 2 };
    return <>
      {[0, 1, 2].map((i) => <Fly key={i} a={{ ...a, y: L.y + (i - 1) * 30 }} b={{ ...b, y: L.y + (i - 1) * 30 }} delay={i * 0.12} d={0.7} size="text-3xl">🐎</Fly>)}
      {allies.map((x, i) => <Ring key={i} at={x} cls="ring-4 ring-amber-300" delay={0.5} />)}
    </>;
  } },
  "Paradox": { ms: 1100, draw: ({ src, t }) => <>
    <Pop at={src} size="text-3xl">⏳</Pop>
    <Fly a={src} b={t} arc={30} d={0.5} delay={0.2}><span className="block size-6 rounded-md bg-zinc-200/60 blur-[1px]" /></Fly>
    <Fly a={t} b={src} arc={-30} d={0.5} delay={0.2}><span className="block size-6 rounded-md bg-zinc-200/60 blur-[1px]" /></Fly>
  </> },
  "Pocket": { ms: 1200, draw: ({ foes, t }) => <>
    {(foes.length ? foes : [t]).map((b, i) => <span key={i}><Over box={b} cls="bg-violet-500/40 blur-[2px]" d={1} /><Rain box={b} glyph="🪙" n={4} delay={0.2} /></span>)}
  </> },
  "Rat King": { ms: 1100, draw: ({ src }) => <>
    {[0, 1, 2, 3].map((i) => <Fly key={i} a={src} b={{ ...src, x: src.x + (i - 1.5) * 50, y: window.innerHeight - 30 }} delay={i * 0.08} d={0.7} size="text-2xl">🐀</Fly>)}
  </> },
  "Rem": { ms: 1200, draw: ({ src, foes }) => <>
    <Pop at={src} size="text-3xl">🏮</Pop>
    {foes.map((b, i) => <span key={i}><Burst at={b} cls="size-1.5 rounded-full bg-cyan-100" n={8} r={40} delay={0.2} /><Pop at={b} delay={0.35} size="text-3xl">💤</Pop></span>)}
  </> },
  "Seven": { ms: 1200, draw: ({ foes, loc, t }) => <>
    <Over box={loc ?? t} cls="bg-linear-to-b from-zinc-900/90 via-zinc-800/40 to-transparent" d={1.1} />
    {(foes.length ? foes : [t]).map((b, i) => <span key={i}><Slash box={b} ang={80} cls="bg-yellow-100 shadow-[0_0_12px_4px_var(--color-yellow-300)]" w={4} delay={0.3 + i * 0.1} d={0.3} /><Slash box={b} ang={100} cls="bg-yellow-100 shadow-[0_0_8px_var(--color-yellow-300)]" w={3} delay={0.42 + i * 0.1} d={0.3} /></span>)}
  </> },
  "Shiv": { ms: 900, draw: ({ t }) => <>
    <Slash box={t} ang={-35} cls="bg-zinc-100 shadow-[0_0_10px_var(--color-red-500)]" w={6} d={0.35} />
    <Burst at={t} cls="size-2 rounded-full bg-red-600" n={8} r={45} delay={0.15} d={0.5} />
  </> },
  "Silver": { ms: 1200, draw: ({ src }) => <>
    <Pop at={src} size="text-6xl" rise={0} d={1.1}>🌕</Pop>
    <Claws box={src} cls="bg-zinc-200 shadow-[0_0_6px_var(--color-zinc-400)]" delay={0.4} />
    <Pop at={src} delay={0.5} size="text-3xl">🐺</Pop>
  </> },
  "Sinclair": { ms: 1100, draw: ({ src }) => <>
    <Pop at={src} size="text-4xl">🎩</Pop>
    <Burst at={src} glyph="✨" n={7} r={55} delay={0.25} />
    <Pop at={src} delay={0.35} size="text-3xl" rise={60}>🕊️</Pop>
  </> },
  "Solomon": { ms: 1000, draw: ({ src }) => <>
    <motion.span className="absolute -translate-1/2 text-5xl leading-none" style={{ left: src.x, top: src.y }}
      initial={{ y: -120, opacity: 0 }} animate={{ y: [-120, 0, 0], opacity: [0, 1, 0] }} transition={{ duration: 0.9, times: [0, 0.35, 1], ease: "easeIn" }}>♛</motion.span>
    <Ring at={src} cls="ring-4 ring-amber-300" delay={0.3} />
  </> },
  "The Doorman": { ms: 1100, draw: ({ src, dst }) => <>
    <Pop at={src} size="text-4xl">🚪</Pop>
    <Ring at={src} cls="bg-amber-200/30 ring-2 ring-amber-200" delay={0.2} />
    {dst.map((x, i) => <Pop key={i} at={x.box} delay={0.35} size="text-3xl">🚪</Pop>)}
  </> },
  "Venator": { ms: 1000, draw: ({ src, t }) => <>
    <Pop at={t === src ? { ...src, y: src.y + src.h * 0.45 } : t} size="text-4xl" rise={0}>🪤</Pop>
    <Burst at={t} cls="size-1.5 rounded-full bg-zinc-300" n={6} r={35} delay={0.35} />
  </> },
  "Victor": { ms: 1100, draw: ({ src, dst }) => <>
    <Ring at={src} cls="ring-4 ring-yellow-200 shadow-[0_0_16px_var(--color-yellow-300)]" size={2.2} d={0.6} />
    {dst.map((x, i) => <Burst key={i} at={x.box} glyph="⚡" n={4} r={30} delay={0.25} />)}
  </> },
  "Vindicta": { ms: 1000, draw: ({ src, t, foes }) => <>
    <Beam a={src} b={t} cls={glowRed} w={2} d={0.25} hold={0.35} />
    <Ring at={t} cls="bg-white/70" delay={0.55} d={0.25} size={0.6} />
    <Pop at={t} delay={0.55} rise={0} size="text-xl"><span className="block size-3 rounded-full bg-black ring-2 ring-red-500/80" /></Pop>
    {!foes.length && <Fly a={{ ...src, y: src.y - 200 }} b={src} d={0.6} delay={0.2} size="text-3xl">🐦‍⬛</Fly>}
  </> },
  "Violet": { ms: 1100, draw: ({ src }) => <>
    {["bg-rose-400/80", "bg-amber-300/80", "bg-sky-400/80", "bg-emerald-400/80"].map((c, i) => <Slash key={c} box={src} ang={-20 + i * 14} cls={c} w={9} len={0.8} delay={i * 0.12} d={0.5} />)}
    <Burst at={src} cls="size-2 rounded-full bg-fuchsia-300" n={8} r={50} delay={0.4} />
  </> },
  "Viscous": { ms: 1100, draw: ({ src, allies }) => <>
    {(allies.length ? allies : [src]).map((b, i) => <Over key={i} box={b} cls="bg-lime-400/35 ring-4 ring-lime-300/70" d={1} wobble />)}
    <Burst at={src} cls="size-2.5 rounded-full bg-lime-300/80" n={8} r={45} delay={0.2} />
  </> },
  "Vyper": { ms: 1100, draw: ({ src, t }) => <>
    <Pop at={src} size="text-3xl">🐍</Pop>
    <Over box={t} cls="bg-stone-400/60" delay={0.3} d={0.8} />
    <Slash box={t} ang={-60} cls="bg-zinc-800" w={3} len={0.7} delay={0.45} />
    <Slash box={t} ang={30} cls="bg-zinc-800" w={2} len={0.5} delay={0.5} />
  </> },
  "Warden": { ms: 1000, draw: ({ src }) => <>
    <Ring at={src} cls="ring-4 ring-sky-300 shadow-[0_0_14px_var(--color-sky-400)]" />
    <Pop at={src} delay={0.15}>🛡️</Pop>
  </> },
  "Wraith": { ms: 1200, draw: ({ t }) => <>
    <Over box={t} cls="bg-violet-500/40 shadow-[0_0_24px_8px_var(--color-violet-500)]" d={1.1} />
    {[0, 1, 2].map((i) => (
      <motion.span key={i} className="absolute -translate-1/2 text-2xl leading-none" style={{ left: t.x, top: t.y }}
        initial={{ rotate: i * 120, opacity: 0 }} animate={{ rotate: i * 120 + 360, opacity: [0, 1, 0] }} transition={{ duration: 1, ease: "linear" }}>
        <span className="block" style={{ transform: `translateX(${t.w * 0.7}px)` }}>🃏</span>
      </motion.span>
    ))}
  </> },
  "Yamato": { ms: 1000, draw: ({ src, loc }) => <>
    <Over box={src} cls="bg-black/60 shadow-[0_0_30px_10px_var(--color-red-700)]" d={0.9} />
    <Slash box={loc ?? src} ang={-12} cls="bg-zinc-100 shadow-[0_0_10px_var(--color-red-500)]" w={5} len={1.1} delay={0.25} d={0.4} />
  </> },
  hit: { ms: 800, draw: ({ src, t, me }) => <>
    <Beam a={src} b={t} cls={brush(me)} w={6} d={0.25} hold={0.2} />
    <Ring at={t} cls="ring-4 ring-red-400/80" delay={0.3} size={0.8} />
  </> },
  self: { ms: 800, draw: ({ src }) => <><Ring at={src} cls="ring-4 ring-emerald-300" /><Pop at={src} size="text-3xl">⬆</Pop></> },
  team: { ms: 800, draw: ({ src, allies }) => <>{(allies.length ? allies : [src]).map((b, i) => <Ring key={i} at={b} cls="ring-4 ring-emerald-300" delay={i * 0.06} />)}</> },
  aura: { ms: 800, draw: ({ src, allies }) => <>{(allies.length ? allies : [src]).map((b, i) => <Ring key={i} at={b} cls="ring-2 ring-emerald-200 bg-emerald-300/15" delay={i * 0.06} />)}</> },
  draw: { ms: 800, draw: ({ src }) => <Fly a={src} b={{ ...src, y: window.innerHeight - 30 }} d={0.6} size="text-3xl">🂠</Fly> },
};

/**
 * Uma animação de habilidade, desenhada na camada fixa; chama `onDone` quando termina. Com movimento reduzido, só um
 * anel curto nos alvos.
 */
export function AbilityFx({ ab, scene, onDone }: { ab: AbilityKey; scene: FxScene; onDone?: () => void }) {
  const still = useReducedMotion();
  const r = FX[ab];
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const id = setTimeout(() => done.current?.(), r ? (still ? 400 : r.ms + 200) : 0);
    return () => clearTimeout(id);
  }, [r, still]);
  if (!r) return null;
  const foes = scene.dst.filter((x) => x.foe).map((x) => x.box);
  const allies = scene.dst.filter((x) => !x.foe).map((x) => x.box);
  const t = foes[0] ?? scene.dst[0]?.box ?? scene.src;
  if (still) return <>{(scene.dst.length ? scene.dst.map((x) => x.box) : [scene.src]).map((b, i) => <Ring key={i} at={b} cls="ring-2 ring-dl-text/70" d={0.3} />)}</>;
  return <>{r.draw({ ...scene, t, foes, allies })}</>;
}

/** Camada fixa por cima de tudo, sem receber cliques. */
export function FxLayer({ children }: { children: ReactNode }) {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-90 overflow-hidden">{children}</div>;
}
