// A coreografia de cada herói, nos quatro tempos: preparo, ação, impacto e consequência. As peças estão em
// choreoKit.ts; quem roda a cena é o Rig (choreo.ts).
import type { AbilityKey } from "./config";
import {
  beam, burst, cable, cover, glow, mist, vine, dust, ease, ease3, flash, where, half, hop, icon, jitter, jostle, knock, later, mix, move, now, off, pt, rise,
  shock, spawn, stick, swap, tf, vignette, type Actor, type Box, type Recipe, type Stage,
} from "./choreoKit";

const foesOf = (s: Stage) => s.dst.filter((a) => a.foe);
const alliesOf = (s: Stage) => s.dst.filter((a) => !a.foe);
/** Inclina a carta para o alvo e volta (mirar, puxar o braço). */
const lean = (a: Actor, to: Box, ms = 300, k = 8) => {
  const { ux, uy } = off(a.from, to);
  return move(a.g, [{ transform: tf() }, { transform: tf(-ux * k, -uy * k, ux >= 0 ? -6 : 6, 1.06), offset: 0.6 }, { transform: tf(0, 0, 0, 1.04) }], ms);
};
/** Levanta a carta da mesa (preparo) e volta. */
const lift = (a: Actor, ms = 320, dy = -12, sc = 1.08) => move(a.g, [{ transform: tf() }, { transform: tf(0, dy, 0, sc), offset: 0.5 }, { transform: tf() }], ms);
/** Brilho que atravessa a carta (aço, luz). */
const shine = (a: Actor, cls = "bg-linear-to-r from-transparent via-white/70 to-transparent", ms = 420) => {
  if (!a.g) return;
  const clip = document.createElement("div");
  clip.className = "absolute inset-0 overflow-hidden rounded-lg";
  const bar = document.createElement("div");
  bar.className = `absolute -inset-y-4 left-0 w-1/3 -skew-x-12 mix-blend-screen ${cls}`;
  clip.appendChild(bar);
  a.g.appendChild(clip);
  move(bar, [{ transform: "translateX(-120%)" }, { transform: `translateX(${a.from.w * 3.2}px)` }], ms, 0, ease.io);
};
/** "Z" subindo da carta que dorme. */
const zzz = (s: Stage, a: Box, n = 3) => {
  for (let i = 0; i < n; i++) {
    const el = spawn(s, "text-center text-lg leading-none font-black text-indigo-200 [text-shadow:0_0_6px_var(--color-indigo-500)]", pt(a.x + a.w * 0.25, a.y - a.h * 0.25), 20, 1100);
    el.textContent = "Z";
    move(el, [{ transform: tf(0, 0, 0, 0.4), opacity: 0 }, { transform: tf(6, -16, 8, 0.9), opacity: 1, offset: 0.4 }, { transform: tf(14, -42, 14, 1.2), opacity: 0 }], 900, i * 260);
  }
};
/** Garradas: riscos que rasgam a carta em sequência. */
const claws = (a: Actor, cls: string, n = 3, rot = 25, gap = 90) => {
  for (let i = 0; i < n; i++) later(() => {
    const el = cover(a, `inset-x-[15%] top-1/2 h-1 rounded-full ${cls}`, [{ transform: `translateY(${(i - 1) * 14}px) rotate(${rot}deg) scaleX(0)`, opacity: 1 }, { transform: `translateY(${(i - 1) * 14}px) rotate(${rot}deg) scaleX(1)`, opacity: 1, offset: 0.4 }, { transform: `translateY(${(i - 1) * 14}px) rotate(${rot}deg) scaleX(1)`, opacity: 0 }], 520);
    el?.classList.remove("inset-0");
  }, i * gap);
};
/** Fica preso no dublê até o fim (a carta acorrentada, a gelatina, a pedra). */
const stay = (a: Actor, cls: string, from: Keyframe, ms = 260) => {
  const el = cover(a, cls, [from, { opacity: 1, transform: "none" }], ms);
  return el;
};

/** Abrams: abaixa a cabeça, arranca em linha reta e chifra; a vítima voa girando para o outro local (ou racha na beirada). */
function abrams(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (!v) {
    move(src.g, [{ transform: tf() }, { transform: tf(0, 8, -6, 1.05, 0.94) }, { transform: tf(0, -10, 4, 1.1) }, { transform: tf() }], 600);
    return dust(s, src.from, 10);
  }
  const o = off(src.from, v.from);
  const reach = Math.max(0, o.len - (src.from.h + v.from.h) * 0.42);
  const tilt = o.ux >= 0 ? 8 : -8;
  move(src.g, [
    { transform: tf(), offset: 0 },
    { transform: tf(-o.ux * 14, -o.uy * 14, -tilt, 1.06, 0.94), offset: 0.18, easing: ease.out },
    { transform: tf(-o.ux * 10, -o.uy * 10, -tilt * 0.6, 1.06, 0.94), offset: 0.3, easing: ease.in },
    { transform: tf(o.ux * reach, o.uy * reach, tilt * 0.4, 1.12), offset: 0.46, easing: "linear" },
    { transform: tf(o.ux * reach, o.uy * reach, tilt * 0.4, 1.12), offset: 0.52, easing: ease.out },
    { transform: tf(o.ux * reach * 0.6, o.uy * reach * 0.6, -tilt * 0.3, 1.04), offset: 0.75, easing: ease.out },
    { transform: tf(), offset: 1 },
  ], 1100);
  // vapor pelas narinas e o pé raspando
  later(() => rise(s, src.from, 4, "rounded-full bg-zinc-200/50 blur-sm", 16, 40, 500, src.from.w * 0.3), 60);
  later(() => dust(s, src.from, 9), 120);
  later(() => dust(s, src.from, 6), 330);
  const hit = 1100 * 0.46;
  later(() => {
    const at = mix(src.from, v.from, (reach + src.from.h * 0.2) / o.len);
    glow(s, "rounded-full bg-radial from-white via-amber-200/70 to-transparent to-70%", at, v.from.w * 1.6, 260);
    burst(s, at, 12, "bg-zinc-200 [clip-path:polygon(50%_0,100%_100%,0_60%)]", v.from.w * 0.9, 560);
    flash(v);
    s.shake(2);
    jostle(s, v.from, [v.id, src.id]);
  }, hit);
  const moved = Math.hypot(v.to.x - v.from.x, v.to.y - v.from.y) > 4;
  if (moved) {
    const d = off(v.from, v.to);
    const up = Math.max(70, d.len * 0.45);
    const spin = d.dx >= 0 ? 540 : -540;
    move(v.g, [
      { transform: tf(), offset: 0 },
      { transform: tf(o.ux * 14, o.uy * 14, spin * 0.05, 1.05, 0.9), offset: 0.08 },
      { transform: tf(d.dx * 0.5, d.dy * 0.5 - up, spin * 0.5, 1.2), offset: 0.48 },
      { transform: tf(d.dx, d.dy, spin, 1.02, 0.94), offset: 0.8, easing: ease.out },
      { transform: tf(d.dx, d.dy - 12, spin, 1), offset: 0.9, easing: ease.in },
      { transform: tf(d.dx, d.dy, spin, 1), offset: 1 },
    ], 640, hit, ease.io);
    later(() => { dust(s, v.to, 10); s.shake(1); jostle(s, v.to, [v.id]); }, hit + 640 * 0.8);
  } else {
    move(v.g, [{ transform: tf() }, { transform: tf(o.ux * 18, o.uy * 18, tilt, 0.92, 1.04), offset: 0.2 }, { transform: tf(o.ux * 10, o.uy * 10 + 6, tilt * 0.5), offset: 0.6 }, { transform: tf() }], 520, hit);
    later(() => { stay(v, "bg-[linear-gradient(100deg,transparent_47%,white_48%,transparent_50%,transparent_60%,white_61%,transparent_62%)] opacity-0", { opacity: 0 }); }, hit);
  }
}

