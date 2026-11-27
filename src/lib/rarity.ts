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

// Letreiro: topo em zigurate art déco (degraus subindo até o centro, como os arranha-céus de Nova York dos anos 20)
const ziggurat = (): Pt[] => {
  const steps: [number, number][] = [[0, 9], [10, 6], [20, 3.6], [32, 1.6], [42, 0]];
  const left: Pt[] = steps.flatMap(([x, y], i): Pt[] => (i ? [[x, steps[i - 1][1]], [x, y]] : [[x, y]]));
  const right = left.map(([x, y]): Pt => [100 - x, y]).reverse();
  return [...left, ...right, [100, 96], [96, 96], [96, 100], [4, 100], [4, 96], [0, 96]];
};

// Fenda: as laterais são rachaduras que abrem e fecham, e o zigue-zague anda pela borda
const RIFT_PAT = [0, 1, 0.25, 0.8, 0.1, 1, 0.35, 0.75, 0.05, 0.9];
const RIFT_Y = [7, 15, 23, 32, 41, 50, 59, 68, 77, 86];
const rift = (amp: number, shift: number): Pt[] => {
  const n = RIFT_PAT.length;
  const right = RIFT_Y.map((y, i): Pt => [+(100 - amp * RIFT_PAT[(i + shift) % n]).toFixed(2), y]);
  const left = RIFT_Y.map((y, i): Pt => [+(amp * RIFT_PAT[(i + shift + 4) % n]).toFixed(2), y]).reverse();
  return [[0, 3], [3, 0], [97, 0], [100, 3], ...right, [100, 93], [96, 97], [50, 100], [4, 97], [0, 93], ...left];
};

// Chifres: dois chifres curvos nos cantos de cima e uma ponta no meio, que crescem e recolhem como se respirassem
const horns = (lift: number): Pt[] => {
  const tip: Pt = [+(12 + lift * 2).toFixed(2), +((1 - lift) * 2.5).toFixed(2)];
  const left: Pt[] = [[0, 24], [0.8, 16], [2.4, 9.5], [5, 4.5], [8.5, 1.4], tip, [14.5, 5], [16.5, 10], [19.5, 14], [24, 16.5]];
  const mid: Pt[] = [[36, 17.5], [45, 16], [50, +(12 - lift * 3).toFixed(2)], [55, 16], [64, 17.5]];
  const right = left.map(([x, y]): Pt => [100 - x, y]).reverse();
  return [...left, ...mid, ...right, [100, 88], [50, 100], [0, 88]];
};

