import type { RevealLevel } from "./packSounds";
import type { Player, TierBand } from "./types";
import { getPlayerOvr, hexToRgba } from "./cards";
import { RARITY_BANDS, rarityKeyOf } from "./rarityBands";

type Pt = [number, number];

const archTop = (): Pt[] => {
  const xs = [0, 3, 6, 10, 15, 22, 30, 40, 50, 60, 70, 78, 85, 90, 94, 97, 100];
  const top = xs.map((x): Pt => [x, +(9 * (1 - Math.sqrt(1 - Math.pow((x - 50) / 50, 2)))).toFixed(2)]);
  return top.concat([[100, 88], [50, 100], [0, 88]]);
};

const SHAPES: Pt[][] = [
  [[0, 0], [100, 0], [100, 95.9], [94, 100], [6, 100], [0, 95.9]],
  [[0, 0], [100, 0], [100, 88], [50, 100], [0, 88]],
  [[0, 4.1], [6, 0], [94, 0], [100, 4.1], [100, 87], [50, 100], [0, 87]],
  [[0, 5.5], [8, 0], [36, 0], [50, 3.5], [64, 0], [92, 0], [100, 5.5], [100, 86], [50, 100], [0, 86]],
  [[0, 7], [5, 2.5], [14, 4.5], [31, 0], [41, 3.8], [50, 0], [59, 3.8], [69, 0], [86, 4.5], [95, 2.5], [100, 7], [100, 84], [50, 100], [0, 84]],
  archTop(),
  [[0, 6], [9, 0], [91, 0], [100, 6], [100, 94], [91, 100], [9, 100], [0, 94]],
  [[0, 3.5], [10, 0], [22, 3.5], [34, 0], [46, 3.5], [58, 0], [70, 3.5], [82, 0], [94, 3.5], [100, 0], [100, 86], [50, 100], [0, 86]],
  [[0, 3.5], [5, 3.5], [5, 0], [95, 0], [95, 3.5], [100, 3.5], [100, 96.5], [95, 96.5], [95, 100], [5, 100], [5, 96.5], [0, 96.5]],
  [[0, 6], [50, 0], [100, 6], [100, 94], [50, 100], [0, 94]],
];
const PAD = [2, 3, 3, 4, 5];
const GLOW_R = [0, 4, 8, 12, 18];

type FxSpec = { rise?: number; twinkle?: number; streak?: number; speed?: [number, number]; size?: [number, number]; colors?: string[] };

export type Tier = {
  key: string;
  tierKey: string;
  name: string;
  min: number;
  lvl: number;
  c: string;
  hi: string;
  lo: string;
  custom?: boolean;
  frame?: string;
  pad?: number;
  topPad?: number;
  glint?: boolean;
  noSweep?: boolean;
  fx?: FxSpec | null;
};

const LOOK: Record<string, Pick<Tier, "lvl" | "c" | "hi" | "lo">> = {
  eternus: { lvl: 4, c: "#38e8ff", hi: "#e8fdff", lo: "#0b6f9e" },
  ascendant: { lvl: 3, c: "#f5b82e", hi: "#fff3c4", lo: "#8f5e08" },
  oracle: { lvl: 2, c: "#ff6a26", hi: "#ffd6bf", lo: "#992b05" },
  archon: { lvl: 1, c: "#b26bff", hi: "#f0dcff", lo: "#4a1a8f" },
  arcanist: { lvl: 1, c: "#2dd47a", hi: "#d1fae5", lo: "#0b6636" },
  initiate: { lvl: 0, c: "#b5533a", hi: "#f0a58f", lo: "#5c2214" },
};
// faixas (nome e overall mínimo) em rarityBands.ts, que o worker também usa; aqui só o visual
export const RARITY_TIERS: Tier[] = RARITY_BANDS.map((b) => ({ ...b, ...LOOK[b.key] }));

const RARITY_FX: Record<string, FxSpec> = {
  archon: { twinkle: 4 },
  oracle: { twinkle: 7 },
  ascendant: { rise: 16, twinkle: 4, speed: [4, 8], size: [4, 9], colors: ["#f5b82e", "#ff9d2e", "#fff3c4"] },
  eternus: { rise: 18, twinkle: 7, streak: 3, speed: [3.5, 7], size: [4, 9], colors: ["#e8fdff", "#38e8ff", "#7ff3ff"] },
};