/** Apollo: saca a espada e fica em guarda; quando apanha, segura o golpe com faíscas, gira e devolve um corte em meia-lua. */
function apollo(s: Stage) {
  const { src } = s;
  const a = s.dst[0];
  if (s.ev !== "parry" || !a) {
    move(src.g, [{ transform: tf() }, { transform: tf(0, -8, -6, 1.06), offset: 0.4 }, { transform: tf(0, 0, -3, 1.02) }], 600);
    const sw = icon(s, "sword", pt(src.from.x + src.from.w * 0.45, src.from.y), src.from.h * 0.7, 800);
    move(sw, [{ transform: "rotate(-80deg) scale(0.4)", opacity: 0 }, { transform: "rotate(-15deg) scale(1.05)", opacity: 1, offset: 0.45 }, { transform: "rotate(-20deg) scale(1)", opacity: 1, offset: 0.8 }, { transform: "rotate(-20deg) scale(1)", opacity: 0 }], 780);
    later(() => shine(src, "bg-linear-to-r from-transparent via-sky-100/80 to-transparent"), 250);
    return;
  }
  const o = off(src.from, a.from);
  // segura o golpe: tranco para trás e faíscas na borda virada para o atacante
  move(src.g, [{ transform: tf() }, { transform: tf(-o.ux * 12, -o.uy * 12, o.ux >= 0 ? -6 : 6, 0.96) }, { transform: tf() }], 220);
  burst(s, mix(src.from, a.from, 0.15), 10, "size-1.5 rounded-full bg-sky-100", 40, 360);
  later(() => move(src.g, [{ transform: tf() }, { transform: tf(0, -6, 180, 1.1) }, { transform: tf(0, 0, 360, 1) }], 360, 0, ease.io), 200);
  later(() => {
    const cr = icon(s, "crescent", src.from, src.from.w * 0.9, 420);
    move(cr, [{ transform: `translate(0,0) rotate(${(o.ang * 180) / Math.PI + 90}deg) scale(0.6)`, opacity: 1 }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(${(o.ang * 180) / Math.PI + 90}deg) scale(1.2)`, opacity: 1 }], 260, 0, ease.in);
  }, 480);
  later(() => {
    knock(s, a, src.from, 16, 1);
    cover(a, "inset-x-[-10%] top-1/2 h-0.5 rounded-full bg-sky-100 shadow-[0_0_8px_var(--color-sky-300)]", [{ transform: "rotate(-35deg) scaleX(0)", opacity: 1 }, { transform: "rotate(-35deg) scaleX(1)", opacity: 1, offset: 0.4 }, { transform: "rotate(-35deg) scaleX(1)", opacity: 0 }], 420)?.classList.remove("inset-0");
  }, 740);
}

/** Baba: fumaça de bruxa pega a vítima, que encolhe e estoura em penas; cai um pombo meio torto no lugar. */
function baba(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  move(src.g, [{ transform: tf() }, { transform: tf(0, -10, 0, 1.1, 1.06), offset: 0.5 }, { transform: tf() }], 600);
  rise(s, src.from, 8, "rounded-full bg-emerald-800/70 blur-sm", 22, 70, 700);
  rise(s, src.from, 5, "rounded-full bg-zinc-950/70 blur-sm", 18, 60, 700);
  if (!v) return;
  later(() => {
    const blob = spawn(s, "rounded-full bg-radial from-emerald-300/80 via-emerald-800/70 to-transparent to-70% blur-[2px]", src.from, src.from.w * 0.9, 500);
    const o = off(src.from, v.from);
    move(blob, [{ transform: tf(0, 0, 0, 0.5) }, { transform: tf(o.dx * 0.5, o.dy * 0.5 - 30, 0, 0.9) }, { transform: tf(o.dx, o.dy, 0, 1.4), opacity: 0.8 }], 420, 0, ease.io);
  }, 250);
  later(() => {
    cover(v, "bg-emerald-700/50 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1 }], 200);
    move(v.g, [{ transform: tf() }, { transform: tf(-3, -20, -4, 0.9) }, { transform: tf(3, -24, 4, 0.75) }, { transform: tf(-2, -26, -3, 0.55) }, { transform: tf(0, -26, 0, 0.35) }], 420, 0, ease.lin);
  }, 650);
  later(() => {
    burst(s, pt(v.from.x, v.from.y - 26), 12, "", v.from.w * 0.9, 750, 30, 18, "featherGrey");
    glow(s, "rounded-full bg-radial from-zinc-100/80 to-transparent to-70%", pt(v.from.x, v.from.y - 26), v.from.w * 1.2, 260);
    swap(v);
    // o pombo cai de cima, bate as asas e pousa torto
    move(v.g, [{ transform: tf(0, -v.from.h * 0.8, -20, 0.8), opacity: 1 }, { transform: tf(0, 6, 10, 1.02, 0.94), offset: 0.55 }, { transform: tf(0, -6, -6, 1), offset: 0.75 }, { transform: tf(0, 0, 5, 1) }], 520, 0, ease.in);
  }, 1080);
  later(() => dust(s, v.from, 6), 1380);
}

/** Bebop: gira o braço; no puxão, o braço de sucata voa até a carta, a garra prende e arrasta para a lane dele. */
function bebop(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  const arm = "bg-[repeating-linear-gradient(90deg,var(--color-amber-500)_0_10px,var(--color-stone-800)_10px_13px,var(--color-amber-400)_13px_18px,var(--color-stone-800)_18px_20px)] shadow-[0_0_6px_rgb(0_0_0/0.8)]";
  if (s.ev !== "pull" || !v) {
    move(src.g, [{ transform: tf() }, { transform: tf(0, -4, -10, 1.06) }, { transform: tf(0, -4, 10, 1.06) }, { transform: tf(0, -2, -6, 1.03) }, { transform: tf() }], 620);
    const c = icon(s, "claw", pt(src.from.x, src.from.y - src.from.h * 0.55), 38, 700);
    move(c, [{ transform: "rotate(0deg) scale(0.4)", opacity: 0 }, { transform: "rotate(360deg) scale(1.1)", opacity: 1, offset: 0.6 }, { transform: "rotate(720deg) scale(0.9)", opacity: 0 }], 650, 0, ease.lin);
    burst(s, pt(src.from.x, src.from.y - src.from.h * 0.4), 8, "size-1 rounded-full bg-amber-300", 34, 420);
    return;
  }
  const out = 330, grab = 90, drag = 520;
  const from = () => ({ ...src.from, y: src.from.y - src.from.h * 0.1 });
  const tilt = v.from.x >= src.from.x ? 7 : -7;
  move(src.g, [{ transform: tf() }, { transform: tf(0, 0, -tilt, 1.04), offset: 0.3 }, { transform: tf(0, 0, tilt, 1.06), offset: 0.5 }, { transform: tf(0, 0, tilt * 0.6, 1.04), offset: 0.85 }, { transform: tf() }], out + grab + drag + 260);
  cable(s, arm, 8, from, (t) => {
    const T = t * (out + grab + drag + 220);
    if (T < out) return mix(from(), v.from, ease3(T / out));
    if (T < out + grab + drag) return now(v);
    return mix(v.to, from(), ease3((T - out - grab - drag) / 220));
  }, out + grab + drag + 220, "claw", 36);
  later(() => { flash(v, 160, "bg-amber-200 mix-blend-screen"); burst(s, v.from, 8, "size-1.5 rounded-full bg-amber-300", v.from.w * 0.5, 380); jitter(v.g, grab, 3); }, out);
  const d = off(v.from, v.to);
  later(() => move(v.g, [
    { transform: tf(), offset: 0 },
    { transform: tf(d.dx * 0.6, d.dy * 0.6 - 20, d.dx >= 0 ? -10 : 10, 1.08), offset: 0.7, easing: ease.in },
    { transform: tf(d.dx, d.dy, 0, 1.06, 0.92), offset: 0.92 },
    { transform: tf(d.dx, d.dy, 0, 1), offset: 1 },
  ], drag + 80, 0, ease.io), out + grab);
  for (let i = 1; i <= 4; i++) later(() => burst(s, now(v), 4, "size-1 rounded-full bg-amber-200", 30, 300), out + grab + i * (drag / 5));
  later(() => { dust(s, v.to, 10); s.shake(1); jostle(s, v.to, [v.id]); }, out + grab + (drag + 80) * 0.92);
}

/** Billy: gira as correntes, laça a vítima em X, puxa e o cadeado fecha. */
function billy(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  const r = icon(s, "ring", src.from, src.from.w * 1.5, 560);
  move(r, [{ transform: "rotate(0deg) scale(0.6)", opacity: 0 }, { transform: "rotate(360deg) scale(1)", opacity: 1, offset: 0.4 }, { transform: "rotate(720deg) scale(1.05)", opacity: 0 }], 540, 0, ease.lin);
  lift(src, 500, -6, 1.05);
  if (!v) return;
  const chain = "bg-[repeating-linear-gradient(90deg,var(--color-zinc-300)_0_6px,var(--color-zinc-600)_6px_8px)] shadow-[0_0_4px_rgb(0_0_0/0.9)]";
  [-1, 1].forEach((side, i) => later(() => cable(s, chain, 5, () => ({ ...src.from, x: src.from.x + side * 10 }), (t) => (t < 0.6 ? mix(src.from, now(v), ease3(t / 0.6)) : now(v)), 900), 420 + i * 60));
  later(() => {
    ["rotate-45", "-rotate-45"].forEach((rot) => stay(v, `inset-x-[-8%] top-[45%] h-2 ${rot} rounded-full ${chain}`, { opacity: 0, transform: "scaleX(0)" })?.classList.remove("inset-0"));
    const o = off(v.from, src.from);
    move(v.g, [{ transform: tf() }, { transform: tf(o.ux * 22, o.uy * 22, 0, 1.03) }, { transform: tf(o.ux * 8, o.uy * 8) }], 320);
  }, 760);
  later(() => {
    const lk = stick(v, "lock", 26, 0.5, 0.85);
    move(lk, [{ transform: "scale(0)" }, { transform: "scale(1.3)", offset: 0.6 }, { transform: "scale(1)" }], 220);
    flash(v, 140);
    s.shake(1);
  }, 1050);
}

/** Calico: agacha e vira fumaça com dois olhos brilhando; no bote, salta sobre cada inimiga com três garradas. */
function calico(s: Stage) {
  const { src } = s;
  if (s.ev !== "late") {
    move(src.g, [{ transform: tf() }, { transform: tf(0, 8, 0, 1.08, 0.82), offset: 0.4 }, { transform: tf(0, 4, 0, 1, 0.92), opacity: 0.35 }], 700);
    const sh = spawn(s, "rounded-full bg-black/70 blur-md", pt(src.from.x, src.from.y + src.from.h * 0.45), src.from.w, 900, 18);
    move(sh, [{ transform: "scale(0.4)" }, { transform: "scale(1.6)" }], 500);
    later(() => rise(s, src.from, 9, "rounded-full bg-purple-700/60 blur-sm", 22, 60, 650), 300);
    later(() => [-1, 1].forEach((k) => {
      const e = spawn(s, "rounded-full bg-lime-300 shadow-[0_0_8px_var(--color-lime-300)]", pt(src.from.x + k * 9, src.from.y - 6), 7, 600, 4);
      move(e, [{ opacity: 0, transform: "scaleY(0.1)" }, { opacity: 1, transform: "scaleY(1)", offset: 0.2 }, { opacity: 1, transform: "scaleY(0.1)", offset: 0.6 }, { opacity: 1, transform: "scaleY(1)", offset: 0.8 }, { opacity: 0 }], 600);
    }), 550);
    return;
  }
  const vs = foesOf(s);
  rise(s, src.from, 6, "rounded-full bg-purple-700/60 blur-sm", 20, 40, 400);
  vs.forEach((v, i) => later(() => {
    const d = off(src.from, v.from);
    hop(src.g, { dx: d.dx * 0.85, dy: d.dy * 0.85 }, 220, 50, 0, 1, 1.08);
    later(() => { claws(v, "bg-purple-200 shadow-[0_0_6px_var(--color-fuchsia-400)]", 3, -30, 60); knock(s, v, src.from, 10, 1); }, 220);
  }, 150 + i * 380));
  later(() => {
    const last = vs.at(-1);
    const d = last ? off(src.from, last.from) : { dx: 0, dy: 0 };
    move(src.g, [{ transform: tf(d.dx * 0.85, d.dy * 0.85, 0, 1.08) }, { transform: tf(d.dx * 0.4, d.dy * 0.4 - 50, 0, 1.12) }, { transform: tf() }], 280, 0, ease.io);
  }, 150 + vs.length * 380);
}

/** Celeste: ergue a mão e solta uma bola de luz azul e roxa que quica na cabeça de cada inimiga, uma depois da outra. */
function celeste(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  lift(src, 420, -10, 1.08);
  cover(src, "bg-violet-400/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], 520);
  const head = (b: Box) => pt(b.x, b.y - b.h * 0.42);
  const stops = [pt(src.from.x, src.from.y - src.from.h * 0.35), ...(vs.length ? vs.map((v) => head(v.from)) : [pt(src.from.x, src.from.y - src.from.h * 0.42)])];
  const size = Math.max(26, src.from.w * 0.42);
  const ball = spawn(s, "rounded-full bg-radial-[at_35%_30%] from-white via-sky-300 to-violet-600 shadow-[0_0_18px_var(--color-violet-500),0_0_6px_var(--color-sky-200)]", stops[0], size, CELESTE_UP + stops.length * CELESTE_HOP + 200);
  // cada quique: sobe em arco (desacelerando), desce (acelerando), amassa na cabeça e segue
  const kf: Keyframe[] = [{ transform: tf(0, 0, 0, 0.2), opacity: 0, offset: 0, easing: ease.out }];
  const total = CELESTE_UP + (stops.length - 1) * CELESTE_HOP + 420;
  const at = (ms: number) => ms / total;
  kf.push({ transform: tf(0, -src.from.h * 0.3, 0, 1), opacity: 1, offset: at(CELESTE_UP), easing: "cubic-bezier(.15,.55,.55,1)" });
  stops.slice(1).forEach((p, i) => {
    const a = stops[i], t0 = CELESTE_UP + i * CELESTE_HOP;
    const top = Math.max(size, Math.min(a.y, p.y) - Math.max(80, Math.abs(p.x - a.x) * 0.5));
    kf.push({ transform: tf((a.x + p.x) / 2 - stops[0].x, top - stops[0].y, (i + 0.5) * 220, 1.04, 0.96), offset: at(t0 + CELESTE_HOP * 0.5), easing: "cubic-bezier(.45,0,.85,.45)" });
    kf.push({ transform: tf(p.x - stops[0].x, p.y - stops[0].y, (i + 1) * 220, 1.14, 0.86), offset: at(t0 + CELESTE_HOP - 40), easing: ease.out });
    kf.push({ transform: tf(p.x - stops[0].x, p.y - stops[0].y - 6, (i + 1) * 220 + 20, 0.97, 1.03), offset: at(t0 + CELESTE_HOP), easing: "cubic-bezier(.15,.55,.55,1)" });
  });
  const last = stops.at(-1)!;
  kf.push({ transform: tf(last.x - stops[0].x, last.y - stops[0].y - 60, (stops.length - 1) * 220 + 90, 0.5), opacity: 0, offset: 1 });
  move(ball, kf, total, 0, ease.lin);
  // rastro de faíscas atrás da bola
  for (let k = 1; k < total / 45; k++) later(() => spawn(s, k % 2 ? "rounded-full bg-sky-200/80 blur-[1px]" : "rounded-full bg-violet-300/80 blur-[1px]", where(ball, src.from), 7, 300), k * 45);
  vs.forEach((v, i) => later(() => {
    knock(s, v, pt(v.from.x, v.from.y - 200), 12, 1, "bg-violet-200 mix-blend-screen");
    glow(s, "rounded-full bg-radial from-white via-sky-300/70 to-transparent to-70%", head(v.from), v.from.w * 1.1, 240);
    burst(s, head(v.from), 8, i % 2 ? "size-1.5 rotate-45 bg-violet-200" : "size-1.5 rotate-45 bg-sky-200", v.from.w * 0.55, 420, -6);
  }, CELESTE_UP + (i + 1) * CELESTE_HOP));
}
const CELESTE_UP = 380, CELESTE_HOP = 560;

/** Deadman Danny: trava como lançador e solta mísseis que fazem a curva no alto e mergulham, com explosões e crateras. */
function danny(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  move(src.g, [{ transform: tf() }, { transform: tf(0, 6, -8, 1.04, 0.96), offset: 0.3 }, { transform: tf(0, 6, -8, 1.04, 0.96), offset: 0.8 }, { transform: tf() }], 420 + Math.max(1, vs.length) * 170);
  rise(s, src.from, 5, "rounded-full bg-zinc-400/50 blur-sm", 20, 50, 600, src.from.w * 0.4);
  const targets = vs.length ? vs.map((v) => v.from) : [half(s, true)];
  targets.forEach((b, i) => later(() => {
    const top = pt((src.from.x + b.x) / 2, Math.min(src.from.y, b.y) - src.from.h * 1.3);
    const r = icon(s, "rocket", src.from, 34, 640);
    const ang = (p: Box, q: Box) => (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90;
    move(r, [
      { transform: `translate(0,0) rotate(0deg)` },
      { transform: `translate(${top.x - src.from.x}px, ${top.y - src.from.y}px) rotate(${ang(top, b)}deg)`, easing: ease.in },
      { transform: `translate(${b.x - src.from.x}px, ${b.y - src.from.y}px) rotate(${ang(top, b)}deg)` },
    ], 520, 0, ease.out);
    for (let k = 1; k < 5; k++) later(() => spawn(s, "rounded-full bg-zinc-300/50 blur-[2px]", where(r, src.from), 12, 400), k * 90);
    later(() => {
      glow(s, "rounded-full bg-radial from-yellow-100 via-orange-500/90 to-transparent to-70%", b, b.w * 1.3, 300);
      burst(s, b, 10, "size-2 rounded-full bg-orange-400", b.w * 0.7, 480);
      const v = vs[i];
      if (v) {
        knock(s, v, pt(b.x, b.y - 100), 14, 1, "bg-orange-300 mix-blend-screen");
        rise(s, { ...v.from, y: v.from.y + v.from.h * 0.3 }, 6, "rounded-t-full bg-linear-to-t from-red-600 via-orange-500 to-yellow-300", 12, 30, 600, v.from.w * 0.7);
      } else s.shake(1);
    }, 520);
  }, 240 + i * 170));
}

/** Drifter: a mesa escurece e só a vítima isolada fica na luz, com o coração batendo; ele salta e rasga com as garras. */
function drifter(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  if (!v) return lift(src);
  vignette(s, v.from, 1300, 0.75);
  later(() => move(v.g, [{ transform: tf() }, { transform: tf(0, 0, 0, 1.06) }, { transform: tf() }, { transform: tf(0, 0, 0, 1.06) }, { transform: tf() }], 480, 0, ease.io), 60);
  cover(v, "bg-red-700/40 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0.3 }], 480);
  const d = off(src.from, v.from);
  later(() => {
    move(src.g, [{ transform: tf() }, { transform: tf(0, 8, 0, 1.06, 0.88) }], 140);
    later(() => hop(src.g, { dx: d.dx * 0.8, dy: d.dy * 0.8 }, 300, 110, d.dx >= 0 ? 12 : -12, 1, 1.12), 140);
  }, 480);
  later(() => {
    ["rotate-[35deg]", "-rotate-[35deg]"].forEach((r, i) => later(() => cover(v, `inset-x-[5%] top-1/2 h-1.5 ${r} rounded-full bg-red-500 shadow-[0_0_8px_var(--color-red-500)]`, [{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1, offset: 0.3 }, { opacity: 0, transform: "scaleX(1)" }], 520)?.classList.remove("inset-0"), i * 70));
    burst(s, v.from, 12, "size-1.5 rounded-full bg-red-600", v.from.w * 0.7, 520, 20);
    knock(s, v, src.from, 16, 2, "bg-red-200 mix-blend-screen");
  }, 920);
  later(() => move(src.g, [{ transform: tf(d.dx * 0.8, d.dy * 0.8, 0, 1.12) }, { transform: tf(d.dx * 0.4, d.dy * 0.4 - 80, 0, 1.1) }, { transform: tf() }], 340, 0, ease.io), 1060);
  if (s.self) later(() => { cover(src, "bg-red-500/40 mix-blend-screen", [{ opacity: 0.8 }, { opacity: 0 }], 400); burst(s, src.from, 6, "size-1 rounded-full bg-red-600", 20, 500, 30); }, 1400);
}

/** Dynamo: flutua, abre uma singularidade acima do local e arranca as inimigas mais fracas dos outros locais para ela. */
function dynamo(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  move(src.g, [{ transform: tf() }, { transform: tf(0, -16, 0, 1.08), offset: 0.2 }, { transform: tf(0, -18, 0, 1.08), offset: 0.85 }, { transform: tf() }], 1300);
  const core = vs.length ? pt(src.from.x, (half(s, true).y + src.from.y) / 2) : pt(src.from.x, src.from.y - src.from.h);
  shock(s, src.from, "border-indigo-300/70", 1.4, 500);
  const hole = spawn(s, "rounded-full bg-radial from-black via-black to-indigo-500/60 to-75% shadow-[0_0_30px_var(--color-indigo-500),inset_0_0_10px_var(--color-fuchsia-500)]", core, src.from.w * 0.9, 1300);
  move(hole, [{ transform: "scale(0) rotate(0deg)" }, { transform: "scale(1) rotate(180deg)", offset: 0.25 }, { transform: "scale(1.1) rotate(540deg)", offset: 0.85 }, { transform: "scale(0) rotate(720deg)" }], 1250, 0, ease.lin);
  vs.forEach((v, i) => {
    later(() => jitter(v.g, 200, 3), 300 + i * 60);
    later(() => {
      const a = off(v.from, core), b = off(v.from, v.to);
      move(v.g, [{ transform: tf() }, { transform: tf(a.dx, a.dy, 360, 0.55), easing: ease.out }, { transform: tf(b.dx, b.dy, 720, 1) }], 650, 0, ease.in);
    }, 500 + i * 60);
  });
  later(() => {
    glow(s, "rounded-full bg-radial from-white via-indigo-300/70 to-transparent to-70%", core, src.from.w * 1.6, 280);
    vs.forEach((v) => { dust(s, v.to, 6); flash(v, 200, "bg-indigo-200 mix-blend-screen"); });
    s.shake(vs.length ? 2 : 1);
  }, 1150);
}

/** Graves: a mesa racha, a lápide rompe o chão e mãos de esqueleto puxam um Carniçal para cada lado. */
function graves(s: Stage) {
  const { src } = s;
  const ghouls = s.dst;
  jitter(src.g, 300, 2);
  burst(s, pt(src.from.x, src.from.y + src.from.h * 0.45), 8, "size-2 bg-stone-600 [clip-path:polygon(50%_0,100%_100%,0_70%)]", src.from.w * 0.6, 500, -10);
  const tomb = icon(s, "tomb", pt(src.from.x + src.from.w * 0.62, src.from.y + src.from.h * 0.15), src.from.w * 0.7, 1300);
  move(tomb, [{ transform: "translateY(40px) scaleY(0.2)", opacity: 0 }, { transform: "translateY(0) scaleY(1)", opacity: 1, offset: 0.25 }, { transform: "translateY(0) scaleY(1)", opacity: 1, offset: 0.8 }, { transform: "translateY(30px) scaleY(0.3)", opacity: 0 }], 1250);
  later(() => s.shake(1), 260);
  ghouls.forEach((g, i) => later(() => {
    const hd = icon(s, "hand", pt(g.from.x, g.from.y + g.from.h * 0.3), g.from.w * 0.8, 700);
    move(hd, [{ transform: "translateY(30px)", opacity: 0 }, { transform: "translateY(-20px)", opacity: 1, offset: 0.5 }, { transform: "translateY(-30px)", opacity: 0 }], 650);
    move(g.g, [{ transform: tf(0, g.from.h * 0.7, 0, 0.8), opacity: 0 }, { transform: tf(0, -8, g.foe ? 10 : 0, 1.04), opacity: 1, offset: 0.65 }, { transform: tf(0, 0, g.foe ? 6 : 0, 1) }], 520, 0, ease.out);
    burst(s, pt(g.from.x, g.from.y + g.from.h * 0.45), 8, "size-2 rounded-full bg-stone-500/80", g.from.w * 0.6, 500, -14);
  }, 380 + i * 180));
}

/** Grey Talon: puxa o arco, a ponta acende em verde e a flecha cruza a mesa deixando um rastro e crava na vítima. */
function greyTalon(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  if (!v) return lift(src);
  const o = off(src.from, v.from);
  const deg = (o.ang * 180) / Math.PI + 90;
  const size = Math.max(60, src.from.h * 0.9);
  // tensiona: a carta recua, treme e a ponta da flecha brilha antes de soltar
  move(src.g, [{ transform: tf() }, { transform: tf(-o.ux * 12, -o.uy * 12, o.ux >= 0 ? -5 : 5, 1.06), offset: 0.7 }, { transform: tf(-o.ux * 12, -o.uy * 12, o.ux >= 0 ? -5 : 5, 1.06) }], TALON_DRAW);
  later(() => jitter(src.g, 120, 2, false, tf(-o.ux * 12, -o.uy * 12, o.ux >= 0 ? -5 : 5, 1.06)), TALON_DRAW - 120);
  const glow = spawn(s, "rounded-full bg-radial from-lime-100 via-green-400/80 to-transparent to-70%", mix(src.from, v.from, 0.12), 44, TALON_DRAW + 80);
  move(glow, [{ transform: "scale(0.2)", opacity: 0 }, { transform: "scale(1.2)", opacity: 1 }], TALON_DRAW, 0, ease.in);
  later(() => {
    move(src.g, [{ transform: tf(-o.ux * 12, -o.uy * 12, 0, 1.06) }, { transform: tf(o.ux * 6, o.uy * 6, 0, 0.98) }, { transform: tf() }], 300);
    const a = icon(s, "arrow", src.from, size, TALON_FLY + 40, "drop-shadow-[0_0_10px_var(--color-green-400)]");
    move(a, [{ transform: `translate(0px, 0px) rotate(${deg}deg) scale(0.8)` }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(${deg}deg) scale(1)` }], TALON_FLY, 0, ease.lin);
    beam(s, src.from, v.from, "bg-linear-to-r from-transparent via-green-400/70 to-lime-200 shadow-[0_0_12px_var(--color-green-400)]", 6, TALON_FLY, 140);
    for (let k = 1; k < 6; k++) later(() => spawn(s, "rounded-full bg-lime-200/80 blur-[1px]", where(a, src.from), 8, 320), k * (TALON_FLY / 6));
  }, TALON_DRAW);
  later(() => {
    stick(v, "arrow", size * 0.7, 0.5 - o.ux * 0.12, 0.42 - o.uy * 0.12, deg);
    burst(s, v.from, 12, "size-1.5 rotate-45 bg-green-300 shadow-[0_0_6px_var(--color-green-400)]", v.from.w * 0.8, 520);
    knock(s, v, src.from, 18, 2, "bg-green-200 mix-blend-screen");
  }, TALON_DRAW + TALON_FLY);
  if (s.self) later(() => {
    // derrubou: o brilho verde volta para ela
    const g = spawn(s, "rounded-full bg-radial from-lime-100 via-green-400/80 to-transparent to-70%", v.from, 26, 460);
    move(g, [{ transform: "translate(0,0)" }, { transform: `translate(${-o.dx}px, ${-o.dy}px)` }], 420, 0, ease.io);
    later(() => { flash(src, 300, "bg-green-300 mix-blend-screen"); move(src.g, [{ transform: tf() }, { transform: tf(0, -6, 0, 1.08) }, { transform: tf() }], 300); }, 420);
  }, TALON_DRAW + TALON_FLY + 380);
}
const TALON_DRAW = 420, TALON_FLY = 300;