// Fechadura: buraco de fechadura recortado no topo e quatro trincos nas laterais que recolhem quando a carta destranca
const KEYHOLE = { cx: 50, cy: 5.6, rx: 4.1, ry: 2.8, hw: 1 };
const keyhole = (): Pt[] => {
  const { cx, cy, rx, ry, hw } = KEYHOLE;
  const arc = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i): Pt => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [+(cx + rx * Math.cos(a)).toFixed(2), +(cy + ry * Math.sin(a)).toFixed(2)];
  });
  const a = (Math.asin(hw / rx) * 180) / Math.PI;
  return [[cx - hw, 0], ...arc(-90 - a, -235, 7), [cx - 3.2, 13], [cx + 3.2, 13], ...arc(55, -90 + a, 7), [cx + hw, 0]];
};
const LOCK_TABS = [[28, 36], [62, 70]];
const lock = (open: number): Pt[] => {
  const b = 3.5, e = +(b * open).toFixed(2);
  const rightTabs = LOCK_TABS.flatMap(([y0, y1]): Pt[] => [[100 - b, y0], [100 - e, y0], [100 - e, y1], [100 - b, y1]]);
  const leftTabs = [...LOCK_TABS].reverse().flatMap(([y0, y1]): Pt[] => [[b, y1], [e, y1], [e, y0], [b, y0]]);
  return [[b, 0], ...keyhole(), [100 - b, 0], ...rightTabs, [100 - b, 100], [b, 100], ...leftTabs];
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
  ziggurat(),
  // ogiva gótica no topo e ponta embaixo (Ritual)
  [[0, 9], [4, 5.5], [12, 2.8], [24, 1.2], [38, 0.4], [50, 0], [62, 0.4], [76, 1.2], [88, 2.8], [96, 5.5], [100, 9], [100, 90], [56, 98.5], [50, 100], [44, 98.5], [0, 90]],
  rift(2.5, 0),
  horns(0),
  lock(0),
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

// Letreiro: lâmpadas nos degraus do zigurate acendendo do centro para fora, tubos de neon que piscam ao ligar e um leque de raios no alto
function frameMarquee(t: Tier, uid: string) {
  const o = frPath(frPts(t.lvl, 0.962, 0.974));
  const treads: [number, number, number][] = [[0, 10, 9], [10, 20, 6], [20, 32, 3.6], [32, 42, 1.6], [42, 58, 0], [58, 68, 1.6], [68, 80, 3.6], [80, 90, 6], [90, 100, 9]];
  let bulbs = "";
  for (const [a, b, y] of treads) {
    const x0 = (a * FR_W) / 100 + 7, x1 = (b * FR_W) / 100 - 7, n = Math.max(1, Math.round((x1 - x0) / 13));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, d = Math.abs(x - FR_W / 2) / (FR_W / 2);
      bulbs += `<circle class="fr-bulb" cx="${x.toFixed(1)}" cy="${((y * FR_H) / 100 + 9).toFixed(1)}" r="3.3" style="animation-delay:${(d * 1.2 - 1.2).toFixed(2)}s"/>`;
    }
  }
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = ((200 + i * 17.5) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return `<line x1="${(147.5 + 12 * c).toFixed(1)}" y1="${(58 + 12 * s).toFixed(1)}" x2="${(147.5 + 38 * c).toFixed(1)}" y2="${(58 + 38 * s).toFixed(1)}"/>`;
  }).join("");
  const tube = "M11 92 V372 Q11 392 31 392 H70";
  const tubes = `<path d="${tube}"/><path d="${tube}" transform="translate(295 0) scale(-1 1)"/>`;
  return `<defs><radialGradient id="${uid}b"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="${t.hi}"/><stop offset="1" stop-color="${t.c}"/></radialGradient></defs>`
    + `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".85" stroke-width="1.3"/>`
    + `<g class="fr-breathe" stroke="${t.hi}" stroke-width="1.4" stroke-linecap="round" stroke-opacity=".55">${rays}</g>`
    + `<g class="fr-neon" fill="none" stroke-linecap="round">`
    + `<g stroke="${t.c}" stroke-width="7" stroke-opacity=".55" style="filter:blur(4px)">${tubes}</g>`
    + `<g stroke="${t.hi}" stroke-width="2">${tubes}</g></g>`
    + `<g fill="url(#${uid}b)" style="filter:drop-shadow(0 0 3px ${t.hi})">${bulbs}</g>`;
}

// Fenda: as laterais racham e brilham por dentro, com faíscas correndo pelas trincas
function frameRift(t: Tier, uid: string) {
  const cracks = ["M2 96 L18 104 L30 98 L46 110", "M293 176 L276 188 L268 180 L250 196", "M2 268 L16 260 L26 272 L42 266", "M293 336 L280 348 L266 342 L254 352"];
  return `<defs>`
    + `<linearGradient id="${uid}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.c}" stop-opacity=".6"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient>`
    + `<linearGradient id="${uid}r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${t.c}" stop-opacity=".6"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient></defs>`
    + `<rect class="fr-breathe" x="0" y="0" width="56" height="430" fill="url(#${uid}l)"/>`
    + `<rect class="fr-breathe" x="239" y="0" width="56" height="430" fill="url(#${uid}r)" style="animation-delay:-1.5s"/>`
    + cracks.map((d) => `<path d="${d}" fill="none" stroke="${t.c}" stroke-width="1.4" stroke-opacity=".8" stroke-linejoin="round"/>`).join("")
    + cracks.map((d, i) => `<path class="fr-run" pathLength="100" d="${d}" fill="none" stroke="${t.hi}" stroke-width="2" stroke-linecap="round" stroke-dasharray="16 84" style="animation-duration:${(2.2 + i * 0.4).toFixed(1)}s;filter:drop-shadow(0 0 3px ${t.hi})"/>`).join("");
}

