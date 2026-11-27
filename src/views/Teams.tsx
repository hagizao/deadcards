import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { useData } from "../lib/data";
import { activeRoster, REGIONS, regionClass, teamOvr, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { RegionBackdrop } from "../components/RegionBackdrop";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { usePointerTilt } from "../lib/tilt";
import type { Team } from "../lib/types";
import { Card } from "../components/Card";

import { Icon } from "../components/Icon";
import { easeOut, pageTitle, pill } from "../lib/ui";
import { cascade, useSettled } from "../lib/motion";

const S = strings({
  pt: {
    title: "Elencos & cartas", hint: "Clique em um time para abrir o elenco e em uma carta para ver os detalhes",
    desc: "OVR decrescente", asc: "OVR crescente", collapseAll: "Recolher todos", showAll: "Exibir todos",
    medium: "Cartas médias", large: "Cartas grandes", all: (n: number) => `Todas (${n})`, noTeams: "Nenhum time nesta região",
    count: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"} no elenco oficial`, emptyRoster: "Nenhum jogador cadastrado neste elenco ainda.",
  },
  en: {
    title: "Rosters & cards", hint: "Click a team to open its roster and a card to see its details",
    desc: "OVR descending", asc: "OVR ascending", collapseAll: "Collapse all", showAll: "Show all",
    medium: "Medium cards", large: "Large cards", all: (n: number) => `All (${n})`, noTeams: "No teams in this region",
    count: (n: number) => `${n} ${n === 1 ? "player" : "players"} on the official roster`, emptyRoster: "No players registered on this roster yet.",
  },
  es: {
    title: "Rosters y cartas", hint: "Haz clic en un equipo para abrir su roster y en una carta para ver los detalles",
    desc: "OVR descendente", asc: "OVR ascendente", collapseAll: "Contraer todos", showAll: "Mostrar todos",
    medium: "Cartas medianas", large: "Cartas grandes", all: (n: number) => `Todas (${n})`, noTeams: "Ningún equipo en esta región",
    count: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"} en el roster oficial`, emptyRoster: "Aún no hay jugadores registrados en este roster.",
  },
});

export function Teams({ focusTeamId, onOpenCard }: { focusTeamId?: string; onOpenCard: (id: string) => void }) {
  const { teams, players } = useData();
  const t = useT(S);
  const label = useLabel();
  const [region, setRegion] = useState("ALL");
  const [desc, setDesc] = useState(true);
  const [size, setSize] = useState<"team" | "medium">("team");
  const settled = useSettled();
  const [open, setOpen] = useState<Record<string, boolean>>(focusTeamId ? { [focusTeamId]: true } : {});

  useEffect(() => {
    if (focusTeamId) document.getElementById(`team-card-${focusTeamId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusTeamId]);

  const visible = teams
    .filter((t) => region === "ALL" || (t.region || "Europa") === region)
    .map((t) => ({ team: t, o: teamOvr(players, t.id) }))
    .sort((a, b) => (desc ? b.o.exact - a.o.exact : a.o.exact - b.o.exact) || a.team.name.localeCompare(b.team.name));
  const anyOpen = visible.some((v) => open[v.team.id]);

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className={pageTitle}>{t.title}</h1>
            <p className="mt-1.5 text-xs text-zinc-400 sm:text-sm">{t.hint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pill(false)} onClick={() => setDesc((d) => !d)}><Icon name={desc ? "arrow-down" : "arrow-up"} />{desc ? t.desc : t.asc}</button>
            <button type="button" className={pill(false)} onClick={() => setOpen(anyOpen ? {} : Object.fromEntries(visible.map((v) => [v.team.id, true])))}>
              <Icon name={anyOpen ? "chevron-up" : "chevron-down"} />{anyOpen ? t.collapseAll : t.showAll}
            </button>
            <button type="button" className={pill(size === "medium")} onClick={() => setSize((s) => (s === "team" ? "medium" : "team"))}>
              {size === "medium" ? t.medium : t.large}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pill(region === "ALL")} onClick={() => setRegion("ALL")}>{t.all(teams.length)}</button>
          {REGIONS.map((r) => (
            <button key={r} type="button" className={pill(region === r)} onClick={() => setRegion(r)}>
              {label(r)} ({teams.filter((x) => (x.region || "Europa") === r).length})
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <div className="py-10 text-center text-sm text-zinc-300">{t.noTeams}</div>}

      {visible.map(({ team, o }, i) => {
        const roster = activeRoster(players, team.id);
        const isOpen = !!open[team.id];
        return (
          <motion.div
            layout
            key={team.id}
            initial={{ opacity: 0, y: settled ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: easeOut, delay: settled ? 0 : cascade(i, 0.05, 8) }}
            id={`team-card-${team.id}`}
            style={{ scrollMarginTop: "6.5rem" }}
            className={`noir-glass team-region-card ${regionClass(team.region)} rounded-2xl p-4 sm:p-6`}
          >
            <RegionBackdrop region={team.region} />
            <TeamHeader team={team} open={isOpen} onClick={() => setOpen((s) => ({ ...s, [team.id]: !s[team.id] }))}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="team-title-text font-display text-xl/tight font-extrabold tracking-wider text-area uppercase transition-[color,text-shadow] duration-200 sm:text-2xl/tight">{team.name}</h2>
                  <span className="team-ovr-chip">
                    <span className="team-ovr-num">{o.count ? o.rounded : "--"}</span>
                    <span className="team-ovr-lbl">OVR</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-300">{label(team.region)} · {t.count(roster.length)}</p>
              </div>
              <Icon name={isOpen ? "chevron-up" : "chevron-down"} className="size-5 text-zinc-400 transition-colors group-hover:text-white" />
            </TeamHeader>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="roster"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 flex flex-wrap justify-center gap-6 border-t border-zinc-200/15 pt-6 sm:justify-start">
                    {roster.length === 0 && (
                      <div className="w-full rounded-xl border border-dashed border-zinc-200/20 bg-black/25 py-8 text-center text-xs text-zinc-300">{t.emptyRoster}</div>
                    )}
                    {roster.map((p, i) => (
                      <motion.div key={p.id} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min(i, 5) * 0.04, duration: 0.25, ease: easeOut }}>
                        <Card player={p} variant={size} onOpen={() => onOpenCard(p.id)} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </section>
  );
}

function TeamHeader({ team, open, onClick, children }: { team: Team; open: boolean; onClick: () => void; children: ReactNode }) {
  const { rotateX, rotateY, ...tiltHandlers } = usePointerTilt();
  return (
    <motion.button type="button" onClick={onClick} aria-expanded={open} whileHover="hover" {...tiltHandlers} className="team-header-trigger group flex w-full items-center gap-4 text-left">
      <TeamLogo3D team={team} className="size-[60px]" radius={14} tilt={{ rotateX, rotateY }} />
      {children}
    </motion.button>
  );
}
