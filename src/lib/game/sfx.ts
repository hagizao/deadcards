// Áudio do Cardslock Game: efeitos (Kenney, CC0; ver src/assets/sfx/LICENSE.txt), baque sintetizado para cartas pesadas
// música de fundo ("Midnight on Miller Street", tcarisland, CC BY 4.0) e conversa do bar (SSE Library, CC0); ver src/assets/music/LICENSE.txt.
// O arrasto e a batida das cartas na madeira são sintetizados. Volume e mudo de efeitos, música e conversa ficam separados e salvos no navegador.
import { useSyncExternalStore } from "react";
import walla from "../../assets/music/bar-walla.mp3";
import music from "../../assets/music/midnight-on-miller-street.mp3";
import draw from "../../assets/sfx/draw.ogg";
import endTurn from "../../assets/sfx/end-turn.ogg";
import error from "../../assets/sfx/error.ogg";
import grab from "../../assets/sfx/grab.ogg";
import loss from "../../assets/sfx/loss.ogg";
import shuffle from "../../assets/sfx/shuffle.ogg";
import soul from "../../assets/sfx/soul.ogg";
import win from "../../assets/sfx/win.ogg";

const FILES = { draw, endTurn, error, grab, loss, shuffle, soul, win };
/** Carta tocando a mesa: sintetizada como carta pesada batendo na madeira (força de cada uma). */
const WOOD = { place: 0.6, land: 0.75, slam: 1, target: 0.45 } as const;
export type Sfx = keyof typeof FILES | keyof typeof WOOD | "reveal" | "hover";

/** Volume e mudo de cada canal (0 a 1). */
export type AudioPrefs = { sfx: number; music: number; amb: number; sfxOn: boolean; musicOn: boolean; ambOn: boolean };

const KEY = "cardslock-audio";
const SFX_BASE = 0.45;
const MUSIC_BASE = 0.35;
const AMB_BASE = 0.5;
/** Quanto a música abaixa por baixo do resultado da partida. */
const DUCK = 0.35;
const DEFAULTS: AudioPrefs = { sfx: 0.8, music: 0.6, amb: 0.5, sfxOn: true, musicOn: true, ambOn: true };

function load(): AudioPrefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AudioPrefs> | null;
    // quem silenciou os efeitos na versão anterior continua silenciado
    const old = localStorage.getItem("cardslock-mute") === "1";
    const n = (x: unknown, d: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : d);
    return {
      sfx: n(v?.sfx, DEFAULTS.sfx), music: n(v?.music, DEFAULTS.music), amb: n(v?.amb, DEFAULTS.amb),
      sfxOn: typeof v?.sfxOn === "boolean" ? v.sfxOn : !old, musicOn: typeof v?.musicOn === "boolean" ? v.musicOn : true,
      ambOn: typeof v?.ambOn === "boolean" ? v.ambOn : true,
    };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const subs = new Set<() => void>();
const cache = new Map<keyof typeof FILES, HTMLAudioElement>();
let ctx: AudioContext | null = null;

const sfxLevel = () => (prefs.sfxOn ? prefs.sfx : 0);
const hasCtx = () => typeof window !== "undefined" && "AudioContext" in window;
/** Contexto de áudio único (criado no primeiro gesto do jogador). */
function audioCtx() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Toca um efeito (sem efeito com o canal mudo ou se o navegador bloquear). */
export function sfx(name: Sfx, volume = 1) {
  if (name in WOOD) return woodHit(WOOD[name as keyof typeof WOOD] * volume);
  if (name === "reveal") return revealSwell(volume);
  if (name === "hover") return cardFlick(volume);
  const lv = sfxLevel();
  if (!lv || typeof Audio === "undefined") return;
  const file = name as keyof typeof FILES;
  let base = cache.get(file);
  if (!base) { base = new Audio(FILES[file]); base.preload = "auto"; cache.set(file, base); }
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = Math.min(1, SFX_BASE * volume * lv);
  a.play().catch(() => {});
}

/** Baque grave para a carta pesada caindo na mesa. */
export function thump(strength = 1) {
  const lv = sfxLevel();
  if (!lv || !hasCtx()) return;
  const c = audioCtx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5 * SFX_BASE * strength * lv, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.42);
}

/* ---------- copo arrastando na madeira ---------- */
let slide: { gain: GainNode; band: BiquadFilterNode; stop: () => void } | null = null;
let slideIdle: ReturnType<typeof setTimeout> | null = null;

/** Ruído branco (estalos) ou marrom (grave, como atrito pesado). */
function noise(c: AudioContext, sec: number, brown = false) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    // marrom: integra o branco, tirando o agudo; o ganho compensa a queda de volume
    d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
  }
  return b;
}
let burst: AudioBuffer | null = null;

