import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, useData } from "../lib/data";
import { STAT_KEYS } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import type { InventoryPack, PackKind } from "../lib/packs";
import { getCardTier, type Tier } from "../lib/rarity";
import { easeOut } from "../lib/ui";
import { isMuted, playRays, playReveal, playSignature, playStat, playTear, preloadPackSounds, setMuted, type RevealLevel } from "../lib/packSounds";
import { Card } from "./Card";
import { PackFace } from "./Pack";

const S = strings({
  pt: {
    dialog: (name: string) => `Abrir ${name}`,
    hint: { closed: "Toque para rasgar", rays: "Toque para rasgar mais", stat: "Toque para revelar", reveal: "Toque em qualquer lugar para fechar", error: "Toque para fechar" },
    action: { closed: "Rasgar o pack", rays: "Rasgar mais", stat: "Revelar a carta", reveal: "Fechar", error: "Fechar" },
    kind: { alt: "Herói jogado", signature: "Herói de assinatura", special: "Carta especial" } as Record<PackKind, string>,
    signature: "Assinatura",
    test: "Pack de teste: nada foi gravado",
    soundOn: "Desligar som",
    soundOff: "Ligar som",
    exhausted: "Você já tem todas as cartas que podem sair neste pack. Ele continua fechado no seu inventário.",
    failed: "Não deu para abrir o pack agora. Ele continua no seu inventário.",
  },
  en: {
    dialog: (name: string) => `Open ${name}`,
    hint: { closed: "Tap to tear", rays: "Tap to tear more", stat: "Tap to reveal", reveal: "Tap anywhere to close", error: "Tap to close" },
    action: { closed: "Tear the pack", rays: "Tear more", stat: "Reveal the card", reveal: "Close", error: "Close" },
    kind: { alt: "Played hero", signature: "Signature hero", special: "Special card" },
    signature: "Signature",
    test: "Test pack: nothing was saved",
    soundOn: "Turn sound off",
    soundOff: "Turn sound on",
    exhausted: "You already own every card this pack can give. It stays closed in your inventory.",
    failed: "Couldn't open the pack right now. It's still in your inventory.",
  },
  es: {
    dialog: (name: string) => `Abrir ${name}`,
    hint: { closed: "Toca para rasgar", rays: "Toca para rasgar más", stat: "Toca para revelar", reveal: "Toca en cualquier lugar para cerrar", error: "Toca para cerrar" },
    action: { closed: "Rasgar el pack", rays: "Rasgar más", stat: "Revelar la carta", reveal: "Cerrar", error: "Cerrar" },
    kind: { alt: "Héroe jugado", signature: "Héroe insignia", special: "Carta especial" },
    signature: "Insignia",
    test: "Pack de prueba: no se guardó nada",
    soundOn: "Apagar sonido",
    soundOff: "Encender sonido",
    exhausted: "Ya tienes todas las cartas que puede dar este pack. Sigue cerrado en tu inventario.",
    failed: "No se pudo abrir el pack ahora. Sigue en tu inventario.",
  },
});

type Stage = "closed" | "rays" | "stat" | "reveal" | "error";

/** Quanto mais rara, mais luz, mais partículas e mais tremor. Especial usa a cor da própria borda. */
const FX: Record<RevealLevel, { rays: number; step: string; speed: string; opacity: number; burst: number; rings: number; shake: number; flash: number }> = {
  base: { rays: 430, step: "24deg", speed: "34s", opacity: 0.45, burst: 0, rings: 0, shake: 0, flash: 0.25 },
  ascendant: { rays: 580, step: "15deg", speed: "18s", opacity: 0.8, burst: 28, rings: 1, shake: 7, flash: 0.5 },
  special: { rays: 600, step: "14deg", speed: "16s", opacity: 0.85, burst: 32, rings: 2, shake: 8, flash: 0.55 },
  eternus: { rays: 720, step: "11deg", speed: "11s", opacity: 1, burst: 48, rings: 3, shake: 14, flash: 0.85 },
};
const NEUTRAL = { c: "rgb(255 239 215 / 0.32)", hi: "#ffefd7" };

