/// <reference types="vite/client" />
/**
 * Sons da abertura de pack: um catálogo só (`PACK_SOUNDS`), com o id, quando toca e o volume de cada som.
 *
 * Para trocar um som: salve o arquivo como `src/assets/sounds/pack/<id>.mp3` (ou .ogg/.wav). Nada mais muda:
 * o arquivo entra no build sozinho e passa na frente do som sintetizado. Sem arquivo, toca o `synth`.
 * Os sons com arquivo vieram do Hagizao; rays e bell ainda são CC0 do Kenney (kenney.nl, licença junto deles).
 *
 * Só tocam depois de um toque (o navegador exige gesto) e respeitam o mudo salvo no aparelho.
 */

export type RevealLevel = "base" | "ascendant" | "eternus" | "special";

type PlayOpts = {
  /** Atraso em segundos. */
  delay?: number;
  /** Multiplica o volume do catálogo (0–1). */
  gain?: number;
  /** Duração em segundos, para sons que acompanham uma animação (só o sintetizado usa; o arquivo toca inteiro). */
  len?: number;
  /** Toca mesmo com o mudo ligado (prévia do Editor). */
  force?: boolean;
  /** Repete o arquivo até alguém chamar `stop` (música de fundo). */
  loop?: boolean;
};
type Synth = (o: { gain: number; len: number }) => (() => void) | void;
type SoundSpec = { when: string; volume: number; synth?: Synth };

