import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, useData } from "../lib/data";
import { STAT_KEYS } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import type { InventoryPack, PackKind } from "../lib/packs";
import { getCardTier, type Tier } from "../lib/rarity";
import { easeOut } from "../lib/ui";
import { isMuted, playRays, playReveal, playSignature, playStat, playTear, setMuted, type RevealLevel } from "../lib/packSounds";
import { Card } from "./Card";
import { PackArt } from "./Pack";

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
  base: { rays: 430, step: "24deg", speed: "34s", opacity: 0.5, burst: 0, rings: 0, shake: 0, flash: 0.25 },
  ascendant: { rays: 580, step: "15deg", speed: "18s", opacity: 0.85, burst: 28, rings: 1, shake: 7, flash: 0.5 },
  special: { rays: 600, step: "14deg", speed: "16s", opacity: 0.9, burst: 32, rings: 2, shake: 8, flash: 0.55 },
  eternus: { rays: 720, step: "11deg", speed: "11s", opacity: 1, burst: 48, rings: 3, shake: 14, flash: 0.85 },
};
const NEUTRAL = { c: "rgb(255 239 215 / 0.32)", hi: "#ffefd7" };

const levelOf = (tier: Tier | null | undefined): RevealLevel =>
  !tier ? "base" : tier.custom ? "special" : tier.key === "eternus" ? "eternus" : tier.key === "ascendant" ? "ascendant" : "base";

// o pack rasga em três pedaços com borda serrilhada: topo, meio e o resto
const zig = (y: number, flip = false) => Array.from({ length: 13 }, (_, i) => `${((i * 100) / 12).toFixed(2)}% ${y + ((i % 2 === 0) !== flip ? -1.4 : 1.4)}%`);
const piece = (top: number | null, bottom: number | null) => {
  const upper = top === null ? ["0% 0%", "100% 0%"] : zig(top);
  const lower = bottom === null ? ["100% 100%", "0% 100%"] : zig(bottom, true).reverse();
  return `polygon(${[...upper, ...lower].join(", ")})`;
};
const TEAR_1 = 16;
const TEAR_2 = 42;
const PIECES = [piece(null, TEAR_1), piece(TEAR_1, TEAR_2), piece(TEAR_2, null)];

type Spark = { x: number; y: number; s: number; d: number; c: string };

