// Peças das coreografias das habilidades (ver choreo.ts): tipos da cena, movimento por quadros-chave, partículas,
// cabos que seguem as cartas e os desenhos de cada herói. Tudo em elementos soltos numa camada fixa por cima da
// tela, animados só com transform e opacity.
import type { HeardEv } from "./engine";

/** Centro e tamanho de uma caixa na tela. */
export type Box = { x: number; y: number; w: number; h: number };

/**
 * Uma carta na cena: o dublê (`g`, nulo se a carta não está na tela) sai de `from` e termina em `to`. `next` é a
 * face nova da carta, quando a cena mostra a troca (a Baba virando a carta em pombo).
 */
export type Actor = { id: number; g: HTMLElement | null; from: Box; to: Box; foe: boolean; gone: boolean; next: Element | null };

export type Stage = {
  src: Actor; dst: Actor[];
  /** A própria carta mudou (a Vindicta que cai, o Drifter que cresce). */ self: boolean;
  ev?: HeardEv;
  /** O local onde a carta age e, na Doorman, o outro lado da porta. */ lane: Box | null; alt: Box | null;
  layer: HTMLElement;
  /** Tremor da mesa, de 1 (leve) a 3 (forte). */ shake: (power: 1 | 2 | 3) => void;
};

/**
 * Uma coreografia: `ms` diz quanto a cena dura (pelo número de alvos, se a carta mudou e o momento), `hit` quando
 * o golpe acerta (o X das que morrem aparece aí) e `kills` se a própria cena mostra a morte (a Shiv corta a carta).
 */
export type Recipe = {
  ms: (n: number, self: boolean, ev?: HeardEv) => number;
  hit?: (n: number, self: boolean, ev?: HeardEv) => number;
  kills?: boolean;
  run: (s: Stage) => void;
};

export const ease = { out: "cubic-bezier(.2,.8,.2,1)", in: "cubic-bezier(.6,0,.9,.4)", io: "cubic-bezier(.65,0,.35,1)", lin: "linear" };
export const tf = (dx = 0, dy = 0, r = 0, sx = 1, sy = sx) => `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${sx}, ${sy})`;

/**
 * Anima por quadros-chave; `easing` vale para cada trecho (o quadro pode ter o seu), a linha do tempo é linear.
 * A próxima animação do mesmo elemento deve ser criada depois (com `later`), para ficar por cima da anterior.
 */
export const move = (el: Element | null | undefined, kf: Keyframe[], ms: number, delay = 0, easing = ease.out) =>
  el?.animate(kf.map((k) => ({ easing, ...k })), { duration: ms, delay, fill: "both" });
export const later = (f: () => void, ms: number) => { setTimeout(f, ms); };
export const off = (a: Box, b: Box) => {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { dx, dy, len, ang: Math.atan2(dy, dx), ux: dx / len, uy: dy / len };
};
export const mix = (a: Box, b: Box, t: number): Box => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w, h: a.h });
export const ease3 = (t: number) => 1 - (1 - t) ** 3;
export const pt = (x: number, y: number, w = 40, h = w): Box => ({ x, y, w, h });

