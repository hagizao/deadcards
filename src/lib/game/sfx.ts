// Efeitos sonoros do Cardslock Game (Kenney, CC0; ver src/assets/sfx/LICENSE.txt) e um baque sintetizado para cartas pesadas.
import { useSyncExternalStore } from "react";
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

const KEY = "cardslock-mute";
const VOLUME = 0.45;
let muted = typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
const subs = new Set<() => void>();
const cache = new Map<Sfx, HTMLAudioElement>();
let ctx: AudioContext | null = null;

/** Toca um som (sem efeito com o som desligado ou se o navegador bloquear). */
export function sfx(name: Sfx, volume = 1) {
  if (muted || typeof Audio === "undefined") return;
  let base = cache.get(name);
  if (!base) { base = new Audio(FILES[name]); base.preload = "auto"; cache.set(name, base); }
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = Math.min(1, VOLUME * volume);
  a.play().catch(() => {});
}

/** Baque grave para a carta pesada caindo na mesa. */
export function thump(strength = 1) {
  if (muted || typeof window === "undefined" || !("AudioContext" in window)) return;
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5 * VOLUME * strength, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.42);
}

export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem(KEY, v ? "1" : "0");
  subs.forEach((f) => f());
}

export function useMuted() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => muted, () => false);
}
