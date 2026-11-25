import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { api, useData } from "../lib/data";
import { STAT_KEYS } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import type { InventoryPack, PackKind } from "../lib/packs";
import { getCardTier, type Tier } from "../lib/rarity";
import { easeOut } from "../lib/ui";
import { isMuted, playRays, playReveal, playSignature, playStat, playTear, preloadPackSounds, setMuted, type RevealLevel } from "../lib/packSounds";
import { Card } from "./Card";
import { PackFace } from "./Pack";
import { LAYER, center, firstTear, moreDamage, statHole, strips, toPath, type Damage, type Hole, type Pt, type Rect } from "../lib/packTear";

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

const VIEW = `0 0 ${LAYER.w} ${LAYER.h}`;
/** A camada do pack sobra 8 px em volta da carta. */
const CARD_INSET = 8;
const toPoly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(", ")})`;
const svgMask = (body: string): CSSProperties => {
  const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" preserveAspectRatio="none">${body}</svg>`)}")`;
  return { maskImage: url, WebkitMaskImage: url, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
};
/** O pack inteiro menos os buracos. */
const packMask = (holes: Hole[]) => (holes.length ? svgMask(`<path fill-rule="evenodd" d="M-20 -20H${LAYER.w + 20}V${LAYER.h + 20}H-20Z ${holes.map((h) => toPath(h.pts)).join(" ")}"/>`) : {});
/** Só os buracos. */
const holesMask = (holes: Hole[]) => svgMask(holes.map((h) => `<path d="${toPath(h.pts)}"/>`).join(""));
const isBig = (h: Hole) => {
  const xs = h.pts.map((p) => p[0]);
  const ys = h.pts.map((p) => p[1]);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) > 14;
};

/** Posição de um elemento dentro de `root`, sem contar transformações (o pack pode estar torto). */
function localRect(el: Element | null | undefined, root: HTMLElement | null, offset = 0): Rect | null {
  if (!(el instanceof HTMLElement) || !root) return null;
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? { x: x + offset, y: y + offset, w: el.offsetWidth, h: el.offsetHeight } : null;
}

const noDamage = (): Damage => ({ holes: [], fly: [], creases: [], scuffs: [] });
type Spark = { x: number; y: number; s: number; d: number; c: string };

/**
 * Abertura de pack em 3 toques, com a carta de verdade atrás do pack, que vai ficando cada vez mais judiado:
 * 1º rasgo (um de vários formatos) só deixa a luz da raridade escapar; 2º rasga em cima de um atributo, mostra só ele
 * e deixa arranhões com fiapos da carta, nunca perto do overall, do nome ou dos outros atributos; 3º arranca o pack em tiras.
 */
