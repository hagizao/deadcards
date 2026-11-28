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
import { Icon } from "../components/Icon";
import { cascade, useSettled } from "../lib/motion";
import { useRail } from "../lib/rail";
import { RailArrows } from "../components/Rail";

const S = strings({
  pt: {
    title: "Elencos & cartas", hint: "Escolha um time para ver o elenco. Clique numa carta para ver os detalhes.",
    medium: "Cartas médias", large: "Cartas grandes", regions: "Times por região", noTeams: "Nenhum time ainda",
    teams: (n: number) => `${n} ${n === 1 ? "time" : "times"}`, show: (name: string) => `Ver o elenco de ${name}`,
    count: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"} no elenco oficial`, emptyRoster: "Nenhum jogador cadastrado neste elenco ainda.",
    collapse: "Recolher os times", expand: "Mostrar os times", prevRegions: "Regiões anteriores", nextRegions: "Mais regiões", prevCards: "Cartas anteriores", nextCards: "Mais cartas",
  },
  en: {
    title: "Rosters & cards", hint: "Pick a team to see its roster. Click a card to see its details.",
    medium: "Medium cards", large: "Large cards", regions: "Teams by region", noTeams: "No teams yet",
    teams: (n: number) => `${n} ${n === 1 ? "team" : "teams"}`, show: (name: string) => `Show ${name}'s roster`,
    count: (n: number) => `${n} ${n === 1 ? "player" : "players"} on the official roster`, emptyRoster: "No players registered on this roster yet.",
    collapse: "Hide the teams", expand: "Show the teams", prevRegions: "Previous regions", nextRegions: "More regions", prevCards: "Previous cards", nextCards: "More cards",
  },
  es: {
    title: "Rosters y cartas", hint: "Elige un equipo para ver su roster. Haz clic en una carta para ver los detalles.",
    medium: "Cartas medianas", large: "Cartas grandes", regions: "Equipos por región", noTeams: "Aún no hay equipos",
    teams: (n: number) => `${n} ${n === 1 ? "equipo" : "equipos"}`, show: (name: string) => `Ver el roster de ${name}`,
    count: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"} en el roster oficial`, emptyRoster: "Aún no hay jugadores registrados en este roster.",
    collapse: "Ocultar los equipos", expand: "Mostrar los equipos", prevRegions: "Regiones anteriores", nextRegions: "Más regiones", prevCards: "Cartas anteriores", nextCards: "Más cartas",
  },
});

const FREE = "Sem Time";
// as quatro regiões; "Sem time" entra por último, à direita, quando tem algum time
const MAIN_REGIONS = REGIONS.filter((r) => r !== FREE);
// largura das cartas do elenco (card-size-team e card-size-team-medium no cards.css)
const CARD_W = { team: 295, medium: 222 } as const;

export function Teams({ focusTeamId, onOpenCard }: { focusTeamId?: string; onOpenCard: (id: string) => void }) {
  const { teams, players } = useData();
  const t = useT(S);
  const label = useLabel();
  const still = useReducedMotion();
  const settled = useSettled();
  const [size, setSize] = useState<"team" | "medium">("team");
  const [picked, setPicked] = useState<string | null>(focusTeamId ?? null);
  // clicar no nome de uma região recolhe os logos de todas, e as cartas sobem para a vista
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const ranked = teams
    .map((team) => ({ team, o: teamOvr(players, team.id) }))
    .sort((a, b) => b.o.exact - a.o.exact || a.team.name.localeCompare(b.team.name));
  const inRegion = (r: string) => ranked.filter(({ team }) => (team.region || "Europa") === r);
  const free = inRegion(FREE);
  const regionList = free.length ? [...MAIN_REGIONS, FREE] : MAIN_REGIONS;
  const [regionsEl, setRegionsEl] = useState<HTMLDivElement | null>(null);
  // uma linha só: até 4 regiões à vista, as outras pelas setas
  const regionRail = useRail(regionsEl, regionList.length, { item: 280, gap: 24, max: 4, fluid: true });
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

      {/* cabeçalho de regiões: uma linha de colunas separadas pela linha fina, com os times encaixados; setas para as que não cabem */}
      <nav aria-label={t.regions} className="flex flex-col gap-3">
        <div className="flex min-h-11 justify-end">
          <RailArrows rail={regionRail} prev={t.prevRegions} next={t.nextRegions} />
        </div>
        <div ref={setRegionsEl} className={`${regionRail.fade} overflow-x-clip`}>
          <motion.ul className="flex gap-6" {...regionRail.track}>
            {regionList.map((r, i) => {
              const list = inRegion(r);
              return (
                <li key={r} style={{ width: regionRail.size }} inert={regionRail.hidden(i) || undefined}
                  className={`${regionAccentClass(r)} flex shrink-0 flex-col gap-3 border-l border-zinc-200/15 pl-4`}>
                  <div className="flex flex-col gap-1">
                    <h2>
                      <button type="button" aria-expanded={open} aria-controls={`region-${i}`} title={open ? t.collapse : t.expand} onClick={() => setOpen((o) => !o)}
                        className="group flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md text-left text-2xl font-extrabold tracking-widest text-zinc-100 uppercase transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:opacity-80">
                        <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-(--team-accent) shadow-[0_0_10px_var(--team-accent)]" />
                        {label(r)}
                        <Icon name="chevron-down" className={`size-5 shrink-0 text-zinc-500 transition-transform duration-200 group-hover:text-zinc-200 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} />
                      </button>
                    </h2>
                    <span className="text-xs text-zinc-500">{t.teams(list.length)}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      // corta só enquanto abre e fecha; parado, o brilho do logo escolhido passa livre
                      <motion.div id={`region-${i}`} initial={{ height: 0, opacity: 0, overflowY: "clip" }} animate={{ height: "auto", opacity: 1, transitionEnd: { overflowY: "visible" } }} exit={{ height: 0, opacity: 0, overflowY: "clip" }}
                        transition={still ? { duration: 0 } : { duration: 0.22, ease: easeOut }}>
                        {list.length
                          ? <ul className="flex flex-wrap gap-1">{list.map(logo)}</ul>
                          : <p className="py-2 text-sm text-zinc-500">{t.noTeams}</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </motion.ul>
        </div>
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
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  // elenco numa linha só; as cartas que não cabem ficam atrás das setas
  const rail = useRail(rowEl, roster.length, { item: CARD_W[size], gap: 24 });
  return (
    <motion.section
      aria-labelledby={`team-${team.id}`}
      className={`${regionAccentClass(team.region)} flex flex-col gap-2`}
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
        <RailArrows rail={rail} prev={t.prevCards} next={t.nextCards} />
      </div>
      {roster.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">{t.emptyRoster}</p>}
      {/* o fade das pontas é uma máscara e corta tudo fora da caixa: o padding em volta dá lugar ao brilho e à subida do hover (useRail mede só a área de dentro) */}
      <div ref={setRowEl} className={`${rail.fadeStrong} overflow-x-clip px-6 pt-6 pb-10 rail-glow`}>
        <motion.ul className="flex gap-6" {...rail.track}>
          {roster.map((p, i) => (
            <motion.li key={p.id} className="shrink-0" inert={rail.hidden(i) || undefined} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min(i, 5) * 0.04, duration: 0.25, ease: easeOut }}>
              <Card player={p} variant={size} onOpen={() => onOpenCard(p.id)} />
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.section>
  );
}