// Chifres: brasa na ponta de cada chifre e um olho no meio que pisca de vez em quando
function frameHorns(t: Tier, uid: string) {
  const tipL = (13 * FR_W) / 100, tipR = FR_W - tipL;
  return `<defs><radialGradient id="${uid}e"><stop offset="0" stop-color="${t.hi}" stop-opacity=".95"/><stop offset=".35" stop-color="${t.c}" stop-opacity=".6"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></radialGradient></defs>`
    + `<circle class="fr-breathe" cx="${tipL.toFixed(1)}" cy="8" r="28" fill="url(#${uid}e)"/>`
    + `<circle class="fr-breathe" cx="${tipR.toFixed(1)}" cy="8" r="28" fill="url(#${uid}e)" style="animation-delay:-1.4s"/>`
    + `<g style="filter:drop-shadow(0 0 6px ${t.c})"><path d="M137 66 Q147.5 57 158 66 Q147.5 75 137 66Z" fill="${t.lo}" stroke="${t.hi}" stroke-width="1.2"/>`
    + `<g class="fr-blink" style="transform-origin:147.5px 66px"><ellipse cx="147.5" cy="66" rx="2.4" ry="5" fill="${t.hi}"/></g></g>`;
}

// Fechadura: aro no buraco da fechadura, luz que escapa quando destranca e trincos de aço que recolhem junto com a silhueta
function frameLock(t: Tier, uid: string) {
  const hole = "M" + keyhole().map(([x, y]) => `${((x * FR_W) / 100).toFixed(1)},${((y * FR_H) / 100).toFixed(1)}`).join(" L");
  const bolts = LOCK_TABS.map(([y0, y1]) => {
    const y = (y0 * FR_H) / 100, h = ((y1 - y0) * FR_H) / 100;
    const plate = (x: number) => `<rect x="${x}" y="${y.toFixed(1)}" width="26" height="${h.toFixed(1)}" rx="2" fill="url(#${uid}m)" stroke="${t.lo}" stroke-width="1"/>`
      + `<line x1="${x + 6}" y1="${(y + h / 2).toFixed(1)}" x2="${x + 20}" y2="${(y + h / 2).toFixed(1)}" stroke="${t.lo}" stroke-width="2" stroke-linecap="round"/>`;
    return `<g class="fr-bolt-l">${plate(-4)}</g><g class="fr-bolt-r">${plate(FR_W - 22)}</g>`;
  }).join("");
  return `<defs><linearGradient id="${uid}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.hi}"/><stop offset=".5" stop-color="${t.c}"/><stop offset="1" stop-color="${t.lo}"/></linearGradient>`
    + `<radialGradient id="${uid}g"><stop offset="0" stop-color="${t.hi}" stop-opacity=".9"/><stop offset="1" stop-color="${t.hi}" stop-opacity="0"/></radialGradient></defs>`
    + `<ellipse class="fr-unlock" cx="147.5" cy="34" rx="46" ry="36" fill="url(#${uid}g)"/>`
    + `<path d="${hole}" fill="none" stroke="url(#${uid}m)" stroke-width="3" stroke-linejoin="round" style="filter:drop-shadow(0 1px 2px rgb(0 0 0 / .7))"/>`
    + `<g style="filter:drop-shadow(0 2px 3px rgb(0 0 0 / .6))">${bolts}</g>`;
}

const gearPath = (cx: number, cy: number, r: number, teeth: number, h: number) => {
  const pt = (a: number, rad: number) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, w = Math.PI / teeth;
    d += `${i ? "L" : "M"}${pt(a - w * 0.55, r)} L${pt(a - w * 0.35, r + h)} L${pt(a + w * 0.35, r + h)} L${pt(a + w * 0.55, r)} `;
  }
  const hole = r * 0.32;
  return d + `Z M${(cx + hole).toFixed(1)} ${cy} A${hole.toFixed(1)} ${hole.toFixed(1)} 0 1 0 ${(cx - hole).toFixed(1)} ${cy} A${hole.toFixed(1)} ${hole.toFixed(1)} 0 1 0 ${(cx + hole).toFixed(1)} ${cy}Z`;
};