export function PackOpening({ pack, onClose, onOpened }: { pack: InventoryPack; onClose: () => void; onOpened: (cardId: string) => void }) {
  const t = useT(S);
  const { players, settings } = useData();
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [stage, setStage] = useState<Stage>("closed");
  const [result, setResult] = useState<{ id: string; kind: PackKind } | null>(null);
  const [error, setError] = useState("");
  const [damage, setDamage] = useState<Damage>(noDamage);
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

  const addDamage = (d: Damage) => setDamage((cur) => ({ holes: [...cur.holes, ...d.holes], fly: [...cur.fly, ...d.fly], creases: [...cur.creases, ...d.creases], scuffs: [...cur.scuffs, ...d.scuffs] }));
  /** Nome do pack, com folga: rasgo nenhum passa por cima dele. */
  const titleZone = (): Rect[] => {
    const r = localRect(packLayer.current?.querySelector("[data-pack-title]"), packLayer.current);
    return r ? [{ x: r.x - 12, y: r.y - 10, w: r.w + 24, h: r.h + 20 }] : [];
  };
  const onCard = (el: Element | null | undefined) => localRect(el, cardLayer.current, CARD_INSET);

  // 1º rasgo: só luz
  const tearOpen = async () => {
    setStage("rays");
    addDamage(firstTear(Math.random, titleZone()));
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

  // 2º rasgo: em cima de um atributo sorteado, mais arranhões e vincos
  const tearStat = () => {
    const root = cardLayer.current;
    const cells = STAT_KEYS.map((k) => onCard(root?.querySelector(`[data-stat="${k}"]`))).filter((r): r is Rect => !!r);
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const zones = [...(root?.querySelectorAll("[data-zone]") ?? [])].map(onCard).filter((r): r is Rect => !!r);
    const forbidden = [...zones, ...cells.filter((c) => c !== cell)];
    const more = moreDamage(Math.random, damage.holes[0], [...forbidden, ...(cell ? [cell] : [])], titleZone());
    addDamage({ ...more, holes: cell ? [statHole(Math.random, cell, forbidden), ...more.holes] : more.holes });
    setStage("stat");
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
    setShreds(strips(Math.random, 6));
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
  const mask = packMask(damage.holes);
  const lights = damage.holes.filter((h) => h.kind === "light");
  const first = lights[0];
  const [lx, ly] = first ? center(first.pts) : [LAYER.w * 0.7, 0];
  const lightBg = lights.map((h) => {
    const [x, y] = center(h.pts);
    return `radial-gradient(circle at ${x.toFixed(0)}px ${y.toFixed(0)}px, #ffffff 0, ${colors.hi} 14px, ${colors.c} 38px, transparent 90px)`;
  }).join(", ");
  // o pack entorta um pouco a cada rasgo; carta rara faz ele tremer antes da revelação
  const tilt = stage === "rays" ? -1.6 : stage === "stat" ? 2 : 0;
  const shiver = stage === "stat" && level !== "base" ? (level === "eternus" ? [0, -3, 3, -2, 2, 0] : [0, -1.5, 1.5, 0]) : 0;

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

          {/* carta atrás, pack por cima */}
          <motion.div className="relative h-[430px] w-[295px]" animate={{ rotate: tilt, x: shiver }}
            transition={{ rotate: { type: "spring", stiffness: 260, damping: 11 }, x: shiver ? { duration: level === "eternus" ? 0.25 : 0.4, repeat: Infinity } : { duration: 0.2 } }}>
            {card && (
              <motion.div ref={cardLayer} aria-hidden={stage !== "reveal"} className="absolute inset-0"
                animate={stage === "reveal" ? { filter: ["brightness(1)", `brightness(${level === "eternus" ? 6 : level === "base" ? 1.5 : 3})`, "brightness(1)"] } : { filter: "brightness(1)" }}
                transition={{ duration: level === "eternus" ? 1.3 : 0.7, times: [0, 0.25, 1] }}>
                <Card player={card} signature={signature} />
              </motion.div>
            )}

            {/* camada do pack: tudo do rasgo usa as coordenadas dela (LAYER, em px) */}
            <div ref={packLayer} className="absolute -inset-2">
              {stage !== "reveal" && (
                <>
                  {/* buracos de luz: a carta não aparece por eles, só o brilho dela */}
                  {lights.length > 0 && (
                    <div aria-hidden="true" className="absolute inset-0 bg-zinc-950 pack-shape" style={holesMask(lights)}>
                      <motion.div className="absolute inset-0" style={{ background: lightBg }} initial={{ opacity: 0 }}
                        animate={result ? { opacity: [0.8, 1, 0.8] } : { opacity: 0.12 }} transition={result ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }} />
                    </div>
                  )}

                  <div className="absolute inset-0 drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)]" style={mask}>
                    <PackFace name={pack.type.name} art={pack.type.art} title="text-3xl" />
                    <Wear damage={damage} />
                  </div>

                  <TornEdges holes={damage.holes} id={uid} />

                  {/* a luz vaza por cima do papel em volta dos rasgos */}
                  {lit && lights.map((h, i) => {
                    const [x, y] = center(h.pts);
                    const big = isBig(h);
                    return (
                      <motion.div key={i} aria-hidden="true" className={`absolute rounded-full mix-blend-screen ${big ? "size-44" : "size-16"}`}
                        style={{ left: x, top: Math.max(y, 6), translate: "-50% -50%", background: `radial-gradient(circle, ${colors.hi}, ${colors.c} 32%, transparent 68%)` }}
                        initial={{ opacity: 0 }} animate={{ opacity: fx.opacity * (big ? 0.6 : 0.4) }} transition={{ duration: 0.5 }} />
                    );
                  })}
                  {lit && first && (
                    <motion.div aria-hidden="true" className="absolute mix-blend-screen" style={{ left: lx, top: Math.max(ly, 6), translate: "-50% -50%" }}
                      initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: fx.opacity, scale: stage === "stat" ? 1 : 0.8 }} transition={{ duration: 0.5, ease: easeOut }}>
                      <div className="pack-rays" style={{ ...raysStyle, width: fx.rays * 0.6, height: fx.rays * 0.6 }} />
                    </motion.div>
                  )}
                </>
              )}

              {/* pedaços arrancados voando */}
              {damage.fly.map((f, i) => (
                <motion.div key={i} aria-hidden="true" className="absolute inset-0" style={{ clipPath: toPoly(f.pts) }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ ...f.to, opacity: 0 }} transition={{ duration: 0.7, ease: easeOut }}>
                  <PackFace name={pack.type.name} art={pack.type.art} title="text-3xl" />
                </motion.div>
              ))}

              {/* assinatura: faixa dourada com pontas recortadas, presa ao pack no 2º rasgo */}
              {stage === "stat" && signature && (
                <motion.div aria-hidden="true" className="absolute top-[40%] left-[-7%] w-[114%] -rotate-12 drop-shadow-[0_8px_10px_rgb(0_0_0/0.6)]"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.3, ease: easeOut }}>
                  <div className="bg-linear-to-r from-amber-700 via-amber-200 to-amber-700 py-2 text-center text-sm font-black tracking-[0.45em] text-amber-950 uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-2px_0_rgb(120_53_15/0.5)] [clip-path:polygon(0_0,100%_0,96%_50%,100%_100%,0_100%,4%_50%)]">
                    {t.signature}
                  </div>
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
                    <Wear damage={damage} />
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

