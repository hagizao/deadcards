/**
 * Sons da abertura de pack: arquivos CC0 do Kenney (kenney.nl, Casino Audio, Interface Sounds,
 * Impact Sounds e Music Jingles) em `public/sounds/`. Crédito não é obrigatório; a licença fica junto dos arquivos.
 * Só tocam depois de um toque (o navegador exige gesto) e respeitam o mudo salvo no aparelho.
 */

export type RevealLevel = "base" | "ascendant" | "eternus" | "special";

type Sound = "tear" | "tear-big" | "rays" | "stat" | "signature" | "reveal" | "reveal-base" | "reveal-rare" | "reveal-epic" | "bell";

const MUTE_KEY = "deadcards:pack-sound-off";
const cache = new Map<Sound, HTMLAudioElement>();

export const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
};
export const setMuted = (off: boolean) => {
  try { localStorage.setItem(MUTE_KEY, off ? "1" : "0"); } catch { /* sem localStorage: só não lembra */ }
};

const ALL: Sound[] = ["tear", "tear-big", "rays", "stat", "signature", "reveal", "reveal-base", "reveal-rare", "reveal-epic", "bell"];

function load(name: Sound) {
  let base = cache.get(name);
  if (!base) {
    base = new Audio(`/sounds/${name}.mp3`);
    base.preload = "auto";
    cache.set(name, base);
  }
  return base;
}

/** Carrega os sons antes do primeiro toque, para não atrasar o rasgo. */
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

/** Papel rasgando. `big` é o segundo rasgo, maior. */
export function playTear(big = false) {
  play(big ? "tear-big" : "tear", big ? 1 : 0.9);
}

/** Luz saindo do pack: mais alto quanto mais rara a carta. */
export function playRays(level: RevealLevel) {
  play("rays", level === "base" ? 0.35 : 0.7);
  if (level === "eternus") play("bell", 0.25, 0.15);
}

/** Atributo aparecendo. */
export function playStat() {
  play("stat", 0.8, 0.12);
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
