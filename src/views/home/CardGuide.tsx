import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Player, TierBand } from "../../lib/types";
import { useData } from "../../lib/data";
import { STAT_KEYS } from "../../lib/cards";
import { ALT_HERO_DROP } from "../../lib/cardKinds";
import { strings, useT } from "../../lib/i18n";
import { sectionTitle } from "../../lib/ui";
import { RARITY_TIERS, getRarity } from "../../lib/rarity";
import { STAT_NAMES } from "../../lib/statNames";
import { motion } from "motion/react";
import { cascade, enter } from "../../lib/motion";
import { Card } from "../../components/Card";
import { Reveal } from "../../components/Motion";

type Part = "ovr" | "role" | "team" | "name" | "stats";
const PARTS: Part[] = ["ovr", "role", "team", "name", "stats"];


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
    heroes: "Dois tipos de herói",
    sigTitle: "Herói de assinatura", sigText: "O herói que o jogador mais joga. É a carta principal dele: quando aparece junto das outras, ganha a faixa Assinatura.",
    playedTitle: "Herói jogado", playedText: (n: number) => `Outro herói que ele também joga. É uma carta à parte, com o OVR e os atributos ${n} pontos abaixo da carta de assinatura.`,
    point: (part: string) => `Destacar ${part} na carta`, rarity: "Raridade", rarityLead: "A moldura muda com o OVR. Quanto mais rara, mais ela brilha.",
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
    heroes: "Two kinds of hero",
    sigTitle: "Signature hero", sigText: "The hero the player plays the most. It's their main card: shown next to the others, it gets the Signature ribbon.",
    playedTitle: "Played hero", playedText: (n: number) => `Another hero they also play. It's a separate card, with OVR and attributes ${n} points below the signature card.`,
    point: (part: string) => `Highlight ${part} on the card`, rarity: "Rarity", rarityLead: "The frame changes with the OVR. The rarer, the more it shines.",
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
    heroes: "Dos tipos de héroe",
    sigTitle: "Héroe insignia", sigText: "El héroe que el jugador más juega. Es su carta principal: junto a las otras, lleva la cinta Firma.",
    playedTitle: "Héroe jugado", playedText: (n: number) => `Otro héroe que también juega. Es una carta aparte, con el OVR y los atributos ${n} puntos por debajo de la carta insignia.`,
    point: (part: string) => `Resaltar ${part} en la carta`, rarity: "Rareza", rarityLead: "El marco cambia con el OVR. Cuanto más rara, más brilla.",
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

const MARK = "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-[0_0_0_3px_rgb(16_19_13/0.8)] transition-[scale,background-color] duration-150";
const markTone = (on: boolean) => (on ? "scale-115 bg-white text-dl-black" : "bg-dl-text text-dl-black");

type Box = { x: number; y: number; w: number; h: number };

// cada parte é achada pelo que a carta já marca no DOM (data-ovr, data-zone, data-stat), então os números seguem a carta de verdade
function partEl(root: HTMLElement, part: Part): Element | null {
  const ovr = root.querySelector("[data-ovr]");
  if (part === "ovr") return ovr;
  if (part === "role") return ovr?.nextElementSibling ?? null;
  if (part === "team") return ovr?.nextElementSibling?.nextElementSibling ?? null;
  if (part === "name") return root.querySelector('[data-zone="name"] h3');
  return root.querySelector("[data-stat]")?.parentElement ?? null;
}

function measure(root: HTMLElement): Record<Part, Box> | null {
  const base = root.getBoundingClientRect();
  const out = {} as Record<Part, Box>;
  for (const part of PARTS) {
    const el = partEl(root, part);
    if (!el) return null;
    // o nome é um bloco da largura da carta: mede só o texto, para o número ficar colado nele
    let r = el.getBoundingClientRect();
    if (part === "name") { const range = document.createRange(); range.selectNodeContents(el); r = range.getBoundingClientRect(); }
    out[part] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }
  return out;
}

const MARK_SIZE = 28;
// onde o número fica em relação à parte: à direita dela, menos nos atributos, que ganham o número à esquerda
const markAt = (part: Part, b: Box) => ({
  left: part === "stats" ? b.x - MARK_SIZE - 10 : b.x + b.w + 8,
  top: b.y + b.h / 2 - MARK_SIZE / 2,
});