let lastFlick = 0;
/** Passar o mouse pelas cartas da mão: o roçar curto de uma carta grossa na outra (no máximo um a cada 60 ms). */
function cardFlick(strength = 1) {
  const lv = sfxLevel();
  if (!lv || !hasCtx()) return;
  const c = audioCtx();
  const t = c.currentTime;
  if (t - lastFlick < 0.06) return;
  lastFlick = t;
  burst ??= noise(c, 0.3);
  const src = c.createBufferSource();
  src.buffer = burst;
  const band = c.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 900 + Math.random() * 300; band.Q.value = 1.1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35 * SFX_BASE * lv * strength, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(band).connect(gain).connect(c.destination);
  src.start(t, Math.random() * 0.2);
  src.stop(t + 0.08);
}

/** Local se revelando: a névoa se abre num sopro que sobe e o tampo ressoa grave por baixo. */
function revealSwell(strength = 1) {
  const lv = sfxLevel();
  if (!lv || !hasCtx()) return;
  const c = audioCtx();
  const t = c.currentTime;
  const vol = SFX_BASE * lv * strength;
  const air = c.createBufferSource();
  air.buffer = noise(c, 1.6, true);
  const band = c.createBiquadFilter();
  band.type = "bandpass"; band.Q.value = 1.4;
  band.frequency.setValueAtTime(220, t);
  band.frequency.exponentialRampToValueAtTime(1300, t + 1.1);
  const airGain = c.createGain();
  airGain.gain.setValueAtTime(0.0001, t);
  airGain.gain.exponentialRampToValueAtTime(1.6 * vol, t + 0.55);
  airGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  air.connect(band).connect(airGain).connect(c.destination);
  air.start(t);
  air.stop(t + 1.5);
  const low = c.createOscillator();
  low.type = "sine";
  low.frequency.setValueAtTime(55, t);
  low.frequency.linearRampToValueAtTime(80, t + 1.1);
  const lowGain = c.createGain();
  lowGain.gain.setValueAtTime(0.0001, t);
  lowGain.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.6);
  lowGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  low.connect(lowGain).connect(c.destination);
  low.start(t);
  low.stop(t + 1.5);
}

/** Carta pesada batendo na mesa de madeira: baque grave do tampo, o "toc" da tábua e o estalo do contato. */
function woodHit(strength = 1) {
  const lv = sfxLevel();
  if (!lv || !hasCtx()) return;
  const c = audioCtx();
  const t = c.currentTime;
  const vol = SFX_BASE * lv * strength;
  // tampo: um grave curto que cai, mais fundo quanto mais forte a batida
  const body = c.createOscillator();
  const bodyGain = c.createGain();
  body.type = "sine";
  body.frequency.setValueAtTime(140 - 35 * strength, t);
  body.frequency.exponentialRampToValueAtTime(48, t + 0.2);
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.005);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2 + 0.12 * strength);
  body.connect(bodyGain).connect(c.destination);
  body.start(t);
  body.stop(t + 0.45);
  // tábua: ruído curto passando pelas ressonâncias da madeira
  burst ??= noise(c, 0.3);
  const knock = c.createBufferSource();
  knock.buffer = burst;
  const knockGain = c.createGain();
  knockGain.gain.setValueAtTime(0.0001, t);
  knockGain.gain.exponentialRampToValueAtTime(1.4 * vol, t + 0.003);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + 0.05 * strength);
  for (const [f, q] of [[190, 2.5], [420, 4], [760, 5]]) {
    const band = c.createBiquadFilter();
    band.type = "bandpass"; band.frequency.value = f; band.Q.value = q;
    knock.connect(band).connect(knockGain);
  }
  knockGain.connect(c.destination);
  // contato: estalo seco e baixo da borda da carta
  const tick = c.createBufferSource();
  tick.buffer = burst;
  const high = c.createBiquadFilter();
  high.type = "bandpass"; high.frequency.value = 1800; high.Q.value = 0.8;
  const tickGain = c.createGain();
  tickGain.gain.setValueAtTime(0.25 * vol, t);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  tick.connect(high).connect(tickGain).connect(c.destination);
  knock.start(t);
  tick.start(t);
  knock.stop(t + 0.3);
  tick.stop(t + 0.05);
}

/** Começa o arrasto: o som fica pronto e só aparece quando a carta anda (ver slideSpeed). */
export function slideStart() {
  if (slide || !sfxLevel() || !hasCtx()) return;
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = noise(c, 2, true);
  src.loop = true;
  // fricção: ruído marrom numa faixa grave, como uma base pesada deslizando na madeira (sem o chiado agudo)
  const band = c.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 160; band.Q.value = 0.9;
  const low = c.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 520;
  // veios da madeira: um ruído lento faz o volume tremer, como o fundo do copo pulando nas emendas
  const grain = c.createBufferSource();
  grain.buffer = noise(c, 2);
  grain.loop = true;
  const grainLow = c.createBiquadFilter();
  grainLow.type = "lowpass"; grainLow.frequency.value = 25;
  const grainAmt = c.createGain();
  grainAmt.gain.value = 3;
  const body = c.createGain();
  body.gain.value = 0.7;
  grain.connect(grainLow).connect(grainAmt).connect(body.gain);
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(band).connect(low).connect(body).connect(gain).connect(c.destination);
  src.start();
  grain.start();
  slide = { gain, band, stop: () => { src.stop(); grain.stop(); } };
}

