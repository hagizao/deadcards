import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { api, useData } from "../lib/data";
import { activeRoster, REGIONS, regionClass, teamOvr, teamTrend, useLabel } from "../lib/cards";
import { strings, useLocale, useT } from "../lib/i18n";
import { RegionBackdrop } from "../components/RegionBackdrop";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { usePointerTilt } from "../lib/tilt";
import type { EdlTeamSeries, Team } from "../lib/types";
import { TrendBadge } from "../components/TrendBadge";
import { Card } from "../components/Card";

import { Icon } from "../components/Icon";
import { easeOut, pageTitle, pill, slugName } from "../lib/ui";
import { EdlLogo } from "../components/EdlLogo";

const S = strings({
  pt: {
    title: "Elencos & cartas", hint: "Clique em um time para abrir o elenco e em uma carta para ver os detalhes",
    desc: "OVR decrescente", asc: "OVR crescente", collapseAll: "Recolher todos", showAll: "Exibir todos",
    medium: "Cartas médias", large: "Cartas grandes", all: (n: number) => `Todas (${n})`, noTeams: "Nenhum time nesta região",
    count: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"} no elenco oficial`, emptyRoster: "Nenhum jogador cadastrado neste elenco ainda.",
    seriesTitle: "Séries no EDL", seriesHint: "Últimas séries do time no edl.gg", win: "Vitória", loss: "Derrota", vs: "contra", gameWon: "jogo ganho", gameLost: "jogo perdido",
  },
  en: {
    title: "Rosters & cards", hint: "Click a team to open its roster and a card to see its details",
    desc: "OVR descending", asc: "OVR ascending", collapseAll: "Collapse all", showAll: "Show all",
    medium: "Medium cards", large: "Large cards", all: (n: number) => `All (${n})`, noTeams: "No teams in this region",
    count: (n: number) => `${n} ${n === 1 ? "player" : "players"} on the official roster`, emptyRoster: "No players registered on this roster yet.",
    seriesTitle: "Series on EDL", seriesHint: "Latest series for this team on edl.gg", win: "Win", loss: "Loss", vs: "against", gameWon: "game won", gameLost: "game lost",
  },
  es: {
    title: "Rosters y cartas", hint: "Haz clic en un equipo para abrir su roster y en una carta para ver los detalles",
    desc: "OVR descendente", asc: "OVR ascendente", collapseAll: "Contraer todos", showAll: "Mostrar todos",
    medium: "Cartas medianas", large: "Cartas grandes", all: (n: number) => `Todas (${n})`, noTeams: "Ningún equipo en esta región",
    count: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"} en el roster oficial`, emptyRoster: "Aún no hay jugadores registrados en este roster.",
    seriesTitle: "Series en EDL", seriesHint: "Últimas series del equipo en edl.gg", win: "Victoria", loss: "Derrota", vs: "contra", gameWon: "juego ganado", gameLost: "juego perdido",
  },
});

export function Teams({ focusTeamId, onOpenCard }: { focusTeamId?: string; onOpenCard: (id: string) => void }) {
  const { teams, players } = useData();
  const t = useT(S);
  const label = useLabel();
  const [region, setRegion] = useState("ALL");
  const [desc, setDesc] = useState(true);
  const [size, setSize] = useState<"team" | "medium">("team");
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
      <div className="noir-glass space-y-4 rounded-2xl p-5 sm:p-7">
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

      {visible.length === 0 && <div className="noir-glass rounded-2xl p-10 text-center text-sm text-zinc-300">{t.noTeams}</div>}

      {visible.map(({ team, o }) => {
        const roster = activeRoster(players, team.id);
        const isOpen = !!open[team.id];
        return (
          <motion.div
            layout
            key={team.id}
            id={`team-card-${team.id}`}
            style={{ scrollMarginTop: "6.5rem" }}
            className={`noir-glass team-region-card ${regionClass(team.region)} rounded-2xl p-4 sm:p-6`}
          >
            <RegionBackdrop region={team.region} />
            <TeamHeader team={team} open={isOpen} onClick={() => setOpen((s) => ({ ...s, [team.id]: !s[team.id] }))}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="team-title-text font-display text-xl/tight font-extrabold tracking-wider text-dl-text uppercase transition-[color,text-shadow] duration-200 sm:text-2xl/tight">{team.name}</h2>
                  <span className="team-ovr-chip">
                    <span className="team-ovr-num">{o.count ? o.rounded : "--"}</span>
                    <span className="team-ovr-lbl">OVR</span>
                  </span>
                  <TrendBadge delta={teamTrend(players, team.id)} size="editor" />
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
                  {team.edlSlug && <TeamSeries teamId={team.id} />}
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

const LAST_SERIES = 6;

// Últimas séries do time no EDL; sem série (ou sem resposta) a seção some.
function TeamSeries({ teamId }: { teamId: string }) {
  const t = useT(S);
  const locale = useLocale();
  const [list, setList] = useState<EdlTeamSeries[]>([]);
  useEffect(() => {
    let alive = true;
    api.teamSeries(teamId).then((r) => alive && setList(r)).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [teamId]);
  const recent = [...list].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0)).slice(0, LAST_SERIES);
  if (!recent.length) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} aria-labelledby={`series-${teamId}`} className="mt-6 border-t border-zinc-200/15 pt-5">
      <h3 id={`series-${teamId}`} className="font-display text-sm font-extrabold tracking-[0.14em] text-dl-text uppercase">{t.seriesTitle}</h3>
      <p className="mt-0.5 text-xs text-zinc-400">{t.seriesHint}</p>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {recent.map((s) => (
          <li key={`${s.event}/${s.series}`} className="flex items-center gap-3 rounded-xl border border-zinc-200/10 bg-black/25 p-2.5 sm:p-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${s.won ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>
              <span aria-hidden="true">{s.won ? "V" : "D"}</span>
              <span className="sr-only">{s.won ? t.win : t.loss}</span>
            </span>
            <EdlLogo url={s.opponent.logoUrl} tag={s.opponent.tag} name={s.opponent.name} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-zinc-100"><span className="sr-only">{t.vs} </span>{s.opponent.name}{s.opponent.tag && <span className="font-normal text-zinc-400"> ({s.opponent.tag})</span>}</p>
              <p className="truncate text-xs text-zinc-400">{slugName(s.event)}{s.startTime && ` · ${new Date(s.startTime * 1000).toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "")}`}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-display text-lg/none font-extrabold tabular-nums ${s.won ? "text-emerald-300" : "text-red-300"}`}>{s.score[0]}–{s.score[1]}</p>
              <p className="mt-1 flex justify-end gap-0.5" aria-hidden="true">
                {[...s.games].sort((a, b) => a.game - b.game).map((g) => <span key={g.matchId} title={g.won ? t.gameWon : t.gameLost} className={`h-1 w-3 rounded-full ${g.won ? "bg-emerald-400" : "bg-red-400/80"}`} />)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