/** "Como ler uma carta": uma carta de verdade com números em cima e a explicação de cada parte ao lado. */
export function CardGuide({ sample }: { sample: Player }) {
  const t = useT(S);
  const statNames = useT(STAT_NAMES);
  const { settings } = useData();
  const rarities = rarityRanges(settings.tierConfig!);
  const cardRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<Part, Box> | null>(null);
  const [hot, setHot] = useState<Part | null>(null);

  // mede as partes quando a carta aparece e sempre que muda de tamanho (celular, troca de carta)
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxes(measure(el)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sample.id]);

  // destaque da parte: marca a parte, o caminho até ela e a zona dela; o CSS (cards.css, .guide-card) faz o resto
  useEffect(() => {
    const root = cardRef.current;
    const part = hot && root ? partEl(root, hot) : null;
    if (!root || !part) return;
    const zone = part.closest(".deadlock-card-inner > *");
    const path: Element[] = [];
    for (let e = part.parentElement; e && e !== zone; e = e.parentElement) path.push(e);
    root.dataset.guiding = "";
    part.setAttribute("data-guide-part", "");
    zone?.setAttribute("data-guide-zone", "");
    path.forEach((e) => e.setAttribute("data-guide-path", ""));
    return () => {
      delete root.dataset.guiding;
      part.removeAttribute("data-guide-part");
      zone?.removeAttribute("data-guide-zone");
      path.forEach((e) => e.removeAttribute("data-guide-path"));
    };
  }, [hot]);

  return (
    <section aria-labelledby="home-guide" className="flex flex-col gap-6">
      <Reveal className="flex flex-col gap-2">
        <h2 id="home-guide" className={`${sectionTitle} deco-eye`}>{t.title}</h2>
        <p className="max-w-2xl text-sm text-pretty text-zinc-300">{t.lead}</p>
      </Reveal>

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
        <Reveal className="w-fit max-w-full shrink-0">
          {/* isolate: os números e o anel ficam presos ao bloco da carta e não passam por cima do cabeçalho fixo */}
          <div ref={cardRef} className="guide-card relative isolate">
            <Card player={sample} />
            {boxes && PARTS.map((part, i) => (
              <button
                key={part}
                type="button"
                aria-label={t.point(t.parts[part][0])}
                aria-pressed={hot === part}
                onPointerEnter={() => setHot(part)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(part)}
                onBlur={() => setHot(null)}
                onClick={() => setHot((h) => (h === part ? null : part))}
                style={markAt(part, boxes[part])}
                className={`${MARK} ${markTone(hot === part)} absolute z-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <ol className="flex flex-col gap-4">
            {PARTS.map((part, i) => (
              <motion.li key={part} className="flex gap-3" onPointerEnter={() => setHot(part)} onPointerLeave={() => setHot(null)} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...enter, delay: cascade(i, 0.06) }}>
                  <span aria-hidden="true" className={`${MARK} ${markTone(hot === part)}`}>{i + 1}</span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className={`font-display text-base tracking-[0.11em] uppercase transition-colors title-depth ${hot === part ? "text-white" : "text-dl-text"}`}>{t.parts[part][0]}</span>
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

          <Reveal className="flex flex-col gap-3">
            <h3 className="font-display text-lg tracking-[0.11em] text-dl-text uppercase title-depth">{t.heroes}</h3>
            <dl className="flex flex-col gap-3">
              {/* assinatura em dourado (o herói principal); jogado em prata, o segundo lugar, 2 pontos abaixo */}
              {[
                { term: t.sigTitle, text: t.sigText, tone: "text-ach-gold", line: "border-ach-gold/60" },
                { term: t.playedTitle, text: t.playedText(ALT_HERO_DROP), tone: "text-ach-silver", line: "border-ach-silver/50" },
              ].map(({ term, text, tone, line }) => (
                <div key={term} className={`flex flex-col gap-1 border-l-2 pl-3 ${line}`}>
                  <dt className={`font-display text-base tracking-[0.11em] uppercase title-depth ${tone}`}>{term}</dt>
                  <dd className="text-sm text-pretty text-zinc-300">{text}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-lg tracking-[0.11em] text-dl-text uppercase title-depth">{t.rarity}</h3>
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
