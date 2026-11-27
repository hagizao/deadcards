import { motion } from "motion/react";
import { useState, type CSSProperties } from "react";
import { useData } from "../lib/data";
import { getPlayerOvr, getPlayerTrend, isMainCard, isRosterCard, REGIONS, regionClass, teamOf, teamOvr, teamTrend, tierKeyForOvr, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { getCardTier, rarityStyleVars } from "../lib/rarity";
import { RegionBackdrop } from "../components/RegionBackdrop";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { Icon } from "../components/Icon";
import { field, pageTitle, pill } from "../lib/ui";

const S = strings({
  pt: {
    players: "Jogadores", teams: "Times", region: "Região", allRegions: "Todas as regiões", search: "Buscar", placeholder: "Buscar…",
    rankedPlayers: (n: number) => `${n} ${n === 1 ? "jogador classificado" : "jogadores classificados"}`, rankedTeams: (n: number) => `${n} ${n === 1 ? "time classificado" : "times classificados"}`,
    nobody: (min: number, max: number) => `Ninguém nesta faixa (${min}–${max} OVR)`, count: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"}`,
  },
  en: {
    players: "Players", teams: "Teams", region: "Region", allRegions: "All regions", search: "Search", placeholder: "Search…",
    rankedPlayers: (n: number) => `${n} ranked ${n === 1 ? "player" : "players"}`, rankedTeams: (n: number) => `${n} ranked ${n === 1 ? "team" : "teams"}`,
    nobody: (min: number, max: number) => `Nobody in this range (${min}–${max} OVR)`, count: (n: number) => `${n} ${n === 1 ? "player" : "players"}`,
  },
  es: {
    players: "Jugadores", teams: "Equipos", region: "Región", allRegions: "Todas las regiones", search: "Buscar", placeholder: "Buscar…",
    rankedPlayers: (n: number) => `${n} ${n === 1 ? "jugador clasificado" : "jugadores clasificados"}`, rankedTeams: (n: number) => `${n} ${n === 1 ? "equipo clasificado" : "equipos clasificados"}`,
    nobody: (min: number, max: number) => `Nadie en este rango (${min}–${max} OVR)`, count: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"}`,
  },
});

export function TierList({ onOpenCard, onOpenTeam }: { onOpenCard: (id: string) => void; onOpenTeam: (id: string) => void }) {
  const { teams, players, settings, heroArt } = useData();
  const cfg = settings.tierConfig!;
  const tr = useT(S);
  const label = useLabel();
  const [mode, setMode] = useState<"players" | "teams">("players");
  const [region, setRegion] = useState("ALL");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const rankedPlayers = players
    .map((p) => ({ p, team: teamOf(teams, p), ovr: getPlayerOvr(p) }))
    .filter(({ p, team }) => {
      if (!isRosterCard(players, p)) return false;
      if (!isMainCard(p) && region === "ALL") return false;
      if (region !== "ALL" && team.region !== region) return false;
      return !query || `${p.name} ${team.name} ${team.tag} ${p.hero} ${p.position}`.toLowerCase().includes(query);
    })
    .sort((a, b) => b.ovr - a.ovr || b.p.stats.MIR - a.p.stats.MIR);

  const rankedTeams = teams
    .map((t) => ({ t, ...teamOvr(players, t.id), delta: teamTrend(players, t.id) }))
    .filter(({ t }) => (region === "ALL" || t.region === region) && (!query || `${t.name} ${t.tag} ${t.region} ${label(t.region)}`.toLowerCase().includes(query)))
    .sort((a, b) => b.exact - a.exact || a.t.name.localeCompare(b.t.name));

  return (
    <section className="space-y-5">
      <div className="noir-glass flex flex-col justify-between gap-4 rounded-2xl p-5 sm:p-7 lg:flex-row lg:items-center">
        <div>
          <h1 className={pageTitle}>Tier List</h1>
          <p className="mt-1.5 text-xs text-zinc-400">{mode === "players" ? tr.rankedPlayers(rankedPlayers.length) : tr.rankedTeams(rankedTeams.length)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={pill(mode === "players")} onClick={() => setMode("players")}>{tr.players}</button>
          <button type="button" className={pill(mode === "teams")} onClick={() => setMode("teams")}>{tr.teams}</button>
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label={tr.region} className={field}>
            <option value="ALL">{tr.allRegions}</option>
            {REGIONS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.placeholder} aria-label={tr.search} className={`${field} w-40`} />
        </div>
      </div>

      <div className="tierlist-board overflow-hidden rounded-xl">
        {cfg.map((tier) => {
          const pItems = mode === "players" ? rankedPlayers.filter((x) => tierKeyForOvr(x.ovr, cfg) === tier.key) : [];
          const tItems = mode === "teams" ? rankedTeams.filter((x) => (x.count ? tierKeyForOvr(x.rounded, cfg) : cfg[cfg.length - 1].key) === tier.key) : [];
          const empty = mode === "players" ? !pItems.length : !tItems.length;
          return (
            <div key={tier.key} className="tierlist-row">
              <div className="tierlist-label-cell px-2 py-3" style={{ backgroundColor: tier.bg, color: tier.text }}>
                <span className="text-2xl leading-none font-semibold tracking-wide sm:text-[26px]">{tier.key}</span>
                <span className="mt-1 text-xs font-bold tracking-wider tabular-nums opacity-75">{tier.min}–{tier.max}</span>
              </div>
              <div className="tierlist-content-cell">
                {empty && <span className="px-2 text-xs text-zinc-500">{tr.nobody(tier.min, tier.max)}</span>}
                {pItems.map(({ p, team, ovr }, i) => {
                  const art = heroArt(p.hero);
                  const delta = getPlayerTrend(p);
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenCard(p.id)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: Math.min(i, 10) * 0.02 }}
                      whileHover={{ y: -3 }}
                      className="rk-tier-item relative h-[112px] w-[92px] cursor-pointer overflow-hidden rounded-lg text-left"
                      style={rarityStyleVars(getCardTier(p, cfg)) as CSSProperties}
                      title={`${p.name} · ${team.name}`}
                    >
                      {art && <img src={art.url} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${art.x}% ${art.y}%` }} />}
                      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent" />
                      <span className="card-txt-shadow absolute top-1 left-1.5 text-lg font-black text-white tabular-nums">{ovr}</span>
                      {delta !== 0 && <span className={`absolute top-1.5 right-1.5 flex items-center text-[11px] font-extrabold tabular-nums ${delta > 0 ? "text-emerald-300" : "text-red-300"}`}><Icon name={delta > 0 ? "arrow-up" : "arrow-down"} className="size-3" />{Math.abs(delta)}</span>}
                      <span className="card-txt-shadow absolute inset-x-1.5 bottom-1.5 line-clamp-2 text-[11px]/tight font-extrabold tracking-wider text-white uppercase">{p.name}</span>
                    </motion.button>
                  );
                })}
                {tItems.map(({ t, rounded, count, delta }) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTeam(t.id)}
                    className={`team-region-card ${regionClass(t.region)} relative flex w-64 cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border border-zinc-200/20 bg-zinc-950 p-2.5 text-left transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100`}
                  >
                    <RegionBackdrop region={t.region} />
                    <div className="relative z-10 flex w-12 shrink-0 flex-col items-center rounded-md border border-white bg-zinc-100 py-1.5 text-zinc-950 shadow-sm">
                      <span className="text-xl leading-none font-black tabular-nums">{count ? rounded : "--"}</span>
                      <span className="mt-0.5 text-[11px] font-extrabold tracking-widest uppercase opacity-80">OVR</span>
                    </div>
                    <div className="relative z-10 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo3D team={t} className="size-5" radius={4} />
                        <span className="truncate text-sm font-extrabold tracking-wider text-white uppercase">{t.name}</span>
                        {delta > 0 && <span className="flex items-center text-[11px] font-extrabold text-emerald-300 tabular-nums"><Icon name="arrow-up" className="size-3" />{delta}</span>}
                        {delta < 0 && <span className="flex items-center text-[11px] font-extrabold text-red-300 tabular-nums"><Icon name="arrow-down" className="size-3" />{-delta}</span>}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{label(t.region)} · {tr.count(count)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
