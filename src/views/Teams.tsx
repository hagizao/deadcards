import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useData } from "../lib/data";
import { activeRoster, REGIONS, regionAccentClass, teamOvr, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { usePointerTilt } from "../lib/tilt";
import type { Team } from "../lib/types";
import { Card } from "../components/Card";
import { easeOut, pageTitle, pill, sectionTitle } from "../lib/ui";
import { cascade, useSettled } from "../lib/motion";

const S = strings({
  pt: {
    title: "Elencos & cartas", hint: "Escolha um time para ver o elenco. Clique numa carta para ver os detalhes.",
    medium: "Cartas médias", large: "Cartas grandes", regions: "Times por região", noTeams: "Nenhum time ainda",
    teams: (n: number) => `${n} ${n === 1 ? "time" : "times"}`, show: (name: string) => `Ver o elenco de ${name}`,
    count: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"} no elenco oficial`, emptyRoster: "Nenhum jogador cadastrado neste elenco ainda.",
  },
  en: {
    title: "Rosters & cards", hint: "Pick a team to see its roster. Click a card to see its details.",
    medium: "Medium cards", large: "Large cards", regions: "Teams by region", noTeams: "No teams yet",
    teams: (n: number) => `${n} ${n === 1 ? "team" : "teams"}`, show: (name: string) => `Show ${name}'s roster`,
    count: (n: number) => `${n} ${n === 1 ? "player" : "players"} on the official roster`, emptyRoster: "No players registered on this roster yet.",
  },
  es: {
    title: "Rosters y cartas", hint: "Elige un equipo para ver su roster. Haz clic en una carta para ver los detalles.",
    medium: "Cartas medianas", large: "Cartas grandes", regions: "Equipos por región", noTeams: "Aún no hay equipos",
    teams: (n: number) => `${n} ${n === 1 ? "equipo" : "equipos"}`, show: (name: string) => `Ver el roster de ${name}`,
    count: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"} en el roster oficial`, emptyRoster: "Aún no hay jugadores registrados en este roster.",
  },
});

const FREE = "Sem Time";
// as quatro regiões do cabeçalho; os sem time ficam numa linha embaixo delas
const MAIN_REGIONS = REGIONS.filter((r) => r !== FREE);

export function Teams({ focusTeamId, onOpenCard }: { focusTeamId?: string; onOpenCard: (id: string) => void }) {
  const { teams, players } = useData();
  const t = useT(S);
  const label = useLabel();
  const still = useReducedMotion();
  const settled = useSettled();
  const [size, setSize] = useState<"team" | "medium">("team");
  const [picked, setPicked] = useState<string | null>(focusTeamId ?? null);
  const panelRef = useRef<HTMLDivElement>(null);

  const ranked = teams
    .map((team) => ({ team, o: teamOvr(players, team.id) }))
    .sort((a, b) => b.o.exact - a.o.exact || a.team.name.localeCompare(b.team.name));
  const inRegion = (r: string) => ranked.filter(({ team }) => (team.region || "Europa") === r);
  const free = inRegion(FREE);
  // sem escolha, abre o time de maior OVR para a tela nunca começar vazia
  const current = ranked.find(({ team }) => team.id === picked) ?? ranked[0];

  // vindo de outra tela (Home, Tier List), desce até o time pedido
  useEffect(() => {
    if (focusTeamId) panelRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [focusTeamId, still]);

  // escolher um time só troca o elenco embaixo; a tela não rola sozinha
  const pick = (id: string) => setPicked(id);

  const logo = ({ team }: { team: Team }, i: number) => (
    <TeamPick key={team.id} team={team} active={current?.team.id === team.id} label={t.show(team.name)} delay={settled ? 0 : cascade(i, 0.04, 8)} onPick={() => pick(team.id)} />
  );

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className={pageTitle}>{t.title}</h1>
          <p className="text-xs text-zinc-400 sm:text-sm">{t.hint}</p>
        </div>
        <button type="button" className={pill(size === "medium")} aria-pressed={size === "medium"} onClick={() => setSize((s) => (s === "team" ? "medium" : "team"))}>
          {size === "medium" ? t.medium : t.large}
        </button>
      </div>

      {/* cabeçalho de regiões: colunas separadas pela linha fina, com os times encaixados em cada uma */}
      <nav aria-label={t.regions} className="flex flex-col gap-6">
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
          {MAIN_REGIONS.map((r) => {
            const list = inRegion(r);
            return (
              <div key={r} className={`${regionAccentClass(r)} flex flex-col gap-3 border-l border-zinc-200/15 pl-4`}>
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-widest text-zinc-100 uppercase">
                    <span aria-hidden="true" className="size-3 rounded-full bg-(--team-accent) shadow-[0_0_10px_var(--team-accent)]" />
                    {label(r)}
                  </h2>
                  <span className="text-xs text-zinc-500">{t.teams(list.length)}</span>
                </div>
                {list.length
                  ? <ul className="flex flex-wrap gap-1">{list.map(logo)}</ul>
                  : <p className="py-2 text-sm text-zinc-500">{t.noTeams}</p>}
              </div>
            );
          })}
        </div>
        {free.length > 0 && (
          <div className={`${regionAccentClass(FREE)} flex flex-wrap items-center gap-x-4 gap-y-2 border-l border-zinc-200/15 pl-4`}>
            <h2 className="text-2xl font-extrabold tracking-widest text-zinc-300 uppercase">{label(FREE)}</h2>
            <ul className="flex flex-wrap gap-1">{free.map(logo)}</ul>
          </div>
        )}
      </nav>

      {/* o time escolhido abre embaixo do cabeçalho */}
      <div ref={panelRef} className="scroll-mt-28 border-t border-zinc-200/15 pt-8" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {current && <TeamPanel key={current.team.id} team={current.team} ovr={current.o} size={size} onOpenCard={onOpenCard} />}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** Logo + nome de um time no cabeçalho; o escolhido fica aceso, com a cor da região embaixo. */
function TeamPick({ team, active, label, delay, onPick }: { team: Team; active: boolean; label: string; delay: number; onPick: () => void }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: easeOut, delay }}>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        aria-label={label}
        className={`group flex w-33 cursor-pointer flex-col items-center gap-2 rounded-xl px-1 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/10 ${
          active ? "shadow-[inset_0_-2px_0_var(--team-accent)]" : "hover:bg-zinc-100/5"}`}
      >
        <span className={`transition-[scale,filter] duration-200 group-hover:scale-105 ${active ? "scale-105 drop-shadow-[0_0_10px_var(--team-accent)]" : "opacity-80 grayscale-35 group-hover:opacity-100 group-hover:grayscale-0"}`}>
          <TeamLogo3D team={team} className="size-18" radius={14} />
        </span>
        <span className={`line-clamp-2 w-full text-center text-base/tight font-bold tracking-wide text-balance uppercase ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>{team.name}</span>
      </button>
    </motion.li>
  );
}

function TeamPanel({ team, ovr, size, onOpenCard }: { team: Team; ovr: { rounded: number; count: number }; size: "team" | "medium"; onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { players } = useData();
  const roster = activeRoster(players, team.id);
  const { rotateX, rotateY, ...tilt } = usePointerTilt();
  return (
    <motion.section
      aria-labelledby={`team-${team.id}`}
      className={`${regionAccentClass(team.region)} flex flex-col gap-6`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: easeOut }}
    >
      <div className="flex flex-wrap items-center gap-4 sm:gap-5" {...tilt}>
        <TeamLogo3D team={team} className="size-20 sm:size-24" radius={18} tilt={{ rotateX, rotateY }} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`team-${team.id}`} className={sectionTitle}>{team.name}</h2>
            <span className="team-ovr-chip">
              <span className="team-ovr-num">{ovr.count ? ovr.rounded : "--"}</span>
              <span className="team-ovr-lbl">OVR</span>
            </span>
          </div>
          <p className="text-sm text-zinc-300">{label(team.region)} · {t.count(roster.length)}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-6 sm:justify-start">
        {roster.length === 0 && <p className="w-full py-8 text-center text-sm text-zinc-400">{t.emptyRoster}</p>}
        {roster.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min(i, 5) * 0.04, duration: 0.25, ease: easeOut }}>
            <Card player={p} variant={size} onOpen={() => onOpenCard(p.id)} />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
