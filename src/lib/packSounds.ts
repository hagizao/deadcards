/**
 * Sons da abertura de pack, sintetizados com Web Audio: sem arquivos para baixar e sem dependência.
 * Só tocam depois de um toque (o navegador exige gesto) e respeitam o mudo salvo no aparelho.
 */

export type RevealLevel = "base" | "ascendant" | "eternus" | "special";

const MUTE_KEY = "deadcards:pack-sound-off";
let ctx: AudioContext | null = null;

export const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
};
export const setMuted = (off: boolean) => {
  try { localStorage.setItem(MUTE_KEY, off ? "1" : "0"); } catch { /* sem localStorage: só não lembra */ }
};

function audio(): AudioContext | null {
  if (isMuted() || typeof window === "undefined" || !window.AudioContext) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function master(a: AudioContext, gain: number) {
  const g = a.createGain();
  g.gain.value = gain;
  g.connect(a.destination);
  return g;
}

function noise(a: AudioContext, seconds: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Envelope rápido: sobe em `attack` e cai até `end`. */
function env(g: GainNode, t: number, peak: number, attack: number, end: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
}

function tone(a: AudioContext, out: AudioNode, freq: number, t: number, dur: number, peak: number, type: OscillatorType = "sine") {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, peak, 0.01, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Papel rasgando: ruído com filtro que desce. `big` é o segundo rasgo, maior. */
export function playTear(big = false) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = master(a, 0.5);
  const src = noise(a, big ? 0.45 : 0.3);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(big ? 5200 : 4200, t);
  bp.frequency.exponentialRampToValueAtTime(big ? 900 : 1300, t + (big ? 0.4 : 0.26));
  const g = a.createGain();
  env(g, t, big ? 0.9 : 0.7, 0.015, big ? 0.42 : 0.28);
  // estalos irregulares do papel
  const crackle = a.createGain();
  crackle.gain.setValueAtTime(1, t);
  for (let i = 0; i < 10; i++) crackle.gain.setValueAtTime(Math.random() > 0.5 ? 1 : 0.35, t + i * 0.03);
  src.connect(bp).connect(g).connect(crackle).connect(out);
  src.start(t);
}

/** Luz saindo do pack: brilho que sobe, mais rico quanto mais rara a carta. */
export function playRays(level: RevealLevel) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = master(a, 0.22);
  const base = level === "eternus" ? 523.25 : level === "ascendant" || level === "special" ? 440 : 329.63;
  const voices = level === "base" ? [1, 1.5] : level === "eternus" ? [1, 1.25, 1.5, 2, 3] : [1, 1.25, 1.5, 2];
  for (const [i, m] of voices.entries()) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(base * m * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(base * m, t + 0.9);
    env(g, t + i * 0.04, 0.3 / voices.length, 0.4, level === "base" ? 1.1 : 1.8);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 2);
  }
}

/** Atributo aparecendo: um "tic" curto. */
export function playStat() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = master(a, 0.3);
  tone(a, out, 1318.5, t, 0.18, 0.5, "triangle");
  tone(a, out, 1975.5, t + 0.05, 0.22, 0.25, "sine");
}

/** Herói de assinatura: carimbo grave com um anel metálico dourado. */
export function playSignature() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = master(a, 0.55);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
  env(g, t, 0.9, 0.005, 0.32);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
  for (const f of [987.77, 1479.98, 2349.32]) tone(a, out, f, t + 0.06, 1.1, 0.12, "sine");
}

/** Revelação: sopro + acorde. Ascendente ganha arpejo dourado; Eternus, acorde cheio com cauda longa. */
export function playReveal(level: RevealLevel) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = master(a, 0.42);
  // sopro
  const src = noise(a, 0.6);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.exponentialRampToValueAtTime(6000, t + 0.35);
  const g = a.createGain();
  env(g, t, 0.35, 0.2, 0.55);
  src.connect(lp).connect(g).connect(out);
  src.start(t);

  if (level === "base") {
    tone(a, out, 659.25, t + 0.15, 0.6, 0.3, "triangle");
    tone(a, out, 987.77, t + 0.22, 0.7, 0.18);
    return;
  }
  // grave de impacto
  const boom = a.createOscillator();
  const bg = a.createGain();
  boom.frequency.setValueAtTime(110, t + 0.12);
  boom.frequency.exponentialRampToValueAtTime(40, t + 0.7);
  env(bg, t + 0.12, level === "eternus" ? 0.9 : 0.6, 0.01, 0.8);
  boom.connect(bg).connect(out);
  boom.start(t + 0.12);
  boom.stop(t + 1);

  const chord = level === "eternus"
    ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093]
    : level === "special"
      ? [466.16, 587.33, 698.46, 932.33, 1174.66]
      : [523.25, 659.25, 783.99, 1046.5, 1318.51];
  const step = level === "eternus" ? 0.07 : 0.06;
  const tail = level === "eternus" ? 2.6 : 1.6;
  chord.forEach((f, i) => {
    tone(a, out, f, t + 0.15 + i * step, tail, 0.16, "triangle");
    tone(a, out, f * 2, t + 0.15 + i * step, tail * 0.7, 0.05, "sine");
  });
  if (level === "eternus") {
    // brilho que fica no ar
    for (let i = 0; i < 8; i++) tone(a, out, 2637 + Math.random() * 1500, t + 0.6 + i * 0.12, 0.5, 0.05, "sine");
  }
}