// ---------- síntese (Web Audio), usada enquanto o som não tem arquivo ----------
let ctx: AudioContext | null = null;
// enquanto renderiza um som para arquivo, a síntese vai para este contexto em vez dos alto-falantes
let offline: OfflineAudioContext | null = null;
const audio = (): BaseAudioContext => {
  if (offline) return offline;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

function noise(dur: number, freq: number, gain: number, q = 1, toFreq = freq) {
  const a = audio(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = buf;
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, t);
  if (toFreq !== freq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
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

/** Zumbido que sobe de tom e de volume durante `len` segundos; devolve como cortar antes. */
function riser(len: number, gain: number) {
  const a = audio(), t = a.currentTime, out = a.createGain(), lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(2400, t + len);
  out.gain.setValueAtTime(0.001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + len);
  out.gain.exponentialRampToValueAtTime(0.001, t + len + 0.15);
  lp.connect(out).connect(a.destination);
  const oscs = [0, 7].map((detune) => {
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.detune.value = detune;
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(280, t + len);
    o.connect(lp);
    o.start();
    o.stop(t + len + 0.2);
    return o;
  });
  return () => {
    const now = a.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.001), now);
    out.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    oscs.forEach((o) => { try { o.stop(now + 0.1); } catch { /* já parou */ } });
  };
}

/**
 * Todos os sons da abertura, na ordem em que aparecem. A chave é o id e o nome do arquivo.
 * `when` diz o momento; `volume` é o volume base (0–1).
 */
export const PACK_SOUNDS = {
  arrive: { when: "A maleta é jogada e bate na mesa (toca uma vez, no primeiro impacto)", volume: 1, synth: ({ gain }) => { tone(140, 42, 0.3, 0.9 * gain); noise(0.16, 480, 0.7 * gain, 0.8); } },
  latch: { when: "Cada trava solta (duas vezes)", volume: 1, synth: ({ gain }) => { noise(0.08, 2400, 0.9 * gain, 2); tone(180, 70, 0.12, 0.5 * gain); } },
  creak: { when: "Primeiro som quando a mala abre: a tampa abre uma fresta", volume: 1, synth: ({ gain }) => tone(90, 140, 0.5, 0.12 * gain, "sawtooth") },
  "riser-eternus": { when: "Eternus e especial: riser do começo da fresta até a revelação; o estouro (13,5 s) cai quando a carta aparece", volume: 0.9 },
  tension: { when: "Ascendant: tensão subindo durante o walkout; o pico (5,4 s) cai quando a carta aparece", volume: 1, synth: ({ gain, len }) => riser(len, 0.16 * gain) },
  pulse: { when: "Rara: a luz jorra pela fresta, contínua (~1,3 s), logo antes de trocar de cor", volume: 1, synth: ({ gain }) => { tone(55 + gain * 25, 34, 0.32, 0.75 * gain); noise(0.05, 700, 0.25 * gain, 1); } },
  rays: { when: "Rara: no último pulso a luz troca para a cor da raridade", volume: 0.7 },
  smoke: { when: "Rara: fumaça escapando pela fresta e espalhando quando a tampa abre", volume: 1, synth: ({ gain }) => noise(1.3, 1800, 0.3 * gain, 0.5, 400) },
  "lid-open": { when: "Comum: a tampa abre", volume: 1, synth: ({ gain }) => { tone(80, 120, 0.6, 0.12 * gain, "sawtooth"); noise(0.3, 900, 0.15 * gain, 0.6); } },
  "lid-boom": { when: "Rara: começa antes e estoura (0,9 s) quando a tampa pula", volume: 1, synth: ({ gain }) => { tone(120, 30, 0.9, 0.9 * gain); noise(0.6, 600, 0.5 * gain, 0.5); } },
  beat: { when: "Walkout: hit de cada pista (região, posição, time), 3 vezes", volume: 1, synth: ({ gain }) => { tone(140, 50, 0.18, 0.8 * gain); noise(0.06, 900, 0.5 * gain, 1); } },
  signature: { when: "Assinatura: a faixa dourada se estende dentro da tampa (logo depois da cor da luz)", volume: 0.6 },
  spin: { when: "A carta sobe girando", volume: 1, synth: ({ gain, len }) => noise(Math.max(0.3, len), 500, 0.35 * gain, 0.7, 3000) },
  reveal: { when: "Fora de uso: a carta comum (Initiate, Arcanist) aparece sem som", volume: 0.9 },
  "reveal-walkout": { when: "Carta com walkout (Ascendant, especial, Eternus) aparece", volume: 0.9 },
  crowd: { when: "Plateia reagindo, junto com reveal-walkout", volume: 0.6 },
  "music-ascendant": { when: "Ascendant: música de fundo em loop, da troca de cor da luz até a plateia (some em fade quando o crowd entra)", volume: 0.45 },
  bell: { when: "Eternus: sino na troca de cor e na revelação", volume: 0.5 },
  shockwave: { when: "Eternus: onda de choque na mesa; o golpe (0,35 s) cai quando a carta aparece", volume: 1, synth: ({ gain }) => { tone(80, 24, 1.4, 0.9 * gain); noise(1, 300, 0.6 * gain, 0.5, 90); } },
} satisfies Record<string, SoundSpec>;

export type PackSoundId = keyof typeof PACK_SOUNDS;

// arquivos que existem em src/assets/sounds/pack: id → URL do build
const FILES: Partial<Record<PackSoundId, string>> = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../assets/sounds/pack/*.{mp3,ogg,wav}", { eager: true, query: "?url", import: "default" }))
    .map(([path, url]) => [path.replace(/^.*\/|\.\w+$/g, ""), url]),
);

const MUTE_KEY = "deadcards:pack-sound-off";
const cache = new Map<PackSoundId, HTMLAudioElement>();

export const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
};
export const setMuted = (off: boolean) => {
  try { localStorage.setItem(MUTE_KEY, off ? "1" : "0"); } catch { /* sem localStorage: só não lembra */ }
};

function load(id: PackSoundId) {
  const url = FILES[id];
  if (!url) return null;
  let base = cache.get(id);
  if (!base) {
    base = new Audio(url);
    base.preload = "auto";
    cache.set(id, base);
  }
  return base;
}

/** Carrega os arquivos antes do primeiro toque, para não atrasar a abertura. */
export function preloadPackSounds() {
  if (typeof Audio !== "undefined" && !isMuted()) (Object.keys(PACK_SOUNDS) as PackSoundId[]).forEach(load);
}

/** Som tocando: `stop` corta; `position` diz em que segundo do arquivo está (null sem arquivo ou antes de começar). */
export type SoundHandle = { stop: (fade?: number) => void; position: () => number | null };