// Engrenagens: relojoaria de latão girando nos cantos e um relógio que bate os segundos no topo
function frameGears(t: Tier, uid: string) {
  const o = frPath(frPts(t.lvl, 0.962, 0.974));
  // [cx, cy, raio, dentes, sentido]: as que se tocam giram ao contrário, na proporção dos dentes
  const gears: [number, number, number, number, number][] = [
    [6, 424, 44, 14, 1], [20, 357, 20, 7, -1],
    [289, 424, 44, 14, -1], [275, 357, 20, 7, 1],
    [291, 4, 30, 10, -1],
  ];
  const g = gears.map(([cx, cy, r, n, dir]) => {
    const spokes = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2;
      return `M${(cx + r * 0.32 * Math.cos(a)).toFixed(1)} ${(cy + r * 0.32 * Math.sin(a)).toFixed(1)} L${(cx + r * 0.8 * Math.cos(a)).toFixed(1)} ${(cy + r * 0.8 * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    return `<g class="fr-spin" style="--d:${(n * 1.6).toFixed(1)}s;animation-direction:${dir > 0 ? "normal" : "reverse"};transform-origin:${cx}px ${cy}px">`
      + `<path d="${gearPath(cx, cy, r, n, r * 0.18)}" fill="url(#${uid}m)" fill-rule="evenodd" stroke="${t.lo}" stroke-width="1"/>`
      + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.8).toFixed(1)}" fill="none" stroke="${t.lo}" stroke-opacity=".7" stroke-width="1"/>`
      + `<path d="${spokes}" stroke="${t.lo}" stroke-width="${(r * 0.12).toFixed(1)}" stroke-linecap="round"/></g>`;
  }).join("");
  const rivets = [[14, 14], [14, 120], [14, 240], [281, 120], [281, 240]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join("");
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<line x1="${(147.5 + 10 * Math.cos(a)).toFixed(1)}" y1="${(24 + 10 * Math.sin(a)).toFixed(1)}" x2="${(147.5 + 12 * Math.cos(a)).toFixed(1)}" y2="${(24 + 12 * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  return `<defs><linearGradient id="${uid}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.hi}"/><stop offset=".45" stop-color="${t.c}"/><stop offset="1" stop-color="${t.lo}"/></linearGradient></defs>`
    + `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".8" stroke-width="1.3"/>`
    + `<g fill="${t.hi}" fill-opacity=".85">${rivets}</g>`
    + `<g opacity=".92" style="filter:drop-shadow(0 2px 3px rgb(0 0 0 / .6))">${g}</g>`
    + `<g style="filter:drop-shadow(0 1px 2px rgb(0 0 0 / .7))"><circle cx="147.5" cy="24" r="14" fill="${t.lo}" stroke="url(#${uid}m)" stroke-width="2.4"/>`
    + `<g stroke="${t.hi}" stroke-width="1" stroke-linecap="round">${ticks}</g>`
    + `<line class="fr-tick" x1="147.5" y1="24" x2="147.5" y2="14" stroke="${t.hi}" stroke-width="1.4" stroke-linecap="round" style="transform-origin:147.5px 24px"/>`
    + `<circle cx="147.5" cy="24" r="1.8" fill="${t.hi}"/></g>`;
}

