/**
 * Geometria dos rasgos da abertura de pack, em pixels da camada do pack (LAYER).
 * Sem React: dá para testar com um sorteio fixo.
 */

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };
export type Rand = () => number;
/** Buraco no pack. "light" só deixa passar luz; "card" mostra a carta. `edge` é a borda branca do papel; `flap`, a aba dobrada. */
export type Hole = { pts: Pt[]; kind: "light" | "card"; edge: Pt[]; flap?: { pts: Pt[]; side: Side } };
/** Pedaço arrancado que sai voando. */
export type Fly = { pts: Pt[]; to: { x: number; y: number; rotate: number } };
/** Desgaste acumulado: buracos, vincos e arranhões de superfície. */
export type Damage = { holes: Hole[]; fly: Fly[]; creases: Pt[][]; scuffs: Pt[][] };
type Side = "left" | "right" | "top" | "bottom";

/** Camada do pack: a carta (295 × 430) com 8 px de sobra em volta. */
export const LAYER = { w: 311, h: 446 };
const W = LAYER.w;
const H = LAYER.h;
const TAU = Math.PI * 2;

const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(rand: Rand, xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

/** Ruído suave e periódico (período 1) em [−1, 1]. */
function wobble(rand: Rand, octaves = 4) {
  const ph = Array.from({ length: octaves }, () => rand() * TAU);
  const total = ph.reduce((a, _, k) => a + 1 / (k + 1), 0);
  return (t: number) => ph.reduce((s, p, k) => s + Math.sin(TAU * (k + 1) * t + p) / (k + 1), 0) / total;
}

export const toPath = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
export const center = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const area = (pts: Pt[]) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/**
 * Buraco irregular. `square` > 2 deixa a forma mais retangular (cobre os cantos de um texto);
 * `rough` é a irregularidade relativa ao raio, com fibras miúdas por cima.
 */
export function blob(rand: Rand, cx: number, cy: number, rx: number, ry: number, rot = 0, rough = 0.2, square = 2): Pt[] {
  const n = Math.round(Math.min(120, Math.max(30, ((rx + ry) * Math.PI) / 2.5)));
  const w = wobble(rand);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const e = 2 / square;
  return Array.from({ length: n }, (_, i): Pt => {
    const t = i / n;
    const ca = Math.cos(t * TAU);
    const sa = Math.sin(t * TAU);
    const r = 1 + w(t) * rough + (rand() - 0.5) * rough * 0.5;
    const x = Math.sign(ca) * Math.abs(ca) ** e * rx * r;
    const y = Math.sign(sa) * Math.abs(sa) ** e * ry * r;
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}

/** Arranhão/fenda fina entre dois pontos, afinando nas pontas e com a linha levemente torta. */
export function slash(rand: Rand, x1: number, y1: number, x2: number, y2: number, width: number): Pt[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const n = Math.max(10, Math.round(len / 2.5));
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const bend = wobble(rand, 3);
  const thick = wobble(rand, 3);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bend(t * 0.5) * len * 0.05;
    const h = (width / 2) * Math.sin(Math.PI * t) ** 0.6 * (0.7 + 0.5 * thick(t * 0.5)) + rand() * 0.4;
    const cx = x1 + ux * len * t - uy * off;
    const cy = y1 + uy * len * t + ux * off;
    left.push([cx - uy * h + (rand() - 0.5) * 0.6, cy + ux * h + (rand() - 0.5) * 0.6]);
    right.push([cx + uy * h, cy - ux * h]);
  }
  return [...left, ...right.reverse()];
}

/** Borda branca do papel rasgado: largura que varia e some em alguns trechos, como o miolo do papel aparecendo. */
export function fiberEdge(rand: Rand, pts: Pt[], max: number): Pt[] {
  const n = pts.length;
  const w = wobble(rand, 3);
  const sign = area(pts) > 0 ? 1 : -1;
  return pts.map((p, i): Pt => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const base = Math.max(0, w(i / n) * 1.5 - 0.15) * max;
    const k = base > 0 ? base + rand() * 0.45 * max : rand() * 0.12 * max;
    return [p[0] + (dy / l) * sign * k, p[1] - (dx / l) * sign * k];
  });
}

/** Aba de papel dobrada para fora do buraco, presa por um dos lados (encurtada, como se estivesse curvada). */
export function foldFlap(pts: Pt[], side: Side, squash = 0.55): Pt[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const hinge = side === "left" ? Math.min(...xs) : side === "right" ? Math.max(...xs) : side === "top" ? Math.min(...ys) : Math.max(...ys);
  return pts.map(([x, y]): Pt => (side === "left" || side === "right" ? [hinge - (x - hinge) * squash, y] : [x, hinge - (y - hinge) * squash]));
}

const inRect = (p: Pt, r: Rect) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
export function inPoly([x, y]: Pt, pts: Pt[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** O buraco encosta em algum dos retângulos (com folga `pad`)? */
export function touches(pts: Pt[], rects: Rect[], pad = 0) {
  return rects.some((r0) => {
    const r = { x: r0.x - pad, y: r0.y - pad, w: r0.w + pad * 2, h: r0.h + pad * 2 };
    if (pts.some((p) => inRect(p, r))) return true;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 3; j++) if (inPoly([r.x + (r.w * i) / 6, r.y + (r.h * j) / 3], pts)) return true;
    return false;
  });
}

const hole = (rand: Rand, pts: Pt[], kind: Hole["kind"], fiber: number, flap?: Side): Hole =>
  ({ pts, kind, edge: fiberEdge(rand, pts, fiber), flap: flap && { pts: foldFlap(pts.map(inside), flap, 0.45), side: flap } });
/** Só a parte do buraco que fica dentro do pack dobra (o resto já não existe). */
const inside = ([x, y]: Pt): Pt => [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];

/** Vinco atravessando o pack, de uma borda a outra. */
function crease(rand: Rand): Pt[] {
  const vertical = rand() < 0.5;
  const a: Pt = vertical ? [between(rand, 0.15, 0.85) * W, -4] : [-4, between(rand, 0.15, 0.85) * H];
  const b: Pt = vertical ? [between(rand, 0.15, 0.85) * W, H + 4] : [W + 4, between(rand, 0.15, 0.85) * H];
  return Array.from({ length: 6 }, (_, i): Pt => {
    const t = i / 5;
    const j = i === 0 || i === 5 ? 0 : 7;
    return [a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * j, a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * j];
  });
}

/** Grupo de arranhões de superfície (não atravessam o pack). */
function scuffs(rand: Rand): Pt[][] {
  const x = between(rand, 20, W - 20);
  const y = between(rand, 30, H - 30);
  const ang = between(rand, 0, Math.PI);
  return Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, i) => {
    const len = between(rand, 10, 26);
    const ox = x + Math.sin(ang) * i * 4;
    const oy = y - Math.cos(ang) * i * 4;
    return [[ox, oy], [ox + Math.cos(ang) * len, oy + Math.sin(ang) * len]];
  });
}