/** Toca um som do catálogo (arquivo se houver, senão o sintetizado). */
export function playPackSound(id: PackSoundId, { delay = 0, gain = 1, len = 1, force = false, loop = false }: PlayOpts = {}): SoundHandle {
  if (isMuted() && !force) return { stop: () => {}, position: () => null };
  const spec: SoundSpec = PACK_SOUNDS[id];
  let stop: ((fade?: number) => void) | void;
  let el: HTMLAudioElement | null = null;
  let cancelled = false;
  const go = () => {
    if (cancelled) return;
    const file = typeof Audio !== "undefined" ? load(id) : null;
    if (file) {
      const a = file.cloneNode() as HTMLAudioElement;
      a.volume = Math.min(1, spec.volume * gain);
      a.loop = loop;
      a.play().then(() => { el = a; }, () => { /* autoplay bloqueado: fica sem som */ });
      stop = (fade = 0) => {
        if (fade <= 0 || a.paused) return a.pause();
        // abaixa o volume aos poucos e só então pausa
        const from = a.volume, t0 = performance.now();
        const iv = setInterval(() => {
          const k = Math.min(1, (performance.now() - t0) / (fade * 1000));
          a.volume = from * (1 - k);
          if (k >= 1) { clearInterval(iv); a.pause(); }
        }, 30);
      };
    } else if (spec.synth && typeof AudioContext !== "undefined") {
      try { stop = spec.synth({ gain: spec.volume * gain, len }); } catch { /* sem áudio: segue sem som */ }
    }
  };
  if (delay > 0) setTimeout(go, delay * 1000); else go();
  return { stop: (fade) => { cancelled = true; stop?.(fade); }, position: () => (el && !el.paused ? el.currentTime : null) };
}

// ---------- prévia no Editor ----------
/** Duração típica dos sons que acompanham uma animação, para ouvir fora da abertura. */
const PREVIEW_LEN: Partial<Record<PackSoundId, number>> = { tension: 2.1, spin: 1.05 };

export const hasPackFile = (id: PackSoundId) => !!FILES[id];

/** Toca um som como na abertura (ignora o mudo). */
export const previewPackSound = (id: PackSoundId) => playPackSound(id, { len: PREVIEW_LEN[id] ?? 1, force: true });

/** Renderiza um som sintetizado para WAV (mono, 16 bits). Null se o som não é sintetizado. */
export async function renderPackSoundWav(id: PackSoundId, sampleRate = 44100): Promise<Blob | null> {
  const spec: SoundSpec = PACK_SOUNDS[id];
  if (!spec.synth || typeof OfflineAudioContext === "undefined") return null;
  const len = PREVIEW_LEN[id] ?? 1;
  const off = new OfflineAudioContext(1, Math.ceil(sampleRate * (len + 1.6)), sampleRate);
  offline = off;
  try { spec.synth({ gain: spec.volume, len }); } finally { offline = null; }
  const buf = await off.startRendering();
  // corta o silêncio do fim
  const data = buf.getChannelData(0);
  let end = data.length;
  while (end > 1 && Math.abs(data[end - 1]) < 1e-4) end--;
  const n = Math.min(data.length, end + Math.round(sampleRate * 0.05));
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out], { type: "audio/wav" });
}

/**
 * Em que segundo de cada arquivo está o momento forte, para cair junto com a animação.
 * Trocou um desses arquivos? Meça o pico de novo e atualize aqui.
 */
export const SOUND_PEAK = { "riser-eternus": 13.5, tension: 5.4, "lid-boom": 0.9, shockwave: 0.35 } as const;

/** Segundos depois da revelação em que a plateia (crowd) entra. */
export const CROWD_DELAY = 0.25;

/** Revelação: comum (Initiate, Arcanist) aparece em silêncio; carta com walkout ganha o som final e a plateia. */
export function playReveal(level: RevealLevel) {
  if (level === "base") return;
  playPackSound("reveal-walkout");
  playPackSound("crowd", { delay: CROWD_DELAY });
}
