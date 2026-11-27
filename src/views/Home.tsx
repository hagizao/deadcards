import { motion } from "motion/react";
import type { CSSProperties } from "react";
import type { Player, Team } from "../lib/types";
import { useData } from "../lib/data";
import { getPlayerOvr, isMainCard, regionClass, teamOvr, tierKeyForOvr, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { Card } from "../components/Card";
import { RegionBackdrop } from "../components/RegionBackdrop";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { usePointerTilt } from "../lib/tilt";
import { Icon } from "../components/Icon";
import { easeOut, pageTitle, pill } from "../lib/ui";

export type Area = "teams" | "tierlist" | "collection" | "compare" | "redeem";

const S = strings({
  pt: {
    featured: "Cartas em destaque", picked: "Escolhidas pela equipe", top: "As maiores OVR",
    explore: "Explore", ranking: "Ranking dos times", allTeams: (n: number) => `Ver os ${n} times`,
    none: "Nenhum time cadastrado ainda.", players: (n: number) => `${n} ${n === 1 ? "jogador" : "jogadores"}`,
    areas: {
      teams: ["Times", "Elencos, regiões e o OVR de cada time"],
      tierlist: ["Tier List", "Quem está no topo, do SS ao D"],
      collection: ["Coleção", "Todas as cartas, com busca e ordenação"],
      compare: ["Comparar", "Duas cartas lado a lado, atributo por atributo"],
      redeem: ["Resgatar", "Tem um código? Resgate sua carta"],
    },
    meta: { teams: (n: number) => `${n} times`, tierlist: (n: number) => `${n} tiers`, collection: (n: number) => `${n} cartas`, compare: () => "1 contra 1", redeem: () => "Precisa entrar" },
  },
  en: {
    featured: "Featured cards", picked: "Picked by the team", top: "Highest OVR",
    explore: "Explore", ranking: "Team ranking", allTeams: (n: number) => `See all ${n} teams`,
    none: "No teams registered yet.", players: (n: number) => `${n} ${n === 1 ? "player" : "players"}`,
    areas: {
      teams: ["Teams", "Rosters, regions and each team's OVR"],
      tierlist: ["Tier List", "Who's on top, from SS to D"],
      collection: ["Collection", "Every card, with search and sorting"],
      compare: ["Compare", "Two cards side by side, stat by stat"],
      redeem: ["Redeem", "Got a code? Redeem your card"],
    },
    meta: { teams: (n: number) => `${n} teams`, tierlist: (n: number) => `${n} tiers`, collection: (n: number) => `${n} cards`, compare: () => "1 vs 1", redeem: () => "Sign-in needed" },
  },
  es: {
    featured: "Cartas destacadas", picked: "Elegidas por el equipo", top: "Los OVR más altos",
    explore: "Explora", ranking: "Ranking de equipos", allTeams: (n: number) => `Ver los ${n} equipos`,
    none: "Aún no hay equipos registrados.", players: (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"}`,
    areas: {
      teams: ["Equipos", "Plantillas, regiones y el OVR de cada equipo"],
      tierlist: ["Tier List", "Quién está arriba, de SS a D"],
      collection: ["Colección", "Todas las cartas, con búsqueda y orden"],
      compare: ["Comparar", "Dos cartas lado a lado, atributo por atributo"],
      redeem: ["Canjear", "¿Tienes un código? Canjea tu carta"],
    },
    meta: { teams: (n: number) => `${n} equipos`, tierlist: (n: number) => `${n} tiers`, collection: (n: number) => `${n} cartas`, compare: () => "1 contra 1", redeem: () => "Hay que iniciar sesión" },
  },
});

const AREAS: Area[] = ["teams", "tierlist", "collection", "compare", "redeem"];
const FEATURED = 5;
const RANKING = 4;

// no leque (xl) a primeira escolhida fica no centro e as seguintes alternam esquerda/direita: 0 → 0, 1 → -1, 2 → 1, 3 → -2, 4 → 2
const fanOffset = (i: number) => (i % 2 ? -(i + 1) / 2 : i / 2);

export function Home({ onOpenTeam, onOpenCard, onNavigate }: { onOpenTeam: (teamId: string) => void; onOpenCard: (id: string) => void; onNavigate: (area: Area) => void }) {
  const { teams, players, settings, me } = useData();
  const t = useT(S);
  const label = useLabel();

  const picked = (settings.homeFeatured ?? []).flatMap((id) => players.find((p) => p.id === id) ?? []);
  const featured = picked.length
    ? picked
    : players.filter(isMainCard).sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a)).slice(0, FEATURED);

  const ranked = teams
    .map((team) => ({ team, ...teamOvr(players, team.id) }))
    .sort((a, b) => b.exact - a.exact || a.team.name.localeCompare(b.team.name));

  const meta: Record<Area, string | null> = {
    teams: t.meta.teams(teams.length),
    tierlist: t.meta.tierlist(settings.tierConfig?.length ?? 0),
    collection: t.meta.collection(players.length),
    compare: t.meta.compare(),
    redeem: me ? null : t.meta.redeem(),
  };

  return (
    <div className="flex flex-col gap-10">
      {featured.length > 0 && (
        <section className="noir-glass relative flex flex-col gap-6 overflow-hidden rounded-3xl py-5 sm:py-8" aria-labelledby="home-featured">
          {settings.homeHero && <img src={settings.homeHero} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-20" />}
          <div className="relative flex flex-col gap-1 px-5 sm:px-8">
            <span className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase">{picked.length ? t.picked : t.top}</span>
            <h1 id="home-featured" className={pageTitle}>{t.featured}</h1>
          </div>
          <Fan cards={featured} onOpenCard={onOpenCard} />
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="home-explore">
        <h2 id="home-explore" className={sectionTitle}>{t.explore}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {AREAS.map((a) => <AreaTile key={a} title={t.areas[a][0]} text={t.areas[a][1]} meta={meta[a]} onClick={() => onNavigate(a)} />)}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="home-ranking">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-ranking" className={sectionTitle}>{t.ranking}</h2>
          {ranked.length > RANKING && <button type="button" className={pill(false)} onClick={() => onNavigate("teams")}>{t.allTeams(ranked.length)}</button>}
        </div>
        {ranked.length === 0 && <div className="noir-glass rounded-2xl p-6 text-sm text-zinc-300">{t.none}</div>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ranked.slice(0, RANKING).map((r, idx) => (
            <TeamRow
              key={r.team.id}
              r={r}
              idx={idx}
              tier={r.count ? settings.tierConfig!.find((x) => x.key === tierKeyForOvr(r.rounded, settings.tierConfig!)) : undefined}
              meta={`${r.team.tag} · ${label(r.team.region)} · ${t.players(r.count)}`}
              onOpen={() => onOpenTeam(r.team.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

const sectionTitle = "font-display text-xl font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-2xl";

function Fan({ cards, onOpenCard }: { cards: Player[]; onOpenCard: (id: string) => void }) {
  return (
    <div className="relative flex snap-x snap-mandatory items-center justify-center-safe gap-2 overflow-x-auto overflow-y-hidden px-5 py-8 sm:px-8 xl:items-end xl:gap-0 xl:overflow-visible xl:px-4">
      {cards.map((p, i) => {
        const k = fanOffset(i);
        return (
          <div key={p.id} className="shrink-0 snap-center xl:order-(--fo) xl:translate-y-(--fy) xl:rotate-(--fr)" style={{ "--fo": k, "--fr": `${k * 3}deg`, "--fy": `${Math.abs(k) * 12}px` } as CSSProperties}>
            <Card player={p} variant={k === 0 ? "team" : "medium"} onOpen={() => onOpenCard(p.id)} />
          </div>
        );
      })}
    </div>
  );
}

function AreaTile({ title, text, meta, onClick }: { title: string; text: string; meta: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="noir-glass flex min-h-11 cursor-pointer items-center gap-4 rounded-2xl p-5 text-left transition-colors hover:border-zinc-200/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-lg tracking-[0.11em] text-dl-text uppercase">{title}</span>
        <span className="text-sm text-zinc-300">{text}</span>
        {meta && <span className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase">{meta}</span>}
      </span>
      <Icon name="chevron-right" className="size-5 text-zinc-400" />
    </button>
  );
}

function TeamRow({ r, idx, tier, meta, onOpen }: {
  r: { team: Team; rounded: number; count: number };
  idx: number;
  tier?: { key: string; bg: string; text: string };
  meta: string;
  onOpen: () => void;
}) {
  const { rotateX, rotateY, ...tiltHandlers } = usePointerTilt();

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      {...tiltHandlers}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(idx, 8) * 0.05, duration: 0.25, ease: easeOut }}
      whileHover="hover"
      variants={{ hover: { y: -2 } }}
      className={`home-team-box noir-glass team-region-card ${regionClass(r.team.region)} relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-100 sm:gap-5 sm:px-5`}
    >
      <RegionBackdrop region={r.team.region} />
      <span className="relative z-10 w-9 shrink-0 text-center text-xl font-black text-zinc-300 tabular-nums sm:text-2xl">#{idx + 1}</span>
      <TeamLogo3D team={r.team} className="size-14 sm:size-16" radius={12} tilt={{ rotateX, rotateY }} />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="line-clamp-2 font-display text-base/tight font-extrabold tracking-wider text-balance text-dl-text uppercase sm:text-xl/tight">{r.team.name}</div>
        <div className="mt-1 text-[11px] font-bold tracking-wider text-zinc-300 uppercase">{meta}</div>
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-center gap-1">
        <div className="team-ovr-chip team-ovr-chip--stack">
          <span className="team-ovr-num">{r.count ? r.rounded : "--"}</span>
          <span className="team-ovr-lbl">OVR</span>
        </div>
        {tier && <span className="rounded-md border border-black/25 px-2 py-0.5 text-xs font-black" style={{ background: tier.bg, color: tier.text }}>{tier.key}</span>}
      </div>
    </motion.button>
  );
}