/** Elemento solto na camada, centrado em `at`, que some sozinho depois de `life` ms. */
export function spawn(s: Stage, cls: string, at: Box, w: number, life: number, h = w) {
  const el = document.createElement("div");
  el.className = `absolute ${cls}`;
  Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${at.x - w / 2}px`, top: `${at.y - h / 2}px` });
  s.layer.appendChild(el);
  later(() => el.remove(), life);
  return el;
}

/** Desenhos dos heróis (SVG no traço do jogo), sempre com a cor do herói. */
const ICON = {
  // garra do braço do Bebop: aço escuro com o laranja e amarelo do robô
  claw: `<circle cx="12" cy="6" r="4.5" fill="#f59e0b" stroke="#292524" stroke-width="1.6"/><circle cx="12" cy="6" r="1.6" fill="#292524"/><path d="M12 10c-5 1-7.5 6-5.5 12M12 10c5 1 7.5 6 5.5 12M12 11v10" fill="none" stroke="#292524" stroke-width="3.4" stroke-linecap="round"/><path d="M12 10c-5 1-7.5 6-5.5 12M12 10c5 1 7.5 6 5.5 12M12 11v10" fill="none" stroke="#fbbf24" stroke-width="1.3" stroke-linecap="round"/>`,
  feather: `<path d="M21 2C11 3 5 10 3.5 20l1.5 2C7 13 13 7 21 2z" fill="#18181b" stroke="#52525b" stroke-width="1"/><path d="M5 21C9 14 14 8 20 3" stroke="#3f3f46" stroke-width="0.8" fill="none"/>`,
  featherSky: `<path d="M21 2C11 3 5 10 3.5 20l1.5 2C7 13 13 7 21 2z" fill="#a5f3fc" stroke="#22d3ee" stroke-width="1"/>`,
  featherGrey: `<path d="M21 2C11 3 5 10 3.5 20l1.5 2C7 13 13 7 21 2z" fill="#d4d4d8" stroke="#71717a" stroke-width="1"/>`,
  sword: `<path d="M12 1l2.2 14h-4.4z" fill="#e5e7eb" stroke="#94a3b8" stroke-width="0.8"/><rect x="6.5" y="15" width="11" height="2" rx="1" fill="#eab308"/><rect x="11" y="17" width="2" height="5" fill="#78350f"/>`,
  crescent: `<path d="M3 16C6 6 18 6 21 16 17 10 7 10 3 16z" fill="#e0f2fe" stroke="#7dd3fc" stroke-width="1"/>`,
  lock: `<path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="#a1a1aa" stroke-width="2.4"/><rect x="5" y="11" width="14" height="10" rx="2" fill="#71717a" stroke="#27272a" stroke-width="1.5"/><circle cx="12" cy="16" r="1.6" fill="#18181b"/>`,
  ring: `<circle cx="12" cy="12" r="9.5" fill="none" stroke="#71717a" stroke-width="2.6" stroke-dasharray="4 2.5"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="#d4d4d8" stroke-width="0.8" stroke-dasharray="4 2.5"/>`,
  rocket: `<path d="M12 1.5c3.2 3 4.2 7 4.2 11l-4.2 3.5-4.2-3.5c0-4 1-8 4.2-11z" fill="#d4d4d8" stroke="#3f3f46" stroke-width="1"/><path d="M7.8 12.5l-3 4.5h3.4M16.2 12.5l3 4.5h-3.4" fill="#dc2626"/><circle cx="12" cy="8" r="1.6" fill="#0ea5e9"/>`,
  owl: `<path d="M12 5c-4.5 0-7.5 3.4-7.5 8 0 5 3.4 9 7.5 9s7.5-4 7.5-9c0-4.6-3-8-7.5-8z" fill="#67e8f9" fill-opacity="0.75" stroke="#cffafe" stroke-width="1"/><path d="M5.5 7L4 2.5 8.5 5.5M18.5 7L20 2.5 15.5 5.5" fill="#67e8f9"/><circle cx="9" cy="11" r="2.3" fill="#ecfeff"/><circle cx="15" cy="11" r="2.3" fill="#ecfeff"/><circle cx="9" cy="11" r="1" fill="#083344"/><circle cx="15" cy="11" r="1" fill="#083344"/><path d="M11 13.5l1 2 1-2z" fill="#fbbf24"/>`,
  dagger: `<path d="M12 1l2 13h-4z" fill="#ddd6fe" stroke="#7c3aed" stroke-width="0.8"/><rect x="8" y="14" width="8" height="1.8" rx="0.9" fill="#4c1d95"/><rect x="11" y="15.8" width="2" height="6" rx="1" fill="#1e1b4b"/>`,
  pad: `<rect x="4" y="18.5" width="16" height="3" rx="1" fill="#57534e" stroke="#1c1917" stroke-width="0.8"/><path d="M7 18.5l10-2.2-10-2.2 10-2.2" fill="none" stroke="#d4d4d8" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="12" cy="10" rx="9.5" ry="2.8" fill="#f59e0b" stroke="#78350f" stroke-width="1.2"/><ellipse cx="12" cy="9.4" rx="5" ry="1" fill="#fcd34d"/>`,
  leaf: `<path d="M3 21C3 10 10 3 21 3c0 11-7 18-18 18z" fill="#22c55e" stroke="#14532d" stroke-width="1"/><path d="M3 21L15 9" stroke="#14532d" stroke-width="1"/>`,
  flower: `<g fill="#f472b6" stroke="#9d174d" stroke-width="0.7"><circle cx="12" cy="6" r="4"/><circle cx="17.7" cy="10.2" r="4"/><circle cx="15.5" cy="17" r="4"/><circle cx="8.5" cy="17" r="4"/><circle cx="6.3" cy="10.2" r="4"/></g><circle cx="12" cy="12" r="3" fill="#fde047"/>`,
  toolbox: `<path d="M8 8V5h8v3" fill="none" stroke="#3f3f46" stroke-width="2"/><rect x="2.5" y="8" width="19" height="12" rx="1.5" fill="#dc2626" stroke="#450a0a" stroke-width="1.4"/><rect x="2.5" y="12" width="19" height="2" fill="#7f1d1d"/><rect x="10.5" y="11.5" width="3" height="3" fill="#d4d4d8"/>`,
  bat: `<path d="M12 8c-.8 0-1.4.6-1.6 1.3L9.6 8l-.4 2.2C7.4 9 4.6 8.4 1 9.5c2 1 3 2.6 3.3 4.6 1.4-.9 3-.9 4.2.1.3-1.1 1.4-1.8 2.5-1.6.3.9.6 1.8 1 2.6.4-.8.7-1.7 1-2.6 1.1-.2 2.2.5 2.5 1.6 1.2-1 2.8-1 4.2-.1.3-2 1.3-3.6 3.3-4.6-3.6-1.1-6.4-.5-8.2.7L14.4 8l-.8 1.3C13.4 8.6 12.8 8 12 8z" fill="#1c0a0a" stroke="#dc2626" stroke-width="0.9"/><circle cx="11.3" cy="10.2" r="0.45" fill="#f87171"/><circle cx="12.7" cy="10.2" r="0.45" fill="#f87171"/>`,
  coin: `<circle cx="12" cy="12" r="9" fill="#facc15" stroke="#a16207" stroke-width="1.6"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#a16207" stroke-width="1.2"/>`,
  case: `<path d="M8.5 7V4.5h7V7" fill="none" stroke="#3b0764" stroke-width="2"/><rect x="2" y="7" width="20" height="13" rx="2" fill="#6b21a8" stroke="#3b0764" stroke-width="1.5"/><rect x="10" y="11" width="4" height="3" rx="0.6" fill="#facc15"/>`,
  rat: `<path d="M3 15c0-4 4-7 9-7 4 0 7 2 8.5 5l1.5 1-1.5 1c-1 2-4 3-8 3-6 0-9.5-1-9.5-3z" fill="#78716c" stroke="#292524" stroke-width="1"/><circle cx="17" cy="10" r="2.2" fill="#a8a29e" stroke="#292524" stroke-width="0.8"/><circle cx="19" cy="13" r="0.8" fill="#18181b"/><path d="M3 15C1 15 0 18 2 20" fill="none" stroke="#a8a29e" stroke-width="1.2"/>`,
  lantern: `<path d="M9 3h6M12 3v2" stroke="#78350f" stroke-width="1.6"/><path d="M7 7h10l-1 12H8z" fill="#fde68a" fill-opacity="0.9" stroke="#78350f" stroke-width="1.4"/><circle cx="12" cy="13" r="2.6" fill="#f59e0b"/>`,
  bolt: `<path d="M14 0L4 13h6l-3 11 13-15h-7l3-9z" fill="#fef9c3" stroke="#facc15" stroke-width="1"/>`,
  moon: `<circle cx="12" cy="12" r="10" fill="#f5f5f4" stroke="#d6d3d1" stroke-width="1"/><circle cx="8.5" cy="9" r="2" fill="#e7e5e4"/><circle cx="15" cy="14" r="2.8" fill="#e7e5e4"/>`,
  hat: `<rect x="6" y="3" width="12" height="13" rx="1" fill="#18181b" stroke="#52525b" stroke-width="1"/><rect x="6" y="12" width="12" height="2.4" fill="#a21caf"/><ellipse cx="12" cy="17" rx="10" ry="2.6" fill="#27272a" stroke="#52525b" stroke-width="1"/>`,
  rabbit: `<path d="M9 9C7 4 7 1 8.5 1S11 5 11 9M13 9c0-4 1-8 2.5-8S17 4 15 9" fill="#fafafa" stroke="#a1a1aa" stroke-width="0.8"/><circle cx="12" cy="14" r="5.5" fill="#fafafa" stroke="#a1a1aa" stroke-width="0.8"/><circle cx="10" cy="13" r="0.8" fill="#18181b"/><circle cx="14" cy="13" r="0.8" fill="#18181b"/><circle cx="12" cy="15.5" r="0.8" fill="#f472b6"/>`,
  pawn: `<circle cx="12" cy="6" r="3.4" fill="#fafafa" stroke="#27272a" stroke-width="1.2"/><path d="M9 10.5h6l1.4 7.5H7.6z" fill="#fafafa" stroke="#27272a" stroke-width="1.2"/><rect x="5.5" y="18" width="13" height="3.5" rx="1" fill="#fafafa" stroke="#27272a" stroke-width="1.2"/>`,
  king: `<path d="M12 1v5M9.5 3.5h5" stroke="#facc15" stroke-width="1.8"/><path d="M7 8h10l-1.5 10h-7z" fill="#facc15" stroke="#713f12" stroke-width="1.2"/><rect x="5" y="18" width="14" height="3.5" rx="1" fill="#facc15" stroke="#713f12" stroke-width="1.2"/>`,
  bell: `<path d="M5 17c1.5-1.5 1.5-3 1.5-6a5.5 5.5 0 0111 0c0 3 0 4.5 1.5 6z" fill="#eab308" stroke="#713f12" stroke-width="1.2"/><rect x="4" y="17" width="16" height="2" rx="1" fill="#a16207"/><circle cx="12" cy="20.5" r="1.6" fill="#713f12"/>`,
  door: `<path d="M3 23V8a9 7 0 0118 0v15z" fill="#fcd34d" fill-opacity="0.9"/><path d="M3 23V8a9 7 0 0118 0v15" fill="none" stroke="#78350f" stroke-width="2"/>`,
  cart: `<rect x="3" y="8" width="18" height="9" rx="1" fill="#a16207" stroke="#422006" stroke-width="1.2"/><rect x="5" y="4" width="6" height="5" fill="#7c2d12"/><rect x="12" y="2" width="7" height="7" fill="#1e3a8a"/><circle cx="7" cy="19.5" r="2" fill="#27272a"/><circle cx="17" cy="19.5" r="2" fill="#27272a"/>`,
  trapOpen: `<path d="M2 15h20" stroke="#52525b" stroke-width="2.4"/><path d="M3 15L5 7l2 6 2-7 2 7 2-7 2 7 2-6 2 8" fill="none" stroke="#d4d4d8" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="17" r="2.2" fill="#3f3f46"/>`,
  trapShut: `<path d="M3 14c3-6 15-6 18 0" fill="none" stroke="#d4d4d8" stroke-width="2.2"/><path d="M5 10l1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3" fill="none" stroke="#e4e4e7" stroke-width="1.3"/><path d="M3 14c3 4 15 4 18 0" fill="none" stroke="#71717a" stroke-width="2.2"/>`,
  eye: `<path d="M1 12C5 5 19 5 23 12 19 19 5 19 1 12z" fill="#a3e635" stroke="#365314" stroke-width="1.2"/><ellipse cx="12" cy="12" rx="1.6" ry="5.5" fill="#1a2e05"/>`,
  tomb: `<path d="M5 23V10a7 7 0 0114 0v13z" fill="#57534e" stroke="#1c1917" stroke-width="1.4"/><path d="M12 9v8M9 12h6" stroke="#a8a29e" stroke-width="1.8"/>`,
  hand: `<path d="M8 23v-7l-3-6M10 16V5M12 16V3M14 16V5M16 17l3-5" fill="none" stroke="#e7e5e4" stroke-width="1.8" stroke-linecap="round"/>`,
  knight: `<path d="M7 21h11v-2.5c0-4.5-1.5-8-4-10.5l.8-3.5-3.3 1.5L6 10.5l1.2 2.4 3.6-1.3L6.5 18z" fill="#fafaf9" stroke="#44403c" stroke-width="1.2"/>`,
  banner: `<path d="M5 2v20" stroke="#78350f" stroke-width="1.8"/><path d="M5.8 3h13l-3 4.5 3 4.5h-13z" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="1"/>`,
  page: `<rect x="5" y="3" width="14" height="18" rx="1" fill="#fafaf9" stroke="#a8a29e"/><path d="M8 8h8M8 11h8M8 14h6" stroke="#a8a29e"/>`,
  spade: `<rect x="3" y="2" width="18" height="20" rx="2" fill="#c4b5fd" fill-opacity="0.55" stroke="#ede9fe" stroke-width="1.2"/><path d="M12 6c-3 3.5-5 5-5 7.5a2.6 2.6 0 005 1L11 18h2l-1-3.5a2.6 2.6 0 005-1C17 11 15 9.5 12 6z" fill="#4c1d95"/>`,
} as const;
export type Icon = keyof typeof ICON;