const emptyDamage = (): Damage => ({ holes: [], fly: [], creases: [], scuffs: [] });

/**
 * 1º rasgo: um de vários formatos, sempre longe do nome do pack (`avoid`) e só com luz.
 * Pode vir com vinco e arranhões, para o pack começar a parecer judiado.
 */
export function firstTear(rand: Rand, avoid: Rect[]): Damage {
  for (let i = 0; i < 30; i++) {
    const d = tearVariant(rand, avoid);
    if (!d.holes.some((h) => touches(h.pts, avoid))) return d;
  }
  // nada coube: um canto pequeno, longe de tudo
  const d = emptyDamage();
  d.holes.push(hole(rand, blob(rand, W + 4, -4, 34, 30, 0.3, 0.26), "light", 5, "left"));
  return d;
}

function tearVariant(rand: Rand, avoid: Rect[]): Damage {
  const d = emptyDamage();
  const variant = pick(rand, ["notch", "cornerR", "cornerL", "side", "puncture", "claw"] as const);
  if (variant === "notch") {
    const pts = blob(rand, between(rand, 0.64, 0.84) * W, -8, between(rand, 24, 36), between(rand, 44, 56), between(rand, -0.25, 0.25), 0.3);
    d.holes.push(hole(rand, pts, "light", 5));
    d.fly.push({ pts, to: { x: between(rand, 30, 90), y: -150, rotate: between(rand, 20, 45) } });
  } else if (variant === "cornerR" || variant === "cornerL") {
    const right = variant === "cornerR";
    const pts = blob(rand, right ? W + 6 : -6, -6, between(rand, 52, 66), between(rand, 46, 58), between(rand, -0.4, 0.4), 0.26);
    d.holes.push(hole(rand, pts, "light", 6, right ? "left" : "right"));
  } else if (variant === "side") {
    const right = rand() < 0.5;
    const pts = blob(rand, right ? W + 8 : -8, between(rand, 0.4, 0.52) * H, between(rand, 42, 56), between(rand, 13, 19), between(rand, -0.2, 0.2), 0.32);
    d.holes.push(hole(rand, pts, "light", 5));
    d.fly.push({ pts, to: { x: right ? 160 : -160, y: between(rand, -20, 40), rotate: right ? 55 : -55 } });
  } else if (variant === "puncture") {
    let cx = 0;
    let cy = 0;
    let pts: Pt[] = [];
    for (let i = 0; i < 20; i++) {
      cx = between(rand, 0.28, 0.72) * W;
      cy = between(rand, 0.4, 0.5) * H;
      pts = blob(rand, cx, cy, between(rand, 15, 21), between(rand, 13, 18), rand() * TAU, 0.5);
      if (!touches(pts, avoid, 30)) break;
    }
    d.holes.push(hole(rand, pts, "light", 4));
    const cracks = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < cracks; i++) {
      const a = rand() * TAU;
      const len = between(rand, 28, 46);
      const crack = slash(rand, cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 3.5);
      if (!touches(crack, avoid, 4)) d.holes.push(hole(rand, crack, "light", 1.5));
    }
  } else {
    const x0 = between(rand, 0.55, 0.72) * W;
    const y0 = between(rand, 0.36, 0.42) * H;
    const a = between(rand, 1.85, 2.2);
    const len = between(rand, 70, 100);
    for (let i = 0; i < 3; i++) {
      const ox = x0 + i * 15;
      const oy = y0 + i * 6;
      d.holes.push(hole(rand, slash(rand, ox, oy, ox + Math.cos(a) * len * (i === 1 ? 1.1 : 0.9), oy + Math.sin(a) * len, between(rand, 6, 8)), "light", 2.5));
    }
  }
  d.creases.push(crease(rand));
  d.scuffs.push(...scuffs(rand));
  return d;
}

