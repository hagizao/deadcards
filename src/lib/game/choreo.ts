// Coreografia das habilidades: as próprias cartas se mexem (avançam, colidem, voam de um local para outro).
// Enquanto a cena roda, cada carta envolvida vira um dublê (cópia da face) numa camada fixa por cima da tela; a
// carta de verdade fica invisível no lugar final e reaparece quando a cena acaba. Só transform e opacity.
import type { AbilityKey } from "./config";

/** Centro e tamanho de uma caixa na tela. */
export type Box = { x: number; y: number; w: number; h: number };

/** Uma carta na cena: o dublê (`g`, nulo se a carta saiu da mesa) sai de `from` e termina em `to`. */
export type Actor = { id: number; g: HTMLElement | null; from: Box; to: Box; foe: boolean };

export type Stage = {
  src: Actor; dst: Actor[];
  /** A própria carta mudou (a Vindicta que cai). */ self: boolean;
  /** O puxão do gancho do Bebop. */ pull: boolean;
  layer: HTMLElement;
  /** Tremor da mesa, de 1 (leve) a 3 (forte). */ shake: (power: 1 | 2 | 3) => void;
};

/** `ms`: duração da cena, pelo número de alvos, se a própria carta mudou e se é o puxão. */
type Recipe = { ms: (n: number, self: boolean, pull: boolean) => number; run: (s: Stage) => void };

const ease = { out: "cubic-bezier(.2,.8,.2,1)", in: "cubic-bezier(.6,0,.9,.4)", io: "cubic-bezier(.65,0,.35,1)" };
const tf = (dx = 0, dy = 0, r = 0, sx = 1, sy = sx) => `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${sx}, ${sy})`;
/** Anima por quadros-chave; `easing` vale para cada trecho (o quadro pode ter o seu), a linha do tempo é linear. */
const move = (el: Element | null, kf: Keyframe[], ms: number, delay = 0, easing = ease.out) =>
  el?.animate(kf.map((k) => ({ easing, ...k })), { duration: ms, delay, fill: "both" });
const later = (f: () => void, ms: number) => setTimeout(f, ms);
const off = (a: Box, b: Box) => ({ dx: b.x - a.x, dy: b.y - a.y, len: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) });

/** Elemento solto na camada, centrado em `at` (opcional), que some sozinho depois de `life` ms. */
function spawn(s: Stage, cls: string, at: Box | null, size: number, life: number, text = "") {
  const el = document.createElement("div");
  el.className = `absolute ${cls}`;
  el.textContent = text;
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, left: `${(at?.x ?? 0) - size / 2}px`, top: `${(at?.y ?? 0) - size / 2}px` });
  s.layer.appendChild(el);
  later(() => el.remove(), life);
  return el;
}

/** Lampejo branco em cima de um dublê. */
function flash(a: Actor, ms = 220, cls = "bg-white") {
  if (!a.g) return;
  const el = document.createElement("div");
  el.className = `absolute inset-0 rounded-lg ${cls} mix-blend-screen`;
  a.g.appendChild(el);
  move(el, [{ opacity: 0.95 }, { opacity: 0 }], ms)?.finished.then(() => el.remove(), () => el.remove());
}

/** Anel de choque no chão. */
function shock(s: Stage, at: Box, cls = "border-white/80", r = 1.6) {
  const el = spawn(s, `rounded-full border-4 ${cls}`, at, at.w, 600);
  move(el, [{ transform: "scale(0.3)", opacity: 1 }, { transform: `scale(${r})`, opacity: 0 }], 520);
}

/** Partículas saindo de um ponto (poeira, estilhaços, faíscas, penas). */
function burst(s: Stage, at: Box, n: number, cls: string, r = 60, ms = 600, text = "", up = 0, size = 8) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
    const d = r * (0.6 + ((i * 37) % 10) / 22);
    const el = spawn(s, `${cls} leading-none`, at, size, ms + 60, text);
    move(el, [{ transform: tf(0, 0, 0, 0.4), opacity: 1 }, { transform: tf(Math.cos(t) * d, Math.sin(t) * d * 0.7 + up, (i * 47) % 180, 1), opacity: 0 }], ms, (i % 3) * 25);
  }
}

