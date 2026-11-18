// Som de cada habilidade quando ela funciona na mesa, sintetizado no Web Audio (sem arquivos).
// Cada receita lembra o que o herói faz no Deadlock (deadlock.wiki): a faca da Shiv, o uivo da Silver, as correntes do Billy...
import type { AbilityKey } from "./config";
import { noise, ring, voice } from "./sfx";

type Tone = { f: number; to?: number; at?: number; dur: number; gain: number; type?: OscillatorType; attack?: number; vib?: [number, number]; lp?: number };
type Hiss = { f: number; to?: number; at?: number; dur: number; gain: number; q?: number; type?: BiquadFilterType; brown?: boolean; attack?: number; trem?: [number, number] };

/** Peças para montar os sons: tom com envelope, ruído filtrado, sino metálico e batida grave. */
function kit(strength: number) {
  const v = voice(strength);
  if (!v) return null;
  const { c, t, vol } = v;
  const env = (g: AudioParam, at: number, peak: number, attack: number, dur: number) => {
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + dur);
  };
  const lfo = (rate: number, depth: number, target: AudioParam, at: number, dur: number) => {
    const o = c.createOscillator();
    o.frequency.value = rate;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const tone = ({ f, to, at = 0, dur, gain, type = "sine", attack = 0.005, vib, lp }: Tone) => {
    const s = t + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, s);
    if (to) o.frequency.exponentialRampToValueAtTime(to, s + dur);
    if (vib) lfo(vib[0], vib[1], o.frequency, s, dur);
    const g = c.createGain();
    env(g.gain, s, gain, attack, dur);
    let node: AudioNode = o;
    if (lp) { const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp; node = o.connect(f2); }
    node.connect(g).connect(c.destination);
    o.start(s);
    o.stop(s + dur + 0.05);
  };
  const hiss = ({ f, to, at = 0, dur, gain, q = 1, type = "bandpass", brown = false, attack = 0.005, trem }: Hiss) => {
    const s = t + at;
    const src = c.createBufferSource();
    src.buffer = noise(c, dur + 0.05, brown);
    const fl = c.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, s);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, s + dur);
    const g = c.createGain();
    env(g.gain, s, gain, attack, dur);
    const mid = c.createGain();
    if (trem) { mid.gain.value = 1 - trem[1]; lfo(trem[0], trem[1], mid.gain, s, dur); }
    src.connect(fl).connect(mid).connect(g).connect(c.destination);
    src.start(s);
    src.stop(s + dur + 0.05);
  };
  const bell = (at: number, parts: readonly (readonly [number, number, number])[], gain = 1) => ring(c, t + at, parts, vol * gain);
  /** Batida grave (corpo) com o estalo do contato. */
  const thud = (at: number, gain: number, f = 120) => {
    tone({ f, to: 40, at, dur: 0.35, gain: gain * 1.2 });
    hiss({ f: 500, at, dur: 0.1, gain: gain * 0.9, brown: true, type: "lowpass", attack: 0.002 });
  };
  const click = (at: number, gain: number, f = 3500) => hiss({ f, at, dur: 0.025, gain, q: 2, attack: 0.001 });
  return { tone, hiss, bell, thud, click };
}
type Kit = NonNullable<ReturnType<typeof kit>>;

const METAL = (f: number) => [[f, 0.3, 0.6], [f * 1.51, 0.18, 0.45], [f * 2.27, 0.1, 0.3], [f * 3.1, 0.05, 0.2]] as const;
const GLASS = (f: number) => [[f, 0.25, 1.2], [f * 2.01, 0.12, 0.9], [f * 3.98, 0.05, 0.6]] as const;
/** Corrente sacudindo: elos metálicos batendo em sequência. */
const chain = (k: Kit, at: number, n: number, gain: number) => {
  for (let i = 0; i < n; i++) k.bell(at + i * 0.035 + Math.random() * 0.015, [[2600 + Math.random() * 1800, 0.12 * gain, 0.12], [5200 + Math.random() * 2000, 0.06 * gain, 0.08]]);
};
const whoosh = (k: Kit, at: number, dur: number, gain: number, from = 400, to = 2400) => k.hiss({ f: from, to, at, dur, gain, q: 1.2, attack: dur * 0.6 });