/**
 * 2º rasgo: buraco em cima do atributo sorteado (`cell`), sem encostar em nada de `forbidden`,
 * com a aba dobrada para o lado. Se não couber com folga, encolhe; no limite, recorta o retângulo justo.
 */
export function statHole(rand: Rand, cell: Rect, forbidden: Rect[]): Hole {
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  const side = pick(rand, ["left", "right", "top"] as const);
  for (let i = 0; i < 14; i++) {
    const k = 1 - i * 0.06;
    const pts = blob(rand, cx, cy, (cell.w / 2 + 12) * k, (cell.h / 2 + 4) * k, between(rand, -0.05, 0.05), 0.17, 3.5);
    if (!touches(pts, forbidden)) return hole(rand, pts, "card", 6, side);
  }
  const { x, y, w, h } = cell;
  return hole(rand, [[x - 2, y - 1], [x + w + 2, y - 1], [x + w + 2, y + h + 1], [x - 2, y + h + 1]], "card", 4, side);
}

/**
 * Mais desgaste no 2º toque: arranhões que mostram fiapos da carta (nunca perto de `forbidden`),
 * uma rachadura de luz saindo do primeiro rasgo e mais vincos e marcas.
 */
export function moreDamage(rand: Rand, first: Hole | undefined, forbidden: Rect[], avoid: Rect[]): Damage {
  const d = emptyDamage();
  const want = 2 + Math.floor(rand() * 2);
  for (let tries = 0; tries < 80 && d.holes.length < want; tries++) {
    const x = between(rand, 16, W - 16);
    const y = between(rand, 18, H - 18);
    const a = rand() * TAU;
    const len = between(rand, 30, 70);
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    if (x2 < 14 || x2 > W - 14 || y2 < 16 || y2 > H - 16) continue;
    const pts = slash(rand, x, y, x2, y2, between(rand, 2.5, 4));
    if (!touches(pts, forbidden, 10) && !touches(pts, avoid, 2)) d.holes.push(hole(rand, pts, "card", 1.8));
  }
  if (first) {
    const [fx, fy] = center(first.pts);
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.atan2(H / 2 - fy, W / 2 - fx) + between(rand, -0.7, 0.7);
      const len = between(rand, 40, 70);
      const sx = Math.min(W - 6, Math.max(6, fx + Math.cos(a) * 20));
      const sy = Math.min(H - 6, Math.max(6, fy + Math.sin(a) * 20));
      const pts = slash(rand, sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, 4.5);
      if (!touches(pts, avoid, 2)) { d.holes.push(hole(rand, pts, "light", 2)); break; }
    }
  }
  d.creases.push(crease(rand), crease(rand));
  d.scuffs.push(...scuffs(rand), ...scuffs(rand));
  return d;
}

/** 3º: o pack inteiro em tiras verticais com borda irregular, como um pôster arrancado. */
export function strips(rand: Rand, count: number): Pt[][] {
  const edges: Pt[][] = [];
  for (let i = 0; i <= count; i++) {
    const base = (i / count) * W;
    const w = wobble(rand, 3);
    edges.push(Array.from({ length: 30 }, (_, j): Pt => {
      const y = -6 + (j * (H + 12)) / 29;
      if (i === 0) return [-6, y];
      if (i === count) return [W + 6, y];
      return [base + w(j / 58) * 16 + (rand() - 0.5) * 3, y];
    }));
  }
  return Array.from({ length: count }, (_, i) => [...edges[i], ...[...edges[i + 1]].reverse()]);
}