const levelOf = (tier: Tier | null | undefined): RevealLevel =>
  !tier ? "base" : tier.custom ? "special" : tier.key === "eternus" ? "eternus" : tier.key === "ascendant" ? "ascendant" : "base";

// ---------- geometria do rasgo (coordenadas em % da camada do pack)
type Pt = [number, number];
const toPoly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`;
const toPath = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")}Z`;

/** Buraco irregular em volta de um retângulo: borda de papel rasgado, com pontas para dentro e para fora. */
function ragged(x: number, y: number, w: number, h: number, amp: number): Pt[] {
  const pts: Pt[] = [];
  const side = (n: number, at: (t: number) => Pt, normal: Pt) => {
    for (let i = 0; i < n; i++) {
      const [px, py] = at(i / n);
      const k = (Math.random() * 2 - 1) * amp * (i % 3 === 0 ? 1.8 : 1);
      pts.push([px + normal[0] * k, py + normal[1] * k]);
    }
  };
  const nx = Math.max(4, Math.round(w / 3));
  const ny = Math.max(4, Math.round(h / 3));
  side(nx, (t) => [x + w * t, y], [0, 1]);
  side(ny, (t) => [x + w, y + h * t], [1, 0]);
  side(nx, (t) => [x + w * (1 - t), y + h], [0, 1]);
  side(ny, (t) => [x, y + h * (1 - t)], [1, 0]);
  return pts;
}

/** Pack inteiro em tiras verticais irregulares, como um pôster arrancado. */
function strips(count: number): Pt[][] {
  const edges: Pt[][] = [];
  for (let i = 0; i <= count; i++) {
    const base = (i / count) * 100;
    edges.push(Array.from({ length: 9 }, (_, j): Pt => [i === 0 ? -2 : i === count ? 102 : base + (Math.random() * 2 - 1) * 6, -2 + (j * 104) / 8]));
  }
  return Array.from({ length: count }, (_, i) => [...edges[i], ...[...edges[i + 1]].reverse()]);
}

