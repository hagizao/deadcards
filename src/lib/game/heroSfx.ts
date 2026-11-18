// Som de cada habilidade quando ela funciona na mesa, sintetizado no Web Audio (sem arquivos).
// Cada receita conta uma pequena cena do que o herói faz no Deadlock (deadlock.wiki) e do que a carta faz:
// o laço da Holliday girando antes de prender, o acorde distorcido do Billy, o bip de hospital da Nurse Harrow...
// O kit dá espaço (reverb), lado (pan), FM, distorção e cordas dedilhadas para as camadas não soarem como bipes soltos.
import type { AbilityKey } from "./config";
import { noise, voice } from "./sfx";

/** Saída de cada camada: lado no estéreo (−1 a 1, pode deslizar até `panTo`) e quanto vai para o reverb. */
type Out = { pan?: number; panTo?: number; wet?: number };
type Env = { at?: number; dur: number; gain: number; attack?: number; hold?: number; trem?: [rate: number, depth: number] };
type Tone = Out & Env & {
  f: number; to?: number; type?: OscillatorType; vib?: [rate: number, hz: number];
  /** Curva de altura: pares [segundos desde o início, frequência]. */
  path?: [number, number][];
  lp?: number; hp?: number; q?: number;
  /** Modulação de frequência: razão do modulador e índice (do início ao fim). */
  fm?: [ratio: number, index: number, indexTo?: number];
  drive?: number;
};
type Hiss = Out & Env & { f: number; to?: number; q?: number; type?: BiquadFilterType; brown?: boolean };
type Pluck = Out & { f: number; at?: number; dur: number; gain: number; bright?: number; drive?: number; lp?: number };
type Partial3 = readonly (readonly [freq: number, gain: number, dur: number])[];

const rooms = new WeakMap<BaseAudioContext, ConvolverNode>();
/** Sala compartilhada: um impulso de ruído que decai, criado uma vez por contexto. */
function room(c: AudioContext) {
  let r = rooms.get(c);
  if (r) return r;
  r = c.createConvolver();
  const len = Math.floor(c.sampleRate * 2);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.5;
  }
  r.buffer = b;
  const g = c.createGain();
  g.gain.value = 0.45;
  r.connect(g).connect(c.destination);
  rooms.set(c, r);
  return r;
}
const curves = new Map<number, Float32Array<ArrayBuffer>>();
const driveCurve = (k: number) => {
  let cv = curves.get(k);
  if (!cv) {
    cv = new Float32Array(1024);
    for (let i = 0; i < cv.length; i++) { const x = (i / (cv.length - 1)) * 2 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); }
    curves.set(k, cv);
  }
  return cv;
};

/** Peças para montar os sons, todas passando por um compressor (o som fica cheio sem estourar) e pela sala. */
function kit(strength: number) {
  const v = voice(strength);
  if (!v) return null;
  const { c, t } = v;
  const vol = v.vol * 1.6;
  const bus = c.createDynamicsCompressor();
  bus.threshold.value = -16; bus.knee.value = 12; bus.ratio.value = 5; bus.attack.value = 0.003; bus.release.value = 0.2;
  bus.connect(c.destination);
  const rv = room(c);

  const out = (n: AudioNode, s: number, dur: number, o: Out) => {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(o.pan ?? 0, s);
    if (o.panTo !== undefined) p.pan.linearRampToValueAtTime(o.panTo, s + dur);
    n.connect(p).connect(bus);
    const w = o.wet ?? 0.2;
    if (w > 0) { const g = c.createGain(); g.gain.value = w; p.connect(g).connect(rv); }
  };
  const lfo = (rate: number, depth: number, target: AudioParam, s: number, dur: number) => {
    const o = c.createOscillator();
    o.frequency.value = rate;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(s);
    o.stop(s + dur + 0.05);
  };
  /** Ganho com ataque, sustentação opcional e queda exponencial; com `trem`, o volume pulsa. */
  const amp = (s: number, e: Env) => {
    const g = c.createGain();
    const a = e.attack ?? 0.005;
    const peak = Math.max(0.0002, e.gain * vol);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + a);
    if (e.hold) g.gain.setValueAtTime(peak, s + a + e.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, s + Math.max(e.dur, a + (e.hold ?? 0) + 0.01));
    if (!e.trem) return { in: g as AudioNode, out: g };
    const m = c.createGain();
    m.gain.value = 1 - e.trem[1] / 2;
    lfo(e.trem[0], e.trem[1] / 2, m.gain, s, e.dur);
    m.connect(g);
    return { in: m as AudioNode, out: g };
  };
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  const tone = (o: Tone) => {
    const s = t + (o.at ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.path?.[0]?.[1] ?? o.f, s);
    if (o.path) o.path.slice(1).forEach(([dt, f]) => osc.frequency.exponentialRampToValueAtTime(f, s + dt));
    else if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, s + o.dur);
    if (o.vib) lfo(o.vib[0], o.vib[1], osc.frequency, s, o.dur);
    if (o.fm) {
      const [ratio, index, indexTo] = o.fm;
      const mod = c.createOscillator();
      mod.frequency.setValueAtTime(o.f * ratio, s);
      if (o.to && !o.path) mod.frequency.exponentialRampToValueAtTime(o.to * ratio, s + o.dur);
      const mg = c.createGain();
      mg.gain.setValueAtTime(o.f * index, s);
      if (indexTo !== undefined) mg.gain.linearRampToValueAtTime(o.f * indexTo, s + o.dur);
      mod.connect(mg).connect(osc.frequency);
      mod.start(s);
      mod.stop(s + o.dur + 0.05);
    }
    let n: AudioNode = osc;
    if (o.drive) { const ws = c.createWaveShaper(); ws.curve = driveCurve(o.drive); n = n.connect(ws); }
    if (o.lp) n = n.connect(filt("lowpass", o.lp, o.q));
    if (o.hp) n = n.connect(filt("highpass", o.hp));
    const g = amp(s, o);
    n.connect(g.in);
    out(g.out, s, o.dur, o);
    osc.start(s);
    osc.stop(s + o.dur + 0.05);
  };
  const hiss = (o: Hiss) => {
    const s = t + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = noise(c, o.dur + 0.05, o.brown);
    const fl = filt(o.type ?? "bandpass", o.f, o.q ?? 1);
    fl.frequency.setValueAtTime(o.f, s);
    if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, s + o.dur);
    const g = amp(s, o);
    src.connect(fl).connect(g.in);
    out(g.out, s, o.dur, o);
    src.start(s);
    src.stop(s + o.dur + 0.05);
  };
  /** Corda dedilhada (Karplus-Strong): violão, guitarra, corda de laço, mola. */
  const pluck = (o: Pluck) => {
    const s = t + (o.at ?? 0);
    const sr = c.sampleRate;
    const n = Math.max(2, Math.round(sr / o.f));
    const len = Math.floor(sr * o.dur);
    const b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const line = new Float32Array(n).map(() => Math.random() * 2 - 1);
    const br = o.bright ?? 0.5;
    for (let i = 0, j = 0; i < len; i++, j = (j + 1) % n) {
      const x = line[j];
      d[i] = x;
      line[j] = 0.996 * (br * x + (1 - br) * 0.5 * (x + line[(j + 1) % n]));
    }
    const src = c.createBufferSource();
    src.buffer = b;
    let node: AudioNode = src;
    if (o.drive) { const ws = c.createWaveShaper(); ws.curve = driveCurve(o.drive); node = node.connect(ws); }
    if (o.lp) node = node.connect(filt("lowpass", o.lp));
    const g = amp(s, { dur: o.dur, gain: o.gain, attack: 0.002 });
    node.connect(g.in);
    out(g.out, s, o.dur, o);
    src.start(s);
  };
  /** Sino de parciais senoidais (metal, vidro, caixinha de música). */
  const bell = (at: number, parts: Partial3, gain = 1, o: Out = {}) => {
    const s = t + at;
    for (const [fq, g, dur] of parts) {
      const osc = c.createOscillator();
      osc.frequency.value = fq;
      const gn = amp(s, { dur, gain: g * gain, attack: 0.003 });
      osc.connect(gn.in);
      out(gn.out, s, dur, o);
      osc.start(s);
      osc.stop(s + dur + 0.02);
    }
  };
  /** Batida grave (corpo) com o estalo do contato. */
  const thud = (at: number, gain: number, f = 120, o: Out = {}) => {
    tone({ f, to: f * 0.35, at, dur: 0.4, gain: gain * 1.1, ...o });
    hiss({ f: 600, at, dur: 0.1, gain: gain * 0.9, brown: true, type: "lowpass", attack: 0.002, ...o });
  };
  const click = (at: number, gain: number, f = 3500, o: Out = {}) => hiss({ f, at, dur: 0.025, gain, q: 2, attack: 0.001, ...o });
  return { tone, hiss, pluck, bell, thud, click };
}
type Kit = NonNullable<ReturnType<typeof kit>>;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const METAL = (f: number) => [[f, 0.3, 0.7], [f * 1.51, 0.18, 0.5], [f * 2.27, 0.1, 0.35], [f * 3.1, 0.05, 0.25]] as const;
const GLASS = (f: number) => [[f, 0.25, 1.2], [f * 2.01, 0.12, 0.9], [f * 3.98, 0.05, 0.6]] as const;
/** Tine de caixinha de música: fundamental limpa e parciais altas curtas. */
const TINE = (f: number) => [[f, 0.22, 1], [f * 3.01, 0.04, 0.3], [f * 5.42, 0.02, 0.15]] as const;

