import type { CSSProperties } from "react";
import type { Player, TierBand } from "../../lib/types";
import { useData } from "../../lib/data";
import { STAT_KEYS } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { RARITY_TIERS, getRarity } from "../../lib/rarity";
import { STAT_NAMES } from "../../lib/statNames";
import { motion } from "motion/react";
import { cascade, enter } from "../../lib/motion";
import { Card } from "../../components/Card";
import { Reveal } from "../../components/Motion";

type Part = "ovr" | "role" | "team" | "name" | "stats";
const PARTS: Part[] = ["ovr", "role", "team", "name", "stats"];

// onde fica cada número sobre a carta (porcentagem da carta de 295 x 430)
const SPOT: Record<Part, { left: string; top: string }> = {
  ovr: { left: "36%", top: "8%" },
  role: { left: "30%", top: "17%" },
  team: { left: "30%", top: "25%" },
  name: { left: "74%", top: "43.5%" },
  stats: { left: "-3%", top: "62%" },
};

const S = strings({
  pt: {
    title: "Como ler uma carta", lead: "Cada carta resume um jogador do competitivo de Deadlock. Em 30 segundos você entende todas.",
    parts: {
      ovr: ["OVR", "A nota geral do jogador, de 40 a 99. Resume os seis atributos num número só."],
      role: ["Função", "O papel dele no time. Mais abaixo tem o que cada função faz."],
      team: ["Time", "O time em que ele joga. Sem time, aparece FA (agente livre)."],
      name: ["Nome e herói", "O nick do jogador. A arte é do herói de assinatura, o que ele mais joga."],
      stats: ["Atributos", "Seis notas que mostram no que ele é bom:"],
    },
    stats: { MIR: "precisão dos tiros", MAC: "decisões no mapa: farm, objetivos e rotações", SUP: "o quanto ajuda e protege o time", MOV: "mobilidade e posicionamento", POL: "quantos heróis joga bem", CON: "rende bem partida após partida" },
    rarity: "Raridade", rarityLead: "A moldura muda com o OVR. Quanto mais rara, mais ela brilha.",
  },
  en: {
    title: "How to read a card", lead: "Each card sums up a player from the Deadlock competitive scene. You'll get all of them in 30 seconds.",
    parts: {
      ovr: ["OVR", "The player's overall rating, from 40 to 99. It sums up the six attributes in one number."],
      role: ["Role", "Their job on the team. Further down you'll see what each role does."],
      team: ["Team", "The team they play for. Without a team, it shows FA (free agent)."],
      name: ["Name and hero", "The player's nickname. The art is their signature hero, the one they play the most."],
      stats: ["Attributes", "Six ratings that show what they're good at:"],
    },
    stats: { MIR: "shot accuracy", MAC: "map decisions: farming, objectives and rotations", SUP: "how much they help and protect the team", MOV: "mobility and positioning", POL: "how many heroes they play well", CON: "performs well match after match" },
    rarity: "Rarity", rarityLead: "The frame changes with the OVR. The rarer, the more it shines.",
  },
  es: {
    title: "Cómo leer una carta", lead: "Cada carta resume a un jugador del competitivo de Deadlock. En 30 segundos las entiendes todas.",
    parts: {
      ovr: ["OVR", "La nota general del jugador, de 40 a 99. Resume los seis atributos en un solo número."],
      role: ["Rol", "Su papel en el equipo. Más abajo está lo que hace cada rol."],
      team: ["Equipo", "El equipo en el que juega. Sin equipo, aparece FA (agente libre)."],
      name: ["Nombre y héroe", "El nick del jugador. El arte es su héroe insignia, el que más juega."],
      stats: ["Atributos", "Seis notas que muestran en qué es bueno:"],
    },
    stats: { MIR: "precisión de los disparos", MAC: "decisiones en el mapa: farmeo, objetivos y rotaciones", SUP: "cuánto ayuda y protege al equipo", MOV: "movilidad y posicionamiento", POL: "cuántos héroes juega bien", CON: "rinde bien partida tras partida" },
    rarity: "Rareza", rarityLead: "El marco cambia con el OVR. Cuanto más rara, más brilla.",
  },
});

/** Faixa de OVR de cada raridade com a configuração de tiers atual (as raridades sem faixa ficam de fora). */
function rarityRanges(cfg: TierBand[]) {
  const ranges = new Map<string, { min: number; max: number }>();
  for (let ovr = 40; ovr <= 99; ovr++) {
    const key = getRarity(ovr, cfg).key;
    const r = ranges.get(key);
    if (r) r.max = ovr; else ranges.set(key, { min: ovr, max: ovr });
  }
  return RARITY_TIERS.flatMap((tier) => {
    const r = ranges.get(tier.key);
    return r ? [{ tier, ...r }] : [];
  });
}

const Marker = ({ n, className, style }: { n: number; className?: string; style?: CSSProperties }) => (
  <span aria-hidden="true" style={style} className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-dl-text text-sm font-black text-dl-black shadow-[0_0_0_3px_rgb(16_19_13/0.8)] ${className ?? ""}`}>{n}</span>
);

/** "Como ler uma carta": uma carta de verdade com números em cima e a explicação de cada parte ao lado. */
export function CardGuide({ sample }: { sample: Player }) {
  const t = useT(S);
  const statNames = useT(STAT_NAMES);
  const { settings } = useData();
  const rarities = rarityRanges(settings.tierConfig!);

  return (
    <section aria-labelledby="home-guide" className="flex flex-col gap-6">
      <Reveal className="flex flex-col gap-2">
        <h2 id="home-guide" className="font-display text-xl font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-2xl">{t.title}</h2>
        <p className="max-w-2xl text-sm text-pretty text-zinc-300">{t.lead}</p>
      </Reveal>

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
        <Reveal className="relative w-fit max-w-full shrink-0">
          <Card player={sample} />
          {PARTS.map((part, i) => <Marker key={part} n={i + 1} className="pointer-events-none absolute z-30" style={SPOT[part]} />)}
        </Reveal>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <ol className="flex flex-col gap-4">
            {PARTS.map((part, i) => (
              <motion.li key={part} className="flex gap-3" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...enter, delay: cascade(i, 0.06) }}>
                  <Marker n={i + 1} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-extrabold text-dl-text">{t.parts[part][0]}</span>
                    <span className="text-sm text-pretty text-zinc-300">{t.parts[part][1]}</span>
                    {part === "stats" && (
                      <dl className="mt-1 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        {STAT_KEYS.map((k) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <dt className="w-9 shrink-0 font-mono font-bold text-zinc-100">{k}</dt>
                            <dd className="min-w-0 text-zinc-400"><span className="font-semibold text-zinc-200">{statNames[k]}</span>: {t.stats[k]}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
              </motion.li>
            ))}
          </ol>

          <Reveal className="flex flex-col gap-3 rounded-2xl bg-zinc-950/60 p-4">
            <div className="flex flex-col gap-1">
              <span className="font-extrabold text-dl-text">{t.rarity}</span>
              <span className="text-sm text-zinc-300">{t.rarityLead}</span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {rarities.map(({ tier, min, max }) => (
                <li key={tier.key} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: tier.c, boxShadow: `0 0 ${4 + tier.lvl * 3}px ${tier.c}` }} />
                  <span style={{ color: tier.c }}>{tier.name}</span>
                  <span className="text-zinc-400 tabular-nums">{min}–{max}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
