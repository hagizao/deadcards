import { motion } from "motion/react";
import type { CSSProperties } from "react";
import tableArt from "../assets/game/table.webp";

/** Clima da luz pela chance contra a IA: favorito aquece e firma o lampião, azarão esfria e faz falhar. */
export type BarMood = "hot" | "even" | "cold";

/** Sorteio fixo (o bar é o mesmo a cada visita). */
const rnd = (i: number, n: number) => { const x = Math.sin((i + 1) * n) * 43758.5453; return x - Math.floor(x); };

/** Garrafas do balcão fora de foco: cada uma vira uma bolha de luz. depth 0 = fundo (pequena, nítida), 2 = perto (grande, borrada). */
const BOTTLE_TINTS = ["255 176 80", "255 196 120", "120 200 120", "230 90 70", "90 190 200", "255 220 160"];
const BOKEH = Array.from({ length: 30 }, (_, i) => {
  const depth = i % 3;
  const shelf = rnd(i, 3.1) < 0.5 ? 0 : 1;
  return {
    depth,
    left: rnd(i, 12.9) * 100,
    top: (shelf ? 41 : 29) + rnd(i, 7.7) * 7 - depth * 2,
    size: [10, 18, 30][depth] + rnd(i, 5.3) * [6, 10, 16][depth],
    tint: BOTTLE_TINTS[Math.floor(rnd(i, 9.1) * BOTTLE_TINTS.length)],
    delay: -rnd(i, 2.2) * 9,
    dur: 5 + rnd(i, 4.4) * 6,
  };
});
const BLUR = ["blur-[1px]", "blur-[3px]", "blur-sm"] as const;

/** Poeira flutuando dentro do cone do lampião. */
const DUST = Array.from({ length: 18 }, (_, i) => ({
  left: 36 + rnd(i, 3.7) * 28,
  top: 12 + rnd(i, 8.3) * 58,
  delay: -rnd(i, 6.1) * 14,
  dur: 10 + rnd(i, 1.9) * 8,
  size: rnd(i, 4.2) < 0.3 ? 3 : 2,
}));

/**
 * Fundo do Cardslock Game antes da partida: a sua mesa no bar. Ao fundo, o balcão com as garrafas fora de foco; a mesa
 * de madeira em perspectiva; o lampião balançando com poeira na luz; no primeiro plano, desfocados, o copo de whisky e o
 * cinzeiro com o cigarro soltando fumaça. A luz muda com a chance contra a IA e esquenta com a carta em destaque
 * (`[data-hot]` dentro do grupo `room`). No Jogar o lampião é esbarrado, o balcão sai de foco e o copo sai de quadro
 * enquanto a câmera desce para a mesa (BarTable). Fica por cima do fundo do site.
 */