/** Haze: gira a adaga, arremessa, crava, e a vítima tomba de sono com o alvo pintado; na dança, pisca em volta dela atirando. */
function haze(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  if (s.ev === "late") {
    if (!v) return;
    const spots = [[-1, -0.6], [1, -0.4], [1, 0.6], [-1, 0.5]];
    move(src.g, [{ opacity: 1 }, { opacity: 0 }], 120);
    spots.forEach(([x, y], i) => later(() => {
      const at = pt(v.from.x + x * v.from.w * 0.8, v.from.y + y * v.from.h * 0.6);
      const ghost = spawn(s, "rounded-full bg-radial from-purple-400/70 to-transparent to-70% blur-sm", at, v.from.w * 0.7, 260, v.from.h * 0.7);
      move(ghost, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 200);
      glow(s, "rounded-full bg-radial from-white via-yellow-300/80 to-transparent to-70%", mix(at, v.from, 0.3), 26, 120);
      flash(v, 100, "bg-yellow-100 mix-blend-screen");
      jitter(v.g, 120, 3);
    }, 140 + i * 170));
    later(() => { knock(s, v, src.from, 10, 1); move(src.g, [{ opacity: 0 }, { opacity: 1 }], 160); }, 140 + spots.length * 170);
    return;
  }
  const d = icon(s, "dagger", pt(src.from.x + src.from.w * 0.4, src.from.y - src.from.h * 0.2), 26, 340);
  move(d, [{ transform: "rotate(0deg)" }, { transform: "rotate(720deg)" }], 320, 0, ease.lin);
  if (!v) return;
  lean(src, v.from, 320, 8);
  later(() => {
    const o = off(src.from, v.from);
    const t = icon(s, "dagger", src.from, 34, 300);
    move(t, [{ transform: "translate(0,0) rotate(0deg)" }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(${900 + (o.ang * 180) / Math.PI + 90}deg)` }], 260, 0, ease.in);
  }, 320);
  later(() => {
    stick(v, "dagger", 30, 0.72, 0.3, 160);
    knock(s, v, src.from, 10, 1, "bg-purple-200 mix-blend-screen");
    stay(v, "m-auto size-[60%] rounded-full border-2 border-dashed border-red-500/90 inset-[20%]", { opacity: 0, transform: "scale(1.6)" });
  }, 580);
  later(() => {
    move(v.g, [{ transform: tf() }, { transform: tf(0, -4, 0, 1, 1.06), offset: 0.3 }, { transform: tf(4, 6, 14, 1, 0.98) }], 520, 0, ease.io);
    cover(v, "bg-indigo-500/30 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1 }], 400);
    zzz(s, v.from);
  }, 900);
}

/** Holliday: arma a plataforma de salto sob as duas e as duas sobem girando até o local escolhido. */
function holliday(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  const mid = v ? mix(src.from, v.from, 0.5) : src.from;
  const pad = icon(s, "pad", src.from, src.from.w * 0.9, 600);
  const o = off(src.from, mid);
  move(pad, [{ transform: "translate(0,0) rotate(0deg) scale(0.5)" }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(540deg) scale(1)` }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(540deg) scale(1.4)`, opacity: 0 }], 520, 0, ease.out);
  lean(src, mid, 300, 6);
  later(() => { flash(src, 120, "bg-amber-200 mix-blend-screen"); if (v) flash(v, 120, "bg-amber-200 mix-blend-screen"); spawn(s, "rounded-full border-4 border-amber-400", mid, 40, 260); }, 380);
  [src, ...(v ? [v] : [])].forEach((a, i) => later(() => {
    const d = off(a.from, a.to);
    move(a.g, [
      { transform: tf(0, 6, 0, 1.05, 0.9) },
      { transform: tf(d.dx * 0.5, d.dy * 0.5 - a.from.h * 2, (i ? -1 : 1) * 360, 1.15), easing: ease.in },
      { transform: tf(d.dx, d.dy, (i ? -1 : 1) * 720, 1.04, 0.92), offset: 0.88 },
      { transform: tf(d.dx, d.dy, (i ? -1 : 1) * 720, 1) },
    ], 700, 0, ease.out);
    later(() => { dust(s, a.to, 9); jostle(s, a.to, [src.id, v?.id ?? 0]); }, 620);
  }, 420 + i * 40));
  later(() => s.shake(1), 1050);
}

/** Infernus: cospe um rastro de combustível até a vítima, o rastro acende e o fogo envolve a carta. */
function infernus(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  move(src.g, [{ transform: tf() }, { transform: tf(0, -4, 0, 1.07), offset: 0.5 }, { transform: tf() }], 420);
  cover(src, "bg-orange-500/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 420);
  rise(s, src.from, 6, "rounded-t-full bg-linear-to-t from-red-600 via-orange-500 to-yellow-300", 12, 40, 500, src.from.w * 0.6);
  if (!v) return;
  const tip = (t: number) => mix(src.from, v.from, ease3(t));
  later(() => cable(s, "bg-linear-to-r from-stone-900 to-amber-900", 4, () => src.from, (t) => tip(Math.min(1, t * 1.6)), 760), 300);
  later(() => {
    for (let k = 0; k <= 8; k++) later(() => rise(s, { ...mix(src.from, v.from, k / 8), h: 20 }, 2, "rounded-t-full bg-linear-to-t from-red-600 via-orange-500 to-yellow-200", 12, 34, 460, 12), k * 40);
  }, 620);
  later(() => {
    knock(s, v, src.from, 12, 1, "bg-orange-300 mix-blend-screen");
    rise(s, v.from, 14, "rounded-t-full bg-linear-to-t from-red-600 via-orange-500 to-yellow-200", 16, 60, 650, v.from.w);
    cover(v, "bg-orange-600/40 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.4 }], 600);
  }, 980);
}

/** Ivy: brotos nascem em volta dela, duas vinhas se enroscam até o aliado do outro local, soltando folhas, e flores abrem nas duas cartas. */
function ivy(s: Stage) {
  const { src } = s;
  const a = alliesOf(s)[0];
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2;
    const l = icon(s, "leaf", pt(src.from.x + Math.cos(t) * src.from.w * 0.55, src.from.y + Math.sin(t) * src.from.h * 0.45), 16, 700);
    move(l, [{ transform: "scale(0) rotate(0deg)" }, { transform: `scale(1) rotate(${i * 70}deg)`, offset: 0.4 }, { transform: `scale(0.8) rotate(${i * 70}deg)`, opacity: 0 }], 680, i * 50);
  }
  if (!a) return lift(src);
  const o = off(src.from, a.from);
  // a vinha anda com uma ondulação perpendicular ao caminho, que some quando ela chega
  const path = (t: number, k: number) => {
    const p = mix(src.from, a.from, t);
    const w = Math.sin(t * Math.PI * 5 + k * Math.PI) * 10 * Math.sin(t * Math.PI);
    return { ...p, x: p.x - o.uy * w, y: p.y + o.ux * w };
  };
  const grow = IVY_GROW;
  // duas vinhas enroscadas (fases opostas), a grossa com nós e a fina mais clara
  vine(s, (u) => path(u, 0), "bg-linear-to-r from-green-800 via-emerald-600 to-green-800 shadow-[0_0_3px_rgb(0_0_0/0.8)]", 6, grow, IVY_HOLD, 250);
  vine(s, (u) => path(u, 1), "bg-lime-500", 3, grow, IVY_HOLD, 300);
  // folhas brotando pelo caminho, conforme a vinha passa
  for (let i = 1; i < 10; i++) {
    const f = i / 10, reach = grow * (1 - Math.cbrt(1 - f));
    later(() => {
      const p = path(f, i % 2);
      const left = grow + IVY_HOLD + 300 - reach;
      const l = icon(s, "leaf", pt(p.x - o.uy * (i % 2 ? 8 : -8), p.y + o.ux * (i % 2 ? 8 : -8)), 15, left + 60);
      move(l, [{ transform: `scale(0) rotate(${i * 50}deg)` }, { transform: `scale(1.1) rotate(${i * 50 + 20}deg)`, offset: 0.18 }, { transform: `scale(1) rotate(${i * 50 + 20}deg)`, offset: 0.8 }, { transform: "scale(0.6)", opacity: 0 }], left, 0, ease.io);
    }, 250 + reach);
  }
  later(() => [src, a].forEach((x) => {
    const f = stick(x, "flower", 26, 0.75, 0.2);
    move(f, [{ transform: "scale(0) rotate(-90deg)" }, { transform: "scale(1.3) rotate(0deg)", offset: 0.6 }, { transform: "scale(1)" }], 320);
    move(x.g, [{ transform: tf() }, { transform: tf(0, -6, 0, 1.08) }, { transform: tf() }], 360);
    cover(x, "bg-green-400/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 420);
  }), 760);
}
const IVY_GROW = 900, IVY_HOLD = 500;

/** Kelvin: bate no chão e o gelo se espalha pelo lado dele no local; a área fica azulada até o fim do próximo turno. */
function kelvin(s: Stage) {
  const { src } = s;
  const allies = alliesOf(s).filter((a) => a.id !== src.id);
  move(src.g, [{ transform: tf() }, { transform: tf(0, -10, 0, 1.06), offset: 0.35 }, { transform: tf(0, 4, 0, 1.04, 0.94), offset: 0.6 }, { transform: tf() }], 420);
  const mine = half(s, false);
  later(() => {
    shock(s, src.from, "border-cyan-200/80", 2.2, 600);
    burst(s, pt(src.from.x, src.from.y + src.from.h * 0.45), 12, "size-2 rotate-45 bg-cyan-100", src.from.w * 1.2, 520);
    // a geada nasce no pé dele e cobre o lado inteiro (a marca da mesa assume quando a cena acaba)
    mist(s, mine, "var(--color-cyan-300)", KELVIN_MS - 250, src.from, 70);
    for (let i = 0; i < 9; i++) {
      const c = spawn(s, "rotate-45 bg-white/90 shadow-[0_0_6px_var(--color-cyan-200)]", pt(mine.x + (((i * 37) % 100) / 100 - 0.5) * mine.w * 0.8, mine.y + (((i * 61) % 100) / 100 - 0.5) * mine.h * 0.8), 5, 900);
      move(c, [{ transform: "rotate(45deg) scale(0)" }, { transform: "rotate(45deg) scale(1.4)", offset: 0.4 }, { transform: "rotate(45deg) scale(0)" }], 800, 150 + i * 50);
    }
  }, 250);
  [src, ...allies].forEach((a, i) => later(() => {
    cover(a, "bg-linear-to-t from-cyan-100/80 to-transparent mix-blend-screen", [{ opacity: 0, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1)" }, { opacity: 0 }], 520);
    burst(s, a.from, 5, "size-1 rotate-45 bg-white", a.from.w * 0.5, 400);
  }, 550 + i * 110));
  foesOf(s).forEach((f) => later(() => { jitter(f.g, 300, 2); cover(f, "bg-cyan-300/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 400); }, 900));
}
const KELVIN_MS = 1350;

/** Lady Geist: as duas cartas tremem, as almas saem (a vida da inimiga, pingando sangue, e a dela), giram juntas e trocam de carta. */
function geist(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  lift(src, 400, -10, 1.06);
  if (!v) return;
  jitter(src.g, 300, 2);
  jitter(v.g, 300, 2);
  const mid = mix(src.from, v.from, 0.5);
  [[v, src, "soulRed"], [src, v, "soulPale"]].forEach(([a, b, k], i) => later(() => {
    const A = a as Actor, B = b as Actor;
    const soul = icon(s, k as "soulRed" | "soulPale", A.from, A.from.w * 0.62, 900, i ? "drop-shadow-[0_0_8px_var(--color-indigo-200)]" : "drop-shadow-[0_0_10px_var(--color-red-600)]");
    const m = off(A.from, mid), e = off(A.from, B.from);
    const r = 26;
    move(soul, [
      { transform: tf(0, 0, 0, 0.3), opacity: 0 },
      { transform: tf(m.dx * 0.6, m.dy * 0.6, i ? 10 : -10, 1), opacity: 1 },
      { transform: tf(m.dx + (i ? r : -r), m.dy, i ? -10 : 10, 1) },
      { transform: tf(m.dx, m.dy + (i ? r : -r), i ? 10 : -10, 1) },
      { transform: tf(m.dx + (i ? -r : r), m.dy, 0, 1) },
      { transform: tf(e.dx, e.dy, 0, 0.5), opacity: 0.9 },
    ], 820, 0, ease.io);
    // a alma roubada vai pingando sangue pelo caminho
    if (!i) for (let k = 1; k < 8; k++) later(() => {
      const d = icon(s, "drop", where(soul, A.from), 11, 520);
      move(d, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(26px) scale(0.6)", opacity: 0 }], 480, 0, ease.in);
    }, k * 100);
    later(() => flash(B, 220, i ? "bg-indigo-100 mix-blend-screen" : "bg-red-500 mix-blend-screen"), 820);
  }, 300));
  later(() => {
    stay(v, "bg-zinc-200/40 mix-blend-saturation", { opacity: 0 });
    move(v.g, [{ transform: tf() }, { transform: tf(0, 0, 0, 0.95) }], 300);
    move(src.g, [{ transform: tf() }, { transform: tf(0, -4, 0, 1.08) }, { transform: tf() }], 360);
  }, 1130);
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
      { transform: tf(d.dx * 0.2, -up, i ? 10 : -10, 1.18), offset: (lift / (lift + slam)) * 0.9, easing: ease.in },
      { transform: tf(d.dx, d.dy, 0, 1.1, 0.86), offset: 0.93 },
      { transform: tf(d.dx, d.dy, 0, 1), offset: 1 },
    ], lift + slam + 40, jump, ease.io);
  });
  later(() => {
    vs.forEach((v) => { shock(s, v.to, "border-amber-300/90", 2); dust(s, v.to, 12); flash(v, 200); jostle(s, v.to, vs.map((x) => x.id), 1.8, 8); });
    shock(s, src.from, "border-white/70", 1.4);
    s.shake(3);
  }, jump + lift + slam);
}

/** McGinnis: joga a caixa de ferramentas até o local, a torreta se monta peça por peça e dá uma rajada de teste. */
function mcginnis(s: Stage) {
  const { src } = s;
  const t = s.dst[0];
  lean(src, t?.from ?? src.from, 300, 6);
  if (!t) return;
  const o = off(src.from, t.from);
  move(t.g, [{ opacity: 0 }, { opacity: 0 }], 1);
  const box = icon(s, "toolbox", src.from, 30, 560);
  move(box, [{ transform: "translate(0,0) rotate(0deg)" }, { transform: `translate(${o.dx * 0.5}px, ${o.dy * 0.5 - 90}px) rotate(360deg)`, easing: ease.in }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(720deg)` }], 520, 120, ease.out);
  later(() => {
    glow(s, "rounded-full bg-radial from-sky-100 via-sky-400/60 to-transparent to-70%", t.from, t.from.w, 220);
    [0.45, 0.75, 1].forEach((sc, i) => later(() => {
      move(t.g, [{ transform: tf(0, 0, 0, sc * 0.85), opacity: 1 }, { transform: tf(0, 0, 0, sc), opacity: 1 }], 120);
      burst(s, t.from, 5, "size-1 rounded-full bg-sky-300", t.from.w * 0.4, 260);
    }, i * 150));
  }, 650);
  later(() => {
    move(t.g, [{ transform: tf() }, { transform: tf(0, 0, -10) }, { transform: tf(0, 0, 10) }, { transform: tf() }], 400, 0, ease.io);
    for (let k = 0; k < 3; k++) later(() => {
      const b = spawn(s, "rounded-full bg-yellow-200 shadow-[0_0_6px_var(--color-yellow-300)]", pt(t.from.x, t.from.y - t.from.h * 0.4), 3, 300, 14);
      move(b, [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-120px)", opacity: 0 }], 260);
    }, 200 + k * 70);
  }, 1100);
}

/** Mina: solta um beijo que vira morcegos; no fim do turno a revoada morde e uma veia de sangue leva o poder para ela, pingando. */
function mina(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  const bats = (from: Box, to: Box, n: number, ms: number) => {
    for (let i = 0; i < n; i++) {
      const b = icon(s, "bat", from, 22, ms + 120);
      const o = off(from, to);
      const sway = (i % 2 ? 1 : -1) * (20 + i * 6);
      move(b, [{ transform: "translate(0,0) scale(0.4)", opacity: 0 }, { transform: `translate(${o.dx * 0.5 + sway}px, ${o.dy * 0.5 - 30}px) scale(1, 0.6)`, opacity: 1 }, { transform: `translate(${o.dx}px, ${o.dy}px) scale(0.9, 1)`, opacity: 0.2 }], ms, i * 50, ease.io);
    }
  };
  if (s.ev !== "end" || !v) {
    lift(src, 400, -6, 1.05);
    bats(src.from, pt(src.from.x, src.from.y - src.from.h), 5, 600);
    return;
  }
  bats(src.from, v.from, 6, 520);
  later(() => {
    jitter(v.g, 260, 3);
    flash(v, 220, "bg-red-600 mix-blend-screen");
    burst(s, v.from, 6, "", v.from.w * 0.5, 480, 20, 12, "drop");
    move(v.g, [{ transform: tf() }, { transform: tf(0, 0, 0, 0.92) }, { transform: tf() }], 400);
  }, 560);
  const o = off(v.from, src.from);
  // a veia faz uma curva (pende para o lado) da inimiga até a Mina
  const vein = (u: number) => { const p = mix(v.from, src.from, u), sag = Math.sin(u * Math.PI) * Math.min(40, o.len * 0.12); return { ...p, x: p.x - o.uy * sag, y: p.y + o.ux * sag }; };
  // a veia: grossa, vermelho-escuro, cresce devagar e chega desacelerando
  vine(s, vein, "bg-linear-to-r from-red-950 via-red-700 to-red-900 shadow-[0_0_8px_var(--color-red-700)]", 5, MINA_GROW, MINA_HOLD, 720);
  // o sangue corre por dentro dela, seguindo a curva, quando ela já chegou
  for (let k = 0; k < 5; k++) later(() => {
    const d = icon(s, "drop", v.from, 14, 720, "drop-shadow-[0_0_4px_var(--color-red-600)]");
    const kf = [0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => {
      // a gota aponta para onde a veia segue
      const p = vein(u), q = vein(Math.min(1, u + 0.02)), r = vein(Math.max(0, u - 0.02));
      const a = (Math.atan2(q.y - r.y, q.x - r.x) * 180) / Math.PI - 90;
      return { transform: `translate(${p.x - v.from.x}px, ${p.y - v.from.y}px) rotate(${a}deg) scale(${u === 0 || u === 1 ? 0.5 : 1})`, opacity: u === 1 ? 0 : 1 };
    });
    move(d, kf, 640, 0, ease.lin);
  }, 720 + MINA_GROW * 0.7 + k * 120);
  // gotas que escorrem da veia e caem
  for (let k = 1; k < 6; k++) later(() => {
    const d = icon(s, "drop", vein(k / 6), 10, 760);
    move(d, [{ transform: "translateY(0) scale(0.3)" }, { transform: "translateY(4px) scale(1)", offset: 0.3 }, { transform: "translateY(36px) scale(0.8)", opacity: 0 }], 720, 0, ease.io);
  }, 720 + MINA_GROW * (1 - Math.cbrt(1 - k / 6)) + 120);
  const full = 720 + MINA_GROW + 600;
  later(() => { move(src.g, [{ transform: tf() }, { transform: tf(0, -6, 0, 1.08) }, { transform: tf() }], 420, 0, ease.io); flash(src, 360, "bg-red-500 mix-blend-screen"); }, full);
}
const MINA_GROW = 750, MINA_HOLD = 650;

/** Mirage: gira, a moldura vira areia e um tornado de areia sobe da carta. */
function mirage(s: Stage) {
  const { src } = s;
  move(src.g, [{ transform: tf() }, { transform: tf(0, -10, 180, 0.92) }, { transform: tf(0, 0, 360, 1) }], 600, 0, ease.io);
  cover(src, "bg-amber-300/50 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 600);
  const tor = spawn(s, "origin-bottom bg-linear-to-t from-amber-200/80 via-amber-400/50 to-transparent blur-[2px] [clip-path:polygon(35%_100%,65%_100%,100%_0,0_0)]", pt(src.from.x, src.from.y - src.from.h * 0.5), src.from.w * 0.9, 950, src.from.h * 1.2);
  move(tor, [{ transform: "scaleY(0) skewX(0deg)", opacity: 0 }, { transform: "scaleY(1) skewX(8deg)", opacity: 1, offset: 0.4 }, { transform: "scaleY(1.1) skewX(-8deg)", opacity: 0.8, offset: 0.7 }, { transform: "scaleY(1.2) skewX(0deg)", opacity: 0 }], 900);
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 4;
    const g = spawn(s, "rounded-full bg-amber-200", src.from, 4, 900);
    move(g, [{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${Math.cos(t) * src.from.w * 0.7}px, ${-src.from.h * (0.3 + i / 18)}px)`, opacity: 0 }], 800, i * 25);
  }
}

/** Mo & Krill: gira como broca e afunda na mesa, sobrando um monte de terra com o focinho espiando. */
function moKrill(s: Stage) {
  const { src } = s;
  move(src.g, [{ transform: tf(), opacity: 1 }, { transform: tf(0, -6, 360, 0.96), opacity: 1, offset: 0.35 }, { transform: tf(0, src.from.h * 0.25, 900, 0.7, 0.5), opacity: 0.2 }], 750, 0, ease.in);
  later(() => { burst(s, pt(src.from.x, src.from.y + src.from.h * 0.3), 14, "size-2.5 rounded-full bg-amber-900", src.from.w * 0.9, 600, -20); jostle(s, src.from, [src.id]); s.shake(1); }, 400);
  later(() => {
    const mound = spawn(s, "rounded-t-full bg-linear-to-b from-amber-800 to-amber-950", pt(src.from.x, src.from.y + src.from.h * 0.32), src.from.w * 0.9, 600, src.from.h * 0.3);
    move(mound, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: 0.4 }, { transform: "scaleY(1)", opacity: 0.8 }], 550);
    const nose = spawn(s, "rounded-full bg-pink-300 ring-2 ring-amber-950", pt(src.from.x, src.from.y + src.from.h * 0.2), 10, 520);
    move(nose, [{ transform: "translateY(10px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: 0.4 }, { transform: "translateY(0)", opacity: 1, offset: 0.7 }, { transform: "translateY(10px)", opacity: 0 }], 500);
  }, 650);
}

/** Nurse Harrow: a sanguessuga pula na inimiga mais forte, que murcha, e um tubo leva o poder até o aliado mais fraco. */
function harrow(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0], a = alliesOf(s)[0];
  lift(src, 360, -8, 1.06);
  const plus = spawn(s, "bg-[linear-gradient(var(--color-red-500),var(--color-red-500))_center/30%_100%_no-repeat,linear-gradient(var(--color-red-500),var(--color-red-500))_center/100%_30%_no-repeat] drop-shadow-[0_0_6px_var(--color-red-500)]", pt(src.from.x, src.from.y - src.from.h * 0.6), 22, 600);
  move(plus, [{ transform: "scale(0)" }, { transform: "scale(1.2)", offset: 0.4 }, { transform: "scale(1)", opacity: 0 }], 560);
  if (!v) return;
  later(() => {
    const leech = spawn(s, "rounded-full bg-radial from-red-500 via-red-800 to-red-950 shadow-[0_0_6px_black]", src.from, 18, 1400, 12);
    const o = off(src.from, v.from);
    move(leech, [{ transform: "translate(0,0)" }, { transform: `translate(${o.dx * 0.5}px, ${o.dy * 0.5 - 60}px)`, easing: ease.in }, { transform: `translate(${o.dx}px, ${o.dy - v.from.h * 0.2}px)` }, { transform: `translate(${o.dx}px, ${o.dy - v.from.h * 0.2}px) scale(1.4, 0.8)`, offset: 0.9 }, { transform: `translate(${o.dx}px, ${o.dy - v.from.h * 0.2}px)` }], 1100, 0, ease.out);
  }, 280);
  later(() => {
    move(v.g, [{ transform: tf() }, { transform: tf(0, 4, 0, 0.9) }], 400, 0, ease.io);
    cover(v, "bg-zinc-400/40 mix-blend-saturation", [{ opacity: 0 }, { opacity: 1 }], 400);
    if (!a) return;
    cable(s, "bg-red-700/80 shadow-[0_0_5px_var(--color-red-600)]", 4, () => v.from, (t) => mix(v.from, a.from, ease3(Math.min(1, t * 1.6))), 950);
    for (let k = 0; k < 4; k++) later(() => {
      const o = off(v.from, a.from);
      const d = icon(s, "drop", v.from, 12, 380);
      move(d, [{ transform: `translate(0px, 0px) rotate(${(o.ang * 180) / Math.PI - 90}deg)` }, { transform: `translate(${o.dx}px, ${o.dy}px) rotate(${(o.ang * 180) / Math.PI - 90}deg)` }], 340, 0, ease.in);
    }, 200 + k * 90);
    later(() => { move(a.g, [{ transform: tf() }, { transform: tf(0, -6, 0, 1.1) }, { transform: tf() }], 340); flash(a, 260, "bg-red-200 mix-blend-screen"); }, 650);
  }, 600);
}

/** Paige: ergue o livro e a luz verde se espalha pelo lado dela no local, envolvendo as aliadas (a área continua verde enquanto ela estiver ali). */
function paige(s: Stage) {
  const { src } = s;
  lift(src, 420, -10, 1.06);
  cover(src, "bg-emerald-300/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 520);
  const mine = half(s, false);
  later(() => {
    mist(s, mine, "var(--color-emerald-400)", PAIGE_MS - 250, src.from, 70);
    rise(s, mine, 12, "rounded-full bg-emerald-200/80 shadow-[0_0_6px_var(--color-emerald-300)]", 5, 50, 900, mine.w * 0.8);
  }, 250);
  s.dst.forEach((a, i) => later(() => {
    move(a.g, [{ transform: tf() }, { transform: tf(0, -5, 0, 1.06) }, { transform: tf() }], 300);
    cover(a, "bg-emerald-300/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 420);
  }, 550 + i * 90));
}
const PAIGE_MS = 1250;

/** Paradox: o tempo para (a mesa perde a cor e um relógio aparece) e as duas cartas deslizam trocando de lugar. */
function paradox(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  const gray = spawn(s, "backdrop-grayscale", pt(0, 0), 10, 1350);
  Object.assign(gray.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
  move(gray, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], 1300, 0, ease.lin);
  const c = v ? mix(src.from, v.from, 0.5) : src.from;
  const clock = spawn(s, "rounded-full border-4 border-amber-300/80 bg-teal-950/40 shadow-[0_0_20px_var(--color-amber-300)]", c, src.from.w * 1.6, 1300);
  move(clock, [{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.2 }, { transform: "scale(1)", opacity: 1, offset: 0.8 }, { transform: "scale(1.3)", opacity: 0 }], 1250);
  [[0.42, 2.5], [0.3, 4]].forEach(([len, w], i) => {
    const h = spawn(s, "origin-bottom rounded-full bg-amber-200", pt(c.x, c.y - (src.from.w * 1.6 * len) / 2), w, 1300, src.from.w * 1.6 * len);
    move(h, [{ transform: "rotate(0deg)" }, { transform: `rotate(${-720 * (i + 1)}deg)` }], 1200, 0, ease.io);
  });
  if (!v) return;
  [src, v].forEach((a) => later(() => {
    const echo = spawn(s, "rounded-full bg-radial from-teal-200/50 to-transparent to-70% blur-md", a.from, a.from.w * 1.4, 700, a.from.h * 1.2);
    move(echo, [{ opacity: 1 }, { opacity: 0 }], 650);
    const d = off(a.from, a.to);
    move(a.g, [{ transform: tf() }, { transform: tf(d.dx, d.dy, 0, 1) }], 700, 0, ease.io);
  }, 300));
  later(() => { s.shake(1); flash(src, 200, "bg-teal-100 mix-blend-screen"); flash(v, 200, "bg-teal-100 mix-blend-screen"); }, 1050);
}

/** Pocket: abre a maleta, a névoa roxa rola pelo lado inimigo e as moedas escorrem das inimigas para a maleta. */
function pocket(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  lift(src, 400, -6, 1.05);
  const caseAt = pt(src.from.x, src.from.y - src.from.h * 0.62);
  const cs = icon(s, "case", caseAt, 34, 1400);
  move(cs, [{ transform: "scale(0)" }, { transform: "scale(1.15)", offset: 0.2 }, { transform: "scale(1)", offset: 0.85 }, { transform: "scale(0)" }], 1350);
  const enemy = half(s, true);
  later(() => {
    const mist = spawn(s, "rounded-full bg-purple-600/45 blur-xl", pt(enemy.x - enemy.w * 0.5, enemy.y), enemy.w, 900, enemy.h * 0.7);
    move(mist, [{ transform: "translateX(0) scale(0.5)", opacity: 0 }, { transform: `translateX(${enemy.w * 0.5}px) scale(1)`, opacity: 1, offset: 0.5 }, { transform: `translateX(${enemy.w}px) scale(1.1)`, opacity: 0 }], 850, 0, ease.io);
  }, 250);
  vs.forEach((v, i) => later(() => {
    move(v.g, [{ transform: tf() }, { transform: tf(0, 5, 0, 1, 0.9) }, { transform: tf(0, 2, 0, 1, 0.96) }], 400, 0, ease.io);
    cover(v, "bg-purple-700/30 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.3 }], 500);
    for (let k = 0; k < 3; k++) later(() => {
      const c = icon(s, "coin", v.from, 14, 520);
      const o = off(v.from, caseAt);
      move(c, [{ transform: "translate(0,0) scale(0.6)" }, { transform: `translate(${o.dx * 0.5 + (k - 1) * 20}px, ${o.dy * 0.5 - 30}px) scale(1) rotateY(180deg)` }, { transform: `translate(${o.dx}px, ${o.dy}px) scale(0.6) rotateY(360deg)` }], 480, 0, ease.io);
    }, k * 70);
  }, 500 + i * 120));
  later(() => { glow(s, "rounded-full bg-radial from-yellow-100 via-yellow-400/60 to-transparent to-70%", caseAt, 60, 260); move(cs, [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], 220); }, 1050 + vs.length * 60);
}

/** Rat King: estala os dedos, o chão treme e uma fila de ratos corre da carta até a sua mão. */
function ratKing(s: Stage) {
  const { src } = s;
  move(src.g, [{ transform: tf() }, { transform: tf(0, 0, -6, 1.04) }, { transform: tf() }], 220);
  later(() => jostle(s, src.from, [src.id], 1.4, 4), 120);
  const hand = pt(window.innerWidth / 2, window.innerHeight - 40);
  for (let i = 0; i < 6; i++) later(() => {
    const r = icon(s, "rat", src.from, 22, 760);
    const o = off(src.from, hand);
    const flip = o.dx < 0 ? -1 : 1;
    move(r, [0, 1, 2, 3, 4, 5].map((j) => ({ transform: `translate(${(o.dx * j) / 5 + (j % 2 ? 6 : -6)}px, ${(o.dy * j) / 5 + (j % 2 ? -4 : 0)}px) scaleX(${flip})`, opacity: j === 5 ? 0 : 1 })), 700, 0, ease.lin);
  }, 200 + i * 80);
  later(() => glow(s, "rounded-full bg-radial from-amber-100/80 to-transparent to-70%", hand, 80, 300), 950);
}

/** Rem: balança a lanterna, o pó do sono cai sobre o lado inimigo e as inimigas bocejam e tombam dormindo. */
function rem(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  const l = icon(s, "lantern", pt(src.from.x, src.from.y - src.from.h * 0.55), 28, 900, "origin-top");
  move(l, [{ transform: "rotate(-25deg)" }, { transform: "rotate(25deg)" }, { transform: "rotate(-15deg)" }, { transform: "rotate(10deg)", opacity: 1 }, { opacity: 0 }], 880, 0, ease.io);
  glow(s, "rounded-full bg-radial from-amber-200/60 to-transparent to-70%", pt(src.from.x, src.from.y - src.from.h * 0.45), 90, 800);
  const enemy = half(s, true);
  later(() => {
    for (let i = 0; i < 22; i++) {
      const x = enemy.x + (((i * 37) % 100) / 100 - 0.5) * enemy.w;
      const d = spawn(s, i % 2 ? "rounded-full bg-indigo-200 shadow-[0_0_6px_var(--color-indigo-300)]" : "rounded-full bg-violet-200 shadow-[0_0_6px_var(--color-violet-300)]", pt(x, enemy.y - enemy.h * 0.6), i % 3 ? 4 : 6, 1100);
      move(d, [{ transform: "translate(0,0)", opacity: 0 }, { transform: `translate(${i % 2 ? 8 : -8}px, ${enemy.h * 0.5}px)`, opacity: 1, offset: 0.5 }, { transform: `translate(0px, ${enemy.h}px)`, opacity: 0 }], 900, (i * 41) % 300, ease.lin);
    }
  }, 300);
  vs.forEach((v, i) => later(() => {
    move(v.g, [{ transform: tf() }, { transform: tf(0, -4, 0, 0.96, 1.08), offset: 0.3 }, { transform: tf(0, 2, 0, 1.02, 0.94), offset: 0.55 }, { transform: tf(4, 6, i % 2 ? -14 : 14, 1) }], 650, 0, ease.io);
    cover(v, "bg-indigo-500/35 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1 }], 500);
    zzz(s, v.from, 2);
  }, 650 + i * 100));
}

/** Seven: ergue os braços e flutua, a nuvem de tempestade cobre o lado inimigo; no fim do turno os raios caem um a um. */
function seven(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  const enemy = half(s, true);
  const sky = pt(enemy.x, enemy.y - enemy.h * 0.55);
  const cloud = (ms: number) => {
    for (let i = 0; i < 6; i++) {
      const c = spawn(s, "rounded-full bg-radial from-zinc-600 via-zinc-800 to-zinc-950/0 to-70%", pt(sky.x + (i - 2.5) * enemy.w * 0.16, sky.y + (i % 2) * 10), enemy.w * 0.45, ms, enemy.w * 0.28);
      move(c, [{ transform: "scale(0.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.25 }, { transform: `translateX(${i % 2 ? 6 : -6}px) scale(1.05)`, opacity: 1, offset: 0.85 }, { opacity: 0 }], ms);
    }
  };
  if (s.ev !== "end") {
    move(src.g, [{ transform: tf() }, { transform: tf(0, -14, 0, 1.06), offset: 0.3 }, { transform: tf(0, -14, 0, 1.06), offset: 0.8 }, { transform: tf() }], 900);
    burst(s, src.from, 8, "h-3 w-0.5 bg-sky-200 shadow-[0_0_6px_var(--color-sky-300)]", src.from.w * 0.6, 400);
    cloud(900);
    return;
  }
  cloud(450 + vs.length * 170 + 400);
  vs.forEach((v, i) => later(() => {
    // o raio em zigue-zague da nuvem até a carta
    const pts = [sky, ...[0.3, 0.55, 0.8].map((k, j) => { const p = mix(sky, v.from, k); return { ...p, x: p.x + (j % 2 ? 14 : -14) }; }), v.from];
    pts.slice(1).forEach((p, j) => {
      beam(s, pts[j], p, "bg-yellow-50 shadow-[0_0_10px_var(--color-sky-300),0_0_3px_white]", 4, 30, 120);
      beam(s, pts[j], p, "bg-sky-300/50 blur-sm", 12, 30, 120);
    });
    glow(s, "rounded-full bg-radial from-white via-sky-200/70 to-transparent to-70%", v.from, v.from.w * 1.4, 220);
    jitter(v.g, 320, 4);
    cover(v, "bg-sky-200/70 mix-blend-screen", [{ opacity: 1 }, { opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], 300);
    s.shake(1);
  }, 400 + i * 170));
}

/** Shiv: agacha com a lâmina brilhando, salta na mais fraca, crava a faca e a carta se parte em duas metades. */
function shiv(s: Stage) {
  const { src } = s;
  const vs = foesOf(s);
  shine(src, "bg-linear-to-r from-transparent via-red-100/80 to-transparent", 380);
  move(src.g, [{ transform: tf() }, { transform: tf(0, 8, 0, 1.06, 0.86) }], 200);
  let prev = { dx: 0, dy: 0 };
  vs.forEach((v, i) => later(() => {
    const d = off(src.from, v.from);
    move(src.g, [{ transform: tf(prev.dx, prev.dy, 0, 1.06, i ? 1 : 0.86) }, { transform: tf((prev.dx + d.dx * 0.75) / 2, (prev.dy + d.dy * 0.75) / 2 - 70, 0, 1.12), easing: ease.in }, { transform: tf(d.dx * 0.75, d.dy * 0.75, d.dx >= 0 ? 8 : -8, 1.1) }], 260, 0, ease.out);
    prev = { dx: d.dx * 0.75, dy: d.dy * 0.75 };
    later(() => {
      s.shake(2);
      glow(s, "rounded-full bg-radial from-white via-red-300/60 to-transparent to-70%", v.from, v.from.w, 200);
      // a carta se parte na diagonal e as metades caem para lados opostos
      if (v.g) {
        const face = v.g.firstElementChild;
        [["polygon(0_0,100%_0,0_100%)", -1], ["polygon(100%_0,100%_100%,0_100%)", 1]].forEach(([clip, k]) => {
          const part = document.createElement("div");
          part.className = "absolute inset-0";
          part.style.clipPath = String(clip).replace(/_/g, " ");
          if (face) part.appendChild(face.cloneNode(true));
          v.g!.appendChild(part);
          later(() => move(part, [{ transform: tf() }, { transform: tf(Number(k) * 26, 30, Number(k) * 25), opacity: 1, offset: 0.6 }, { transform: tf(Number(k) * 40, 70, Number(k) * 40), opacity: 0 }], 600, 0, ease.in), 120);
        });
        if (face instanceof HTMLElement) face.style.opacity = "0";
        const cut = cover(v, "inset-x-[-10%] top-1/2 h-1 -rotate-[55deg] rounded-full bg-red-500 shadow-[0_0_8px_var(--color-red-500)]", [{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1 }, { opacity: 0, transform: "scaleX(1)" }], 300);
        cut?.classList.remove("inset-0");
      }
    }, 300);
  }, 220 + i * 520));
  later(() => move(src.g, [{ transform: tf(prev.dx, prev.dy, 0, 1.1) }, { transform: tf(prev.dx / 2, prev.dy / 2 - 50, 0, 1.08) }, { transform: tf() }], 300, 0, ease.io), 220 + vs.length * 520 + 120);
}

/** Silver: a lua cheia nasce atrás da carta, ela convulsiona, a moldura racha e o lobisomem rompe uivando. */
function silver(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  const moon = icon(s, "moon", pt(src.from.x, src.from.y - src.from.h * 0.45), src.from.w * 1.3, 1300, "-z-10 drop-shadow-[0_0_20px_var(--color-stone-200)]");
  move(moon, [{ transform: "translateY(30px)", opacity: 0 }, { transform: "translateY(0)", opacity: 0.9, offset: 0.3 }, { opacity: 0.9, offset: 0.85 }, { opacity: 0 }], 1250);
  later(() => jitter(src.g, 500, 5, true), 250);
  later(() => burst(s, src.from, 8, "h-0.5 w-5 bg-white", src.from.w * 0.4, 400), 550);
  later(() => {
    glow(s, "rounded-full bg-radial from-white via-stone-300/60 to-transparent to-70%", src.from, src.from.w * 1.8, 260);
    move(src.g, [{ transform: tf() }, { transform: tf(0, -8, 0, 1.22) }, { transform: tf(0, 0, 0, 1.04) }], 420, 0, ease.out);
    shock(s, src.from, "border-stone-200/80", 1.8);
    later(() => shock(s, src.from, "border-stone-200/60", 2.4), 140);
    s.shake(2);
  }, 760);
  if (v) later(() => {
    const d = off(src.from, v.from);
    hop(src.g, { dx: d.dx * 0.8, dy: d.dy * 0.8 }, 280, 70, 0, 1.04, 1.1);
    later(() => { claws(v, "bg-stone-100", 2, 60, 50); knock(s, v, src.from, 12, 2); }, 280);
    later(() => move(src.g, [{ transform: tf(d.dx * 0.8, d.dy * 0.8, 0, 1.1) }, { transform: tf() }], 300, 0, ease.io), 520);
  }, 1200);
}

/** Sinclair: a cartola gira, a carta treme num estalo de mágica e um coelho pula da cartola. */
function sinclair(s: Stage) {
  const { src } = s;
  const at = pt(src.from.x, src.from.y - src.from.h * 0.55);
  const hat = icon(s, "hat", at, 34, 900);
  move(hat, [{ transform: "rotateY(0deg) scale(0.4)", opacity: 0 }, { transform: "rotateY(720deg) scale(1)", opacity: 1, offset: 0.5 }, { transform: "rotate(180deg)", opacity: 1, offset: 0.7 }, { transform: "rotate(180deg)", opacity: 0 }], 880, 0, ease.io);
  cover(src, "bg-fuchsia-400/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 500);
  later(() => {
    const echo = spawn(s, "rounded-full bg-radial from-fuchsia-300/55 to-transparent to-70% blur-md", src.from, src.from.w * 1.4, 600, src.from.h * 1.2);
    move(echo, [{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${src.from.w * 0.4}px)`, opacity: 0 }], 550, 0, ease.out);
    burst(s, src.from, 10, "size-1.5 rotate-45 bg-yellow-200", src.from.w * 0.7, 500);
  }, 350);
  later(() => {
    const r = icon(s, "rabbit", at, 26, 520);
    move(r, [{ transform: "translate(0,0) scale(0.3)", opacity: 0 }, { transform: "translate(14px,-40px) scale(1)", opacity: 1 }, { transform: "translate(40px,-10px) scale(0.8)", opacity: 0 }], 500, 0, ease.out);
  }, 600);
}