/** Corrente sacudindo: elos metálicos batendo em sequência. */
const chain = (k: Kit, at: number, n: number, gain: number, o: Out = {}) => {
  for (let i = 0; i < n; i++) {
    const p = o.panTo === undefined ? o.pan : (o.pan ?? 0) + ((o.panTo - (o.pan ?? 0)) * i) / Math.max(1, n - 1);
    k.bell(at + i * 0.035 + rnd(0, 0.015), [[rnd(2600, 4400), 0.12 * gain, 0.14], [rnd(5200, 7200), 0.06 * gain, 0.09]], 1, { pan: p, wet: o.wet });
  }
};
const whoosh = (k: Kit, at: number, dur: number, gain: number, from = 400, to = 2400, o: Out = {}) => k.hiss({ f: from, to, at, dur, gain, q: 1.2, attack: dur * 0.6, ...o });
/** Aço contra aço: o estalo do choque e o metal soando. */
const clang = (k: Kit, at: number, f: number, gain: number, o: Out = {}) => {
  k.hiss({ f: f * 2.2, at, dur: 0.06, gain: gain * 0.9, q: 0.8, attack: 0.001, ...o });
  k.bell(at, METAL(f), gain, { wet: 0.35, ...o });
};
/** Catraca: cliques secos acelerando ou freando. */
const ratchet = (k: Kit, at: number, n: number, gain: number, o: Out = {}) => {
  for (let i = 0; i < n; i++) k.click(at + i * 0.04, gain, 2200 + (i % 2) * 600, o);
};
/** Explosão: o estouro, o corpo grave e a cauda na sala. */
const boom = (k: Kit, at: number, gain: number, o: Out = {}) => {
  k.hiss({ f: 1200, to: 120, at, dur: 0.7, gain: gain * 1.6, brown: true, type: "lowpass", attack: 0.004, wet: 0.5, ...o });
  k.thud(at, gain * 1.2, 70, o);
};
/** Cascalho caindo: pedrinhas em tempos e lados aleatórios. */
const debris = (k: Kit, at: number, n: number, gain: number, spread = 0.4) => {
  for (let i = 0; i < n; i++) k.hiss({ f: rnd(500, 2000), at: at + rnd(0, spread), dur: 0.04, gain: gain * rnd(0.5, 1), q: 1.5, attack: 0.001, pan: rnd(-0.7, 0.7) });
};
/** Madeira batendo (peça de xadrez, casco): o estalo e a ressonância curta. */
const wood = (k: Kit, at: number, gain: number, f = 900, o: Out = {}) => {
  k.click(at, gain, f * 1.4, o);
  k.tone({ f, to: f * 0.9, at, dur: 0.08, gain: gain * 0.35, type: "triangle", ...o });
  k.tone({ f: f * 2.7, at, dur: 0.04, gain: gain * 0.12, ...o });
};
/** Lâmina cortando o ar e entrando: o assobio, o golpe e o anel do aço. */
const blade = (k: Kit, at: number, gain: number, o: Out = {}) => {
  k.hiss({ f: 1800, to: 8000, at, dur: 0.12, gain: gain * 0.9, q: 1.4, attack: 0.08, ...o });
  k.hiss({ f: 900, to: 300, at: at + 0.11, dur: 0.12, gain: gain * 0.8, q: 2.5, attack: 0.002, ...o });
  k.thud(at + 0.11, gain * 0.6, 180, o);
  k.bell(at + 0.11, [[2950, 0.1, 0.5], [4410, 0.07, 0.35], [6230, 0.04, 0.25]], gain, { wet: 0.4, ...o });
};

