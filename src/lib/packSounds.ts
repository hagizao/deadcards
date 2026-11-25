/**
 * Sons da abertura de pack: arquivos CC0 do Kenney (kenney.nl, Casino Audio, Interface Sounds,
 * Impact Sounds e Music Jingles) em `public/sounds/`. Crédito não é obrigatório; a licença fica junto dos arquivos.
 * Só tocam depois de um toque (o navegador exige gesto) e respeitam o mudo salvo no aparelho.
 */

export type RevealLevel = "base" | "ascendant" | "eternus" | "special";

type Sound = "rays" | "signature" | "reveal" | "reveal-base" | "reveal-rare" | "reveal-epic" | "bell";

const MUTE_KEY = "deadcards:pack-sound-off";
const cache = new Map<Sound, HTMLAudioElement>();

export const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
};
export const setMuted = (off: boolean) => {
  try { localStorage.setItem(MUTE_KEY, off ? "1" : "0"); } catch { /* sem localStorage: só não lembra */ }
};

const ALL: Sound[] = ["rays", "signature", "reveal", "reveal-base", "reveal-rare", "reveal-epic", "bell"];

function load(name: Sound) {
  let base = cache.get(name);
  if (!base) {
    base = new Audio(`/sounds/${name}.mp3`);
    base.preload = "auto";
    cache.set(name, base);
  }
  return base;
}

/** Carrega os sons antes do primeiro toque, para não atrasar a abertura. */
export function preloadPackSounds() {
  if (typeof Audio !== "undefined" && !isMuted()) ALL.forEach(load);
}

/** Toca um som (cópia nova, para poder sobrepor) com volume e atraso em segundos. */
function play(name: Sound, volume = 1, delay = 0) {
  if (isMuted() || typeof Audio === "undefined") return;
  const a = load(name).cloneNode() as HTMLAudioElement;
  a.volume = volume;
  const go = () => { a.play().catch(() => { /* autoplay bloqueado: fica sem som */ }); };
  if (delay > 0) setTimeout(go, delay * 1000); else go();
}

/** Luz saindo do pack: mais alto quanto mais rara a carta. */
export function playRays(level: RevealLevel) {
  play("rays", level === "base" ? 0.35 : 0.7);
  if (level === "eternus") play("bell", 0.25, 0.15);
}

/** Herói de assinatura: sino dourado. */
export function playSignature() {
  play("signature", 0.6, 0.1);
}

/** Revelação: cartas abrindo + jingle. Ascendente e especial ganham jingle maior; Eternus, jingle longo e sino. */
export function playReveal(level: RevealLevel) {
  play("reveal", 0.8);
  if (level === "base") return play("reveal-base", 0.7, 0.1);
  if (level === "eternus") {
    play("reveal-epic", 0.9, 0.1);
    play("bell", 0.55, 0.12);
    return;
  }
  play("reveal-rare", 0.85, 0.1);
}

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

function noise(dur: number, freq: number, gain: number, q = 1) {
  const a = audio(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf;
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = gain;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

function tone(from: number, to: number, dur: number, gain: number, kind: OscillatorType = "sine") {
  const a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = kind;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(t + dur);
}

const SFX = {
  clack: () => { noise(0.08, 2400, 0.9, 2); tone(180, 70, 0.12, 0.5); },
  creak: () => tone(90, 140, 0.5, 0.12, "sawtooth"),
  boom: () => { tone(120, 30, 0.9, 0.9); noise(0.6, 600, 0.5, 0.5); },
  stamp: () => { tone(140, 50, 0.18, 0.8); noise(0.06, 900, 0.5, 1); },
};

/** Sons da maleta, sintetizados na hora (trava, rangido, estouro, pancada). */
export function playSfx(name: keyof typeof SFX) {
  if (isMuted() || typeof AudioContext === "undefined") return;
  try { SFX[name](); } catch { /* sem áudio: segue sem som */ }
}