/** Solomon: o local vira um tabuleiro, peças de xadrez descem atrás das aliadas e o rei cai no Solomon. */
function solomon(s: Stage) {
  const { src } = s;
  const mine = half(s, false);
  const board = spawn(s, "bg-[repeating-conic-gradient(rgb(255_255_255/0.16)_0_25%,rgb(0_0_0/0.25)_0_50%)] bg-size-[40px_40px] mask-radial-[closest-side] mask-radial-from-30% mask-radial-to-100%", mine, mine.w * 1.1, 1300, mine.h * 1.1);
  mist(s, mine, "var(--color-amber-300)", 1250, src.from, 45);
  move(board, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], 1250);
  lift(src, 400, -8, 1.05);
  s.dst.forEach((a, i) => later(() => {
    const p = icon(s, "pawn", pt(a.from.x + a.from.w * 0.32, a.from.y - a.from.h * 0.3), 26, 800);
    move(p, [{ transform: "translateY(-80px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: 0.35, easing: ease.out }, { transform: "translateY(-6px)", offset: 0.5 }, { transform: "translateY(0)", opacity: 1, offset: 0.8 }, { opacity: 0 }], 760, 0, ease.in);
    later(() => jostle(s, a.from, [], 0.6, 3), 260);
  }, 300 + i * 110));
  later(() => {
    const k = icon(s, "king", pt(src.from.x, src.from.y - src.from.h * 0.45), 36, 700);
    move(k, [{ transform: "translateY(-120px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: 0.4 }, { transform: "translateY(0) scale(1.15)", offset: 0.55 }, { transform: "translateY(0)", opacity: 1, offset: 0.85 }, { opacity: 0 }], 650, 0, ease.in);
    later(() => { s.shake(1); flash(src, 240, "bg-yellow-200 mix-blend-screen"); move(src.g, [{ transform: tf() }, { transform: tf(0, 4, 0, 1.06, 0.94) }, { transform: tf() }], 260); }, 260);
  }, 300 + s.dst.length * 110 + 150);
}

/** The Doorman: toca a campainha, portas de hotel abrem nos dois locais e o carrinho de bagagem atravessa de uma à outra. */
function doorman(s: Stage) {
  const { src } = s;
  const bell = icon(s, "bell", pt(src.from.x, src.from.y - src.from.h * 0.6), 28, 600);
  move(bell, [{ transform: "rotate(-20deg) scale(0.5)" }, { transform: "rotate(20deg) scale(1.1)" }, { transform: "rotate(-15deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0deg)", opacity: 0 }], 580, 0, ease.io);
  const a = s.lane ? { ...half(s, false), h: src.from.h } : src.from, b = s.alt ? pt(s.alt.x, a.y, src.from.w, src.from.h) : null;
  [a, ...(b ? [b] : [])].forEach((d, i) => later(() => {
    glow(s, "rounded-t-full bg-radial-[at_50%_80%] from-amber-200/70 to-transparent to-70%", d, src.from.w * 1.4, 1100, src.from.h * 1.3);
    const door = icon(s, "door", d, src.from.w * 0.9, 1100);
    move(door, [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { transform: "scaleX(0)", opacity: 0 }], 1050);
  }, 250 + i * 100));
  if (b) later(() => {
    const cart = icon(s, "cart", a, 30, 600);
    const o = off(a, b);
    move(cart, [{ transform: "translate(0,0) scale(0.4)", opacity: 0 }, { transform: `translate(${o.dx * 0.1}px, ${o.dy * 0.1}px) scale(1)`, opacity: 1 }, { transform: `translate(${o.dx * 0.9}px, ${o.dy * 0.9}px) scale(1)`, opacity: 1 }, { transform: `translate(${o.dx}px, ${o.dy}px) scale(0.4)`, opacity: 0 }], 560, 0, ease.io);
  }, 650);
}

/** Venator: ajoelha e arma a armadilha no chão do local; quando a inimiga é revelada ali, a armadilha fecha nela. */
function venator(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (s.ev === "trap" && v) {
    const at = pt(v.from.x, v.from.y + v.from.h * 0.42);
    const open = icon(s, "trapOpen", at, v.from.w * 1.1, 140);
    move(open, [{ opacity: 0 }, { opacity: 1 }], 100);
    later(() => {
      const shut = icon(s, "trapShut", at, v.from.w * 1.1, 650);
      move(shut, [{ transform: "scale(1.3, 0.6)" }, { transform: "scale(1)" }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], 600);
      burst(s, at, 8, "size-1.5 rounded-full bg-zinc-200", v.from.w * 0.5, 380, -8);
      move(v.g, [{ transform: tf() }, { transform: tf(0, 10, 0, 1.04, 0.86) }, { transform: tf(0, 4, 0, 1, 0.96) }, { transform: tf() }], 500);
      flash(v, 160, "bg-red-300 mix-blend-screen");
      s.shake(1);
    }, 130);
    return;
  }
  move(src.g, [{ transform: tf() }, { transform: tf(0, 8, 0, 1.04, 0.88), offset: 0.4 }, { transform: tf(0, 8, 0, 1.04, 0.88), offset: 0.7 }, { transform: tf() }], 800);
  const enemy = half(s, true);
  const at = pt(enemy.x, enemy.y + enemy.h * 0.15);
  later(() => {
    const t = icon(s, "trapOpen", at, src.from.w, 600);
    move(t, [{ transform: "translateY(-40px) scale(0.6)", opacity: 0 }, { transform: "translateY(0) scale(1.1)", opacity: 1, offset: 0.4 }, { transform: "scale(1)", opacity: 1, offset: 0.8 }, { opacity: 0 }], 580, 0, ease.out);
    later(() => burst(s, at, 6, "size-1 rounded-full bg-zinc-300", src.from.w * 0.4, 300), 240);
  }, 300);
}

/** Victor: carrega energia, a descarga circular corre pelo chão do local e todas as cartas tremem com faíscas. */
function victor(s: Stage) {
  const { src } = s;
  jitter(src.g, 400, 2, true);
  for (let k = 0; k < 3; k++) later(() => burst(s, src.from, 6, "h-2.5 w-0.5 bg-lime-200 shadow-[0_0_6px_var(--color-lime-300)]", src.from.w * (0.4 + k * 0.15), 300), k * 120);
  later(() => {
    shock(s, src.from, "border-lime-300/90 shadow-[0_0_14px_var(--color-lime-400)]", 4, 600);
    later(() => shock(s, src.from, "border-cyan-200/80", 3.2, 520), 90);
    s.dst.forEach((a) => {
      jitter(a.g, 360, 3);
      cover(a, "bg-lime-300/40 mix-blend-screen", [{ opacity: 1 }, { opacity: 0 }, { opacity: 0.7 }, { opacity: 0 }], 360);
      burst(s, a.from, 4, "h-2 w-0.5 bg-lime-200", a.from.w * 0.5, 260);
    });
    s.shake(1);
  }, 400);
}

/** Violet: uma moldura de quadro aparece em volta dela e pinceladas coloridas pintam camadas, uma por local vencido. */
function violet(s: Stage) {
  const { src } = s;
  const fr = spawn(s, "rounded-md border-[6px] border-amber-700 shadow-[inset_0_0_0_2px_var(--color-amber-400),0_0_0_2px_var(--color-amber-950)]", src.from, src.from.w * 1.16, 1100, src.from.h * 1.12);
  move(fr, [{ transform: "scale(1.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], 1050);
  const paints = ["bg-pink-400", "bg-sky-400", "bg-yellow-300", "bg-violet-400", "bg-emerald-400"];
  paints.forEach((c, i) => later(() => {
    const p = cover(src, `m-auto size-[45%] rounded-full mix-blend-screen ${c}`, [{ transform: `translate(${(i - 2) * 9}px, ${(i % 2 ? 1 : -1) * 18}px) scale(0)`, opacity: 0.9 }, { transform: `translate(${(i - 2) * 9}px, ${(i % 2 ? 1 : -1) * 18}px) scale(1.3, 0.8)`, opacity: 0.8 }, { opacity: 0 }], 520);
    p?.classList.add("blur-[1px]");
    burst(s, src.from, 4, `size-1.5 rounded-full ${c}`, src.from.w * 0.6, 360);
  }, 250 + i * 110));
  later(() => move(src.g, [{ transform: tf() }, { transform: tf(0, -6, 0, 1.08) }, { transform: tf() }], 320), 850);
}

/** Viscous: vira gosma, rola até o aliado e endurece num cubo de gelatina que balança. */
function viscous(s: Stage) {
  const { src } = s;
  const a = alliesOf(s)[0] ?? src;
  move(src.g, [{ transform: tf() }, { transform: tf(0, 10, 0, 1.15, 0.8) }, { transform: tf(0, -4, 0, 0.92, 1.1) }, { transform: tf() }], 420, 0, ease.io);
  cover(src, "bg-lime-400/40 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], 420);
  for (let i = 0; i < 4; i++) {
    const d = spawn(s, "rounded-b-full bg-lime-400/80", pt(src.from.x + (i - 1.5) * 12, src.from.y + src.from.h * 0.45), 7, 600, 10);
    move(d, [{ transform: "scaleY(0.4)" }, { transform: "translateY(16px) scaleY(1.4)", opacity: 0 }], 520, i * 60, ease.in);
  }
  const o = off(src.from, a.from);
  if (a !== src) later(() => {
    const ball = spawn(s, "rounded-full bg-radial from-lime-200 via-lime-500/80 to-lime-700/60 shadow-[0_0_10px_var(--color-lime-400)]", src.from, 30, 420);
    move(ball, [{ transform: "translate(0,0) scale(0.6)" }, { transform: `translate(${o.dx * 0.5}px, ${o.dy * 0.5 - 20}px) scale(1, 0.8) rotate(360deg)` }, { transform: `translate(${o.dx}px, ${o.dy}px) scale(1.6)`, opacity: 0.6 }], 380, 0, ease.io);
  }, 300);
  later(() => {
    stay(a, "bg-radial from-lime-200/30 via-lime-400/35 to-lime-500/50 shadow-[inset_0_0_18px_var(--color-lime-300)] blur-[0.5px]", { opacity: 0, transform: "scale(0.3)" }, 320);
    mist(s, a.from, "var(--color-lime-400)", 900, undefined, 55);
    move(a.g, [{ transform: tf() }, { transform: tf(0, 0, 0, 1.1, 0.92) }, { transform: tf(0, 0, 0, 0.94, 1.08) }, { transform: tf(0, 0, 0, 1.04, 0.97) }, { transform: tf() }], 560, 0, ease.io);
  }, a === src ? 420 : 680);
}

/** Vyper: cospe um jato de veneno que vira uma poça verde do lado inimigo; quando a inimiga é revelada ali, o veneno sobe por ela e ela vira pedra. */
function vyper(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (s.ev === "petri" && v) {
    const pool = pt(v.from.x, v.from.y + v.from.h * 0.38);
    // a poça borbulha embaixo da carta
    for (let i = 0; i < 6; i++) {
      const b = spawn(s, "rounded-full bg-lime-300/90 ring-1 ring-green-700", pt(pool.x + (i - 2.5) * v.from.w * 0.15, pool.y), 7, 500);
      move(b, [{ transform: "translateY(0) scale(0.3)", opacity: 0 }, { transform: "translateY(-10px) scale(1)", opacity: 1, offset: 0.6 }, { transform: "translateY(-16px) scale(1.4)", opacity: 0 }], 420, i * 40);
    }
    later(() => {
      // o veneno sobe pela carta e endurece em pedra
      cover(v, "origin-bottom bg-linear-to-t from-lime-400/80 via-green-500/60 to-transparent mix-blend-screen", [{ transform: "scaleY(0)", opacity: 1 }, { transform: "scaleY(1)", opacity: 1, offset: 0.6 }, { transform: "scaleY(1)", opacity: 0 }], 520);
      cover(v, "origin-bottom bg-zinc-400 mix-blend-color", [{ transform: "scaleY(0)", opacity: 1 }, { transform: "scaleY(1)", opacity: 1 }], 500, 260);
      later(() => {
        stay(v, "bg-[linear-gradient(115deg,transparent_45%,rgb(41_37_36/0.9)_46%,transparent_48%),linear-gradient(60deg,transparent_60%,rgb(41_37_36/0.8)_61%,transparent_63%)]", { opacity: 0 });
        const chip = spawn(s, "bg-stone-500 [clip-path:polygon(0_0,100%_30%,60%_100%)]", pt(v.from.x + v.from.w * 0.35, v.from.y + v.from.h * 0.2), 10, 600);
        move(chip, [{ transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(50px) rotate(200deg)", opacity: 0 }], 560, 0, ease.in);
        s.shake(1);
      }, 760);
    }, 300);
    return;
  }
  lift(src, 400, -6, 1.04);
  const enemy = half(s, true);
  const o = off(src.from, enemy);
  later(() => {
    // o jato em arco até o meio do lado inimigo
    const glob = spawn(s, "rounded-full bg-radial-[at_35%_30%] from-lime-200 via-green-500 to-green-800 shadow-[0_0_12px_var(--color-lime-400)]", src.from, 20, 420);
    move(glob, [{ transform: tf(0, 0, 0, 0.5) }, { transform: tf(o.dx * 0.5, o.dy * 0.5 - 70, 0, 1, 0.85), easing: ease.in }, { transform: tf(o.dx, o.dy, 0, 1.4, 0.6) }], 380, 0, ease.out);
    for (let k = 1; k < 7; k++) later(() => spawn(s, "rounded-full bg-lime-300/80 blur-[1px]", where(glob, src.from), 7, 300), k * 55);
  }, 220);
  later(() => {
    // espirra e a poça se espalha (a marca da mesa assume quando a cena acaba)
    burst(s, enemy, 10, "size-2 rounded-full bg-lime-300", enemy.w * 0.45, 420, -6);
    const p = spawn(s, "rounded-[50%] bg-radial from-lime-300/80 via-green-600/60 to-green-900/0 to-70%", pt(enemy.x, enemy.y + enemy.h * 0.1), enemy.w * 0.9, 700, enemy.h * 0.3);
    move(p, [{ transform: "scale(0.1, 0.05)", opacity: 1 }, { transform: "scale(1.06, 1.1)", opacity: 1, offset: 0.5 }, { transform: "scale(1)", opacity: 0 }], 650, 0, ease.out);
    jostle(s, enemy, [], 1, 3);
  }, 600);
}

/** Warden: finca o pé e cerra o punho; um fio de energia sai de cada inimiga até ele, que cresce a cada fio. */
function warden(s: Stage) {
  const { src } = s;
  const vs = s.dst;
  move(src.g, [{ transform: tf() }, { transform: tf(0, 6, 0, 1.04, 0.94) }], 220);
  const aura = spawn(s, "rounded-full bg-radial from-sky-400/60 to-transparent to-70% blur-sm", src.from, src.from.w * 1.6, 600 + vs.length * 150 + 300, src.from.h * 1.4);
  move(aura, [{ transform: "scale(0.6)", opacity: 0 }, { transform: `scale(${1 + vs.length * 0.12})`, opacity: 1, offset: 0.8 }, { opacity: 0 }], 600 + vs.length * 150 + 250);
  vs.forEach((v, i) => later(() => {
    cable(s, "bg-sky-300 shadow-[0_0_8px_var(--color-sky-400)]", 2, () => v.from, (t) => mix(v.from, src.from, ease3(Math.min(1, t * 1.5))), 720);
    flash(v, 180, "bg-sky-200 mix-blend-screen");
    later(() => move(src.g, [{ transform: tf(0, 6, 0, 1.04 + i * 0.03, 0.94 + i * 0.03) }, { transform: tf(0, 0, 0, 1.08 + i * 0.03) }], 160), 240);
  }, 250 + i * 150));
  later(() => move(src.g, [{ transform: tf(0, 0, 0, 1.08 + vs.length * 0.03) }, { transform: tf() }], 300, 0, ease.io), 300 + vs.length * 150 + 250);
}

/** Wraith: cartas espectrais giram na mão dela e a vítima é erguida da fileira, pairando e girando devagar no ar. */
function wraith(s: Stage) {
  const { src } = s;
  const v = foesOf(s)[0];
  if (s.ev === "late") {
    rise(s, src.from, 8, "rounded-full bg-violet-700/60 blur-sm", 22, 60, 500);
    const d = off(src.from, src.to);
    move(src.g, [{ transform: tf(), opacity: 1 }, { transform: tf(0, 0, 0, 0.8), opacity: 0 }], 260);
    later(() => { move(src.g, [{ transform: tf(d.dx, d.dy, 0, 0.8), opacity: 0 }, { transform: tf(d.dx, d.dy, 0, 1), opacity: 1 }], 300); rise(s, src.to, 8, "rounded-full bg-violet-700/60 blur-sm", 22, 60, 500); }, 380);
    return;
  }
  const orbit = (c: Box, n: number, ms: number, r: number) => {
    for (let i = 0; i < n; i++) {
      const el = icon(s, "spade", c, 18, ms);
      const a0 = (i / n) * 360;
      move(el, [0, 1, 2, 3, 4].map((k) => {
        const a = ((a0 + k * 90) * Math.PI) / 180;
        return { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r * 0.5}px) rotate(${k * 90}deg)`, opacity: k === 4 ? 0 : 1 };
      }), ms, 0, ease.lin);
    }
  };
  orbit(src.from, 4, 600, src.from.w * 0.65);
  lift(src, 400, -6, 1.05);
  if (!v) return;
  later(() => {
    move(v.g, [{ transform: tf() }, { transform: tf(0, -v.from.h * 0.5, 6, 1.06), offset: 0.4 }, { transform: tf(0, -v.from.h * 0.55, -6, 1.06), offset: 0.7 }, { transform: tf(0, -v.from.h * 0.5, 4, 1.06) }], 900, 0, ease.io);
    cover(v, "bg-violet-400/30 mix-blend-screen", [{ opacity: 0 }, { opacity: 1 }], 400);
    orbit(pt(v.from.x, v.from.y - v.from.h * 0.5), 4, 900, v.from.w * 0.7);
    glow(s, "rounded-full bg-black/50 blur-md", pt(v.from.x, v.from.y + v.from.h * 0.45), v.from.w, 900, 14);
  }, 380);
}

/** Yamato: escurece com a aura preta e vermelha, dá um passo e saca num corte único que atravessa o local inteiro. */
function yamato(s: Stage) {
  const { src } = s;
  const enemy = half(s, true);
  cover(src, "bg-black/50 mix-blend-multiply", [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0.3 }], 900);
  rise(s, src.from, 12, "rounded-t-full bg-linear-to-t from-red-700 via-red-950 to-black/0", 14, 70, 700);
  const step = off(src.from, enemy);
  later(() => move(src.g, [{ transform: tf() }, { transform: tf(step.ux * 16, step.uy * 16, 0, 1.06) }], 160, 0, ease.in), 420);
  later(() => {
    const l = s.lane ?? enemy;
    beam(s, pt(l.x - l.w * 0.6, enemy.y + 10), pt(l.x + l.w * 0.6, enemy.y - 10), "bg-linear-to-r from-transparent via-white to-red-500 shadow-[0_0_14px_var(--color-red-500)]", 4, 80, 120);
    const fl = spawn(s, "bg-white", pt(0, 0), 10, 200);
    Object.assign(fl.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
    move(fl, [{ opacity: 0.35 }, { opacity: 0 }], 160);
    jostle(s, enemy, [src.id], 1.2, 8);
    s.shake(2);
  }, 580);
  later(() => move(src.g, [{ transform: tf(step.ux * 16, step.uy * 16, 0, 1.06) }, { transform: tf() }], 300, 0, ease.io), 900);
}

const H = (ms: Recipe["ms"], run: Recipe["run"], hit?: Recipe["hit"], kills?: boolean): Recipe => ({ ms, run, hit, kills });
/** Todas as coreografias por herói (as genéricas seguem com o efeito por cima da mesa). */
export const CHOREO: Partial<Record<AbilityKey, Recipe>> = {
  "Abrams": H((n) => (n ? 1150 : 650), abrams, () => 506),
  "Apollo": H((n, _s, ev) => (ev === "parry" && n ? 1200 : 800), apollo, () => 740),
  "Baba": H((n) => (n ? 1650 : 700), baba, () => 1080),
  "Bebop": H((n, _s, ev) => (ev === "pull" && n ? 1250 : 700), bebop),
  "Billy": H((n) => (n ? 1450 : 600), billy, () => 800),
  "Calico": H((n, _s, ev) => (ev === "late" ? 450 + Math.max(1, n) * 380 + 300 : 1000), calico, () => 400),
  "Celeste": H((n) => CELESTE_UP + Math.max(1, n) * CELESTE_HOP + 600, celeste, () => CELESTE_UP + CELESTE_HOP),
  "Deadman Danny": H((n) => 240 + Math.max(1, n) * 170 + 900, danny, () => 760),
  "Drifter": H((n, self) => (n ? (self ? 1700 : 1450) : 350), drifter, () => 920),
  "Dynamo": H(() => 1350, dynamo, () => 1150),
  "Graves": H((n) => 400 + n * 180 + 600, graves),
  "Grey Talon": H((n, self) => (n ? TALON_DRAW + TALON_FLY + (self ? 950 : 600) : 350), greyTalon, () => TALON_DRAW + TALON_FLY),
  "Haze": H((n, _s, ev) => (ev === "late" ? 1000 : n ? 1450 : 400), haze, (_n, _s, ev) => (ev === "late" ? 840 : 580)),
  "Holliday": H(() => 1250, holliday),
  "Infernus": H((n) => (n ? 1350 : 500), infernus, () => 980),
  "Ivy": H((n) => (n ? 250 + IVY_GROW + IVY_HOLD + 420 : 700), ivy),
  "Kelvin": H(() => KELVIN_MS, kelvin),
  "Lady Geist": H((n) => (n ? 1450 : 400), geist, () => 1130),
  "Lash": H((n) => (n ? 1150 : 0), lash, () => 800),
  "McGinnis": H((n) => (n ? 1600 : 300), mcginnis),
  "Mina": H((n, _s, ev) => (ev === "end" && n ? 720 + MINA_GROW + MINA_HOLD + 450 : 700), mina, () => 560),
  "Mirage": H(() => 950, mirage),
  "Mo & Krill": H(() => 1200, moKrill),
  "Nurse Harrow": H((n) => (n ? 1650 : 600), harrow, () => 600),
  "Paige": H(() => PAIGE_MS, paige),
  "Paradox": H(() => 1350, paradox),
  "Pocket": H((n) => 1100 + n * 120 + 300, pocket, () => 500),
  "Rat King": H(() => 1150, ratKing),
  "Rem": H((n) => 700 + n * 100 + 700, rem, () => 650),
  "Seven": H((n, _s, ev) => (ev === "end" ? 450 + n * 170 + 400 : 950), seven, () => 400),
  "Shiv": H((n) => 220 + Math.max(1, n) * 520 + 500, shiv, () => 520, true),
  "Silver": H((n) => (n ? 1850 : 1300), silver, () => 1480),
  "Sinclair": H(() => 950, sinclair),
  "Solomon": H((n) => 300 + n * 110 + 900, solomon),
  "The Doorman": H(() => 1350, doorman),
  "Venator": H((_n, _s, ev) => (ev === "trap" ? 850 : 950), venator, (_n, _s, ev) => (ev === "trap" ? 130 : 0)),
  "Victor": H(() => 1050, victor),
  "Vindicta": H((n, self) => (n ? (self ? 1500 : 1150) : 0), vindicta, () => 540),
  "Violet": H(() => 1150, violet),
  "Viscous": H(() => 1300, viscous),
  "Vyper": H((_n, _s, ev) => (ev === "petri" ? 1600 : 1150), vyper, (_n, _s, ev) => (ev === "petri" ? 1060 : 600)),
  "Warden": H((n) => 1050 + n * 150, warden),
  "Wraith": H((n, _s, ev) => (ev === "late" ? 750 : n ? 1350 : 650), wraith),
  "Yamato": H(() => 1250, yamato, () => 580),
};

/** Vindicta: a mira escurece a tela, a retícula trava, o laser marca e o tiro empurra a vítima; se não matou, ela cai. */
function vindicta(s: Stage) {
  const { src } = s;
  const v = s.dst[0];
  if (!v) return;
  const aim = 420, fire = aim + 120;
  vignette(s, v.from, fire + 600);
  const ret = spawn(s, "rounded-full border-2 border-red-500 shadow-[0_0_10px_var(--color-red-500)] bg-[linear-gradient(var(--color-red-500),var(--color-red-500))_center/2px_100%_no-repeat,linear-gradient(var(--color-red-500),var(--color-red-500))_center/100%_2px_no-repeat]", src.from, v.from.w * 0.8, fire + 350);
  const o = off(src.from, v.from);
  move(ret, [
    { transform: tf(0, 0, 0, 1.8), opacity: 0 },
    { transform: tf(o.dx * 0.85, o.dy * 0.85, 45, 1.3), opacity: 1, offset: 0.55 },
    { transform: tf(o.dx, o.dy, 90, 0.9), offset: 0.85 },
    { transform: tf(o.dx, o.dy, 90, 1), opacity: 1 },
  ], aim, 0, ease.io);
  later(() => move(ret, [{ opacity: 1 }, { opacity: 0 }], 300), fire);
  const stop = cable(s, "bg-red-500 shadow-[0_0_8px_var(--color-red-500)]", 2, () => src.from, (t) => ({ ...v.from, x: v.from.x + Math.sin(t * 40) * 2 * (1 - t) }), fire);
  later(stop, fire);
  move(src.g, [{ transform: tf() }, { transform: tf(0, 2, 0, 1.03) }], aim);
  later(() => {
    glow(s, "rounded-full bg-radial from-white via-yellow-300/80 to-transparent to-70%", src.from, src.from.w, 200);
    move(src.g, [{ transform: tf(0, 2, 0, 1.03) }, { transform: tf(-o.ux * 16, -o.uy * 16, o.dx >= 0 ? -8 : 8, 1.03) }, { transform: tf() }], 380);
    move(v.g, [{ transform: tf() }, { transform: tf(o.ux * 22, o.uy * 22, o.ux >= 0 ? 9 : -9, 0.95) }, { transform: tf(o.ux * 6, o.uy * 6, 0) }, { transform: tf() }], 520);
    flash(v, 180);
    cover(v, "m-auto size-5 inset-[calc(50%-10px)] rounded-full bg-radial from-black via-zinc-900 to-zinc-500/0 to-80% shadow-[0_0_0_2px_rgb(255_255_255/0.25)]", [{ transform: "scale(0.2)", opacity: 1 }, { transform: "scale(1)", opacity: 1, offset: 0.15 }, { transform: "scale(1)", opacity: 0 }], 900);
    burst(s, v.from, 8, "size-1.5 rounded-full bg-red-400", v.from.w * 0.6, 420);
    s.shake(1);
  }, fire);
  if (s.self) later(() => {
    // errou o golpe de misericórdia: despenca, apagada, soltando penas de corvo
    move(src.g, [{ transform: tf() }, { transform: tf(0, -26, -6, 1.06) }, { transform: tf(0, 14, 4, 0.94, 1) }, { transform: tf() }], 560, 0, ease.io);
    cover(src, "bg-black/40", [{ opacity: 0 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], 600);
    later(() => burst(s, src.from, 7, "", src.from.w * 0.7, 750, 40, 20, "feather"), 200);
  }, fire + 380);
}