export function BarRoom({ mood, leaving, photo }: {
  mood: BarMood | null; leaving: boolean;
  /** Foto do salão escolhida no editor: entra no lugar da parede e do balcão desenhados; luz, mesa, fumaça e copo continuam. */
  photo?: string;
}) {
  const m = mood ?? "even";
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bar-night">
      {/* fundo: a foto do editor ou a parede e o balcão desenhados; no Jogar sai de foco */}
      <motion.div className="absolute inset-0" animate={leaving ? { opacity: 0, scale: 1.08 } : { opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: "easeIn" }}>
      {photo ? (
        <img src={photo} alt="" draggable={false} className="absolute inset-0 size-full scale-105 object-cover blur-[2px] brightness-50 saturate-90" />
      ) : (<>
        <div className="absolute inset-0 bar-wall" />
        <div className="absolute inset-x-0 top-[37%] h-1.5 bg-bar-shelf shadow-[0_6px_14px_rgb(0_0_0/0.7)] blur-[2px]" />
        <div className="absolute inset-x-0 top-[49%] h-1.5 bg-bar-shelf shadow-[0_6px_14px_rgb(0_0_0/0.7)] blur-[2px]" />
        {BOKEH.map((b, i) => (
          <span key={i} className={`absolute bokeh-twinkle rounded-full ${BLUR[b.depth]} ${b.depth === 0 ? "max-sm:hidden" : ""}`}
            style={{
              left: `${b.left}%`, top: `${b.top}%`, width: b.size, height: b.size,
              background: `radial-gradient(circle, rgb(${b.tint} / 0.55), rgb(${b.tint} / 0.18) 55%, transparent 72%)`,
              "--d": `${b.delay}s`, "--t": `${b.dur}s`,
            } as CSSProperties} />
        ))}
        {/* tampo do balcão */}
        <div className="absolute inset-x-0 top-[55%] h-10 bg-linear-to-b from-bar-shelf to-transparent blur-[3px]" />
      </>)}
        {/* faróis de um carro passando lá fora varrem a parede de vez em quando */}
        <div className="absolute inset-y-0 left-0 w-1/3 wall-sweep bg-linear-to-r from-transparent via-amber-50/7 to-transparent blur-2xl" />
      </motion.div>

      {/* mesa: a madeira deitada em perspectiva na metade de baixo, sumindo no escuro do fundo */}
      <div className="absolute inset-x-[-30%] bottom-0 h-[62%] perspective-[900px]">
        <img src={tableArt} alt="" draggable={false}
          className="size-full origin-bottom rotate-x-56 mask-t-from-45% mask-t-to-100% object-cover brightness-65 saturate-90" />
      </div>

      {/* lampião: cone, poça na mesa e poeira balançam juntos; no Jogar ele é esbarrado */}
      <div className={`absolute inset-0 origin-[50%_-10%] ${leaving ? "lamp-knock" : "lamp-sway"}`}>
      <div className="absolute inset-0 lamp-drift">
        <div className="absolute inset-x-0 top-0 h-full bar-cone" />
        {/* raios de luz passando dentro do cone */}
        <div className="absolute inset-x-[38%] top-0 h-4/5 cone-rays blur-md" />
        {/* a poça muda de clima com o crossfade entre as três luzes (por fora); a chama treme por dentro */}
        <div className={`absolute inset-x-0 bottom-0 h-3/5 transition-opacity duration-700 ${m === "hot" ? "opacity-100" : "opacity-0"}`}>
          <div className="size-full table-flicker bg-radial-[ellipse_45%_55%_at_50%_70%] from-amber-300/24 via-amber-600/9 to-transparent to-70%" />
        </div>
        <div className={`absolute inset-x-0 bottom-0 h-3/5 transition-opacity duration-700 ${m === "even" ? "opacity-100" : "opacity-0"}`}>
          <div className="size-full table-flicker bg-radial-[ellipse_45%_55%_at_50%_70%] from-amber-200/18 via-amber-700/7 to-transparent to-70%" />
        </div>
        <div className={`absolute inset-x-0 bottom-0 h-3/5 transition-opacity duration-700 ${m === "cold" ? "opacity-100" : "opacity-0"}`}>
          <div className="size-full lamp-falter bg-radial-[ellipse_45%_55%_at_50%_70%] from-sky-200/14 via-indigo-500/6 to-transparent to-70%" />
        </div>
        {/* a carta em destaque puxa a luz: a mesa esquenta */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-radial-[ellipse_35%_45%_at_50%_65%] from-amber-200/16 to-transparent to-70% opacity-0 transition-opacity duration-300 group-has-data-hot/room:opacity-100" />
        {DUST.map((d, i) => (
          <span key={i} className={`absolute dust-float rounded-full bg-amber-100/70 ${i % 2 ? "max-sm:hidden" : ""}`}
            style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, "--d": `${d.delay}s`, "--t": `${d.dur}s` } as CSSProperties} />
        ))}
      </div>
      </div>

      {/* fumaça solta pelo salão */}
      <div className="absolute top-[15%] left-[-20%] h-1/2 w-[70%] bar-smoke rounded-full bg-stone-300/8 blur-3xl" />
      <div className="absolute top-[35%] right-[-25%] h-2/5 w-[60%] bar-smoke rounded-full bg-stone-300/6 blur-3xl [--d:-14s] max-sm:hidden" />

      {/* bordas no escuro */}
      <div className="absolute inset-0 bg-radial-[ellipse_75%_70%_at_50%_45%] from-transparent from-45% to-black/80" />

      {/* primeiro plano, desfocado: o copo de whisky (sai de quadro no Jogar) e o cinzeiro com o cigarro */}
      <motion.svg viewBox="0 0 200 220" className="absolute bottom-[-3%] left-[-2%] w-[clamp(7rem,17vw,16rem)] blur-xs"
        animate={leaving ? { y: "70%", opacity: 0 } : { y: 0, opacity: 0.95 }} transition={{ duration: 0.55, ease: "easeIn" }}>
        <path d="M20 14 L180 14 L168 206 Q100 216 32 206 Z" fill="rgb(255 240 220 / 0.08)" stroke="rgb(255 230 200 / 0.4)" strokeWidth="5" />
        <ellipse cx="100" cy="14" rx="80" ry="10" fill="none" stroke="rgb(255 230 200 / 0.45)" strokeWidth="4" />
        <path d="M27 100 L173 100 L166 176 Q100 184 34 176 Z" fill="rgb(214 128 40 / 0.6)" />
        <ellipse cx="100" cy="100" rx="73" ry="9" fill="rgb(255 196 110 / 0.7)" />
        <rect x="86" y="72" width="46" height="42" rx="8" fill="rgb(255 245 230 / 0.3)" transform="rotate(14 109 93)" />
        <path d="M34 178 Q100 188 166 178 L168 206 Q100 216 32 206 Z" fill="rgb(255 235 210 / 0.22)" />
        <rect x="40" y="24" width="9" height="150" rx="4" fill="rgb(255 255 255 / 0.22)" />
      </motion.svg>
      <motion.div className="absolute right-[1%] bottom-[2%] w-[clamp(8rem,20vw,19rem)]"
        animate={leaving ? { y: "60%", opacity: 0 } : { y: 0, opacity: 1 }} transition={{ duration: 0.55, ease: "easeIn" }}>
        {/* fumaça do cigarro subindo da brasa */}
        <span className="absolute bottom-[45%] left-[14%] h-40 w-6 smoke-rise rounded-full bg-radial from-stone-200/60 to-transparent to-70% blur-sm" />
        <span className="absolute bottom-[45%] left-[14%] h-40 w-6 smoke-rise rounded-full bg-radial from-stone-200/60 to-transparent to-70% blur-sm [--d:-2.3s]" />
        <span className="absolute bottom-[45%] left-[14%] h-40 w-6 smoke-rise rounded-full bg-radial from-stone-200/60 to-transparent to-70% blur-sm [--d:-4.6s] max-sm:hidden" />
        <svg viewBox="0 0 240 120" className="w-full blur-xs">
          <ellipse cx="120" cy="78" rx="112" ry="36" fill="rgb(20 16 14)" stroke="rgb(255 220 180 / 0.2)" strokeWidth="4" />
          <ellipse cx="120" cy="72" rx="78" ry="20" fill="rgb(8 6 5)" />
          <rect x="40" y="52" width="80" height="9" rx="4" fill="rgb(235 225 210 / 0.85)" transform="rotate(-12 80 56)" />
          <circle cx="41" cy="64" r="6" fill="rgb(255 120 40)" className="ember-glow" />
        </svg>
      </motion.div>

    </div>
  );
}
