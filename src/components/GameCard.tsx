// Carta do Cardslock Game: a mesma arte e moldura da carta da coleção, com custo, poder e o texto da habilidade.
import { AnimatePresence, motion } from "motion/react";
import { useState, type CSSProperties } from "react";
import { playerArt } from "../lib/cards";
import { useData } from "../lib/data";
import { getCardTier, rarityStyleVars } from "../lib/rarity";
import type { Player } from "../lib/types";
import type { DeckLook } from "../lib/game/deck";
import { CardArt } from "./Card";

export type GameCardText = { name: string; kind: string; body: string; master?: string; masterLabel: string };

type Props = {
  /** Jogador da coleção (sem ele, a carta é uma ficha). */
  player: Player | null;
  name: string;
  cost: number;
  power: number;
  /** Poder impresso: o número fica verde acima dele e vermelho abaixo. */
  base: number;
  /** Ficha: emoji no lugar da arte. */
  glyph?: string;
  /** Rótulo do selo de Mestre (sem rótulo, sem selo). */
  master?: string;
  /** Texto da habilidade: só na mão e no zoom. */
  text?: GameCardText | null;
  /** Ícones de status, mostrados acima do nome. */
  status?: string;
  /** Animações da moldura (partículas, brilho); desligadas nas cartas da mesa. */
  fx?: boolean;
  className?: string;
};

const gem = "absolute top-[3cqw] flex size-[21cqw] items-center justify-center rounded-full border-[1.2cqw] border-white text-[12cqw] leading-none font-extrabold shadow-[0_0.8cqw_2cqw_rgb(0_0_0/0.7)]";