/** Um desenho solto na camada. */
export function icon(s: Stage, k: Icon, at: Box, size: number, life: number, cls = "") {
  const el = spawn(s, `drop-shadow-[0_2px_3px_rgb(0_0_0/0.8)] ${cls}`, at, size, life);
  el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${ICON[k]}</svg>`;
  return el;
}

/** Um desenho preso no dublê (anda junto com a carta); `x` e `y` em fração da carta. */
export function stick(a: Actor, k: Icon, size: number, x = 0.5, y = 0.5, rot = 0) {
  if (!a.g) return null;
  const el = document.createElement("div");
  el.className = "absolute drop-shadow-[0_2px_3px_rgb(0_0_0/0.8)]";
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, left: `${x * a.from.w - size / 2}px`, top: `${y * a.from.h - size / 2}px`, rotate: `${rot}deg` });
  el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${ICON[k]}</svg>`;
  a.g.appendChild(el);
  return el;
}

/** Camada por cima da face do dublê (lampejo, tinta, gelo, pedra); some sozinha se `ms` > 0. */
export function cover(a: Actor, cls: string, kf: Keyframe[] = [{ opacity: 0.95 }, { opacity: 0 }], ms = 220, delay = 0) {
  if (!a.g) return null;
  const el = document.createElement("div");
  el.className = `absolute inset-0 rounded-lg ${cls}`;
  a.g.appendChild(el);
  move(el, kf, ms, delay);
  return el;
}
export const flash = (a: Actor, ms = 220, cls = "bg-white mix-blend-screen") => cover(a, cls, [{ opacity: 0.95 }, { opacity: 0 }], ms);