const HEX = /^#[0-9a-f]{6}$/i;

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

const metal = (t: Tier) => `linear-gradient(145deg, ${t.hi}, ${t.c} 28%, ${t.lo} 52%, ${t.c} 76%, ${t.hi})`;
const metalH = (t: Tier) => `linear-gradient(145deg, #ffffff, ${t.hi} 25%, ${t.c} 50%, ${t.hi} 80%, #ffffff)`;

const FR_W = 295;
const FR_H = 430;
const frPts = (lvl: number, sx: number, sy: number) =>
  SHAPES[lvl].map(([x, y]) => [(FR_W / 2 + ((x - 50) * FR_W / 100) * sx).toFixed(1), (FR_H / 2 + ((y - 50) * FR_H / 100) * sy).toFixed(1)]);
const frPath = (pts: string[][]) => "M" + pts.map((q) => q.join(",")).join(" L") + " Z";

function frameDeco(t: Tier) {
  const o1 = frPath(frPts(t.lvl, 0.955, 0.968));
  const o2 = frPath(frPts(t.lvl, 0.915, 0.945));
  let rays = "";
  for (let i = 0; i < 9; i++) {
    const a = ((10 + i * 20) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    rays += `<line x1="${(147.5 + 7 * c).toFixed(1)}" y1="${(12 + 7 * s).toFixed(1)}" x2="${(147.5 + 19 * c).toFixed(1)}" y2="${(12 + 19 * s).toFixed(1)}"/>`;
  }
  return `<path d="${o1}" fill="none" stroke="${t.c}" stroke-opacity=".9" stroke-width="1.5"/>`
    + `<path d="${o2}" fill="none" stroke="${t.hi}" stroke-opacity=".38" stroke-width=".8"/>`
    + `<path class="fr-run" pathLength="100" d="${o1}" fill="none" stroke="${t.hi}" stroke-width="3" stroke-linecap="round" stroke-dasharray="9 91" style="filter:drop-shadow(0 0 4px ${t.hi})"/>`
    + `<g class="fr-twinkle" stroke="${t.hi}" stroke-width="1.1" stroke-linecap="round" stroke-opacity=".85">${rays}</g>`
    + `<path d="M147.5 30 l5 5 -5 5 -5 -5z" fill="${t.hi}" fill-opacity=".85"/>`
    + `<path d="M7 215 l4 5 -4 5 -4 -5z M288 215 l-4 5 4 5 4 -5z" fill="${t.hi}" fill-opacity=".8"/>`;
}

function frameCircuit(t: Tier, uid: string) {
  const o = frPath(frPts(t.lvl, 0.965, 0.975));
  const trs = ["M10 64 V30 L24 16 H70", "M24 16 V40 L32 48 H44", "M70 16 H100 L108 8 H132", "M12 98 V114 L20 122 H34"];
  const nodes = [[70, 16], [44, 48], [132, 8], [34, 122], [10, 64]];
  const corner = (tf: string, full: boolean) => {
    const list = full ? trs : [trs[0], trs[1]];
    const nds = full ? nodes : [nodes[0], nodes[1], nodes[4]];
    return `<g transform="${tf}">`
      + list.map((d) => `<path d="${d}" fill="none" stroke="${t.c}" stroke-opacity=".6" stroke-width="1.2"/>`).join("")
      + nds.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${t.hi}"/>`).join("")
      + list.map((d, i) => `<path class="fr-run" pathLength="100" d="${d}" fill="none" stroke="${t.hi}" stroke-width="2" stroke-linecap="round" stroke-dasharray="14 86" style="animation-duration:${(2.6 + i * 0.5).toFixed(1)}s;animation-delay:-${(i * 0.7).toFixed(1)}s;filter:drop-shadow(0 0 3px ${t.hi})"/>`).join("")
      + "</g>";
  };
  return `<defs><linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.c}" stop-opacity="0"/><stop offset="1" stop-color="${t.hi}" stop-opacity=".3"/></linearGradient></defs>`
    + `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".5" stroke-width="1"/>`
    + corner("", false) + corner("translate(295 0) scale(-1 1)", true)
    + corner("translate(0 430) scale(1 -1)", true) + corner("translate(295 430) scale(-1 -1)", true)
    + `<rect class="fr-scan" x="0" y="0" width="295" height="26" opacity="0" fill="url(#${uid}s)"/>`
    + `<g class="fr-aim" transform="translate(147.5 160)" fill="none" stroke-width="1.4" stroke-linecap="round" opacity=".85" style="--aim:${t.hi};stroke:${t.hi}">`
    + `<circle r="30" stroke-opacity=".9"/><circle r="14" stroke-opacity=".6" stroke-dasharray="3 4"/>`
    + `<path d="M-48 0 H-12 M12 0 H48 M0 -48 V-12 M0 12 V48"/>`
    + `<path d="M-30 -6 v12 M30 -6 v12 M-6 -30 h12 M-6 30 h12" stroke-opacity=".7"/>`
    + `<circle r="2.2" fill="#ff4d4d" stroke="none"/>`
    + `<circle class="fr-lock" r="30" stroke="#ff4d4d" stroke-width="1.8" opacity="0"/></g>`;
}

function frameIce(t: Tier, uid: string) {
  const o1 = frPath(frPts(t.lvl, 0.955, 0.972));
  const o2 = frPath(frPts(t.lvl, 0.915, 0.95));
  const shard = `<g class="fr-breathe">`
    + `<path d="M147.5 6 L156 24 L147.5 46 L139 24Z" fill="url(#${uid}g)" stroke="${t.hi}" stroke-opacity=".9" stroke-width="1"/>`
    + `<path d="M131 12 L136.5 24 L131 38 L125.5 24Z" fill="url(#${uid}g)" stroke="${t.hi}" stroke-opacity=".7" stroke-width=".8"/>`
    + `<path d="M164 12 L169.5 24 L164 38 L158.5 24Z" fill="url(#${uid}g)" stroke="${t.hi}" stroke-opacity=".7" stroke-width=".8"/>`
    + `<line x1="147.5" y1="6" x2="147.5" y2="46" stroke="${t.hi}" stroke-opacity=".55" stroke-width=".7"/></g>`;
  return `<defs><linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.hi}" stop-opacity=".95"/><stop offset="1" stop-color="${t.c}" stop-opacity=".55"/></linearGradient></defs>`
    + `<path d="${o1}" fill="none" stroke="${t.c}" stroke-opacity=".9" stroke-width="1.4"/>`
    + `<path d="${o2}" fill="none" stroke="${t.hi}" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="6 5"/>`
    + `<path class="fr-run" pathLength="100" d="${o1}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="6 94" style="animation-duration:7s;filter:drop-shadow(0 0 4px ${t.hi})"/>`
    + shard + `<g transform="translate(0 430) scale(1 -1)">${shard}</g>`;
}

function frameFlame(t: Tier, uid: string) {
  const o = frPath(frPts(t.lvl, 0.965, 0.975));
  const tongue = (cx: number, w: number, h: number) =>
    `M${(cx - w).toFixed(1)} 430 C${(cx - w * 0.9).toFixed(1)} ${(430 - h * 0.5).toFixed(1)} ${(cx - w * 0.25).toFixed(1)} ${(430 - h * 0.7).toFixed(1)} ${cx.toFixed(1)} ${(430 - h).toFixed(1)} C${(cx + w * 0.25).toFixed(1)} ${(430 - h * 0.7).toFixed(1)} ${(cx + w * 0.9).toFixed(1)} ${(430 - h * 0.5).toFixed(1)} ${(cx + w).toFixed(1)} 430Z`;
  let back = "", front = "";
  for (let i = 0; i < 11; i++) {
    const cx = 14 + i * 26.7;
    const h = 34 + 46 * Math.pow(Math.abs((cx - 147.5) / 147.5), 1.3);
    const dur = (1.2 + (i % 4) * 0.25).toFixed(2), dl = (-(i * 0.37)).toFixed(2);
    back += `<path class="fr-flame" d="${tongue(cx, 19, h * 1.18)}" fill="url(#${uid}b)" style="--d:${dur}s;--dl:${dl}s;transform-origin:${cx.toFixed(1)}px 430px"/>`;
    const cx2 = cx + (i % 2 ? 5 : -5);
    front += `<path class="fr-flame" d="${tongue(cx2, 11, h * 0.78)}" fill="url(#${uid}f)" style="--d:${(+dur * 0.8).toFixed(2)}s;--dl:${(-(i * 0.51)).toFixed(2)}s;transform-origin:${cx2.toFixed(1)}px 430px"/>`;
  }
  return `<defs>`
    + `<linearGradient id="${uid}b" gradientUnits="userSpaceOnUse" x1="0" y1="430" x2="0" y2="300"><stop offset="0" stop-color="${t.c}" stop-opacity="1"/><stop offset=".7" stop-color="${t.c}" stop-opacity=".55"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient>`
    + `<linearGradient id="${uid}f" gradientUnits="userSpaceOnUse" x1="0" y1="430" x2="0" y2="340"><stop offset="0" stop-color="${t.hi}" stop-opacity=".95"/><stop offset=".6" stop-color="${t.c}" stop-opacity=".6"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient>`
    + `</defs>`
    + `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".7" stroke-width="1.2"/>`
    + `<g opacity=".92">${back}${front}</g>`;
}

function frameStorm(t: Tier) {
  const o = frPath(frPts(t.lvl, 0.96, 0.975));
  const bolts = ["M14 8 L24 40 L12 64 L26 98 L14 126", "M281 10 L270 46 L284 72 L268 110", "M12 318 L25 346 L10 372 L23 410", "M283 312 L270 342 L286 372 L272 410"];
  const bolt = (d: string, i: number) => `<g class="fr-bolt" style="--d:${(4.2 + i * 0.9).toFixed(1)}s;--dl:${(-i * 1.3).toFixed(1)}s">`
    + `<path d="${d}" fill="none" stroke="${t.c}" stroke-width="5" stroke-opacity=".6" stroke-linejoin="round" style="filter:blur(3px)"/>`
    + `<path d="${d}" fill="none" stroke="${t.hi}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></g>`;
  return `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".65" stroke-width="1.1"/>`
    + bolts.map(bolt).join("")
    + `<rect class="fr-flash" x="0" y="0" width="295" height="430" opacity="0" fill="${t.hi}"/>`;
}

function frameOrbit(t: Tier) {
  const o = frPath(frPts(t.lvl, 0.965, 0.975));
  const comet = (k: number) => `<path class="fr-run" pathLength="100" d="${o}" fill="none" stroke="${t.c}" stroke-width="7" stroke-opacity=".5" stroke-linecap="round" stroke-dasharray="12 88" style="animation-duration:6s;animation-delay:${-k * 3}s;filter:blur(3px)"/>`
    + `<path class="fr-run" pathLength="100" d="${o}" fill="none" stroke="${t.hi}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="7 93" style="animation-duration:6s;animation-delay:${-k * 3}s;filter:drop-shadow(0 0 4px ${t.hi})"/>`;
  return `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".35" stroke-width="1"/>` + comet(0) + comet(1);
}

type FramePreset = {
  name: string; lvl: number; c1: string; c2: string; pad: number; glow: number; anim: number; topPad: number; glint: boolean;
  fx: FxSpec; noSweep?: boolean; bg: (t: Tier) => string; bgH: (t: Tier) => string; orn: (t: Tier, uid: string) => string;
};

export const FRAME_PRESETS: Record<string, FramePreset> = {
  deco: { name: "Déco Imperial", lvl: 5, c1: "#d9a93a", c2: "#fff0b8", pad: 5, glow: 14, anim: 6, topPad: 30, glint: true, fx: { twinkle: 5 }, bg: metal, bgH: metalH, orn: frameDeco },
  circuito: { name: "Circuito", lvl: 8, c1: "#22f0b4", c2: "#b6fff0", pad: 3, glow: 16, anim: 0, topPad: 22, glint: false, fx: { twinkle: 3 }, noSweep: true,
    bg: (t) => `linear-gradient(160deg, ${t.lo}, ${t.c} 45%, ${t.lo})`, bgH: (t) => `linear-gradient(160deg, ${t.c}, ${t.hi}, ${t.c})`, orn: frameCircuit },
  gelo: { name: "Gelo", lvl: 9, c1: "#5cc8ff", c2: "#eaf9ff", pad: 4, glow: 16, anim: 6, topPad: 36, glint: true, fx: { twinkle: 9 },
    bg: (t) => `linear-gradient(145deg, #ffffff, ${t.hi} 20%, ${t.c} 50%, ${t.hi} 80%, #ffffff)`, bgH: (t) => `linear-gradient(145deg, #ffffff, ${t.hi}, #ffffff)`, orn: frameIce },
  chamas: { name: "Chamas", lvl: 6, c1: "#ff5a1f", c2: "#ffd23f", pad: 4, glow: 22, anim: 3, topPad: 28, glint: false, fx: { rise: 12, twinkle: 2, speed: [3, 6], size: [3, 8] },
    bg: (t) => `linear-gradient(0deg, ${t.hi}, ${t.c} 45%, ${t.lo})`, bgH: (t) => `linear-gradient(0deg, #ffffff, ${t.hi} 40%, ${t.c})`, orn: frameFlame },
  tempestade: { name: "Tempestade", lvl: 7, c1: "#8a5cff", c2: "#f1e9ff", pad: 3, glow: 18, anim: 3, topPad: 26, glint: false, fx: { twinkle: 5 },
    bg: (t) => `linear-gradient(135deg, ${t.lo}, ${t.c}, ${t.lo}, ${t.hi}, ${t.lo})`, bgH: (t) => `linear-gradient(135deg, ${t.c}, #ffffff, ${t.c})`, orn: frameStorm },
  orbita: { name: "Órbita", lvl: 2, c1: "#3df0ff", c2: "#ffffff", pad: 3, glow: 20, anim: 0, topPad: 0, glint: false, fx: { twinkle: 4 },
    bg: (t) => `linear-gradient(145deg, ${hexToRgba(t.c, 0.6)}, #17171c 40%, ${hexToRgba(t.hi, 0.5)})`, bgH: (t) => `linear-gradient(145deg, ${t.c}, #26262c 40%, ${t.hi})`, orn: frameOrbit },
};

export function getRarity(ovr: number, cfg: TierBand[]): Tier {
  const key = rarityKeyOf(ovr, cfg);
  return RARITY_TIERS.find((t) => t.key === key) ?? RARITY_TIERS[RARITY_TIERS.length - 1];
}

export function getCardTier(p: Player, cfg: TierBand[]): Tier {
  const base = getRarity(getPlayerOvr(p), cfg);
  const f = p.special ? p.frame : undefined;
  // hasOwn: um style como "constructor" acharia um membro herdado e quebraria o render
  const pr = f && Object.hasOwn(FRAME_PRESETS, f.style) ? FRAME_PRESETS[f.style] : undefined;
  if (!f || !pr) return base;
  const c = HEX.test(String(f.c1)) ? f.c1! : pr.c1;
  const hi = HEX.test(String(f.c2)) ? f.c2! : pr.c2;
  const pad = Number.isFinite(Number(f.pad)) ? Math.min(10, Math.max(2, Number(f.pad))) : pr.pad;
  return { ...base, custom: true, frame: f.style, lvl: pr.lvl, c, hi, lo: shadeHex(c, 0.45), pad,
    topPad: pr.topPad, glint: pr.glint, noSweep: !!pr.noSweep, fx: pr.fx };
}

const shiftVars = (size: number, seconds: number) => ({
  "--rk-fx": "block", "--rk-sz": `${size}%`, "--rk-dx": `${((100 - size) / size * 100).toFixed(2)}%`,
  "--rk-anim": `rk-shift ${seconds}s ease-in-out infinite alternate`,
});

const clipCSS =(lvl: number) => "polygon(" + SHAPES[lvl].map(([x, y]) => `${x}% ${y}%`).join(", ") + ")";

export function rarityStyleVars(t: Tier): Record<string, string> {
  if (t.custom) {
    const pr = FRAME_PRESETS[t.frame!];
    const v: Record<string, string> = {
      "--rk-clip": clipCSS(t.lvl), "--rk-pad": `${t.pad}px`, "--rk-bg": pr.bg(t), "--rk-bg-h": pr.bgH(t),
      "--rk-glow": hexToRgba(t.c, 0.6), "--rk-gr": `${pr.glow}px`,
    };
    if (pr.anim) Object.assign(v, shiftVars(300, pr.anim));
    return v;
  }
  const v: Record<string, string> = {
    "--rk-clip": clipCSS(t.lvl), "--rk-pad": `${PAD[t.lvl]}px`, "--rk-bg": metal(t), "--rk-bg-h": metalH(t),
    "--rk-glow": hexToRgba(t.c, 0.55), "--rk-gr": `${GLOW_R[t.lvl]}px`,
  };
  if (t.lvl >= 2) Object.assign(v, shiftVars(260, t.lvl >= 3 ? 5 : 9));
  return v;
}

export function ringSVG(t: Tier): string {
  const pts = (sx: number, sy: number) => SHAPES[t.lvl].map(([x, y]) => `${(50 + (x - 50) * sx).toFixed(2)},${(50 + (y - 50) * sy).toFixed(2)}`).join(" ");
  let svg = `<polygon points="${pts(0.953, 0.967)}" fill="none" stroke="${t.c}" stroke-opacity="0.85" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
  if (t.lvl >= 3) svg += `<polygon points="${pts(0.9, 0.93)}" fill="none" stroke="${t.hi}" stroke-opacity="0.4" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

export function ornamentSVG(t: Tier): string {
  const pr = FRAME_PRESETS[t.frame!];
  return pr ? pr.orn(t, "fr" + t.frame + t.c.slice(1) + t.hi.slice(1)) : "";
}

export type Particle = { type: "rise" | "twinkle" | "streak"; x: number; y: number; s: number; d: number; dl: number; dx: number; po: number; color: string };

const FX_CACHE: Record<string, Particle[]> = {};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function particleSpecs(t: Tier): Particle[] {
  const ck = t.custom ? `c:${t.frame}:${t.c}:${t.hi}` : t.key;
  if (FX_CACHE[ck]) return FX_CACHE[ck];
  const fx = t.custom ? (t.fx ? { ...t.fx, colors: [t.c, t.hi, "#ffffff"] } : null) : RARITY_FX[t.key];
  const specs: Particle[] = [];
  if (fx) {
    let seed = 7;
    for (const ch of ck) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = rng(seed);
    const between = (a: number, b: number) => a + (b - a) * rnd();
    const colors = fx.colors ?? [t.hi, t.c];
    for (let i = 0; i < (fx.rise ?? 0); i++) {
      const d = between(fx.speed![0], fx.speed![1]);
      specs.push({ type: "rise", x: between(4, 96), y: 0, s: between(fx.size![0], fx.size![1]), d, dl: -between(0, d), dx: between(-22, 22), po: between(0.6, 1), color: colors[i % colors.length] });
    }
    for (let i = 0; i < (fx.twinkle ?? 0); i++) {
      const d = between(2.2, 4.2);
      specs.push({ type: "twinkle", x: between(8, 92), y: between(8, 86), s: between(9, 16), d, dl: -between(0, d), dx: 0, po: 1, color: t.hi });
    }
    for (let i = 0; i < (fx.streak ?? 0); i++) {
      const d = between(3.2, 5.5);
      specs.push({ type: "streak", x: between(5, 60), y: between(6, 45), s: 0, d, dl: -between(0, d), dx: 0, po: 1, color: colors[1] ?? t.c });
    }
  }
  return (FX_CACHE[ck] = specs);
}

/** Nível da abertura de pack: S, SS e especiais ganham o walkout; o resto abre direto. */
/** Nível da abertura: Ascendant, Eternus e qualquer carta especial (com ou sem moldura) têm walkout. */
export const levelOf = (tier: Tier | null | undefined, special = false): RevealLevel =>
  !tier ? "base" : tier.custom || special ? "special" : tier.key === "eternus" ? "eternus" : tier.key === "ascendant" ? "ascendant" : "base";