/** Carta com a largura do container (`@container`); todas as medidas internas são em cqw, então ela escala inteira. */
export function GameCard({ player, name, cost, power, base, glyph, master, text, status, fx = false, className = "" }: Props) {
  const { settings, heroArt } = useData();
  const rk = player ? getCardTier(player, settings.tierConfig!) : null;
  const art = player ? playerArt(player, heroArt) : null;
  return (
    <div className={`@container aspect-295/430 ${className}`}>
      <div className="rk-wrap gc size-full" data-rarity={rk?.key} style={rk ? (rarityStyleVars(rk) as CSSProperties) : undefined}>
        <div className="deadlock-card-shell size-full select-none">
          <div className="deadlock-card-inner text-white">
            {player && rk ? <CardArt player={player} rk={rk} art={art} fx={fx} /> : (
              <div className="absolute inset-0 flex items-start justify-center bg-linear-160 from-stone-700 to-stone-900 pt-[30cqw] text-[42cqw]" aria-hidden="true">{glyph}</div>
            )}

            <i className={`${gem} left-[3cqw] bg-linear-160 from-sky-400 to-blue-700 not-italic`}>{cost}</i>
            <PowerGem power={power} base={base} />
            {master && (
              <span className="absolute inset-x-[26cqw] top-[5cqw] flex items-center justify-center gap-[1cqw] rounded-full bg-game-brass py-[0.8cqw] text-[6.5cqw] font-extrabold tracking-wider text-dl-black uppercase shadow-[0_0.6cqw_2cqw_rgb(0_0_0/0.6)]">
                <span aria-hidden="true">★</span><span className="hidden @min-[5.5rem]:inline">{master}</span>
              </span>
            )}

            {/* placa do texto: moldura no metal da raridade, cantos de cima chanfrados, separando a arte do texto */}
            {text && (
              <div className="gc-plaque absolute inset-x-[4cqw] bottom-[5cqw] h-[64cqw] bg-zinc-500 bg-(image:--rk-bg) p-[0.8cqw]">
                <div className="gc-plaque flex size-full items-center bg-zinc-950/95 px-[4cqw] pt-[7cqw] pb-[2cqw]">
                  <p className="line-clamp-8 w-full text-center text-[5.2cqw] leading-[1.2] font-semibold text-zinc-100">
                    {text.kind && <span className="mr-[1.5cqw] inline-block rounded-full bg-game-brass/20 px-[2cqw] align-[0.3cqw] text-[3.8cqw] leading-normal font-extrabold tracking-wider text-game-brass uppercase">{text.kind}</span>}
                    <span className="text-game-brass">{text.name}:</span> {text.body}
                    {text.master && <><br /><span className="text-game-brass">★ {text.masterLabel}:</span> {text.master}</>}
                  </p>
                </div>
              </div>
            )}
            {!text && <div className="absolute inset-x-0 bottom-0 h-[45cqw] bg-linear-to-b from-black/0 to-black/80" aria-hidden="true" />}

            {/* faixa do nome na fronteira entre a arte e o texto */}
            <div className={`absolute inset-x-[2cqw] flex flex-col items-center gap-[1.5cqw] ${text ? "bottom-[62cqw]" : "bottom-[9cqw]"}`}>
              {status && <span className="text-center text-[9cqw] leading-none drop-shadow-sm" aria-hidden="true">{status}</span>}
              <div className="gc-ribbon w-full bg-zinc-500 bg-(image:--rk-bg) p-[0.8cqw] shadow-lg">
                <b className={`gc-ribbon card-txt-shadow block truncate bg-zinc-950/90 px-[6cqw] py-[1.2cqw] text-center leading-tight font-black tracking-[0.08em] uppercase ${text ? "text-[7.5cqw]" : "text-[10cqw]"}`}>{name}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Poder com o pulo e o número flutuante quando muda (+2 / −3). */
function PowerGem({ power, base }: { power: number; base: number }) {
  const [prev, setPrev] = useState(power);
  const [pop, setPop] = useState<{ id: number; d: number } | null>(null);
  if (power !== prev) {
    setPrev(power);
    setPop((p) => ({ id: (p?.id ?? 0) + 1, d: power - prev }));
  }
  const tone = power > base ? "from-emerald-200 to-emerald-500" : power < base ? "from-red-300 to-red-600" : "from-amber-200 to-game-brass";
  return (
    <>
      <motion.b key={pop?.id ?? 0} initial={pop ? { scale: 1.45 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className={`${gem} right-[3cqw] bg-linear-160 ${tone} text-dl-black`}>{power}</motion.b>
      <AnimatePresence>
        {pop && (
          <motion.span key={pop.id} initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: "-14cqw" }} transition={{ duration: 0.9, ease: "easeOut" }}
            onAnimationComplete={() => setPop((p) => (p?.id === pop.id ? null : p))}
            className={`pointer-events-none absolute top-[24cqw] right-[4cqw] text-[14cqw] font-extrabold drop-shadow-[0_0.5cqw_1cqw_rgb(0_0_0)] ${pop.d > 0 ? "text-emerald-300" : "text-red-400"}`} aria-hidden="true">
            {pop.d > 0 ? "+" : "−"}{Math.abs(pop.d)}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );
}

/** Verso da carta (cartas viradas da IA e a mão dela). */
/** Verso da carta; `tone` pinta o losango com a cor do lado (IA por padrão). */
/** Classe de cada verso de baralho (cards.css). */
const LOOK: Record<DeckLook, string> = { noir: "deck-look-noir", deco: "deck-look-deco", sepia: "deck-look-sepia", amber: "deck-look-amber", sapphire: "deck-look-sapphire" };

export function CardBack({ className = "", tone = "ai", look }: { className?: string; tone?: "me" | "ai"; look?: DeckLook }) {
  if (look) {
    return (
      <div className={`@container aspect-295/430 ${LOOK[look]} ${className}`}>
        <div className="deadlock-card-shell size-full">
          <div className="deadlock-card-inner deck-back">
            {/* moldura e emblema em traço, na cor do verso (currentColor) */}
            <svg viewBox="0 0 295 430" className="absolute inset-0 size-full" aria-hidden="true" fill="none" stroke="currentColor">
              <polygon points="14,14 281,14 281,370 147.5,415 14,370" strokeWidth="2" opacity="0.7" />
              <polygon points="22,22 273,22 273,364 147.5,406 22,364" strokeWidth="1" opacity="0.35" />
              <g transform="translate(147.5 200)">
                <circle r="58" strokeWidth="1.5" opacity="0.45" />
                <circle r="46" strokeWidth="1" opacity="0.3" />
                <path d="M0 -40 L28 0 L0 40 L-28 0 Z" strokeWidth="3" />
                <path d="M0 -22 L15 0 L0 22 L-15 0 Z" fill="currentColor" stroke="none" />
                <path d="M0 -58 V-74 M0 58 V74 M-58 0 H-74 M58 0 H74" strokeWidth="2" opacity="0.7" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`@container aspect-295/430 ${className}`}>
      <div className="deadlock-card-shell size-full">
        <div className="deadlock-card-inner flex items-center justify-center game-card-back">
          <span className={`text-[40cqw] ${tone === "me" ? "text-game-me/50" : "text-game-ai/50"}`} aria-hidden="true">◆</span>
        </div>
      </div>
    </div>
  );
}

/** Caixas de palavra-chave e status ao lado da carta ampliada. */
export function TipBoxes({ tips, className = "" }: { tips: { title: string; text: string }[]; className?: string }) {
  if (!tips.length) return null;
  return (
    <div className={`flex w-48 flex-col gap-1.5 ${className}`}>
      {tips.map((x) => (
        <div key={x.title} className="rounded-lg bg-zinc-950/95 px-2.5 py-1.5 text-xs/snug text-zinc-200 shadow-lg ring-1 ring-white/10">
          <b className="block tracking-wide text-game-brass">{x.title}</b>
          {x.text}
        </div>
      ))}
    </div>
  );
}