/** Anel de choque no chão. */
export function shock(s: Stage, at: Box, cls = "border-white/80", r = 1.6, ms = 520) {
  const el = spawn(s, `rounded-full border-4 ${cls}`, at, at.w, ms + 80);
  move(el, [{ transform: "scale(0.3)", opacity: 1 }, { transform: `scale(${r})`, opacity: 0 }], ms);
}

/** Partículas saindo de um ponto (poeira, estilhaços, faíscas); com `k`, desenhos (penas, moedas). */
export function burst(s: Stage, at: Box, n: number, cls: string, r = 60, ms = 600, up = 0, size = 8, k?: Icon) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
    const d = r * (0.6 + ((i * 37) % 10) / 22);
    const el = k ? icon(s, k, at, size, ms + 80, cls) : spawn(s, cls, at, size, ms + 80);
    move(el, [{ transform: tf(0, 0, 0, 0.4), opacity: 1 }, { transform: tf(Math.cos(t) * d, Math.sin(t) * d * 0.7 + up, (i * 47) % 180, 1), opacity: 0 }], ms, (i % 3) * 25);
  }
}

/** Poeira levantando no pé da carta. */
export const dust = (s: Stage, at: Box, n = 8) => burst(s, { ...at, y: at.y + at.h * 0.45 }, n, "rounded-full bg-amber-100/60 blur-[1px]", at.w * 0.7, 520, -12, 10);