const RECIPES: Partial<Record<AbilityKey, (k: Kit) => void>> = {
  // Investida: passos pesados acelerando, o rosnado do Abrams e a vítima estourando na parede com cascalho
  "Abrams": (k) => {
    [0, 0.13, 0.23].forEach((a, i) => k.thud(a, 0.5 + i * 0.2, 70, { pan: -0.6 + i * 0.3 }));
    k.hiss({ f: 120, to: 900, at: 0.05, dur: 0.38, gain: 1.6, brown: true, type: "lowpass", attack: 0.33, pan: -0.5, panTo: 0.3 });
    k.tone({ f: 150, to: 95, at: 0.22, dur: 0.3, gain: 0.3, type: "sawtooth", lp: 800, drive: 3, trem: [28, 0.6] });
    k.thud(0.4, 1.8, 80, { pan: 0.4, wet: 0.45 });
    k.hiss({ f: 2200, at: 0.4, dur: 0.15, gain: 0.8, q: 0.6, pan: 0.4 });
    debris(k, 0.45, 12, 0.5, 0.45);
  },
  // Riposta: o florete desvia num choque de aço, a lâmina raspa na outra e devolve a estocada
  "Apollo": (k) => {
    whoosh(k, 0, 0.1, 0.7, 1500, 6000, { pan: -0.4, panTo: 0.1 });
    clang(k, 0.1, 2300, 1.2, { pan: 0.1 });
    k.hiss({ f: 7000, to: 3500, at: 0.13, dur: 0.28, gain: 0.6, q: 6, pan: 0.1, panTo: 0.5 });
    whoosh(k, 0.42, 0.08, 0.8, 2000, 8000, { pan: 0.5 });
    k.thud(0.5, 0.6, 220, { pan: 0.6 });
    k.bell(0.5, [[3100, 0.08, 0.6], [6200, 0.04, 0.4]], 1, { pan: 0.6, wet: 0.5 });
  },
  // Revoada: um "puf" de feitiço, a vítima vira pombo (dois arrulhos) e o bando sai batendo asas pela mesa
  "Baba": (k) => {
    k.hiss({ f: 900, to: 300, dur: 0.3, gain: 1.2, brown: true, type: "lowpass" });
    [2093, 2637, 3136].forEach((f, i) => k.bell(0.04 + i * 0.04, GLASS(f), 0.3, { pan: -0.3 + i * 0.3, wet: 0.6 }));
    [0.3, 0.6].forEach((a) => k.tone({ f: 420, path: [[0, 420], [0.07, 500], [0.22, 360]], at: a, dur: 0.24, gain: 0.32, type: "triangle", lp: 1000, trem: [22, 0.7], attack: 0.03 }));
    for (let i = 0; i < 16; i++) k.hiss({ f: rnd(900, 1600), at: 0.62 + i * 0.045 + rnd(0, 0.015), dur: 0.045, gain: 0.6, q: 1.4, attack: 0.004, pan: -0.8 + i * 0.1 });
  },
  // Gancho: o servo do robô zune, o gancho dispara na pressão, a corrente corre, prende com um clangue e a catraca recolhe
  "Bebop": (k) => {
    k.tone({ f: 300, to: 1400, dur: 0.18, gain: 0.12, type: "square", lp: 2500 });
    k.hiss({ f: 1200, to: 300, at: 0.15, dur: 0.12, gain: 1.2, q: 0.7 });
    chain(k, 0.18, 9, 0.9, { pan: -0.5, panTo: 0.6 });
    clang(k, 0.5, 650, 1.3, { pan: 0.6 });
    ratchet(k, 0.65, 9, 0.6, { pan: 0.4 });
    k.tone({ f: 880, at: 1.05, dur: 0.07, gain: 0.12, type: "square", lp: 3000 });
    k.tone({ f: 1320, at: 1.13, dur: 0.1, gain: 0.12, type: "square", lp: 3000 });
  },
  // Gangue da Corrente: um acorde de guitarra distorcida, as correntes voam e batem, e o cadeado fecha
  "Billy": (k) => {
    [82.4, 123.5, 164.8].forEach((f) => k.pluck({ f, dur: 1.2, gain: 0.55, bright: 0.85, drive: 8, lp: 3200, wet: 0.3 }));
    chain(k, 0.15, 10, 1, { pan: -0.6, panTo: 0.6 });
    k.thud(0.52, 1, 90, { pan: 0.5 });
    clang(k, 0.52, 520, 1.3, { pan: 0.5 });
    k.click(0.8, 1, 1800, { pan: 0.5 });
    k.click(0.86, 0.7, 2700, { pan: 0.5 });
  },
  // Retorno às Sombras: o miado e o chiado da gata, ela some na sombra e as garras riscam três vezes
  "Calico": (k) => {
    k.tone({ f: 600, path: [[0, 600], [0.12, 950], [0.36, 620]], dur: 0.38, gain: 0.22, type: "sawtooth", lp: 2600, vib: [6, 10], attack: 0.03, wet: 0.3 });
    k.hiss({ f: 4500, at: 0.42, dur: 0.35, gain: 0.9, q: 0.6, type: "highpass", attack: 0.01 });
    k.hiss({ f: 600, to: 120, at: 0.5, dur: 0.6, gain: 1.1, brown: true, type: "lowpass", attack: 0.1, pan: 0.3, panTo: -0.4, wet: 0.6 });
    [0.85, 0.93, 1.01].forEach((a, i) => k.hiss({ f: 3500, to: 7500, at: a, dur: 0.06, gain: 0.8, q: 3, pan: -0.4 + i * 0.4, attack: 0.02 }));
  },
  // Maravilha Radiante: a luz sobe num brilho, acerta e ricocheteia de um lado para o outro
  "Celeste": (k) => {
    k.tone({ f: 400, to: 2400, dur: 0.25, gain: 0.15, fm: [2, 1.5, 0.2] });
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => k.bell(i * 0.05, GLASS(f), 0.45, { pan: -0.6 + i * 0.3, wet: 0.5 }));
    k.tone({ f: 3200, to: 900, at: 0.35, dur: 0.18, gain: 0.18, pan: 0.6, wet: 0.4 });
    k.tone({ f: 2800, to: 700, at: 0.6, dur: 0.2, gain: 0.14, pan: -0.7, wet: 0.6 });
    k.hiss({ f: 9000, dur: 0.8, gain: 0.25, type: "highpass", attack: 0.15, wet: 0.6 });
  },
  // Salva de Mísseis: três tubos disparam, os foguetes assobiam pela mesa e explodem no chão com fogo estalando
  "Deadman Danny": (k) => {
    for (let i = 0; i < 3; i++) {
      const a = i * 0.13;
      k.thud(a, 0.35, 180, { pan: -0.4 });
      k.hiss({ f: 800, to: 3500, at: a, dur: 0.35, gain: 0.7, q: 2, pan: -0.4, panTo: 0.1 + i * 0.3, attack: 0.25 });
      k.tone({ f: 1200, to: 2200, at: a, dur: 0.35, gain: 0.05, pan: -0.4, panTo: 0.1 + i * 0.3 });
      boom(k, 0.4 + a, 0.9, { pan: 0.1 + i * 0.3 });
    }
    for (let i = 0; i < 10; i++) k.click(rnd(0.6, 1.3), 0.35, rnd(2500, 5000), { pan: rnd(-0.3, 0.8) });
  },
  // Faro de Sangue: o coração da presa bate, o Drifter fareja, a tensão cresce e ele salta rosnando
  "Drifter": (k) => {
    [0, 0.45].forEach((a) => { k.thud(a, 0.9, 60); k.thud(a + 0.13, 0.6, 55); });
    k.hiss({ f: 1500, to: 3000, at: 0.2, dur: 0.35, gain: 0.5, q: 1.5, attack: 0.3, trem: [14, 0.6] });
    k.tone({ f: 110, at: 0.1, dur: 1, gain: 0.14, type: "sawtooth", lp: 600, attack: 0.5, hold: 0.2 });
    k.tone({ f: 155.6, at: 0.1, dur: 1, gain: 0.1, type: "sawtooth", lp: 600, attack: 0.5, hold: 0.2 });
    k.tone({ f: 120, to: 85, at: 0.8, dur: 0.35, gain: 0.3, type: "sawtooth", lp: 1500, drive: 4, trem: [35, 0.7] });
    blade(k, 0.85, 0.9, { pan: 0.3 });
  },
  // Singularidade: o grave cresce, o ar é sugado dos dois lados para o centro e tudo implode
  "Dynamo": (k) => {
    k.tone({ f: 55, dur: 1.2, gain: 0.4, attack: 0.3 });
    k.hiss({ f: 6000, to: 150, dur: 1, gain: 1.1, q: 2.5, attack: 0.85, pan: -0.8, panTo: 0 });
    k.hiss({ f: 5000, to: 180, at: 0.05, dur: 0.95, gain: 1, q: 2.5, attack: 0.8, pan: 0.8, panTo: 0 });
    k.tone({ f: 800, to: 60, dur: 1, gain: 0.18, fm: [1.5, 3, 0.2], attack: 0.6, wet: 0.6 });
    k.thud(1, 1.6, 60, { wet: 0.6 });
    k.bell(1, GLASS(220), 0.5, { wet: 0.8 });
  },
  // Lápide Emprestada: a lápide arrasta na pedra e cai, a terra se mexe e um carniçal geme de cada lado
  "Graves": (k) => {
    k.hiss({ f: 350, dur: 0.5, gain: 1.2, brown: true, type: "lowpass", trem: [18, 0.7] });
    k.thud(0.5, 1.1, 75, { wet: 0.4 });
    for (let i = 0; i < 8; i++) k.hiss({ f: 700, at: 0.6 + rnd(0, 0.3), dur: 0.06, gain: 0.6, brown: true, type: "lowpass", pan: rnd(-0.6, 0.6) });
    k.tone({ f: 180, path: [[0, 180], [0.3, 220], [0.8, 150]], at: 0.7, dur: 0.9, gain: 0.2, type: "sawtooth", lp: 700, vib: [5, 6], attack: 0.25, pan: -0.6, wet: 0.5 });
    k.tone({ f: 160, path: [[0, 160], [0.3, 200], [0.8, 135]], at: 0.85, dur: 0.9, gain: 0.2, type: "sawtooth", lp: 700, vib: [4, 6], attack: 0.25, pan: 0.6, wet: 0.5 });
  },
  // Coruja Guiada: dois pios, as asas batem, o mergulho assobia atravessando a mesa e a coruja acerta
  "Grey Talon": (k) => {
    [[0, 0.2], [0.28, 0.32]].forEach(([a, d]) => {
      k.tone({ f: 390, path: [[0, 370], [0.05, 410], [d, 350]], at: a, dur: d, gain: 0.35, attack: 0.04, lp: 1200, wet: 0.5 });
      k.hiss({ f: 400, at: a, dur: d, gain: 0.25, q: 3, attack: 0.04 });
    });
    [0.65, 0.77, 0.89].forEach((a) => k.hiss({ f: 500, at: a, dur: 0.12, gain: 0.9, brown: true, type: "lowpass", attack: 0.03 }));
    k.tone({ f: 2600, to: 900, at: 0.9, dur: 0.35, gain: 0.14, pan: -0.7, panTo: 0.5 });
    whoosh(k, 0.9, 0.35, 0.8, 800, 4000, { pan: -0.7, panTo: 0.5 });
    k.thud(1.25, 1, 130, { pan: 0.5 });
    k.hiss({ f: 2500, at: 1.25, dur: 0.1, gain: 0.6, q: 0.8, pan: 0.5 });
  },
  // Adaga do Sono: a adaga voa girando, crava, e uma canção de ninar desce num sopro sonolento
  "Haze": (k) => {
    k.hiss({ f: 2500, to: 4500, dur: 0.25, gain: 0.8, q: 2, trem: [28, 0.8], pan: -0.6, panTo: 0.3 });
    k.click(0.25, 1, 1800, { pan: 0.3 });
    k.thud(0.25, 0.5, 220, { pan: 0.3 });
    [988, 784, 659, 587, 494].forEach((f, i) => k.bell(0.4 + i * 0.15, GLASS(f), 0.4, { wet: 0.7, pan: Math.sin(i * 1.7) * 0.4 }));
    k.hiss({ f: 3000, at: 0.5, dur: 0.9, gain: 0.25, attack: 0.45, q: 0.6, wet: 0.5 });
  },
  // Plataforma de Salto: o laço gira acelerando, voa, prende com a corda esticando, as esporas tilintam e o pad lança as duas
  "Holliday": (k) => {
    [0, 0.2, 0.35].forEach((a, i) => k.hiss({ f: 600, to: 1900, at: a, dur: 0.2 - i * 0.04, gain: 0.75, q: 1.6, attack: 0.1, pan: i % 2 ? 0.6 : -0.6, panTo: i % 2 ? -0.6 : 0.6 }));
    k.hiss({ f: 1500, to: 5000, at: 0.48, dur: 0.18, gain: 0.8, q: 3, pan: -0.2, panTo: 0.7 });
    k.pluck({ f: 98, at: 0.66, dur: 0.7, gain: 0.7, bright: 0.3, pan: 0.7 });
    k.click(0.66, 0.9, 1200, { pan: 0.7 });
    k.tone({ f: 180, to: 140, at: 0.72, dur: 0.25, gain: 0.1, type: "sawtooth", lp: 1500, vib: [40, 30], pan: 0.6 });
    for (let i = 0; i < 6; i++) k.bell(0.82 + i * 0.04, [[rnd(4000, 5000), 0.1, 0.25], [rnd(6500, 7200), 0.05, 0.18]], 1, { pan: 0.3 });
    k.tone({ f: 150, to: 620, at: 1, dur: 0.42, gain: 0.35, type: "triangle", vib: [18, 80] });
    whoosh(k, 1.05, 0.3, 0.6, 400, 2500);
  },
  // Pós-combustão: o "fuoomp" da ignição, a chama ronca, estala e chia na carta
  "Infernus": (k) => {
    k.thud(0, 0.6, 90);
    k.hiss({ f: 200, to: 1800, dur: 0.25, gain: 1.6, brown: true, type: "lowpass", attack: 0.03, wet: 0.3 });
    k.hiss({ f: 900, dur: 0.9, gain: 0.7, q: 0.5, attack: 0.1, trem: [11, 0.35], pan: -0.3, panTo: 0.3 });
    for (let i = 0; i < 14; i++) k.click(rnd(0.1, 1), 0.4, rnd(2500, 5500), { pan: rnd(-0.6, 0.6) });
    k.hiss({ f: 7000, at: 0.2, dur: 0.8, gain: 0.25, type: "highpass", attack: 0.2 });
  },
  // Pacto do Vigia: a gárgula de pedra resmunga, um fio mágico sai de cada lado e os dois se ligam num sino
  "Ivy": (k) => {
    k.hiss({ f: 300, dur: 0.3, gain: 1, brown: true, type: "lowpass", trem: [24, 0.6] });
    k.tone({ f: 90, dur: 0.35, gain: 0.2, type: "sawtooth", lp: 400, trem: [20, 0.6] });
    k.tone({ f: 440, to: 660, at: 0.25, dur: 0.6, gain: 0.15, pan: -0.8, panTo: 0, fm: [2, 0.5], wet: 0.5, attack: 0.2 });
    k.tone({ f: 660, to: 990, at: 0.25, dur: 0.6, gain: 0.13, pan: 0.8, panTo: 0, fm: [2, 0.5], wet: 0.5, attack: 0.2 });
    k.bell(0.85, GLASS(1320), 0.7, { wet: 0.6 });
    k.bell(0.85, GLASS(1980), 0.4, { wet: 0.6 });
  },
  // Abrigo Congelado: o vento gelado sopra, cristais estalam, a cúpula fecha com um sino grave e a cura soa
  "Kelvin": (k) => {
    k.hiss({ f: 800, to: 2500, dur: 0.9, gain: 0.5, q: 4, attack: 0.3, pan: -0.5, panTo: 0.5 });
    for (let i = 0; i < 10; i++) k.bell(i * 0.04, [[rnd(3000, 7000), 0.08, 0.35]], 1, { pan: rnd(-0.7, 0.7), wet: 0.4 });
    for (let i = 0; i < 6; i++) k.click(rnd(0, 0.4), 0.4, 6000, { pan: rnd(-0.5, 0.5) });
    k.bell(0.5, GLASS(523), 1.1, { wet: 0.7 });
    k.tone({ f: 261.6, at: 0.5, dur: 1, gain: 0.15, attack: 0.05 });
    [784, 988, 1175].forEach((f, i) => k.bell(0.75 + i * 0.08, GLASS(f), 0.4, { wet: 0.6 }));
  },
  // Troca de Almas: um sussurro fantasma, as duas almas se cruzam no estéreo e um acorde diminuto fica no ar
  "Lady Geist": (k) => {
    k.hiss({ f: 2500, dur: 0.6, gain: 0.4, q: 5, trem: [7, 0.7], attack: 0.2, wet: 0.5 });
    k.tone({ f: 300, to: 900, at: 0.1, dur: 0.8, gain: 0.22, vib: [6, 20], attack: 0.2, pan: -0.8, panTo: 0.8, wet: 0.6 });
    k.tone({ f: 900, to: 300, at: 0.1, dur: 0.8, gain: 0.22, vib: [7, 20], attack: 0.2, pan: 0.8, panTo: -0.8, wet: 0.6 });
    [220, 261.6, 311.1].forEach((f) => k.tone({ f, at: 0.7, dur: 0.7, gain: 0.08, type: "triangle", attack: 0.05, wet: 0.7 }));
  },
  // Queda Mortal: o chicote estala, as vítimas sobem, caem assobiando e o chão treme
  "Lash": (k) => {
    k.tone({ f: 2200, to: 600, dur: 0.08, gain: 0.1 });
    k.hiss({ f: 4000, at: 0.07, dur: 0.03, gain: 1.8, type: "highpass", attack: 0.001 });
    k.click(0.07, 1, 3000);
    whoosh(k, 0.1, 0.35, 0.6, 300, 1500);
    k.hiss({ f: 2000, to: 300, at: 0.45, dur: 0.25, gain: 0.7, q: 1.2, attack: 0.05 });
    boom(k, 0.7, 1.2, { wet: 0.5 });
    debris(k, 0.75, 12, 0.5, 0.4);
  },
  // Mini Torreta: a chave de catraca aperta, a peça monta, o servo gira, bipa e dispara uma rajada com cápsulas caindo
  "McGinnis": (k) => {
    ratchet(k, 0, 6, 0.7);
    clang(k, 0.26, 900, 0.8);
    k.tone({ f: 150, to: 700, at: 0.3, dur: 0.3, gain: 0.1, type: "square", lp: 1800 });
    k.tone({ f: 1760, at: 0.6, dur: 0.06, gain: 0.12 });
    for (let i = 0; i < 6; i++) {
      k.hiss({ f: 1500, at: 0.7 + i * 0.07, dur: 0.05, gain: 1, q: 0.7, attack: 0.001, pan: 0.4 });
      k.thud(0.7 + i * 0.07, 0.3, 160, { pan: 0.4 });
      k.bell(0.78 + i * 0.07, [[rnd(5000, 7000), 0.05, 0.12]], 1, { pan: -0.3 });
    }
  },
  // Mordidas de Amor: asas de morcego, a mordida, o gole demorado e um brilho doce
  "Mina": (k) => {
    for (let i = 0; i < 8; i++) k.hiss({ f: 1200, at: i * 0.035, dur: 0.03, gain: 0.5, q: 1.5, pan: -0.5 + i * 0.1 });
    k.hiss({ f: 2500, at: 0.3, dur: 0.04, gain: 1.2, q: 1 });
    k.click(0.3, 1, 1500);
    k.thud(0.3, 0.4, 250);
    k.hiss({ f: 600, to: 1100, at: 0.38, dur: 0.35, gain: 0.8, q: 8, trem: [12, 0.6] });
    k.tone({ f: 300, to: 150, at: 0.75, dur: 0.1, gain: 0.25 });
    k.bell(0.85, GLASS(1568), 0.4, { wet: 0.6 });
  },
  // Viajante: a areia rodopia, uma escala do deserto sobe na corda e a carta some num brilho
  "Mirage": (k) => {
    for (let i = 0; i < 4; i++) k.hiss({ f: 1800 + i * 400, at: i * 0.18, dur: 0.3, gain: 0.6, q: 1.2, attack: 0.15, pan: i % 2 ? 0.6 : -0.6, panTo: i % 2 ? -0.6 : 0.6 });
    [330, 349, 415, 440, 494, 523].forEach((f, i) => k.pluck({ f, at: 0.1 + i * 0.08, dur: 0.6, gain: 0.35, bright: 0.85, pan: -0.5 + i * 0.2, wet: 0.4 }));
    k.tone({ f: 400, to: 2000, at: 0.6, dur: 0.35, gain: 0.12, fm: [1.5, 1], wet: 0.6 });
    k.hiss({ f: 900, to: 200, at: 0.85, dur: 0.3, gain: 0.9, brown: true, type: "lowpass" });
  },
  // Entocar: o Krill guincha, as pazadas cavam de um lado e do outro e a terra fecha por cima
  "Mo & Krill": (k) => {
    for (let i = 0; i < 4; i++) { const f = rnd(900, 1400); k.tone({ f, to: f * 1.4, at: i * 0.06, dur: 0.05, gain: 0.12, type: "triangle" }); }
    for (let i = 0; i < 5; i++) { const a = 0.25 + i * 0.11; k.hiss({ f: 500, at: a, dur: 0.1, gain: 1.1, brown: true, type: "lowpass", pan: i % 2 ? 0.4 : -0.4 }); k.click(a, 0.4, 900); }
    k.hiss({ f: 200, at: 0.8, dur: 0.6, gain: 1, brown: true, type: "lowpass", attack: 0.05 });
    k.thud(0.85, 0.8, 60);
  },
  // Terapia de Sanguessuga: as sanguessugas grudam molhadas na inimiga, chupam e o monitor do hospital bipa no aliado
  "Nurse Harrow": (k) => {
    [0, 0.2].forEach((a) => { k.hiss({ f: 900, to: 250, at: a, dur: 0.22, gain: 0.9, q: 7, pan: 0.5 }); k.tone({ f: 200, to: 80, at: a, dur: 0.15, gain: 0.2, pan: 0.5 }); });
    k.hiss({ f: 400, to: 1200, at: 0.45, dur: 0.3, gain: 0.6, q: 6, trem: [16, 0.5], pan: 0.5, panTo: -0.5 });
    k.tone({ f: 988, at: 0.78, dur: 0.08, gain: 0.15, pan: -0.5, wet: 0.3 });
    k.tone({ f: 1319, at: 0.95, dur: 0.18, gain: 0.15, pan: -0.5, wet: 0.3, hold: 0.08 });
  },
  // Carga dos Cavaleiros: a corneta toca o ataque e o galope atravessa a mesa com armaduras batendo
  "Paige": (k) => {
    [[392, 0, 0.12], [523, 0.13, 0.12], [659, 0.26, 0.12], [784, 0.39, 0.4]].forEach(([f, a, d]) => {
      k.tone({ f, at: a, dur: d, gain: 0.16, type: "sawtooth", lp: 2200, attack: 0.02, hold: d * 0.6, vib: [5, 8], wet: 0.4 });
      k.tone({ f: f / 2, at: a, dur: d, gain: 0.06, type: "square", lp: 1200, attack: 0.02, hold: d * 0.6 });
    });
    for (let b = 0; b < 4; b++) [0, 0.06, 0.12].forEach((o) => {
      const a = 0.55 + b * 0.18 + o;
      wood(k, a, 0.6, 700, { pan: -0.7 + (a - 0.55) * 2 });
      k.thud(a, 0.2, 300, { pan: -0.7 + (a - 0.55) * 2 });
    });
    chain(k, 0.65, 6, 0.5, { pan: -0.4, panTo: 0.6 });
  },
  // Troca Paradoxal: o relógio faz tique-taque, o tempo se contrai ao contrário e as duas cartas trocam num zap
  "Paradox": (k) => {
    [0, 0.18, 0.36].forEach((a, i) => k.click(a, 0.8, i % 2 ? 2200 : 3200, { pan: i % 2 ? 0.3 : -0.3, wet: 0.4 }));
    k.hiss({ f: 3000, at: 0.4, dur: 0.4, gain: 0.8, q: 0.8, attack: 0.38 });
    k.tone({ f: 1200, to: 200, at: 0.4, dur: 0.4, gain: 0.12, fm: [1.5, 4], pan: 0.8, panTo: -0.8 });
    k.tone({ f: 200, to: 1200, at: 0.4, dur: 0.4, gain: 0.12, fm: [1.5, 4], pan: -0.8, panTo: 0.8 });
    k.tone({ f: 2000, to: 100, at: 0.8, dur: 0.12, gain: 0.15, type: "square", lp: 4000 });
    k.bell(0.82, GLASS(880), 0.6, { wet: 0.6 });
  },
  // Aflição: as travas da maleta abrem, a tampa range e uma nuvem maldita e dissonante se espalha
  "Pocket": (k) => {
    k.click(0, 1, 2000, { pan: -0.2 });
    k.click(0.08, 0.9, 2400, { pan: 0.2 });
    k.bell(0.08, METAL(1800), 0.3);
    k.tone({ f: 300, to: 420, at: 0.15, dur: 0.3, gain: 0.08, type: "sawtooth", lp: 2000, vib: [45, 25] });
    [110, 116.5, 165, 174.6].forEach((f, i) => k.tone({ f, at: 0.35, dur: 1, gain: 0.12, type: "sawtooth", lp: 700, attack: 0.4, pan: i % 2 ? 0.5 : -0.5, wet: 0.5 }));
    k.hiss({ f: 400, to: 1500, at: 0.35, dur: 1, gain: 0.6, attack: 0.5, trem: [6, 0.4], wet: 0.6 });
  },
  // Enxame: ratos guincham e correm de um lado ao outro, e um rato cai na sua mão
  "Rat King": (k) => {
    for (let i = 0; i < 8; i++) { const f = rnd(2400, 3800); k.tone({ f, to: f * 1.3, at: rnd(0, 0.5), dur: 0.07, gain: 0.12, type: "triangle", pan: rnd(-0.7, 0.7) }); }
    for (let i = 0; i < 18; i++) k.click(i * 0.025, 0.35, rnd(3000, 5000), { pan: -0.8 + i * 0.09 });
    k.hiss({ f: 1500, at: 0.65, dur: 0.08, gain: 0.6, q: 1.1 });
    k.hiss({ f: 1100, at: 0.72, dur: 0.06, gain: 0.5, q: 1.1 });
  },
  // Hora da Soneca: a caixinha de música toca, alguém boceja e começa a roncar
  "Rem": (k) => {
    [1319, 1175, 988, 1175, 784].forEach((f, i) => k.bell(i * 0.16, TINE(f), 1, { wet: 0.5, pan: Math.sin(i) * 0.3 }));
    k.tone({ f: 350, path: [[0, 350], [0.25, 520], [0.7, 260]], at: 0.5, dur: 0.75, gain: 0.15, type: "sawtooth", lp: 1300, attack: 0.15, wet: 0.3 });
    k.hiss({ f: 300, at: 1.1, dur: 0.5, gain: 0.7, brown: true, type: "lowpass", attack: 0.25, trem: [30, 0.5] });
  },
  // Nuvem de Tempestade: o raio racha, o trovão rola na sala, a chuva cai e a eletricidade estala
  "Seven": (k) => {
    k.hiss({ f: 3000, dur: 0.08, gain: 1.8, type: "highpass", attack: 0.001 });
    k.thud(0.02, 1.4, 60);
    k.hiss({ f: 300, at: 0.05, dur: 1.4, gain: 1.4, brown: true, type: "lowpass", attack: 0.1, trem: [3, 0.4], wet: 0.7 });
    for (let i = 0; i < 6; i++) { const a = rnd(0.2, 0.9); k.tone({ f: rnd(80, 140), at: a, dur: 0.05, gain: 0.2, type: "square", fm: [3.7, 8], pan: rnd(-0.6, 0.6) }); k.click(a, 0.4, 5000); }
    k.hiss({ f: 5000, at: 0.2, dur: 1.2, gain: 0.25, type: "highpass", attack: 0.3 });
  },
  // Golpe Mortal: a faca sai da bainha, a Shiv salta e crava com o aço soando
  "Shiv": (k) => {
    k.hiss({ f: 6000, to: 3000, dur: 0.2, gain: 0.6, q: 5, attack: 0.1 });
    k.bell(0.05, METAL(3200), 0.6);
    whoosh(k, 0.2, 0.2, 0.7, 600, 3000, { pan: -0.5, panTo: 0.4 });
    blade(k, 0.32, 1.3, { pan: 0.4 });
  },
  // Maldição Licana: o rosnado, o uivo do lobisomem com um segundo lobo ao fundo e a lua no reverb
  "Silver": (k) => {
    k.tone({ f: 90, to: 75, dur: 0.4, gain: 0.25, type: "sawtooth", lp: 900, drive: 4, trem: [40, 0.7] });
    k.tone({ f: 300, path: [[0, 300], [0.25, 620], [0.9, 600], [1.3, 380]], at: 0.2, dur: 1.35, gain: 0.28, type: "sawtooth", lp: 1600, vib: [5.5, 10], attack: 0.15, hold: 0.6, wet: 0.6 });
    k.tone({ f: 450, path: [[0, 450], [0.25, 930], [0.9, 900], [1.3, 570]], at: 0.3, dur: 1.35, gain: 0.1, type: "triangle", vib: [5, 12], attack: 0.15, hold: 0.6, pan: 0.5, wet: 0.7 });
    k.bell(0.8, GLASS(1568), 0.3, { wet: 0.8 });
  },
  // Ilusionismo: rufar de caixa, prato e "ta-dá" com um puf de fumaça e brilho
  "Sinclair": (k) => {
    for (let i = 0; i < 14; i++) k.hiss({ f: 2500, at: i * 0.035, dur: 0.03, gain: 0.2 + i * 0.04, q: 0.8 });
    k.hiss({ f: 7000, at: 0.5, dur: 0.9, gain: 0.7, type: "highpass", attack: 0.003, wet: 0.5 });
    [392, 494, 587, 784].forEach((f) => k.tone({ f, at: 0.5, dur: 0.55, gain: 0.1, type: "sawtooth", lp: 2500, attack: 0.01, hold: 0.2, wet: 0.4 }));
    k.hiss({ f: 900, at: 0.5, dur: 0.3, gain: 1, brown: true, type: "lowpass" });
    [2093, 2637, 3136].forEach((f, i) => k.bell(0.6 + i * 0.05, GLASS(f), 0.4, { wet: 0.6, pan: -0.4 + i * 0.4 }));
  },
  // Xeque-mate: as peças de madeira batem, uma desliza e a última cai com força num acorde de vitória
  "Solomon": (k) => {
    wood(k, 0, 1, 900, { pan: -0.3 });
    wood(k, 0.18, 0.9, 800, { pan: 0.3 });
    k.hiss({ f: 900, at: 0.3, dur: 0.18, gain: 0.4, q: 1 });
    wood(k, 0.5, 1.4, 700);
    k.thud(0.5, 0.8, 120);
    [196, 247, 294, 392].forEach((f) => k.pluck({ f, at: 0.55, dur: 1.2, gain: 0.3, bright: 0.5, wet: 0.5 }));
  },
  // Portas do Hotel: a campainha da recepção, a porta range, o ar do outro lado passa e ela fecha
  "The Doorman": (k) => {
    k.bell(0, [[2093, 0.3, 1.2], [5230, 0.08, 0.6], [6280, 0.05, 0.4]], 1, { wet: 0.5 });
    k.tone({ f: 140, path: [[0, 140], [0.2, 240], [0.45, 180]], at: 0.3, dur: 0.5, gain: 0.12, type: "sawtooth", lp: 1800, vib: [38, 25] });
    whoosh(k, 0.6, 0.35, 0.6, 300, 1500, { pan: -0.4, panTo: 0.4, wet: 0.4 });
    k.thud(1, 0.7, 110);
    k.click(1, 0.6, 1500);
  },
  // Armadilha de Mola: a catraca enrola a mola, ela vibra tensa e a mandíbula de aço trava
  "Venator": (k) => {
    ratchet(k, 0, 6, 0.6);
    k.pluck({ f: 220, at: 0.25, dur: 0.5, gain: 0.4, bright: 0.95 });
    k.tone({ f: 300, to: 150, at: 0.25, dur: 0.3, gain: 0.2, type: "triangle", vib: [20, 40] });
    k.click(0.5, 1, 2500);
    clang(k, 0.52, 1100, 0.9);
  },
  // Campo de Dor: o zumbido da máquina, arcos de eletricidade pulando e o gemido do monstro
  "Victor": (k) => {
    k.tone({ f: 60, dur: 1.1, gain: 0.22, type: "sawtooth", lp: 900, attack: 0.2 });
    k.tone({ f: 120, dur: 1.1, gain: 0.1, type: "square", lp: 1500, attack: 0.2, trem: [8, 0.4] });
    for (let i = 0; i < 4; i++) { const a = 0.15 + i * 0.2; const p = rnd(-0.7, 0.7); k.tone({ f: 180, at: a, dur: 0.08, gain: 0.15, type: "sawtooth", fm: [3.3, 10], pan: p }); k.hiss({ f: 4000, at: a, dur: 0.04, gain: 0.6, type: "highpass", attack: 0.002, pan: p }); }
    k.tone({ f: 110, to: 85, at: 0.5, dur: 0.6, gain: 0.2, type: "sawtooth", lp: 600, drive: 3, vib: [5, 4], attack: 0.1 });
  },
  // Assassinar: os corvos grasnam, o ferrolho arma e o tiro de sniper ecoa pela sala
  "Vindicta": (k) => {
    [0, 0.2].forEach((a, i) => k.tone({ f: 950, path: [[0, 950], [0.05, 1050], [0.16, 700]], at: a, dur: 0.17, gain: 0.18, type: "sawtooth", lp: 2600, fm: [0.51, 0.8], wet: 0.4, pan: i ? 0.5 : -0.5 }));
    k.click(0.42, 1, 2000);
    k.click(0.49, 0.8, 1400);
    k.hiss({ f: 2500, at: 0.62, dur: 0.08, gain: 2, type: "highpass", attack: 0.001 });
    k.thud(0.62, 1.4, 100);
    k.hiss({ f: 600, at: 0.62, dur: 0.9, gain: 0.8, brown: true, type: "lowpass", wet: 0.9 });
    [[0.88, 0.5, -0.6], [1.12, 0.25, 0.6]].forEach(([a, g, p]) => k.hiss({ f: 2000, at: a, dur: 0.07, gain: g, q: 0.6, pan: p, wet: 0.8 }));
  },
  // Natureza-morta: três pinceladas, o respingo de tinta e um glissando de harpa
  "Violet": (k) => {
    for (let i = 0; i < 3; i++) k.hiss({ f: 1200, to: 2800, at: i * 0.15, dur: 0.14, gain: 0.5, q: 1.5, attack: 0.08, pan: -0.4 + i * 0.4 });
    k.hiss({ f: 700, to: 250, at: 0.5, dur: 0.18, gain: 1, q: 2 });
    k.thud(0.5, 0.4, 200);
    [523, 587, 659, 784, 880, 1047].forEach((f, i) => k.pluck({ f, at: 0.6 + i * 0.04, dur: 0.8, gain: 0.25, bright: 0.6, wet: 0.5, pan: -0.5 + i * 0.2 }));
  },
  // O Cubo: bolhas de gosma sobem, a geleia se espreme, o cubo balança e o escudo fecha
  "Viscous": (k) => {
    for (let i = 0; i < 5; i++) { const f = rnd(250, 450); k.tone({ f, to: f * 2.5, at: i * 0.07, dur: 0.07, gain: 0.25, pan: rnd(-0.5, 0.5) }); }
    k.hiss({ f: 500, to: 200, at: 0.3, dur: 0.3, gain: 0.8, q: 6, trem: [20, 0.6] });
    k.tone({ f: 180, at: 0.45, dur: 0.5, gain: 0.25, vib: [9, 40], fm: [0.5, 0.3] });
    k.bell(0.6, GLASS(660), 0.5, { wet: 0.6 });
  },
  // Olhar Petrificante: o chocalho da cobra, o sibilo, o olhar brilha e a pedra estala sobre a vítima
  "Vyper": (k) => {
    k.hiss({ f: 5000, dur: 0.4, gain: 0.6, q: 2, trem: [45, 0.9] });
    k.hiss({ f: 6500, at: 0.35, dur: 0.4, gain: 0.5, type: "highpass", attack: 0.08 });
    k.tone({ f: 700, to: 1400, at: 0.5, dur: 0.4, gain: 0.1, fm: [1.41, 2], wet: 0.6 });
    k.hiss({ f: 900, at: 0.8, dur: 0.25, gain: 1.2, brown: true, type: "lowpass" });
    debris(k, 0.8, 10, 0.6, 0.3);
    k.thud(0.8, 0.8, 140);
  },
  // Força de Vontade: o molho de chaves, a força cresce num acorde, o escudo bate e o campo fica zumbindo
  "Warden": (k) => {
    chain(k, 0.05, 5, 0.5);
    k.tone({ f: 110, to: 220, dur: 0.5, gain: 0.2, type: "sawtooth", lp: 1200, attack: 0.3, pan: -0.3 });
    k.tone({ f: 111, to: 222, dur: 0.5, gain: 0.2, type: "sawtooth", lp: 1200, attack: 0.3, pan: 0.3 });
    clang(k, 0.5, 400, 1.3);
    k.thud(0.5, 1.2, 90, { wet: 0.5 });
    k.tone({ f: 220, at: 0.5, dur: 0.8, gain: 0.12, type: "triangle", trem: [6, 0.3], fm: [2, 0.3] });
  },
  // Telecinese: as cartas embaralham num leque, um floreio e a vítima flutua num tom etéreo
  "Wraith": (k) => {
    for (let i = 0; i < 16; i++) k.hiss({ f: rnd(2800, 4300), at: i * 0.022, dur: 0.02, gain: 0.45, q: 1.2, attack: 0.002, pan: -0.5 + i * 0.06 });
    whoosh(k, 0.38, 0.15, 0.6, 1500, 6000);
    k.tone({ f: 220, to: 880, at: 0.5, dur: 0.7, gain: 0.16, vib: [7, 15], fm: [2, 0.4], attack: 0.3, wet: 0.7 });
    k.tone({ f: 330, to: 1320, at: 0.5, dur: 0.7, gain: 0.08, vib: [7, 15], attack: 0.3, wet: 0.7 });
    k.hiss({ f: 8000, at: 0.5, dur: 0.7, gain: 0.2, type: "highpass", attack: 0.3, wet: 0.6 });
  },
  // Transformação Sombria: a katana sai da bainha, a sombra cresce grave e o golpe fecha num taiko
  "Yamato": (k) => {
    k.hiss({ f: 3000, to: 7000, dur: 0.35, gain: 0.7, q: 6, attack: 0.2 });
    k.bell(0.35, METAL(3200), 1, { wet: 0.5 });
    k.tone({ f: 50, to: 110, at: 0.1, dur: 0.6, gain: 0.25, type: "sawtooth", lp: 500, drive: 3, attack: 0.4 });
    k.hiss({ f: 200, to: 600, at: 0.1, dur: 0.6, gain: 1, brown: true, type: "lowpass", attack: 0.4 });
    whoosh(k, 0.62, 0.1, 0.8, 2000, 8000, { pan: 0.5, panTo: -0.5 });
    k.thud(0.72, 1.6, 65, { wet: 0.6 });
    k.click(0.72, 0.6, 600);
  },
  // genéricas (cartas sem herói)
  self: (k) => {
    k.tone({ f: 300, to: 600, dur: 0.3, gain: 0.15, type: "triangle", fm: [2, 0.3], attack: 0.1 });
    [523, 659, 784].forEach((f, i) => k.bell(0.15 + i * 0.06, GLASS(f), 0.4, { wet: 0.5 }));
  },
  hit: (k) => { whoosh(k, 0, 0.08, 0.6, 800, 3000); k.thud(0.08, 1, 140); k.click(0.08, 0.7, 1800); },
  team: (k) => {
    k.tone({ f: 392, dur: 0.18, gain: 0.15, type: "sawtooth", lp: 1800, attack: 0.02, hold: 0.08, wet: 0.4 });
    k.tone({ f: 587, at: 0.16, dur: 0.35, gain: 0.15, type: "sawtooth", lp: 1800, attack: 0.02, hold: 0.15, wet: 0.4 });
    k.thud(0.16, 0.5, 100);
  },
  draw: (k) => { [0, 0.08].forEach((a, i) => k.hiss({ f: 1000, at: a, dur: 0.06, gain: 0.5, q: 1.1, pan: i ? 0.3 : -0.3 })); },
  aura: (k) => { [392, 494, 587].forEach((f) => k.tone({ f, dur: 0.7, gain: 0.07, type: "triangle", attack: 0.15, wet: 0.6 })); k.bell(0.1, GLASS(1175), 0.3, { wet: 0.6 }); },
};