const RECIPES: Partial<Record<AbilityKey, (k: Kit) => void>> = {
  // Investida: o ombro arranca pesado e a vítima bate na parede
  "Abrams": (k) => { k.hiss({ f: 150, to: 600, dur: 0.35, gain: 1.6, brown: true, type: "lowpass", attack: 0.3 }); k.thud(0.32, 1.4, 90); k.hiss({ f: 1800, at: 0.32, dur: 0.12, gain: 0.5, q: 0.7 }); },
  // Riposta: a lâmina do esgrimista desvia com um "tlin" agudo
  "Apollo": (k) => { whoosh(k, 0, 0.12, 0.6, 2000, 7000); k.bell(0.1, METAL(2400), 1.2); k.bell(0.1, [[6100, 0.08, 0.5]]); },
  // Revoada: o bando de pombos levanta voo batendo asas e arrulha
  "Baba": (k) => {
    for (let i = 0; i < 12; i++) k.hiss({ f: 900 + Math.random() * 900, at: i * 0.045 + Math.random() * 0.02, dur: 0.05, gain: 0.5, q: 1.5, attack: 0.004 });
    k.tone({ f: 420, to: 360, at: 0.5, dur: 0.22, gain: 0.25, vib: [18, 25], lp: 900 });
    k.tone({ f: 400, to: 330, at: 0.75, dur: 0.28, gain: 0.22, vib: [18, 25], lp: 900 });
  },
  // Gancho: o braço mecânico do robô de sucata dispara, a corrente corre e trava
  "Bebop": (k) => { k.tone({ f: 90, to: 260, dur: 0.3, gain: 0.25, type: "sawtooth", lp: 900 }); chain(k, 0.05, 7, 0.8); k.bell(0.35, METAL(700), 1.2); k.thud(0.35, 0.6, 160); },
  // Gangue da Corrente: as correntes se enrolam e puxam com um tranco
  "Billy": (k) => { chain(k, 0, 10, 1); k.tone({ f: 220, to: 70, at: 0.4, dur: 0.25, gain: 0.5, type: "sawtooth", lp: 600 }); k.bell(0.42, METAL(520), 1.3); },
  // Retorno às Sombras: some numa sombra com o chiado do gato
  "Calico": (k) => { k.hiss({ f: 300, to: 120, dur: 0.6, gain: 1.2, brown: true, type: "lowpass", attack: 0.15 }); k.hiss({ f: 4500, at: 0.05, dur: 0.45, gain: 0.35, q: 0.8, attack: 0.03 }); },
  // Maravilha Radiante: a luz brilha e ricocheteia em notas que sobem
  "Celeste": (k) => { [1047, 1319, 1568, 2093].forEach((f, i) => k.bell(i * 0.07, GLASS(f), 0.8)); k.hiss({ f: 8000, dur: 0.5, gain: 0.15, type: "highpass", attack: 0.1 }); },
  // Salva de Mísseis: três foguetes saem do lançador e estouram
  "Deadman Danny": (k) => { for (let i = 0; i < 3; i++) { whoosh(k, i * 0.12, 0.25, 0.7, 600, 3000); k.thud(0.3 + i * 0.12, 0.6, 140); } },
  // Faro de Sangue: o vampiro sente o coração da presa isolada
  "Drifter": (k) => { k.thud(0, 0.9, 70); k.thud(0.2, 0.7, 65); k.tone({ f: 330, to: 220, at: 0.1, dur: 0.8, gain: 0.12, type: "triangle", vib: [5, 6] }); },
  // Singularidade: um buraco negro suga tudo para o centro
  "Dynamo": (k) => { k.tone({ f: 500, to: 45, dur: 0.9, gain: 0.5 }); k.hiss({ f: 3000, to: 200, dur: 0.9, gain: 0.9, attack: 0.7, q: 2 }); k.thud(0.85, 1, 80); },
  // Lápide Emprestada: a lápide arrasta na pedra e o carniçal geme
  "Graves": (k) => { k.hiss({ f: 400, dur: 0.4, gain: 1.1, brown: true, type: "lowpass", trem: [22, 0.6] }); k.tone({ f: 170, to: 140, at: 0.3, dur: 0.7, gain: 0.25, type: "triangle", vib: [4, 8], attack: 0.2 }); },
  // Coruja Guiada: o pio da coruja, o mergulho e o impacto
  "Grey Talon": (k) => { k.tone({ f: 380, to: 360, dur: 0.18, gain: 0.35, attack: 0.04 }); k.tone({ f: 360, to: 330, at: 0.24, dur: 0.3, gain: 0.35, attack: 0.05 }); whoosh(k, 0.45, 0.25, 0.7, 800, 4000); k.thud(0.7, 0.8, 130); },
  // Adaga do Sono: a adaga voa e uma canção de ninar desce suave
  "Haze": (k) => { whoosh(k, 0, 0.12, 0.6, 2500, 8000); k.click(0.12, 0.7, 2500); [880, 740, 660].forEach((f, i) => k.bell(0.25 + i * 0.18, GLASS(f), 0.5)); },
  // Plataforma de Salto: a mola do pad estica e lança
  "Holliday": (k) => { k.tone({ f: 180, to: 520, dur: 0.45, gain: 0.45, vib: [16, 60], type: "triangle" }); k.click(0, 0.6, 1500); },
  // Pós-combustão: a chama acende e estala
  "Infernus": (k) => {
    k.hiss({ f: 300, to: 2500, dur: 0.6, gain: 1.4, brown: true, type: "lowpass", attack: 0.12 });
    for (let i = 0; i < 8; i++) k.click(0.1 + Math.random() * 0.5, 0.35, 2500 + Math.random() * 2500);
  },
  // Pacto do Vigia: a gárgula de pedra se liga ao aliado (pedra e um laço que soa)
  "Ivy": (k) => { k.hiss({ f: 350, dur: 0.25, gain: 0.8, brown: true, type: "lowpass", trem: [30, 0.5] }); k.bell(0.15, GLASS(660), 0.6); k.bell(0.3, GLASS(990), 0.6); },
  // Abrigo Congelado: o gelo cresce em cristais e a cúpula fecha
  "Kelvin": (k) => {
    for (let i = 0; i < 6; i++) k.bell(i * 0.05, [[3000 + Math.random() * 3000, 0.08, 0.35]]);
    k.hiss({ f: 6000, dur: 0.5, gain: 0.35, type: "highpass", attack: 0.05 }); k.bell(0.3, GLASS(1400), 0.7);
  },
  // Troca de Almas: duas almas se cruzam, uma sobe e outra desce
  "Lady Geist": (k) => { k.tone({ f: 300, to: 900, dur: 0.7, gain: 0.25, vib: [7, 15], attack: 0.2 }); k.tone({ f: 900, to: 300, dur: 0.7, gain: 0.25, vib: [6, 15], attack: 0.2 }); },
  // Queda Mortal: o chicote estala, ergue e bate no chão
  "Lash": (k) => { k.hiss({ f: 5000, dur: 0.03, gain: 1.4, type: "highpass", attack: 0.001 }); whoosh(k, 0.05, 0.3, 0.6, 300, 1200); k.thud(0.4, 1.4, 100); },
  // Mini Torreta: a torreta monta com cliques, gira e dá alguns tiros
  "McGinnis": (k) => { [0, 0.06, 0.12].forEach((a) => k.click(a, 0.6, 2200)); k.tone({ f: 200, to: 600, at: 0.15, dur: 0.2, gain: 0.15, type: "square", lp: 1500 }); [0.4, 0.48, 0.56].forEach((a) => k.hiss({ f: 1200, at: a, dur: 0.05, gain: 0.8, q: 0.7, attack: 0.001 })); },
  // Mordidas de Amor: a mordida da vampira e o gole
  "Mina": (k) => { k.hiss({ f: 1800, dur: 0.06, gain: 0.9, q: 1, attack: 0.002 }); k.hiss({ f: 500, to: 250, at: 0.08, dur: 0.3, gain: 0.7, q: 4, attack: 0.05 }); },
  // Viajante: a areia do djinn sopra e leva a carta
  "Mirage": (k) => { k.hiss({ f: 2500, dur: 0.8, gain: 0.6, q: 0.8, trem: [9, 0.5], attack: 0.3 }); k.tone({ f: 400, to: 1200, at: 0.2, dur: 0.6, gain: 0.12, type: "triangle", attack: 0.2 }); },
  // Entocar: cava a terra em pazadas
  "Mo & Krill": (k) => { for (let i = 0; i < 4; i++) k.hiss({ f: 450, at: i * 0.13, dur: 0.12, gain: 1.1, brown: true, type: "lowpass", attack: 0.01 }); k.thud(0.55, 0.6, 90); },
  // Terapia de Sanguessuga: as sanguessugas grudam com um som molhado
  "Nurse Harrow": (k) => { k.hiss({ f: 700, to: 300, dur: 0.25, gain: 0.8, q: 6, attack: 0.02 }); k.hiss({ f: 900, to: 400, at: 0.2, dur: 0.25, gain: 0.6, q: 6, attack: 0.02 }); },
  // Carga dos Cavaleiros: o galope espectral e uma fanfarra
  "Paige": (k) => { [0, 0.09, 0.22, 0.31].forEach((a) => k.click(a, 0.8, 900)); k.tone({ f: 392, at: 0.35, dur: 0.2, gain: 0.18, type: "sawtooth", lp: 1600 }); k.tone({ f: 523, at: 0.55, dur: 0.4, gain: 0.2, type: "sawtooth", lp: 1600 }); },
  // Troca Paradoxal: o relógio bate e o tempo dobra na troca
  "Paradox": (k) => { k.click(0, 0.7, 3000); k.click(0.25, 0.7, 2400); k.tone({ f: 300, to: 1500, at: 0.4, dur: 0.25, gain: 0.25 }); k.tone({ f: 1500, to: 300, at: 0.65, dur: 0.25, gain: 0.25 }); },
  // Aflição: a maleta abre e uma nuvem maldita cresce
  "Pocket": (k) => { k.click(0, 0.8, 2000); k.click(0.06, 0.6, 2600); k.tone({ f: 110, at: 0.1, dur: 0.9, gain: 0.25, type: "sawtooth", lp: 500, attack: 0.4 }); k.tone({ f: 117, at: 0.1, dur: 0.9, gain: 0.25, type: "sawtooth", lp: 500, attack: 0.4 }); },
  // Enxame: ratos guinchando e correndo
  "Rat King": (k) => { for (let i = 0; i < 5; i++) { const f = 2400 + Math.random() * 1200; k.tone({ f, to: f * 1.3, at: i * 0.09, dur: 0.07, gain: 0.12, type: "triangle" }); } k.hiss({ f: 3000, dur: 0.5, gain: 0.3, q: 0.8, trem: [25, 0.7] }); },
  // Hora da Soneca: caixinha de música de ninar
  "Rem": (k) => { [1319, 1175, 988, 784].forEach((f, i) => k.bell(i * 0.2, GLASS(f), 0.55)); },
  // Nuvem de Tempestade: trovão e estalos elétricos
  "Seven": (k) => { k.hiss({ f: 120, dur: 1.1, gain: 1.6, brown: true, type: "lowpass", attack: 0.08 }); for (let i = 0; i < 5; i++) k.tone({ f: 70 + Math.random() * 60, at: Math.random() * 0.5, dur: 0.06, gain: 0.25, type: "square" }); k.hiss({ f: 5000, dur: 0.05, gain: 0.8, type: "highpass", attack: 0.001 }); },
  // Golpe Mortal: o salto e a faca cravando
  "Shiv": (k) => { whoosh(k, 0, 0.14, 0.9, 1800, 7000); k.thud(0.15, 1.2, 150); k.bell(0.15, [[2950, 0.12, 0.45], [4410, 0.08, 0.35], [6230, 0.05, 0.25]]); },
  // Maldição Licana: o uivo do lobisomem
  "Silver": (k) => { k.tone({ f: 330, to: 620, dur: 0.5, gain: 0.3, type: "sawtooth", lp: 1400, vib: [6, 12], attack: 0.12 }); k.tone({ f: 620, to: 400, at: 0.5, dur: 0.6, gain: 0.28, type: "sawtooth", lp: 1200, vib: [6, 12] }); },
  // Ilusionismo: o truque de mágica, um "puf" e brilho
  "Sinclair": (k) => { k.hiss({ f: 800, dur: 0.25, gain: 1, type: "lowpass", brown: true, attack: 0.01 }); [1568, 2093, 2637].forEach((f, i) => k.bell(0.12 + i * 0.06, GLASS(f), 0.5)); },
  // Xeque-mate: as peças de xadrez batem no tabuleiro
  "Solomon": (k) => { k.click(0, 1, 1200); k.thud(0, 0.3, 300); k.click(0.22, 1, 1000); k.thud(0.22, 0.4, 260); k.bell(0.3, GLASS(523), 0.4); },
  // Portas do Hotel: a porta range e abre num sopro
  "The Doorman": (k) => { k.tone({ f: 140, to: 220, dur: 0.5, gain: 0.15, type: "sawtooth", lp: 1200, vib: [30, 20] }); whoosh(k, 0.35, 0.35, 0.6, 300, 1500); },
  // Armadilha de Mola: a mola arma com um estalo metálico
  "Venator": (k) => { k.click(0, 0.9, 3000); k.bell(0.02, METAL(1100), 1); k.click(0.12, 0.6, 1800); },
  // Campo de Dor: o zumbido elétrico do monstro de Frankenstein
  "Victor": (k) => { k.tone({ f: 60, dur: 0.9, gain: 0.25, type: "sawtooth", lp: 800, attack: 0.25 }); k.tone({ f: 120, dur: 0.9, gain: 0.15, type: "square", lp: 1200, attack: 0.25 }); [0.2, 0.45, 0.6].forEach((a) => k.hiss({ f: 4000, at: a, dur: 0.04, gain: 0.6, type: "highpass", attack: 0.002 })); },
  // Assassinar: o corvo grasna e o rifle dispara
  "Vindicta": (k) => { [0, 0.18].forEach((a) => k.tone({ f: 850, to: 650, at: a, dur: 0.14, gain: 0.18, type: "sawtooth", lp: 2200, vib: [40, 60] })); k.hiss({ f: 3000, at: 0.45, dur: 0.06, gain: 1.6, type: "highpass", attack: 0.001 }); k.thud(0.45, 1.2, 110); },
  // Natureza-morta: a pincelada de tinta e o respingo
  "Violet": (k) => { k.hiss({ f: 1500, to: 3000, dur: 0.3, gain: 0.5, q: 0.7, attack: 0.15 }); k.hiss({ f: 600, at: 0.3, dur: 0.15, gain: 0.8, type: "lowpass", attack: 0.005 }); },
  // O Cubo: a gosma envolve com "bloops"
  "Viscous": (k) => { k.tone({ f: 200, to: 600, dur: 0.12, gain: 0.35 }); k.tone({ f: 260, to: 700, at: 0.15, dur: 0.12, gain: 0.3 }); k.hiss({ f: 400, to: 200, at: 0.05, dur: 0.35, gain: 0.5, q: 5 }); },
  // Olhar Petrificante: o sibilo da cobra e a pedra estalando
  "Vyper": (k) => { k.hiss({ f: 5500, dur: 0.5, gain: 0.5, type: "highpass", attack: 0.05 }); k.hiss({ f: 600, at: 0.45, dur: 0.15, gain: 1.2, brown: true, type: "lowpass", attack: 0.002 }); k.click(0.45, 0.8, 1500); },
  // Força de Vontade: a barreira acende com um zumbido firme
  "Warden": (k) => { k.tone({ f: 220, to: 330, dur: 0.5, gain: 0.2, type: "triangle", attack: 0.1 }); k.tone({ f: 223, to: 333, dur: 0.5, gain: 0.2, type: "triangle", attack: 0.1 }); k.bell(0.4, METAL(400), 0.8); },
  // Telecinese: as cartas embaralham no ar e a vítima é erguida
  "Wraith": (k) => { for (let i = 0; i < 10; i++) k.hiss({ f: 2500 + Math.random() * 2000, at: i * 0.03, dur: 0.025, gain: 0.4, q: 1, attack: 0.002 }); k.tone({ f: 200, to: 800, at: 0.2, dur: 0.5, gain: 0.2, vib: [8, 20], attack: 0.2 }); },
  // Transformação Sombria: a katana sai da bainha num rastro sombrio
  "Yamato": (k) => { k.hiss({ f: 200, to: 80, dur: 0.6, gain: 1, brown: true, type: "lowpass", attack: 0.2 }); whoosh(k, 0.1, 0.2, 0.6, 2000, 7000); k.bell(0.3, METAL(3200), 1); },
  // genéricas (cartas sem herói)
  self: (k) => { [523, 659, 784].forEach((f, i) => k.bell(i * 0.06, GLASS(f), 0.4)); },
  hit: (k) => { k.thud(0, 0.9, 140); },
  team: (k) => { k.tone({ f: 392, dur: 0.18, gain: 0.15, type: "sawtooth", lp: 1500 }); k.tone({ f: 587, at: 0.16, dur: 0.3, gain: 0.15, type: "sawtooth", lp: 1500 }); },
  draw: (k) => { [0, 0.08].forEach((a) => k.hiss({ f: 1000, at: a, dur: 0.06, gain: 0.5, q: 1.1 })); },
  aura: (k) => { k.bell(0, GLASS(784), 0.4); k.bell(0.1, GLASS(1175), 0.3); },
};

/** Toca o som da habilidade (nada para cartas sem habilidade, canal mudo ou sem Web Audio). */
export function abilitySfx(ab: AbilityKey, volume = 1) {
  const r = RECIPES[ab];
  const k = r && kit(volume);
  if (k) r(k);
}
/** Habilidades com som próprio (para o teste conferir que nenhuma ficou de fora). */
export const HAS_SOUND = new Set(Object.keys(RECIPES));