/** Partículas subindo de uma área (fumaça, chamas, aura). */
export function rise(s: Stage, at: Box, n: number, cls: string, size: number, h = 60, ms = 700, spread = at.w * 0.8) {
  for (let i = 0; i < n; i++) {
    const x = ((i * 53) % 100) / 100 - 0.5;
    const el = spawn(s, cls, { ...at, x: at.x + x * spread, y: at.y + at.h * 0.3 }, size, ms + 300);
    move(el, [{ transform: tf(0, 0, 0, 0.5), opacity: 0 }, { transform: tf(x * 10, -h * 0.4, 0, 1), opacity: 1, offset: 0.3 }, { transform: tf(x * 20, -h, 0, 1.3), opacity: 0 }], ms, (i * 61) % 300);
  }
}

/**
 * Linha esticada a cada quadro entre dois pontos que se mexem (braço do gancho, chicote, laser, cipó). `tip(t)` diz
 * onde fica a ponta no instante `t` (0 a 1) da duração; `head` põe um desenho na ponta.
 */
export function cable(s: Stage, cls: string, w: number, from: () => Box, tip: (t: number) => Box, ms: number, head?: Icon, headSize = 34) {
  const line = document.createElement("div");
  line.className = `absolute left-0 top-0 origin-left rounded-full ${cls}`;
  line.style.height = `${w}px`;
  s.layer.appendChild(line);
  const cap = head ? icon(s, head, pt(0, 0), headSize, ms + 50) : null;
  if (cap) Object.assign(cap.style, { left: "0px", top: "0px" });
  const t0 = performance.now();
  let id = 0;
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    const a = from(), b = tip(t), o = off(a, b);
    line.style.width = `${o.len}px`;
    line.style.transform = `translate(${a.x}px, ${a.y - w / 2}px) rotate(${o.ang}rad)`;
    if (cap) cap.style.transform = `translate(${b.x - headSize / 2}px, ${b.y - headSize / 2}px) rotate(${o.ang - Math.PI / 2}rad)`;
    if (t < 1) id = requestAnimationFrame(frame);
    else { line.remove(); cap?.remove(); }
  };
  id = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(id); line.remove(); cap?.remove(); };
}