/** Velocidade do arrasto (px/s): mais rápido, mais alto e mais agudo. Parado, some. */
export function slideSpeed(v: number) {
  if (!slide || !ctx) return;
  const k = Math.min(1, v / 1400);
  const t = ctx.currentTime;
  slide.gain.gain.setTargetAtTime(k * 3 * SFX_BASE * sfxLevel(), t, 0.05);
  slide.band.frequency.setTargetAtTime(120 + k * 140, t, 0.06);
  // sem movimento por um instante, o copo para
  if (slideIdle) clearTimeout(slideIdle);
  slideIdle = v > 0 ? setTimeout(() => slideSpeed(0), 90) : null;
}

/** Fim do arrasto: o som some rápido. */
export function slideStop() {
  if (slideIdle) { clearTimeout(slideIdle); slideIdle = null; }
  if (!slide || !ctx) return;
  const s = slide;
  slide = null;
  s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  setTimeout(s.stop, 250);
}

/* ---------- conversa do bar ---------- */
let amb: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
let ambLoading = false;
let ambOff: ReturnType<typeof setTimeout> | null = null;

const ambGoal = () => (wanted && prefs.ambOn ? AMB_BASE * prefs.amb * duck : 0);

/** Leva o volume da conversa até o alvo; sem ninguém ouvindo, desliga a fonte depois do fade. */
function ambGlide(sec = 0.6) {
  if (ambOff) { clearTimeout(ambOff); ambOff = null; }
  if (!amb || !ctx) return;
  const g = amb.gain.gain, t = ctx.currentTime, goal = ambGoal();
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(goal, t + sec);
  if (goal === 0) {
    ambOff = setTimeout(() => {
      if (ambGoal() > 0 || !amb) return;
      amb.src.stop();
      amb = null;
    }, sec * 1000 + 100);
  }
}

/** Liga a conversa em loop pelo Web Audio (sem a emenda que o <audio> deixa no loop). */
async function startAmb() {
  if (amb) return ambGlide(1.2);
  if (ambLoading || !hasCtx() || !ambGoal()) return;
  ambLoading = true;
  try {
    const c = audioCtx();
    const buf = await c.decodeAudioData(await (await fetch(walla)).arrayBuffer());
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // corta as pontas (silêncio do MP3) para o loop não ter buraco
    src.loopStart = 0.15;
    src.loopEnd = buf.duration - 0.15;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(c.destination);
    src.start(0, 0.15);
    amb = { gain, src };
  } catch {
    // sem conversa se o navegador não decodificar; o resto do áudio segue
  } finally {
    ambLoading = false;
  }
  ambGlide(1.2);
}

/* ---------- música ---------- */
let track: HTMLAudioElement | null = null;
let wanted = false;
let duck = 1;
let fade = 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

const musicGoal = () => (wanted && prefs.musicOn ? MUSIC_BASE * prefs.music * duck : 0);

/** Leva o volume da música até o alvo em ~`ms` (pausa ao chegar em 0). */
function glide(ms = 600) {
  if (!track) return;
  const a = track;
  if (fadeTimer) clearInterval(fadeTimer);
  const goal = musicGoal();
  if (goal > 0 && a.paused) a.play().catch(() => {});
  const step = Math.max(0.01, Math.abs(goal - fade) / (ms / 50));
  fadeTimer = setInterval(() => {
    fade = fade < goal ? Math.min(goal, fade + step) : Math.max(goal, fade - step);
    a.volume = Math.min(1, fade);
    if (fade === goal) {
      clearInterval(fadeTimer!);
      fadeTimer = null;
      if (goal === 0) a.pause();
    }
  }, 50);
}

/** Começa a música (precisa vir de um gesto do jogador: o navegador bloqueia som automático). */
export function startMusic() {
  if (typeof Audio === "undefined") return;
  wanted = true;
  if (!track) { track = new Audio(music); track.loop = true; track.volume = 0; fade = 0; }
  glide(1200);
  startAmb();
}
/** Para a música com um fade curto (ao sair da tela do jogo). */
export function stopMusic() {
  wanted = false;
  glide(400);
  ambGlide(0.4);
}
/** Abaixa a música por baixo de um momento importante (resultado da partida). */
export function duckMusic(on: boolean) {
  duck = on ? DUCK : 1;
  glide(500);
  ambGlide(0.5);
}

export function setAudio(patch: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...patch };
  localStorage.setItem(KEY, JSON.stringify(prefs));
  if ("music" in patch || "musicOn" in patch) glide(200);
  if ("amb" in patch || "ambOn" in patch) { if (amb) ambGlide(0.2); else if (wanted) startAmb(); }
  if (slide && !sfxLevel()) slideStop();
  subs.forEach((f) => f());
}

export function useAudio() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs, () => DEFAULTS);
}