/** Máscara do pack: o retângulo inteiro menos os buracos (evenodd). */
const maskOf = (holes: Pt[][]): CSSProperties => {
  if (!holes.length) return {};
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill-rule="evenodd" fill="#000" d="M-5 -5H105V105H-5Z ${holes.map(toPath).join(" ")}"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { maskImage: url, WebkitMaskImage: url, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
};
const center = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

type Spark = { x: number; y: number; s: number; d: number; c: string };
type Flap = { pts: Pt[]; to: { x: number; y: number; rotate: number } };

/**
 * Abertura de pack em 3 toques, com a carta de verdade atrás do pack:
 * 1º rasgo pequeno no topo só deixa a luz da raridade escapar; 2º rasga em cima de um atributo e mostra só ele;
 * 3º arranca o pack em tiras e revela a carta inteira.
 */
export function PackOpening({ pack, onClose, onOpened }: { pack: InventoryPack; onClose: () => void; onOpened: (cardId: string) => void }) {
  const t = useT(S);
  const { players, settings } = useData();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>("closed");
  const [result, setResult] = useState<{ id: string; kind: PackKind } | null>(null);
  const [error, setError] = useState("");
  const [holes, setHoles] = useState<Pt[][]>([]);
  const [flaps, setFlaps] = useState<Flap[]>([]);
  const [shreds, setShreds] = useState<Pt[][]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [muted, setMutedState] = useState(isMuted);
  const [canClose, setCanClose] = useState(false);
  const stageButton = useRef<HTMLButtonElement>(null);
  const packLayer = useRef<HTMLDivElement>(null);
  const cardLayer = useRef<HTMLDivElement>(null);

  const card = result ? players.find((p) => p.id === result.id) : undefined;
  const tier = card ? getCardTier(card, settings.tierConfig!) : null;
  const level = levelOf(tier);
  const fx = FX[level];
  const colors = tier && level !== "base" ? { c: tier.c, hi: tier.hi } : NEUTRAL;
  const signature = result?.kind === "signature";

  useEffect(() => { stageButton.current?.focus(); preloadPackSounds(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && (stage === "closed" || stage === "error" || canClose)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, canClose, onClose]);

  /** Abre um buraco: o pedaço arrancado sai voando e o buraco fica com borda de papel. */
  const tear = (pts: Pt[], to: Flap["to"]) => {
    setHoles((h) => [...h, pts]);
    setFlaps((f) => [...f, { pts, to }]);
  };

  // 1º rasgo: pequeno, no topo, só deixa a luz sair
  const tearOpen = async () => {
    setStage("rays");
    tear(ragged(54, -4, 20, 14, 1.6), { x: 70, y: -120, rotate: 28 });
    playTear();
    try {
      const res = await api.openPack(pack.id);
      const drawn = res.cards[0];
      const p = players.find((x) => x.id === drawn.id);
      playRays(levelOf(p && getCardTier(p, settings.tierConfig!)));
      setResult(drawn);
      if (!res.test) onOpened(drawn.id);
    } catch (e) {
      setError((e as { code?: string }).code === "exhausted" ? t.exhausted : t.failed);
      setStage("error");
    }
  };

  // 2º rasgo: em cima de um atributo sorteado, mostrando só ele
  const tearStat = () => {
    const layer = packLayer.current;
    const key = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
    const cell = cardLayer.current?.querySelector(`[data-stat="${key}"]`);
    let pts = ragged(14, 60, 34, 8, 1.4);
    if (layer && cell) {
      const b = layer.getBoundingClientRect();
      const r = cell.getBoundingClientRect();
      const px = 2.2;
      const py = 1.6;
      pts = ragged(((r.left - b.left) / b.width) * 100 - px, ((r.top - b.top) / b.height) * 100 - py, (r.width / b.width) * 100 + px * 2, (r.height / b.height) * 100 + py * 2, 1.1);
    }
    setStage("stat");
    tear(pts, { x: -90, y: 60, rotate: -34 });
    playTear(true);
    if (signature) playSignature(); else playStat();
  };

  // 3º: arranca o pack em tiras e revela a carta inteira
  const reveal = () => {
    const palette = [colors.hi, colors.c, "#ffffff"];
    setSparks(Array.from({ length: fx.burst }, (_, i) => {
      const a = (i / fx.burst) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 140 + Math.random() * (level === "eternus" ? 260 : 180);
      return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, s: 3 + Math.random() * 6, d: 0.7 + Math.random() * 0.6, c: palette[i % palette.length] };
    }));
    setShreds(strips(6));
    setStage("reveal");
    playReveal(level);
    setCanClose(false);
    setTimeout(() => setCanClose(true), reduce ? 0 : 800);
  };

  const advance = () => {
    if (stage === "closed") void tearOpen();
    else if (stage === "rays" && result) tearStat();
    else if (stage === "stat") reveal();
    else if ((stage === "reveal" && canClose) || stage === "error") onClose();
  };

  const toggleSound = () => { setMuted(!muted); setMutedState(!muted); };
  const lit = (stage === "rays" || stage === "stat") && !!result;
  const raysStyle = { "--ray-c": colors.c, "--ray-step": fx.step, "--ray-speed": fx.speed, width: fx.rays, height: fx.rays } as CSSProperties;
  const mask = maskOf(holes);
  const firstHole = holes[0];
  const [lx, ly] = firstHole ? center(firstHole) : [64, 3];
  // pressentimento: carta rara faz o pack vibrar antes da revelação
  const anticipation = stage === "stat" && level !== "base"
    ? { x: level === "eternus" ? [0, -3, 3, -2, 2, 0] : [0, -1.5, 1.5, 0], transition: { duration: level === "eternus" ? 0.25 : 0.4, repeat: Infinity } }
    : { x: 0 };

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={t.dialog(pack.type.name)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 overflow-hidden bg-zinc-950/95 backdrop-blur-sm">
      {/* o palco inteiro é um botão: cada toque avança; depois de revelar, qualquer toque fecha */}
      <button ref={stageButton} type="button" onClick={advance} aria-label={t.action[stage]} className="absolute inset-0 cursor-pointer focus-visible:outline-none" />

      {stage === "reveal" && fx.flash > 0 && (
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle, ${colors.hi}, transparent 70%)` }}
          initial={{ opacity: 0 }} animate={{ opacity: [0, fx.flash, 0] }} transition={{ duration: level === "eternus" ? 1.1 : 0.7, times: [0, 0.15, 1] }} />
      )}

      <motion.div className="pointer-events-none relative flex size-full flex-col items-center justify-center gap-6 p-4"
        animate={stage === "reveal" && fx.shake ? { x: [0, -fx.shake, fx.shake, -fx.shake / 2, fx.shake / 2, 0], y: [0, fx.shake / 2, -fx.shake / 2, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}>
        <div className="relative flex h-[470px] w-full max-w-sm items-center justify-center">
          {/* luz da carta atrás de tudo, mais forte quando revela */}
          {result && stage !== "error" && (
            <motion.div aria-hidden="true" className="absolute" initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: stage === "reveal" ? fx.opacity : fx.opacity * 0.35, scale: stage === "reveal" ? 1.25 : 0.7 }} transition={{ duration: 0.6, ease: easeOut }}>
              <div className="pack-rays" style={raysStyle} />
              {level === "eternus" && <div className="absolute inset-0 pack-rays [animation-direction:reverse]" style={{ ...raysStyle, "--ray-c": colors.hi, "--ray-w": "2deg" } as CSSProperties} />}
            </motion.div>
          )}
          {stage === "reveal" && Array.from({ length: fx.rings }, (_, i) => (
            <motion.span key={i} aria-hidden="true" className="absolute size-40 rounded-full border-2" style={{ borderColor: i % 2 ? colors.c : colors.hi }}
              initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 4.5, opacity: 0 }} transition={{ duration: 1, delay: 0.1 + i * 0.16, ease: easeOut }} />
          ))}
          {stage === "reveal" && sparks.map((s, i) => (
            <motion.span key={i} aria-hidden="true" className="absolute rounded-full" style={{ width: s.s, height: s.s, background: s.c, boxShadow: `0 0 10px ${s.c}` }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.3 }} transition={{ duration: s.d, delay: 0.12, ease: easeOut }} />
          ))}

          {/* carta atrás, pack por cima do mesmo tamanho */}
          <motion.div className="relative h-[430px] w-[295px]" animate={anticipation}>
            {card && (
              <motion.div ref={cardLayer} className="absolute inset-0"
                animate={stage === "reveal" ? { filter: ["brightness(1)", `brightness(${level === "eternus" ? 6 : level === "base" ? 1.5 : 3})`, "brightness(1)"] } : { filter: "brightness(1)" }}
                transition={{ duration: level === "eternus" ? 1.3 : 0.7, times: [0, 0.25, 1] }}>
                <Card player={card} signature={signature} />
              </motion.div>
            )}

            {/* camada do pack (um pouco maior que a carta); tudo do rasgo usa as coordenadas dela */}
            <div ref={packLayer} className="absolute -inset-2">
              {/* 1º buraco: só luz, a carta não aparece por ele */}
              {firstHole && stage !== "reveal" && (
                <div aria-hidden="true" className="absolute inset-0" style={{ clipPath: toPoly(firstHole) }}>
                  <motion.div className="size-full" style={{ background: `radial-gradient(circle at ${lx}% ${ly + 4}%, #ffffff, ${colors.hi} 10%, ${colors.c} 24%, #0c0a09 45%)` }}
                    animate={{ opacity: [0.75, 1, 0.75] }} transition={{ duration: 1.4, repeat: Infinity }} />
                </div>
              )}

              {/* pack com os buracos */}
              {stage !== "reveal" && (
                <div className="absolute inset-0 drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)]" style={mask}>
                  <PackFace name={pack.type.name} art={pack.type.art} title="text-3xl" />
                </div>
              )}

              {/* borda de papel rasgado em volta de cada buraco */}
              {stage !== "reveal" && holes.length > 0 && (
                <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {holes.map((h, i) => (
                    <g key={i}>
                      <path d={toPath(h)} fill="none" stroke="rgb(0 0 0 / 0.55)" strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                      <path d={toPath(h)} fill="none" stroke="#efe4cf" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="bevel" />
                    </g>
                  ))}
                </svg>
              )}

              {/* luz escapando pelo primeiro rasgo, por cima do pack */}
              {lit && firstHole && (
                <motion.div aria-hidden="true" className="absolute mix-blend-screen" style={{ left: `${lx}%`, top: `${ly}%`, translate: "-50% -50%" }}
                  initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: fx.opacity, scale: stage === "stat" ? 1 : 0.8 }} transition={{ duration: 0.5, ease: easeOut }}>
                  <div className="pack-rays" style={{ ...raysStyle, width: fx.rays * 0.6, height: fx.rays * 0.6 }} />
                </motion.div>
              )}

              {/* pedaços arrancados voando */}
              {flaps.map((f, i) => (
                <motion.div key={i} aria-hidden="true" className="absolute inset-0" style={{ clipPath: toPoly(f.pts) }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ ...f.to, opacity: 0 }} transition={{ duration: 0.7, ease: easeOut }}>
                  <PackFace name={pack.type.name} art={pack.type.art} title="text-3xl" />
                </motion.div>
              ))}

              {/* assinatura: faixa dourada atravessando o pack no 2º rasgo */}
              {stage === "stat" && signature && (
                <motion.div aria-hidden="true" className="absolute top-[24%] left-[-12%] w-[124%] -rotate-12 bg-linear-to-r from-amber-700 via-amber-200 to-amber-700 py-2 text-center text-sm font-black tracking-[0.45em] text-amber-950 uppercase shadow-[0_0_28px_rgb(252_211_77/0.75)]"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.3, ease: easeOut }}>
                  {t.signature}
                </motion.div>
              )}

              {/* 3º: o pack sai em tiras */}
              {stage === "reveal" && shreds.map((pts, i) => {
                const dir = i < shreds.length / 2 ? -1 : 1;
                return (
                  <motion.div key={i} aria-hidden="true" className="absolute inset-0" style={{ clipPath: toPoly(pts), ...mask }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: dir * (90 + i * 25), y: 140 + (i % 3) * 70, rotate: dir * (14 + i * 6), opacity: 0 }}
                    transition={{ duration: 0.75, delay: Math.abs(i - (shreds.length - 1) / 2) * 0.04, ease: [0.4, 0, 0.6, 1] }}>
                    <PackFace name={pack.type.name} art={pack.type.art} title="text-3xl" />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>

        <div className="flex min-h-16 flex-col items-center gap-1.5 text-center">
          {stage === "reveal" && card && tier && result && (
            <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.3 }}>
              <span className="font-display text-lg font-extrabold tracking-[0.25em] uppercase" style={{ color: level === "base" ? "#ffefd7" : tier.hi }}>{level === "special" ? t.kind.special : tier.name}</span>
              {level !== "special" && <span className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.kind[result.kind]}</span>}
              {pack.test && <span className="text-[11px] text-zinc-500">{t.test}</span>}
            </motion.div>
          )}
          {stage === "error" && <p role="alert" className="max-w-sm text-sm text-red-300">{error}</p>}
          {(stage !== "reveal" || canClose) && stage !== "error" && (
            <p aria-hidden="true" className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase">{stage === "rays" && !result ? "…" : t.hint[stage]}</p>
          )}
        </div>
      </motion.div>

      <button type="button" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? t.soundOff : t.soundOn} title={muted ? t.soundOff : t.soundOn}
        className="absolute top-4 right-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-zinc-800/80 text-zinc-200 transition hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
        </svg>
      </button>
    </motion.div>
  );
}
