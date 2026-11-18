// Áudio do Cardslock Game: efeitos (Kenney, CC0; ver src/assets/sfx/LICENSE.txt), baque sintetizado para cartas pesadas
// música de fundo ("Midnight on Miller Street", tcarisland, CC BY 4.0) e conversa do bar (SSE Library, CC0); ver src/assets/music/LICENSE.txt.
// O copo arrastando na madeira é sintetizado. Volume e mudo de efeitos, música e conversa ficam separados e salvos no navegador.
import { useSyncExternalStore } from "react";
import walla from "../../assets/music/bar-walla.mp3";
import music from "../../assets/music/midnight-on-miller-street.mp3";
import draw from "../../assets/sfx/draw.ogg";
import endTurn from "../../assets/sfx/end-turn.ogg";
import error from "../../assets/sfx/error.ogg";
import grab from "../../assets/sfx/grab.ogg";
import land from "../../assets/sfx/land.ogg";
import loss from "../../assets/sfx/loss.ogg";
import place from "../../assets/sfx/place.ogg";
import shuffle from "../../assets/sfx/shuffle.ogg";
import slam from "../../assets/sfx/slam.ogg";
import soul from "../../assets/sfx/soul.ogg";
import target from "../../assets/sfx/target.ogg";
import win from "../../assets/sfx/win.ogg";

const FILES = { draw, endTurn, error, grab, land, loss, place, shuffle, slam, soul, target, win };
export type Sfx = keyof typeof FILES;

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
const cache = new Map<Sfx, HTMLAudioElement>();
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
  const lv = sfxLevel();
  if (!lv || typeof Audio === "undefined") return;
  let base = cache.get(name);
  if (!base) { base = new Audio(FILES[name]); base.preload = "auto"; cache.set(name, base); }
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

function noise(c: AudioContext, sec: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Começa o arrasto: o som fica pronto e só aparece quando a carta anda (ver slideSpeed). */
export function slideStart() {
  if (slide || !sfxLevel() || !hasCtx()) return;
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = noise(c, 2);
  src.loop = true;
  // fricção: ruído estreitado numa faixa grave-média, como vidro grosso raspando
  const band = c.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 380; band.Q.value = 1.2;
  const low = c.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 1800;
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
  slide.gain.gain.setTargetAtTime(k * 2.5 * SFX_BASE * sfxLevel(), t, 0.04);
  slide.band.frequency.setTargetAtTime(300 + k * 500, t, 0.05);
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
