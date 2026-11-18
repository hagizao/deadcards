// Carta do Cardslock Game: a mesma arte e moldura da carta da coleção, com custo, poder e o texto da habilidade.
import { AnimatePresence, motion } from "motion/react";
import { useState, type CSSProperties } from "react";
import { playerArt } from "../lib/cards";
import { useData } from "../lib/data";
import { getCardTier, rarityStyleVars } from "../lib/rarity";
import type { Player } from "../lib/types";
import type { DeckLook } from "../lib/game/deck";
import soulsIcon from "../assets/game/souls.png";
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

/** Posição e tamanho dos selos de custo e poder nos cantos de cima. */
const gem = "absolute top-[3cqw] z-10 grid size-[21cqw] place-items-center rounded-full text-[12cqw] leading-none font-extrabold";
/** Número sobre os selos: contorno escuro para ler em cima da luz. */
const ink = "relative [text-shadow:0_0.5cqw_0_rgb(0_0_0/0.9),0_0_1.5cqw_rgb(0_0_0/0.8)]";

/** Custo como uma orbe de almas pequena (as almas que você paga): teal escuro, chama ao fundo e o brilho das almas em volta. */
function CostOrb({ cost }: { cost: number }) {
  return (
    <i className={`${gem} left-[3cqw] overflow-hidden bg-radial-[at_50%_35%] from-teal-400 via-teal-800 to-teal-950 text-white not-italic shadow-[inset_0_-1.5cqw_2.5cqw_rgb(0_0_0/0.7),0_0_0_0.8cqw_var(--color-game-soul),0_0_3cqw_var(--color-game-soul)]`}>
      <img src={soulsIcon} alt="" draggable={false} className="absolute inset-0 m-auto h-3/4 opacity-50" />
      <span className={ink}>{cost}</span>
    </i>
  );
}

/**
 * Ficha de cassino do poder no metal da raridade (o mesmo da moldura da carta). O momento fica no número e num aro:
 * verde acima do poder impresso, vermelho abaixo, branco no impresso.
 */
const CHIP = {
  up: { num: "text-emerald-300", ring: "shadow-[0_0_0_0.9cqw_var(--color-emerald-400),0_0.8cqw_2cqw_rgb(0_0_0/0.7)]" },
  down: { num: "text-red-400", ring: "shadow-[0_0_0_0.9cqw_var(--color-red-500),0_0.8cqw_2cqw_rgb(0_0_0/0.7)]" },
  even: { num: "text-white", ring: "shadow-[0_0.8cqw_2cqw_rgb(0_0_0/0.7)]" },
} as const;

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

            <CostOrb cost={cost} />
            <PowerGem power={power} base={base} />
            {master && (
              <span className="absolute inset-x-[26cqw] top-[5cqw] z-10 flex items-center justify-center gap-[1cqw] rounded-full bg-game-brass py-[0.8cqw] text-[6.5cqw] font-extrabold tracking-wider text-dl-black uppercase shadow-[0_0.6cqw_2cqw_rgb(0_0_0/0.6)]">
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
  const chip = CHIP[power > base ? "up" : power < base ? "down" : "even"];
  return (
    <>
      <motion.b key={pop?.id ?? 0} initial={pop ? { scale: 1.45 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className={`${gem} right-[3cqw] bg-zinc-500 bg-[repeating-conic-gradient(rgb(255_255_255/0.75)_0deg_16deg,rgb(0_0_0/0.5)_16deg_45deg),var(--rk-bg,none)] p-[1.6cqw] ${chip.ring}`}>
        {/* miolo da ficha no metal da raridade, com o anel tracejado de dentro */}
        <span className={`grid size-full place-items-center rounded-full bg-zinc-500 bg-(image:--rk-bg) shadow-[inset_0_-1cqw_1.5cqw_rgb(0_0_0/0.45)] outline-[0.5cqw] outline-offset-[-1.6cqw] outline-black/35 outline-dashed ${chip.num}`}>
          <span className={ink}>{power}</span>
        </span>
      </motion.b>
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
/** Caixa de dica: título, texto e, se houver, linhas "rótulo · valor" (a primeira é a base, as outras somam com sinal). */
export type Tip = { title: string; text: string; rows?: [string, number][] };

export function TipBoxes({ tips, className = "" }: { tips: Tip[]; className?: string }) {
  if (!tips.length) return null;
  return (
    <div className={`flex w-48 flex-col gap-1.5 ${className}`}>
      {tips.map((x) => (
        <div key={x.title} className="rounded-lg bg-zinc-950/95 px-2.5 py-1.5 text-xs/snug text-zinc-200 shadow-lg ring-1 ring-white/10">
          <b className="block tracking-wide text-game-brass">{x.title}</b>
          {x.rows && (
            <span className="flex flex-col py-0.5">
              {x.rows.map(([label, v], i) => (
                <span key={`${label}-${i}`} className="flex items-baseline justify-between gap-2">
                  <span>{label}</span>
                  <b className={`tabular-nums ${i === 0 ? "text-zinc-100" : v > 0 ? "text-emerald-300" : "text-rose-300"}`}>{i === 0 ? v : v > 0 ? `+${v}` : `−${-v}`}</b>
                </span>
              ))}
            </span>
          )}
          {x.text}
        </div>
      ))}
    </div>
  );
}
