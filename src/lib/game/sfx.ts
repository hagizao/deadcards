// Áudio do Cardslock Game: efeitos (Kenney, CC0; ver src/assets/sfx/LICENSE.txt), baque sintetizado para cartas pesadas
// e música de fundo ("Midnight on Miller Street", tcarisland, CC BY 4.0; ver src/assets/music/LICENSE.txt).
// Volume e mudo de efeitos e música ficam separados e salvos no navegador.
import { useSyncExternalStore } from "react";
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
export type AudioPrefs = { sfx: number; music: number; sfxOn: boolean; musicOn: boolean };

const KEY = "cardslock-audio";
const SFX_BASE = 0.45;
const MUSIC_BASE = 0.35;
/** Quanto a música abaixa por baixo do resultado da partida. */
const DUCK = 0.35;
const DEFAULTS: AudioPrefs = { sfx: 0.8, music: 0.6, sfxOn: true, musicOn: true };

function load(): AudioPrefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AudioPrefs> | null;
    // quem silenciou os efeitos na versão anterior continua silenciado
    const old = localStorage.getItem("cardslock-mute") === "1";
    const n = (x: unknown, d: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : d);
    return {
      sfx: n(v?.sfx, DEFAULTS.sfx), music: n(v?.music, DEFAULTS.music),
      sfxOn: typeof v?.sfxOn === "boolean" ? v.sfxOn : !old, musicOn: typeof v?.musicOn === "boolean" ? v.musicOn : true,
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
  if (!lv || typeof window === "undefined" || !("AudioContext" in window)) return;
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5 * SFX_BASE * strength * lv, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.42);
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
}
/** Para a música com um fade curto (ao sair da tela do jogo). */
export function stopMusic() {
  wanted = false;
  glide(400);
}
/** Abaixa a música por baixo de um momento importante (resultado da partida). */
export function duckMusic(on: boolean) {
  duck = on ? DUCK : 1;
  glide(500);
}

export function setAudio(patch: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...patch };
  localStorage.setItem(KEY, JSON.stringify(prefs));
  if ("music" in patch || "musicOn" in patch) glide(200);
  subs.forEach((f) => f());
}

export function useAudio() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs, () => DEFAULTS);
}