/** Poeira levantando no pé da carta. */
const dust = (s: Stage, at: Box, n = 8) => burst(s, { ...at, y: at.y + at.h * 0.45 }, n, "rounded-full bg-amber-100/60 blur-[1px]", at.w * 0.7, 520, "", -12, 10);

/**
 * Linha esticada a cada quadro entre dois pontos que se mexem (braço do gancho, chicote, laser). `tip(t)` diz onde
 * fica a ponta no instante `t` (0 a 1) da duração; volta a função que para.
 */
function cable(s: Stage, cls: string, w: number, from: () => Box, tip: (t: number) => Box, ms: number, head = "") {
  const line = document.createElement("div");
  line.className = `absolute left-0 top-0 origin-left rounded-full ${cls}`;
  line.style.height = `${w}px`;
  const cap = document.createElement("div");
  cap.className = "absolute left-0 top-0 text-3xl leading-none drop-shadow-[0_2px_3px_rgb(0_0_0/0.9)]";
  cap.textContent = head;
  s.layer.appendChild(line); s.layer.appendChild(cap);
  const t0 = performance.now();
  let id = 0;
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    const a = from(), b = tip(t), o = off(a, b);
    line.style.width = `${o.len}px`;
    line.style.transform = `translate(${a.x}px, ${a.y - w / 2}px) rotate(${o.ang}rad)`;
    cap.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) rotate(${o.ang + Math.PI / 2}rad)`;
    if (t < 1) id = requestAnimationFrame(frame);
    else { line.remove(); cap.remove(); }
  };
  id = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(id); line.remove(); cap.remove(); };
}

/** Centro atual de um dublê na tela (com as animações dele). */
const now = (a: Actor): Box => {
  const r = a.g?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: a.from.w, h: a.from.h } : a.to;
};
const mix = (a: Box, b: Box, t: number): Box => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w, h: a.h });

/** Abrams: abaixa a cabeça, arranca em linha reta e chifra; a vítima voa girando para o outro local (ou racha na beirada). */
function abrams(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (!v) {
    move(src.g, [{ transform: tf() }, { transform: tf(0, 8, -6, 1.05, 0.94) }, { transform: tf(0, -10, 4, 1.1) }, { transform: tf() }], 600);
    return dust(s, src.from, 10);
  }
  const o = off(src.from, v.from);
  const ux = o.dx / (o.len || 1), uy = o.dy / (o.len || 1);
  const reach = Math.max(0, o.len - (src.from.h + v.from.h) * 0.42);
  const tilt = ux >= 0 ? 8 : -8;
  // preparo: recua, abaixa e raspa o pé
  move(src.g, [
    { transform: tf(), offset: 0 },
    { transform: tf(-ux * 14, -uy * 14, -tilt, 1.06, 0.94), offset: 0.18, easing: ease.out },
    { transform: tf(-ux * 10, -uy * 10, -tilt * 0.6, 1.06, 0.94), offset: 0.3, easing: ease.in },
    // investida e impacto (com uma parada curta no contato)
    { transform: tf(ux * reach, uy * reach, tilt * 0.4, 1.12), offset: 0.46, easing: "linear" },
    { transform: tf(ux * reach, uy * reach, tilt * 0.4, 1.12), offset: 0.52, easing: ease.out },
    // derrapa e volta
    { transform: tf(ux * reach * 0.6, uy * reach * 0.6, -tilt * 0.3, 1.04), offset: 0.75, easing: ease.out },
    { transform: tf(), offset: 1 },
  ], 1100);
  later(() => dust(s, src.from, 9), 120);
  later(() => dust(s, src.from, 6), 330);
  const hit = 1100 * 0.46;
  later(() => {
    const at = mix(src.from, v.from, (reach + src.from.h * 0.2) / (o.len || 1));
    spawn(s, "rounded-full bg-radial from-white via-amber-200/70 to-transparent to-70%", at, v.from.w * 1.6, 260);
    burst(s, at, 12, "bg-zinc-200 [clip-path:polygon(50%_0,100%_100%,0_60%)]", v.from.w * 0.9, 560);
    flash(v);
    s.shake(2);
  }, hit);
  const moved = Math.hypot(v.to.x - v.from.x, v.to.y - v.from.y) > 4;
  if (moved) {
    // voa num arco, girando, e quica no local novo
    const d = off(v.from, v.to);
    const up = Math.max(70, d.len * 0.45);
    const spin = d.dx >= 0 ? 540 : -540;
    move(v.g, [
      { transform: tf(), offset: 0 },
      { transform: tf(ux * 14, uy * 14, spin * 0.05, 1.05, 0.9), offset: 0.08 },
      { transform: tf(d.dx * 0.5, d.dy * 0.5 - up, spin * 0.5, 1.2), offset: 0.48 },
      { transform: tf(d.dx, d.dy, spin, 1.02, 0.94), offset: 0.8, easing: ease.out },
      { transform: tf(d.dx, d.dy - 12, spin, 1), offset: 0.9, easing: ease.in },
      { transform: tf(d.dx, d.dy, spin, 1), offset: 1 },
    ], 640, hit, ease.io);
    later(() => { dust(s, v.to, 10); s.shake(1); }, hit + 640 * 0.8);
  } else {
    // contra a parede: amassa, racha e escorrega de volta
    move(v.g, [
      { transform: tf() },
      { transform: tf(ux * 18, uy * 18, tilt, 0.92, 1.04), offset: 0.2 },
      { transform: tf(ux * 10, uy * 10 + 6, tilt * 0.5), offset: 0.6 },
      { transform: tf() },
    ], 520, hit);
    later(() => burst(s, v.from, 6, "h-0.5 w-6 bg-white/90", v.from.w * 0.4, 500), hit);
  }
}

/** Bebop: na própria revelação, gira o braço; no puxão, o gancho voa até a carta, prende e arrasta para a lane dele. */
function bebop(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (!s.pull || !v) {
    move(src.g, [{ transform: tf() }, { transform: tf(0, -4, -10, 1.06) }, { transform: tf(0, -4, 10, 1.06) }, { transform: tf(0, -2, -6, 1.03) }, { transform: tf() }], 620);
    const hook = spawn(s, "text-4xl leading-none drop-shadow-[0_2px_4px_rgb(0_0_0/0.9)]", { ...src.from, y: src.from.y - src.from.h * 0.55 }, 40, 700, "🪝");
    move(hook, [{ transform: "rotate(0deg) scale(0.4)", opacity: 0 }, { transform: "rotate(360deg) scale(1.1)", opacity: 1, offset: 0.6 }, { transform: "rotate(720deg) scale(0.9)", opacity: 0 }], 650, 0, "linear");
    return;
  }
  const out = 330, grab = 90, drag = 520;
  const from = () => ({ ...src.from, y: src.from.y - src.from.h * 0.1 });
  // preparo: inclina para a vítima e solta o braço
  const tilt = v.from.x >= src.from.x ? 7 : -7;
  move(src.g, [{ transform: tf() }, { transform: tf(0, 0, -tilt, 1.04), offset: 0.3 }, { transform: tf(0, 0, tilt, 1.06), offset: 0.5 }, { transform: tf(0, 0, tilt * 0.6, 1.04), offset: 0.85 }, { transform: tf() }], out + grab + drag + 260);
  cable(s, "bg-[repeating-linear-gradient(90deg,var(--color-zinc-300)_0_10px,var(--color-amber-700)_10px_14px)] shadow-[0_0_6px_rgb(0_0_0/0.8)]", 7, from, (t) => {
    const T = t * (out + grab + drag + 220);
    if (T < out) return mix(from(), v.from, ease3(T / out));
    if (T < out + grab + drag) return now(v);
    return mix(v.to, from(), ease3((T - out - grab - drag) / 220));
  }, out + grab + drag + 220, "🪝");
  // prende: a carta treme com o tranco
  later(() => { flash(v, 160, "bg-amber-200"); burst(s, v.from, 8, "size-1.5 rounded-full bg-amber-300", v.from.w * 0.5, 380); }, out);
  const d = off(v.from, v.to);
  move(v.g, [
    { transform: tf(), offset: 0 },
    { transform: tf(-d.dx * 0.03, -d.dy * 0.03, 0, 0.94, 1.04), offset: grab / (grab + drag) },
    { transform: tf(d.dx * 0.6, d.dy * 0.6 - 20, d.dx >= 0 ? -10 : 10, 1.08), offset: 0.7, easing: ease.in },
    { transform: tf(d.dx, d.dy, 0, 1.06, 0.92), offset: 0.92 },
    { transform: tf(d.dx, d.dy, 0, 1), offset: 1 },
  ], grab + drag + 80, out, ease.io);
  // faíscas raspando no caminho e o baque ao cair na lane do Bebop
  for (let i = 1; i <= 4; i++) later(() => burst(s, now(v), 4, "size-1 rounded-full bg-amber-200", 30, 300), out + grab + i * (drag / 5));
  later(() => { dust(s, v.to, 10); s.shake(1); }, out + (grab + drag + 80) * 0.92);
}
const ease3 = (t: number) => 1 - (1 - t) ** 3;

/** Vindicta: a mira escurece a tela, a retícula trava, o laser marca e o tiro empurra a vítima; se não matou, ela cai. */
function vindicta(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (!v) return;
  const aim = 420, fire = aim + 120;
  // vinheta: tudo escurece menos o alvo
  const vig = spawn(s, "rounded-full", null, 10, fire + 650);
  Object.assign(vig.style, { left: "0px", top: "0px", width: "100%", height: "100%", background: `radial-gradient(circle at ${v.from.x}px ${v.from.y}px, transparent 0, transparent ${v.from.w * 0.9}px, rgb(0 0 0 / 0.65) ${v.from.w * 2.2}px)`, borderRadius: "0" });
  move(vig, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], fire + 600);
  // retícula sai da Vindicta, desliza e trava no alvo
  const ret = spawn(s, "rounded-full border-2 border-red-500 shadow-[0_0_10px_var(--color-red-500)] bg-[linear-gradient(var(--color-red-500),var(--color-red-500))_center/2px_100%_no-repeat,linear-gradient(var(--color-red-500),var(--color-red-500))_center/100%_2px_no-repeat]", src.from, v.from.w * 0.8, fire + 350);
  const o = off(src.from, v.from);
  move(ret, [
    { transform: tf(0, 0, 0, 1.8), opacity: 0 },
    { transform: tf(o.dx * 0.85, o.dy * 0.85, 45, 1.3), opacity: 1, offset: 0.55 },
    { transform: tf(o.dx, o.dy, 90, 0.9), offset: 0.85 },
    { transform: tf(o.dx, o.dy, 90, 1), opacity: 1 },
  ], aim, 0, ease.io);
  move(ret, [{ opacity: 1 }, { opacity: 0 }], 300, fire);
  // laser fino tremendo até o disparo
  const stop = cable(s, "bg-red-500 shadow-[0_0_8px_var(--color-red-500)]", 2, () => src.from, (t) => ({ ...v.from, x: v.from.x + Math.sin(t * 40) * 2 * (1 - t) }), fire);
  later(stop, fire);
  move(src.g, [{ transform: tf() }, { transform: tf(0, 2, 0, 1.03) }], aim, 0);
  later(() => {
    // disparo: clarão na boca, coice, buraco de bala e a vítima jogada para trás
    spawn(s, "rounded-full bg-radial from-white via-yellow-300/80 to-transparent to-70%", src.from, src.from.w, 200);
    move(src.g, [{ transform: tf(0, 2, 0, 1.03) }, { transform: tf(-o.dx / (o.len || 1) * 16, -o.dy / (o.len || 1) * 16, o.dx >= 0 ? -8 : 8, 1.03) }, { transform: tf() }], 380);
    const ux = o.dx / (o.len || 1), uy = o.dy / (o.len || 1);
    move(v.g, [{ transform: tf() }, { transform: tf(ux * 22, uy * 22, ux >= 0 ? 9 : -9, 0.95) }, { transform: tf(ux * 6, uy * 6, 0) }, { transform: tf() }], 520);
    flash(v, 180);
    if (v.g) {
      const hole = document.createElement("div");
      hole.className = "absolute left-1/2 top-[40%] size-5 -translate-1/2 rounded-full bg-radial from-black via-zinc-900 to-zinc-500/0 to-80% shadow-[0_0_0_2px_rgb(255_255_255/0.25)]";
      v.g.appendChild(hole);
      move(hole, [{ transform: "scale(0.2)", opacity: 1 }, { transform: "scale(1)", opacity: 1, offset: 0.15 }, { transform: "scale(1)", opacity: 0 }], 900);
    }
    burst(s, v.from, 8, "size-1.5 rounded-full bg-red-400", v.from.w * 0.6, 420);
    s.shake(1);
  }, fire);
  if (s.self) later(() => {
    // errou o golpe de misericórdia: despenca, apagada, soltando penas de corvo
    move(src.g, [{ transform: tf() }, { transform: tf(0, -26, -6, 1.06) }, { transform: tf(0, 14, 4, 0.94, 1) }, { transform: tf() }], 560, 0, ease.io);
    later(() => burst(s, src.from, 7, "text-xl", src.from.w * 0.7, 700, "🪶", 40, 20), 200);
  }, fire + 380);
}

/** Lash: salta para fora da mesa, laça até duas cartas, ergue no ar e bate com tudo no outro local. */
function lash(s: Stage) {
  const { src } = s;
  const vs = s.dst.slice(0, 2);
  const jump = 260, lift = 300, slam = 240;
  const total = jump + lift + slam + 300;
  move(src.g, [
    { transform: tf(), offset: 0 },
    { transform: tf(0, 10, 0, 1.06, 0.9), offset: 0.08 },
    { transform: tf(0, -src.from.h * 0.9, -6, 1.25), offset: jump / total, easing: ease.out },
    { transform: tf(0, -src.from.h * 1.05, 4, 1.28), offset: (jump + lift) / total, easing: ease.in },
    { transform: tf(0, 0, 0, 1.05, 0.92), offset: (jump + lift + slam) / total },
    { transform: tf(), offset: 1 },
  ], total);
  later(() => dust(s, src.from, 8), 40);
  const top = () => { const b = now(src); return { ...b, y: b.y - src.from.h * 0.3 }; };
  vs.forEach((v, i) => {
    cable(s, "bg-linear-to-r from-amber-300 to-orange-600 shadow-[0_0_6px_var(--color-amber-500)]", 4, top, (t) => {
      const T = t * (jump + lift + slam);
      return T < jump ? mix(top(), v.from, ease3(T / jump)) : now(v);
    }, jump + lift + slam);
    const d = off(v.from, v.to);
    const up = v.from.h * 0.7 + i * 10;
    move(v.g, [
      { transform: tf(), offset: 0 },
      { transform: tf(0, -6, i ? 6 : -6, 1.04), offset: 0.12 },
      { transform: tf(d.dx * 0.2, -up, i ? 10 : -10, 1.18), offset: lift / (lift + slam) * 0.9, easing: ease.in },
      { transform: tf(d.dx, d.dy, 0, 1.1, 0.86), offset: 0.93 },
      { transform: tf(d.dx, d.dy, 0, 1), offset: 1 },
    ], lift + slam + 40, jump, ease.io);
  });
  later(() => {
    vs.forEach((v) => { shock(s, v.to, "border-amber-300/90", 2); dust(s, v.to, 12); flash(v, 200); });
    shock(s, src.from, "border-white/70", 1.4);
    s.shake(3);
  }, jump + lift + slam);
}

/** As habilidades que já têm coreografia (as outras seguem com o efeito por cima da mesa). */
export const CHOREO: Partial<Record<AbilityKey, Recipe>> = {
  "Abrams": { ms: (n) => (n ? 1150 : 650), run: abrams },
  "Bebop": { ms: (n, _s, pull) => (pull && n ? 1250 : 650), run: bebop },
  "Vindicta": { ms: (n, self) => (n ? (self ? 1500 : 1150) : 0), run: vindicta },
  "Lash": { ms: (n) => (n ? 1150 : 0), run: lash },
};

/**
 * Prepara os dublês de uma cena. `hold` cria o dublê de uma carta já (para a que trocou de local ficar no lugar velho
 * até a cena), `start` cria os que faltam e roda; no fim tudo some e as cartas de verdade voltam a aparecer.
 */
export class Rig {
  readonly layer: HTMLDivElement;
  private actors = new Map<number, Actor>();
  private hidden: Animation[] = [];
  constructor() {
    this.layer = document.createElement("div");
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.className = "pointer-events-none fixed inset-0 z-90 overflow-hidden";
    document.body.appendChild(this.layer);
  }
  /** Dublê da carta `id` parado em `from`, terminando em `to`; a carta de verdade some até o fim da cena. */
  hold(id: number, from: Box | null, foe: boolean): Actor | null {
    if (this.actors.has(id)) return this.actors.get(id)!;
    const el = document.querySelector<HTMLElement>(`[data-card="${id}"]`);
    const r = el?.getBoundingClientRect();
    const to = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null;
    const at = from ?? to;
    if (!at) return null;
    const face = el?.querySelector("button")?.firstElementChild ?? el?.firstElementChild;
    let g: HTMLElement | null = null;
    if (el && face) {
      g = document.createElement("div");
      g.className = "absolute will-change-transform drop-shadow-[0_6px_6px_rgb(0_0_0/0.8)]";
      Object.assign(g.style, { left: `${at.x - at.w / 2}px`, top: `${at.y - at.h / 2}px`, width: `${at.w}px`, height: `${at.h}px` });
      const copy = face.cloneNode(true) as HTMLElement;
      copy.style.width = "100%";
      g.appendChild(copy);
      this.layer.appendChild(g);
      this.hidden.push(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: "forwards" }));
    }
    const a: Actor = { id, g, from: at, to: to ?? at, foe };
    this.actors.set(id, a);
    return a;
  }
  /** Roda a coreografia e limpa no fim. */
  start(ab: AbilityKey, src: { id: number; box: Box | null }, dst: { id: number; foe: boolean }[], self: boolean, pull: boolean, shake: Stage["shake"]) {
    const recipe = CHOREO[ab];
    // a carta que agiu pode ter saído da mesa (a Vindicta zerada na queda): a cena roda do lugar onde ela estava
    const s = this.hold(src.id, document.querySelector(`[data-card="${src.id}"]`) ? null : src.box, false);
    if (!recipe || !s) return this.done();
    const stage: Stage = { src: s, dst: dst.flatMap((d) => this.hold(d.id, null, d.foe) ?? []), self, pull, layer: this.layer, shake };
    recipe.run(stage);
    later(() => this.done(), recipe.ms(stage.dst.length, self, pull) + 60);
  }
  done() {
    this.hidden.forEach((a) => a.cancel());
    this.layer.remove();
  }
}