/** Abertura de pack em 3 toques: rasga e solta a luz da raridade, rasga mais e mostra um atributo, revela a carta. */
export function PackOpening({ pack, onClose, onOpened }: { pack: InventoryPack; onClose: () => void; onOpened: (cardId: string) => void }) {
  const t = useT(S);
  const { players, settings, heroIcon } = useData();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>("closed");
  const [result, setResult] = useState<{ id: string; kind: PackKind } | null>(null);
  const [error, setError] = useState("");
  const [stat, setStat] = useState<(typeof STAT_KEYS)[number]>("MIR");
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [muted, setMutedState] = useState(isMuted);
  const [canClose, setCanClose] = useState(false);
  const stageButton = useRef<HTMLButtonElement>(null);

  const card = result ? players.find((p) => p.id === result.id) : undefined;
  const tier = card ? getCardTier(card, settings.tierConfig!) : null;
  const level = levelOf(tier);
  const fx = FX[level];
  const colors = tier && level !== "base" ? { c: tier.c, hi: tier.hi } : NEUTRAL;
  // herói de assinatura (a carta principal) tem o seu próprio momento: faixa dourada, silhueta do herói e carimbo
  const signature = result?.kind === "signature";
  const icon = card ? heroIcon(card.hero) : null;

  useEffect(() => { stageButton.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && (stage === "closed" || stage === "error" || canClose)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, canClose, onClose]);

  const tearOpen = async () => {
    setStage("rays");
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

  const tearMore = () => {
    setStat(STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)]);
    setStage("stat");
    playTear(true);
    if (signature) playSignature(); else playStat();
  };

  const reveal = () => {
    const palette = [colors.hi, colors.c, "#ffffff"];
    setSparks(Array.from({ length: fx.burst }, (_, i) => {
      const a = (i / fx.burst) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 140 + Math.random() * (level === "eternus" ? 260 : 180);
      return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, s: 3 + Math.random() * 6, d: 0.7 + Math.random() * 0.6, c: palette[i % palette.length] };
    }));
    setStage("reveal");
    playReveal(level);
    setCanClose(false);
    setTimeout(() => setCanClose(true), reduce ? 0 : 700);
  };

  const advance = () => {
    if (stage === "closed") void tearOpen();
    else if (stage === "rays" && result) tearMore();
    else if (stage === "stat") reveal();
    else if ((stage === "reveal" && canClose) || stage === "error") onClose();
  };

  const toggleSound = () => { setMuted(!muted); setMutedState(!muted); };
  const opened = stage === "rays" || stage === "stat" || stage === "reveal";
  const raysStyle = { "--ray-c": colors.c, "--ray-step": fx.step, "--ray-speed": fx.speed, width: fx.rays, height: fx.rays } as CSSProperties;
  // pressentimento: carta rara faz o pack vibrar antes da revelação
  const anticipation = stage === "stat" && level !== "base"
    ? { x: level === "eternus" ? [0, -3, 3, -2, 2, 0] : [0, -1.5, 1.5, 0], transition: { duration: level === "eternus" ? 0.25 : 0.4, repeat: Infinity } }
    : { x: 0 };

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={t.dialog(pack.type.name)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 overflow-hidden bg-zinc-950/95 backdrop-blur-sm">
      {/* o palco inteiro é um botão: cada toque avança; depois de revelar, qualquer toque fecha */}
      <button ref={stageButton} type="button" onClick={advance} aria-label={t.action[stage]}
        className="absolute inset-0 cursor-pointer focus-visible:outline-none" />

      {/* clarão da revelação */}
      {stage === "reveal" && fx.flash > 0 && (
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle, ${colors.hi}, transparent 70%)` }}
          initial={{ opacity: 0 }} animate={{ opacity: [0, fx.flash, 0] }} transition={{ duration: level === "eternus" ? 1.1 : 0.7, times: [0, 0.15, 1] }} />
      )}

      <motion.div className="pointer-events-none relative flex size-full flex-col items-center justify-center gap-6 p-4"
        animate={stage === "reveal" && fx.shake ? { x: [0, -fx.shake, fx.shake, -fx.shake / 2, fx.shake / 2, 0], y: [0, fx.shake / 2, -fx.shake / 2, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}>
        <div className="relative flex h-[470px] w-full max-w-sm items-center justify-center">
          {/* raios de luz na cor da raridade (ou da borda da carta especial) */}
          {opened && result && (
            <motion.div aria-hidden="true" className="absolute" initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: fx.opacity, scale: stage === "reveal" ? 1.25 : stage === "stat" ? 1 : 0.8 }} transition={{ duration: 0.6, ease: easeOut }}>
              <div className="pack-rays" style={raysStyle} />
              {level === "eternus" && <div className="absolute inset-0 pack-rays [animation-direction:reverse]" style={{ ...raysStyle, "--ray-c": colors.hi, "--ray-w": "2deg" } as CSSProperties} />}
              <div className="absolute inset-0 m-auto size-1/3 rounded-full blur-3xl" style={{ background: colors.hi, opacity: level === "base" ? 0.25 : 0.55 }} />
            </motion.div>
          )}

          {/* ondas de choque da revelação */}
          {stage === "reveal" && Array.from({ length: fx.rings }, (_, i) => (
            <motion.span key={i} aria-hidden="true" className="absolute size-40 rounded-full border-2" style={{ borderColor: i % 2 ? colors.c : colors.hi }}
              initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 4.5, opacity: 0 }} transition={{ duration: 1, delay: 0.1 + i * 0.16, ease: easeOut }} />
          ))}
          {stage === "reveal" && sparks.map((s, i) => (
            <motion.span key={i} aria-hidden="true" className="absolute rounded-full" style={{ width: s.s, height: s.s, background: s.c, boxShadow: `0 0 10px ${s.c}` }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.3 }} transition={{ duration: s.d, delay: 0.12, ease: easeOut }} />
          ))}

          {/* pack em três pedaços */}
          {stage !== "reveal" && (
            <motion.div className="relative" animate={anticipation} whileHover={stage === "closed" ? { y: -4, scale: 1.02 } : undefined}>
              {PIECES.map((clip, i) => {
                const gone = (i === 0 && opened) || (i === 1 && stage === "stat");
                const away = i === 0 ? { y: -150, x: -40, rotate: -20 } : { y: -60, x: 230, rotate: 24 };
                return (
                  <motion.div key={i} className={i === 0 ? "relative" : "absolute inset-0"} style={{ clipPath: clip }}
                    animate={gone ? { ...away, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }} transition={{ duration: 0.55, ease: easeOut }}>
                    <PackArt name={pack.type.name} art={pack.type.art} size="lg" />
                  </motion.div>
                );
              })}
              {/* luz vazando pela borda rasgada */}
              {opened && result && (
                <motion.span aria-hidden="true" className="absolute inset-x-2 h-3 rounded-full blur-md" style={{ background: colors.hi, top: `${stage === "stat" ? TEAR_2 : TEAR_1}%` }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.2, repeat: Infinity }} />
              )}

              {/* segunda dica: um atributo da carta; assinatura ganha faixa dourada e a silhueta do herói */}
              {stage === "stat" && card && (
                <div className="absolute inset-x-0 flex flex-col items-center gap-2" style={{ bottom: `${100 - TEAR_2 + 4}%` }}>
                  {signature && icon && (
                    <motion.img src={icon} alt="" className="size-16 rounded-full bg-amber-200/10 object-cover ring-2 ring-amber-300 brightness-0 drop-shadow-[0_0_14px_rgb(252_211_77/0.9)]"
                      initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35, ease: easeOut }} />
                  )}
                  <motion.div className="flex items-baseline gap-2 rounded-xl bg-zinc-950/85 px-4 py-2 shadow-lg ring-1 ring-white/10"
                    initial={{ y: 16, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.35, delay: signature ? 0.2 : 0, ease: easeOut }}>
                    <span className="text-xs font-extrabold tracking-[0.2em] text-zinc-400">{stat}</span>
                    <span className="font-display text-3xl font-extrabold text-white">{card.stats[stat]}</span>
                  </motion.div>
                </div>
              )}
              {stage === "stat" && signature && (
                <motion.div aria-hidden="true" className="absolute top-[70%] left-[-15%] w-[130%] -rotate-12 bg-linear-to-r from-amber-700 via-amber-200 to-amber-700 py-1.5 text-center text-xs font-black tracking-[0.4em] text-amber-950 uppercase shadow-[0_0_24px_rgb(252_211_77/0.7)]"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.3, ease: easeOut }}>
                  {t.signature}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* carta: sobe do pack; Eternus fica um instante branca antes de ganhar cor */}
          {stage === "reveal" && card && result && (
            <motion.div className="relative" initial={{ y: 80, scale: 0.6, opacity: 0, filter: `brightness(${level === "eternus" ? 8 : level === "base" ? 1.6 : 4})` }}
              animate={{ y: 0, scale: 1, opacity: 1, filter: "brightness(1)" }}
              transition={{ duration: level === "eternus" ? 1 : 0.6, ease: easeOut, filter: { duration: level === "eternus" ? 1.2 : 0.6, delay: level === "eternus" ? 0.3 : 0 } }}>
              <Card player={card} signature={signature} />
            </motion.div>
          )}
        </div>

        <div className="flex min-h-16 flex-col items-center gap-1.5 text-center">
          {stage === "reveal" && card && tier && result && (
            <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }}>
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