/** Linha reta de `a` até `b` que cresce a partir de `a` e some (feixe, corte, raio). */
export function beam(s: Stage, a: Box, b: Box, cls: string, w: number, grow = 120, hold = 160, delay = 0) {
  const o = off(a, b);
  const el = document.createElement("div");
  el.className = `absolute left-0 top-0 origin-left rounded-full ${cls}`;
  Object.assign(el.style, { width: `${o.len}px`, height: `${w}px`, transform: `translate(${a.x}px, ${a.y - w / 2}px) rotate(${o.ang}rad)` });
  s.layer.appendChild(el);
  const total = grow + hold + 160;
  move(el, [{ scale: "0 1", opacity: 1 }, { scale: "1 1", opacity: 1, offset: grow / total }, { scale: "1 1", opacity: 1, offset: (grow + hold) / total }, { scale: "1 1", opacity: 0 }], total, delay, ease.lin);
  later(() => el.remove(), total + delay + 50);
  return el;
}

/** Centro atual de um dublê na tela (com as animações dele). */
export const now = (a: Actor): Box => {
  const r = a.g?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: a.from.w, h: a.from.h } : a.from;
};

/** Golpe numa carta vindo de `from`: tranco na direção do golpe, lampejo, tremor e as vizinhas balançam. */
export function knock(s: Stage, v: Actor, from: Box, k = 18, power: 1 | 2 | 3 = 1, cls = "bg-white mix-blend-screen") {
  const { ux, uy } = off(from, v.from);
  move(v.g, [{ transform: tf() }, { transform: tf(ux * k, uy * k, ux >= 0 ? k / 2 : -k / 2, 0.94), offset: 0.25 }, { transform: tf(ux * k * 0.3, uy * k * 0.3) }, { transform: tf() }], 480);
  flash(v, 200, cls);
  s.shake(power);
  jostle(s, v.from, [v.id]);
}

