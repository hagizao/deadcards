import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Player } from "../../lib/types";
import { useData } from "../../lib/data";
import { STAT_KEYS, hexToRgba, teamOf, useLabel } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { getCardTier } from "../../lib/rarity";
import { STAT_NAMES } from "../../lib/statNames";
import { enter, springSoft } from "../../lib/motion";
import { pageTitle, pill, primaryBtn } from "../../lib/ui";
import { Card } from "../../components/Card";
import { FillBar } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { TeamLogo3D } from "../../components/TeamLogo3D";
import { ROLE_TEXT, isRole } from "./roleText";

const S = strings({
  pt: {
    title: "Conheça o competitivo do Deadlock", carousel: "Jogadores em destaque", strengths: "Pontos fortes", signature: "Herói de assinatura",
    open: "Ver carta", team: "Conhecer o time", prev: "Jogador anterior", next: "Próximo jogador", show: (name: string) => `Mostrar ${name}`,
    slide: (i: number, n: number) => `${i} de ${n}`,
  },
  en: {
    title: "Meet the Deadlock competitive scene", carousel: "Featured players", strengths: "Strengths", signature: "Signature hero",
    open: "View card", team: "Meet the team", prev: "Previous player", next: "Next player", show: (name: string) => `Show ${name}`,
    slide: (i: number, n: number) => `${i} of ${n}`,
  },
  es: {
    title: "Conoce el competitivo de Deadlock", carousel: "Jugadores destacados", strengths: "Puntos fuertes", signature: "Héroe insignia",
    open: "Ver carta", team: "Conocer el equipo", prev: "Jugador anterior", next: "Siguiente jugador", show: (name: string) => `Mostrar ${name}`,
    slide: (i: number, n: number) => `${i} de ${n}`,
  },
});

/** Distância circular entre a carta `i` e a ativa: 0 no centro, negativo à esquerda, positivo à direita. */
const offset = (i: number, active: number, n: number) => {
  let d = i - active;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
};

const AUTOPLAY_MS = 7000;

/**
 * Palco da Home: as cartas em destaque num arco 3D (a do centro grande, as outras girando para trás)
 * e, ao lado, quem é o jogador: time, função explicada, herói e pontos fortes. Gira sozinho até a pessoa mexer.
 */