/** Vincos e arranhões de superfície: o pack vai ficando judiado. */
function Wear({ damage }: { damage: Damage }) {
  if (!damage.creases.length && !damage.scuffs.length) return null;
  return (
    <svg aria-hidden="true" className="absolute inset-0 size-full pack-shape" viewBox={VIEW} preserveAspectRatio="none">
      {damage.creases.map((c, i) => {
        const d = `M${c.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}`;
        return (
          <g key={i} fill="none" strokeLinejoin="round">
            <path d={d} stroke="rgb(0 0 0 / 0.3)" strokeWidth={2.2} />
            <path d={d} transform="translate(1.2 1)" stroke="rgb(255 239 215 / 0.1)" strokeWidth={1.4} />
          </g>
        );
      })}
      {damage.scuffs.map(([a, b], i) => (
        <path key={i} d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`} stroke="rgb(255 239 215 / 0.3)" strokeWidth={0.8} strokeLinecap="round" />
      ))}
    </svg>
  );
}

const FLAP_DIR = { left: [1, 0, 0, 0], right: [0, 0, 1, 0], top: [0, 1, 0, 0], bottom: [0, 0, 0, 1] } as const;

/** Bordas do rasgo: sombra para dentro do buraco, miolo branco do papel de largura irregular e a aba dobrada. */
function TornEdges({ holes, id }: { holes: Hole[]; id: string }) {
  if (!holes.length) return null;
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full pack-shape" viewBox={VIEW} preserveAspectRatio="none">
      <defs>
        <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" /></filter>
        {holes.map((h, i) => <clipPath key={i} id={`${id}c${i}`}><path d={toPath(h.pts)} /></clipPath>)}
        {holes.map((h, i) => {
          if (!h.flap) return null;
          const [x1, y1, x2, y2] = FLAP_DIR[h.flap.side];
          return (
            <linearGradient key={i} id={`${id}f${i}`} x1={x1} y1={y1} x2={x2} y2={y2}>
              <stop offset="0" stopColor="#4a4236" />
              <stop offset="0.45" stopColor="#8d826e" />
              <stop offset="1" stopColor="#c9bea8" />
            </linearGradient>
          );
        })}
      </defs>
      {holes.map((h, i) => (
        <g key={i}>
          <path d={toPath(h.pts)} fill="none" stroke="#000" strokeOpacity={h.kind === "card" ? 0.85 : 0.55} strokeWidth={h.kind === "card" ? 9 : 6} filter={`url(#${id}b)`} clipPath={`url(#${id}c${i})`} />
          <path d={`${toPath(h.edge)} ${toPath(h.pts)}`} fillRule="evenodd" fill="#eee6d5" />
          <path d={toPath(h.edge)} fill="none" stroke="rgb(0 0 0 / 0.4)" strokeWidth={0.7} />
          {h.flap && (
            <>
              <path d={toPath(h.flap.pts)} fill="#000" opacity={0.5} transform="translate(2 4)" filter={`url(#${id}b)`} />
              <path d={toPath(h.flap.pts)} fill={`url(#${id}f${i})`} stroke="rgb(70 60 45 / 0.5)" strokeWidth={0.6} />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