/** Tremedeira (preso, eletrocutado, convulsão): a carta vibra no lugar, cada vez mais forte com `grow`. */
export function jitter(el: Element | null | undefined, ms: number, k = 4, grow = false, base = tf()) {
  const n = Math.max(4, Math.round(ms / 45));
  const kf: Keyframe[] = Array.from({ length: n + 1 }, (_, i) => {
    const a = (grow ? (i + 1) / n : 1) * k * (i === n ? 0 : 1);
    return { transform: `${base} translate(${i % 2 ? a : -a}px, ${i % 3 === 1 ? a / 2 : -a / 3}px)` };
  });
  return move(el, kf, ms, 0, ease.lin);
}

/** Salto em arco de `a` até `b` (deslocamento a partir do lugar do dublê), com giro opcional. */
export function hop(el: Element | null | undefined, d: { dx: number; dy: number }, ms: number, up = 70, spin = 0, s0 = 1, s1 = 1) {
  return move(el, [
    { transform: tf(0, 0, 0, s0) },
    { transform: tf(d.dx * 0.5, d.dy * 0.5 - up, spin * 0.5, (s0 + s1) / 2 + 0.12), easing: ease.in },
    { transform: tf(d.dx, d.dy, spin, s1) },
  ], ms, 0, ease.out);
}

/** As cartas de verdade perto de `at` balançam (a mesa sacudida); as da cena (`skip`) ficam de fora. */
export function jostle(s: Stage, at: Box, skip: number[] = [], r = 1.6, k = 5) {
  void s;
  document.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
    if (skip.includes(Number(el.dataset.card))) return;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - at.x, dy = b.top + b.height / 2 - at.y;
    const d = Math.hypot(dx, dy);
    if (d > at.w * r * 1.5 || d < 1) return;
    const ux = dx / d, uy = dy / d;
    el.animate([{ transform: "none" }, { transform: `translate(${ux * k}px, ${uy * k}px) rotate(${ux * 3}deg)` }, { transform: "none" }], { duration: 320, easing: ease.out });
  });
}

/** Caixas das cartas de verdade na tela perto de `at` (para constantes que agem no local inteiro). */
export function around(at: Box | null, ids: number[]): Box[] {
  return ids.flatMap((id) => {
    const r = document.querySelector(`[data-card="${id}"]`)?.getBoundingClientRect();
    return r && r.width && (!at || Math.abs(r.left + r.width / 2 - at.x) < at.w) ? [pt(r.left + r.width / 2, r.top + r.height / 2, r.width, r.height)] : [];
  });
}

/** Vinheta: escurece a tela toda menos um círculo em volta de `at`. */
export function vignette(s: Stage, at: Box, ms: number, dark = 0.65) {
  const el = spawn(s, "", pt(0, 0), 10, ms + 50);
  Object.assign(el.style, { left: "0px", top: "0px", width: "100%", height: "100%", background: `radial-gradient(circle at ${at.x}px ${at.y}px, transparent 0, transparent ${at.w * 0.9}px, rgb(0 0 0 / ${dark}) ${at.w * 2.2}px)` });
  move(el, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], ms);
  return el;
}

/** A metade do local do lado `foe` (inimigo de quem age) ou do próprio lado. */
export function half(s: Stage, foe: boolean): Box {
  const l = s.lane ?? { ...s.src.from, w: s.src.from.w * 2, h: s.src.from.h * 4 };
  const top = (s.src.from.y > l.y) === foe;
  return { x: l.x, y: l.y + (top ? -l.h / 4 : l.h / 4), w: l.w, h: l.h / 2 };
}

/** Desaparece com o dublê (a carta que vira outra coisa ou some). */
export const fade = (a: Actor, ms = 160) => move(a.g, [{ opacity: 1 }, { opacity: 0 }], ms);
/** Troca a face do dublê pela nova (a carta já transformada). */
export function swap(a: Actor) {
  if (!a.g || !a.next) return;
  const first = a.g.firstElementChild;
  const copy = a.next.cloneNode(true) as HTMLElement;
  copy.style.width = "100%";
  if (first) a.g.replaceChild(copy, first);
}
/** Centro atual de um elemento solto na camada (o míssil, a coruja), para o rastro. */
export const where = (el: Element, fallback: Box): Box => {
  const r = el.getBoundingClientRect();
  return r.width ? pt(r.left + r.width / 2, r.top + r.height / 2, r.width, r.height) : fallback;
};