export function Stage({ cards, onOpenCard, onOpenTeam }: { cards: Player[]; onOpenCard: (id: string) => void; onOpenTeam: (teamId: string) => void }) {
  const t = useT(S);
  const roles = useT(ROLE_TEXT);
  const statNames = useT(STAT_NAMES);
  const label = useLabel();
  const { teams, settings, heroIcon } = useData();
  const still = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const n = cards.length;
  const at = n ? active % n : 0;

  // gira sozinho; para de vez quando a pessoa escolhe uma carta e pausa com mouse ou foco no palco
  useEffect(() => {
    if (still || paused || touched || n < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % n), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [still, paused, touched, n]);

  if (!n) return null;
  const pick = (i: number) => { setTouched(true); setActive(((i % n) + n) % n); };
  const p = cards[at];
  const team = teamOf(teams, p);
  const tier = getCardTier(p, settings.tierConfig!);
  const hero = heroIcon(p.hero);
  const best = [...STAT_KEYS].sort((a, b) => p.stats[b] - p.stats[a]).slice(0, 2);

  return (
    <section
      aria-labelledby="home-stage"
      aria-roledescription="carousel"
      className="relative isolate"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* luz do palco: as cores da carta ativa e da raridade dela, trocando com um fade lento */}
      {/* sem caixa: capa e luz saem um pouco do palco e somem nas bordas, sem canto aparente */}
      {settings.homeHero && <img src={settings.homeHero} alt="" className="pointer-events-none absolute -top-12 -left-10 -z-10 h-[calc(100%+6rem)] w-[calc(100%+5rem)] max-w-none mask-[radial-gradient(ellipse_closest-side,#000_45%,transparent)] object-cover opacity-20" />}
      <AnimatePresence initial={false}>
        <motion.div
          key={p.id}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-16 -z-10 mask-[radial-gradient(ellipse_closest-side,#000_40%,transparent)]"
          style={{ background: `radial-gradient(55% 70% at 72% 45%, ${hexToRgba(tier.c, 0.3)}, transparent 70%), radial-gradient(45% 60% at 15% 85%, ${hexToRgba(p.c1, 0.35)}, transparent 70%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      </AnimatePresence>

      <div className="flex flex-col gap-2 py-2 lg:flex-row lg:items-center lg:gap-8">
        <div className="relative z-20 order-2 flex flex-col gap-5 lg:order-1 lg:w-[40%] lg:shrink-0">
          <h1 id="home-stage" className={pageTitle}>{t.title}</h1>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={p.id} className="flex flex-col gap-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={enter}>
              <div className="flex flex-col gap-2">
                <p className="font-display text-4xl/none font-black tracking-[0.08em] text-white uppercase title-depth sm:text-5xl/none">{p.name}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-300">
                  <TeamLogo3D team={team} className="size-7" radius={6} />
                  {label(team.name)}
                  <span aria-hidden="true" className="text-zinc-500">·</span>
                  {label(team.region)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-dl-text px-3 py-1.5 text-xs font-extrabold tracking-widest text-dl-black uppercase">{label(p.position || "Flex")}</span>
                <span className="flex items-center gap-2 rounded-lg bg-zinc-900/80 py-1 pr-3 pl-1 text-xs font-bold text-zinc-200">
                  {hero ? <img src={hero} alt="" className="size-7 rounded-md object-cover" /> : <Icon name="star" className="size-4" />}
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] tracking-widest text-zinc-400 uppercase">{t.signature}</span>
                    {p.hero}
                  </span>
                </span>
              </div>

              {isRole(p.position) && <p className="max-w-md text-sm text-pretty text-zinc-300">{roles[p.position]}</p>}

              <div className="flex max-w-sm flex-col gap-2">
                <span className="text-[14px] font-bold tracking-widest text-zinc-400 uppercase">{t.strengths}</span>
                {best.map((k, i) => (
                  <div key={k} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-bold text-zinc-100">{statNames[k]}</span>
                      <span className="font-black text-white tabular-nums">{p.stats[k]}</span>
                    </div>
                    <FillBar pct={((p.stats[k] - 40) / 59) * 100} delay={0.15 + i * 0.08} className="h-1.5 rounded-full bg-zinc-800" style={{ background: `linear-gradient(90deg, ${tier.lo}, ${tier.c})` }} />
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onOpenCard(p.id)} className={primaryBtn}>{t.open}</button>
            {/* agente livre não tem time para conhecer */}
            {team.region !== "Sem Time" && <button type="button" onClick={() => onOpenTeam(team.id)} className={pill(false)}>{t.team}</button>}
          </div>

          {n > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => pick(at - 1)} aria-label={t.prev} className="flex size-11 cursor-pointer items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-100/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                <Icon name="chevron-left" className="size-5" />
              </button>
              {cards.map((c, i) => (
                <button key={c.id} type="button" onClick={() => pick(i)} aria-label={t.show(c.name)} aria-current={i === at ? "true" : undefined}
                  className="group flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                  <span className={`h-1.5 rounded-full transition-all duration-300 ${i === at ? "w-6 bg-dl-text" : "w-1.5 bg-zinc-500 group-hover:bg-zinc-300"}`} />
                </button>
              ))}
              <button type="button" onClick={() => pick(at + 1)} aria-label={t.next} className="flex size-11 cursor-pointer items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-100/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                <Icon name="chevron-right" className="size-5" />
              </button>
              <span className="sr-only" aria-live="polite">{t.slide(at + 1, n)}: {p.name}</span>
            </div>
          )}
        </div>

        {/* o arco: arrastar para os lados troca de carta; clicar numa carta do lado traz ela para o centro */}
        <motion.div
          aria-label={t.carousel}
          role="group"
          className="relative order-1 h-[470px] w-full perspective-[1400px] lg:order-2 lg:h-[520px] lg:flex-1 lg:mask-[linear-gradient(to_right,transparent,#000_24%,#000_86%,transparent)]"
          drag={n > 1 ? "x" : false}
          dragSnapToOrigin
          dragElastic={0.15}
          onDragEnd={(_, info) => { if (info.offset.x < -50) pick(at + 1); else if (info.offset.x > 50) pick(at - 1); }}
        >
          {cards.map((c, i) => {
            const d = offset(i, at, n);
            const far = Math.abs(d);
            return (
              <motion.div
                key={c.id}
                className="absolute top-1/2 left-1/2"
                style={{ zIndex: 10 - far, translate: "-50% -50%" }}
                initial={false}
                animate={{ x: `${d * 56}%`, rotateY: -d * 24, z: -far * 140, scale: 1 - far * 0.1, opacity: far > 2 ? 0 : 1 - far * 0.2 }}
                transition={springSoft}
              >
                {d === 0 ? (
                  <Card player={c} onOpen={() => onOpenCard(c.id)} />
                ) : (
                  <button type="button" tabIndex={far > 2 ? -1 : 0} onClick={() => pick(i)} aria-label={t.show(c.name)}
                    className="block cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-100">
                    <span className="pointer-events-none block brightness-75">
                      <Card player={c} />
                    </span>
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