/** Toca o som da habilidade (nada para cartas sem habilidade, canal mudo ou sem Web Audio). */
export function abilitySfx(ab: AbilityKey, volume = 1) {
  const r = RECIPES[ab];
  const k = r && kit(volume);
  if (k) r(k);
}
/** Habilidades com som próprio (para o teste conferir que nenhuma ficou de fora). */
export const HAS_SOUND = new Set(Object.keys(RECIPES));

/**
 * Facada no ar: o "fsst" rápido da lâmina, o estalo do corte e o "shiiing" do aço (ruído em filtros
 * bem estreitos, que soam como metal vibrando e descem um pouco de altura).
 */
const knife = (k: Kit, at: number, gain: number, o: Out) => {
  k.hiss({ f: 2200, to: 9000, at, dur: 0.1, gain: gain * 1.1, q: 0.9, attack: 0.08, ...o });
  k.hiss({ f: 3200, at: at + 0.085, dur: 0.035, gain: gain * 1.3, type: "highpass", attack: 0.001, ...o });
  k.hiss({ f: 5600, to: 4300, at: at + 0.08, dur: 0.45, gain: gain * 3.2, q: 28, attack: 0.002, wet: 0.35, ...o });
  k.hiss({ f: 8100, to: 7200, at: at + 0.08, dur: 0.3, gain: gain * 2.2, q: 34, attack: 0.002, wet: 0.35, ...o });
  k.tone({ f: 4400, to: 3900, at: at + 0.08, dur: 0.35, gain: gain * 0.05, ...o });
};
/** Carta eliminada: duas facadas cruzadas, no tempo dos dois traços do X. */
export function slashSfx(volume = 1) {
  const k = kit(volume);
  if (!k) return;
  knife(k, 0, 1, { pan: -0.5, panTo: 0.4 });
  knife(k, 0.22, 1.1, { pan: 0.5, panTo: -0.4 });
}

/** "Começou": um sopro que entra macio, três sinos subindo e um acorde quente que fica no ar (nada de estrondo). */
export function startSfx(volume = 1) {
  const k = kit(volume * 0.8);
  if (!k) return;
  k.hiss({ f: 500, to: 2500, dur: 0.5, gain: 0.35, q: 0.8, attack: 0.4, wet: 0.5 });
  [784, 988, 1175].forEach((f, i) => k.bell(0.35 + i * 0.11, GLASS(f), 0.45, { wet: 0.6, pan: -0.3 + i * 0.3 }));
  [392, 494, 587].forEach((f) => k.tone({ f, at: 0.35, dur: 1.4, gain: 0.06, type: "triangle", attack: 0.25, hold: 0.3, wet: 0.6 }));
  k.tone({ f: 196, at: 0.35, dur: 1.4, gain: 0.08, attack: 0.3, hold: 0.3 });
}