// Ritual: runas que acendem em onda pelas laterais e um selo girando no alto da ogiva
const RUNES = ["M0 0 L0 10 M0 3 L5 0 M0 6 L5 3", "M0 0 L5 5 L0 10 M5 0 L5 10", "M2.5 0 L2.5 10 M0 3 L5 7 M5 3 L0 7", "M0 10 L2.5 0 L5 10 M1 6 L4 6", "M0 0 L5 0 L0 10 L5 10", "M0 5 L2.5 0 L5 5 L2.5 10Z"];
function frameRitual(t: Tier, uid: string) {
  const o1 = frPath(frPts(t.lvl, 0.958, 0.972));
  const o2 = frPath(frPts(t.lvl, 0.925, 0.95));
  let runes = "";
  for (let i = 0; i < 13; i++) {
    const y = 66 + i * 24, dl = (-(13 - i) * 0.22).toFixed(2);
    runes += `<path class="fr-rune" d="${RUNES[i % RUNES.length]}" transform="translate(8 ${y}) scale(1.5)" style="animation-delay:${dl}s"/>`
      + `<path class="fr-rune" d="${RUNES[(i + 3) % RUNES.length]}" transform="translate(279.5 ${y}) scale(1.5)" style="animation-delay:${dl}s"/>`;
  }
  const star = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    return `${(147.5 + 14 * Math.cos(a)).toFixed(1)} ${(30 + 14 * Math.sin(a)).toFixed(1)}`;
  });
  const marks = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<circle cx="${(147.5 + 19.5 * Math.cos(a)).toFixed(1)}" cy="${(30 + 19.5 * Math.sin(a)).toFixed(1)}" r="1.1" fill="${t.hi}"/>`;
  }).join("");
  return `<defs><radialGradient id="${uid}r"><stop offset="0" stop-color="${t.c}" stop-opacity=".55"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></radialGradient></defs>`
    + `<path d="${o1}" fill="none" stroke="${t.c}" stroke-opacity=".9" stroke-width="1.4"/>`
    + `<path d="${o2}" fill="none" stroke="${t.hi}" stroke-opacity=".35" stroke-width=".7" stroke-dasharray="1 4"/>`
    + `<g fill="none" stroke="${t.hi}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 2px ${t.hi}) drop-shadow(0 0 5px ${t.c})">${runes}</g>`
    + `<circle class="fr-breathe" cx="147.5" cy="30" r="30" fill="url(#${uid}r)"/>`
    + `<g class="fr-spin" style="--d:24s;transform-origin:147.5px 30px;filter:drop-shadow(0 0 4px ${t.c})" fill="none" stroke="${t.hi}" stroke-width="1" stroke-linejoin="round">`
    + `<circle cx="147.5" cy="30" r="17"/><circle cx="147.5" cy="30" r="22" stroke-opacity=".5" stroke-dasharray="2 3"/>`
    + `<path d="M${star.join(" L")}Z"/>${marks}</g>`;
}

// Almas: fumaça espectral subindo pelas laterais e almas que flutuam até sumir no alto
function frameSouls(t: Tier, uid: string) {
  const o = frPath(frPts(t.lvl, 0.962, 0.974));
  const wisp = (x: number, amp: number, ph: number) => {
    let d = `M${x} 440`;
    for (let y = 440; y > -10; y -= 30) d += ` Q${(x + amp * Math.sin(ph + y / 30)).toFixed(1)} ${y - 15} ${x} ${y - 30}`;
    return d;
  };
  const wisps = [[10, 7, 0], [22, 5, 2], [285, 7, 1], [273, 5, 3]].map(([x, a, ph], i) => {
    const thin = i % 2 === 1;
    return `<path class="fr-run" pathLength="100" d="${wisp(x, a, ph)}" fill="none" stroke="${thin ? t.hi : t.c}" stroke-width="${thin ? 2.4 : 7}" stroke-opacity="${thin ? 0.8 : 0.6}" stroke-linecap="round" stroke-dasharray="${thin ? "18 22" : "30 20"}" style="animation-duration:${(9 + i * 1.7).toFixed(1)}s;animation-delay:${(-i * 2.3).toFixed(1)}s;filter:blur(${thin ? 1 : 3}px)"/>`;
  }).join("");
  const souls = [[18, 0], [277, 1.6], [30, 3.4], [265, 5.1], [14, 6.6], [281, 8.2]].map(([x, dl], i) =>
    `<g class="fr-soul" style="--d:${(8 + (i % 3) * 1.4).toFixed(1)}s;--dl:${(-dl).toFixed(1)}s;--sx:${i % 2 ? -10 : 10}px">`
    + `<ellipse cx="${x}" cy="450" rx="4.5" ry="14" fill="url(#${uid}t)"/>`
    + `<circle cx="${x}" cy="440" r="5" fill="${t.hi}" style="filter:drop-shadow(0 0 4px ${t.hi}) drop-shadow(0 0 8px ${t.c})"/></g>`).join("");
  return `<defs><linearGradient id="${uid}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.hi}" stop-opacity=".9"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient><linearGradient id="${uid}f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${t.c}" stop-opacity=".5"/><stop offset="1" stop-color="${t.c}" stop-opacity="0"/></linearGradient></defs>`
    + `<rect class="fr-breathe" x="0" y="320" width="295" height="110" fill="url(#${uid}f)"/>`
    + `<path d="${o}" fill="none" stroke="${t.c}" stroke-opacity=".6" stroke-width="1.1"/>`
    + `<g>${wisps}</g>${souls}`;
}

type FramePreset = {
  name: string; lvl: number; c1: string; c2: string; pad: number; glow: number; anim: number; topPad: number; glint: boolean;
  fx: FxSpec; noSweep?: boolean;
  /** silhueta animada: quadros [posição 0..1, pontos], todos com o mesmo número de pontos */
  morph?: { dur: number; frames: [number, Pt[]][] };
  bg: (t: Tier) => string; bgH: (t: Tier) => string; orn: (t: Tier, uid: string) => string;
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
  letreiro: { name: "Letreiro", lvl: 10, c1: "#ff3d7f", c2: "#ffe9b0", pad: 4, glow: 18, anim: 0, topPad: 46, glint: false, fx: { twinkle: 3 },
    bg: (t) => `linear-gradient(145deg, ${t.lo}, ${t.c} 30%, ${t.lo} 62%, ${t.c})`, bgH: (t) => `linear-gradient(145deg, ${t.c}, ${t.hi} 50%, ${t.c})`, orn: frameMarquee },
  engrenagens: { name: "Engrenagens", lvl: 0, c1: "#c27c3a", c2: "#ffe1a8", pad: 4, glow: 12, anim: 8, topPad: 34, glint: true, fx: { twinkle: 2 }, bg: metal, bgH: metalH, orn: frameGears },
  ritual: { name: "Ritual", lvl: 11, c1: "#d0173a", c2: "#ffa3b4", pad: 4, glow: 20, anim: 5, topPad: 44, glint: false, fx: { rise: 8, twinkle: 3, speed: [5, 9], size: [2, 5] },
    bg: (t) => `linear-gradient(180deg, #14030a, ${t.c} 45%, #14030a)`, bgH: (t) => `linear-gradient(180deg, ${t.lo}, ${t.hi} 50%, ${t.lo})`, orn: frameRitual },
  almas: { name: "Almas", lvl: 1, c1: "#6ee7c8", c2: "#f0fffb", pad: 3, glow: 22, anim: 7, topPad: 0, glint: false, fx: { rise: 10, twinkle: 4, speed: [6, 11], size: [2, 5] },
    bg: (t) => `linear-gradient(160deg, ${hexToRgba(t.hi, 0.75)}, ${t.c} 40%, ${hexToRgba(t.lo, 0.85)})`, bgH: (t) => `linear-gradient(160deg, #ffffff, ${t.hi} 40%, ${t.c})`, orn: frameSouls },
  fenda: { name: "Fenda", lvl: 12, c1: "#9dff3a", c2: "#f0ffd0", pad: 4, glow: 22, anim: 4, topPad: 22, glint: false, fx: { twinkle: 3, streak: 2 },
    morph: { dur: 4.8, frames: [[0, rift(2.5, 0)], [0.33, rift(6.5, 1)], [0.66, rift(4.5, 2)], [1, rift(2.5, 0)]] },
    bg: (t) => `linear-gradient(90deg, ${t.hi}, ${t.c} 12%, #0b1006 50%, ${t.c} 88%, ${t.hi})`, bgH: (t) => `linear-gradient(90deg, #ffffff, ${t.hi} 15%, ${t.c} 50%, ${t.hi} 85%, #ffffff)`, orn: frameRift },
  chifres: { name: "Chifres", lvl: 13, c1: "#ff4a1c", c2: "#ffc58a", pad: 4, glow: 22, anim: 5, topPad: 76, glint: false, fx: { rise: 10, twinkle: 2, speed: [3, 6], size: [2, 5] },
    morph: { dur: 3.6, frames: [[0, horns(0)], [0.5, horns(1)], [1, horns(0)]] },
    bg: (t) => `linear-gradient(180deg, ${t.hi}, ${t.c} 16%, #1a0703 55%, ${t.lo})`, bgH: (t) => `linear-gradient(180deg, #ffffff, ${t.hi} 20%, ${t.c} 60%, ${t.lo})`, orn: frameHorns },
  fechadura: { name: "Fechadura", lvl: 14, c1: "#aebdcc", c2: "#ffffff", pad: 4, glow: 14, anim: 6, topPad: 24, glint: true, fx: { twinkle: 3 },
    morph: { dur: 6, frames: [[0, lock(0)], [0.55, lock(0)], [0.62, lock(1)], [0.9, lock(1)], [0.97, lock(0)], [1, lock(0)]] },
    bg: metal, bgH: metalH, orn: frameLock },
};

export function getRarity(ovr: number, cfg: TierBand[]): Tier {
  const key = rarityKeyOf(ovr, cfg);
  return RARITY_TIERS.find((t) => t.key === key) ?? RARITY_TIERS[RARITY_TIERS.length - 1];
}

export function getCardTier(p: Player, cfg: TierBand[]): Tier {
  const base = getRarity(getPlayerOvr(p), cfg);
  const f = p.special ? p.frame : undefined;
  const pr = f && FRAME_PRESETS[f.style];
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

/** Silhueta animada da moldura (Web Animations): mesmo recorte na casca e no miolo da carta. */
export function silhouetteFrames(frame: string | undefined): { keyframes: Keyframe[]; duration: number } | null {
  const m = frame ? FRAME_PRESETS[frame]?.morph : undefined;
  if (!m) return null;
  return { duration: m.dur * 1000, keyframes: m.frames.map(([offset, pts]) => ({ offset, clipPath: "polygon(" + pts.map(([x, y]) => `${x}% ${y}%`).join(", ") + ")" })) };
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
