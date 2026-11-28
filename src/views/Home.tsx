import { motion } from "motion/react";
import type { Team } from "../lib/types";
import { useData } from "../lib/data";
import { getPlayerOvr, isMainCard, regionAccentClass, teamOvr, tierKeyForOvr, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { TeamLogo3D } from "../components/TeamLogo3D";
import { usePointerTilt } from "../lib/tilt";
import { Icon, type IconName } from "../components/Icon";
import { easeOut, pill, sectionTitle } from "../lib/ui";
import { cascade, enter } from "../lib/motion";
import type { Tier } from "../lib/rarity";
import { areaStyle, areaTier } from "../lib/areas";
import { Reveal } from "../components/Motion";
import { Stage } from "./home/Stage";
import { Calendar } from "./home/Calendar";
import { Welcome } from "./home/Welcome";
import { CardGuide } from "./home/CardGuide";
import { Roles } from "./home/Roles";
import { NewCards } from "./home/NewCards";

export type Area = "teams" | "tierlist" | "collection" | "compare" | "redeem";

const S = strings({
  pt: {
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
const AREA_ICON: Record<Area, IconName> = { teams: "shield", tierlist: "bars", collection: "cards", compare: "versus", redeem: "ticket" };
const FEATURED = 5;
const RANKING = 4;

export function Home({ onOpenTeam, onOpenCard, onNavigate }: { onOpenTeam: (teamId: string) => void; onOpenCard: (id: string) => void; onNavigate: (area: Area) => void }) {
  const { teams, players, settings, me } = useData();
  const t = useT(S);
  const label = useLabel();

  const picked = (settings.homeFeatured ?? []).flatMap((id) => players.find((p) => p.id === id) ?? []);
  const featured = picked.length
    ? picked
    : players.filter(isMainCard).sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a)).slice(0, FEATURED);

  const guide = players.find((p) => p.id === settings.homeGuide) ?? featured[0];

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
    <div className="home-type flex flex-col gap-14">
      {/* cada seção usa a cor da área com que conversa (lib/areas.ts); "contents" não muda o layout, só passa a cor */}
      <div className="contents" style={areaStyle("teams")}><Stage cards={featured} onOpenCard={onOpenCard} onOpenTeam={onOpenTeam} /></div>
      <div className="contents" style={areaStyle("teams")}><Calendar /></div>
      <div className="contents" style={areaStyle("redeem")}><Welcome onNavigate={onNavigate} /></div>
      {guide && <div className="contents" style={areaStyle("collection")}><CardGuide sample={guide} /></div>}
      <div className="contents" style={areaStyle("tierlist")}><Roles onOpenCard={onOpenCard} /></div>
      <div className="contents" style={areaStyle("compare")}><NewCards onOpenCard={onOpenCard} /></div>


      <section className="flex flex-col gap-4" aria-labelledby="home-ranking" style={areaStyle("teams")}>
        <Reveal className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-ranking" className={`${sectionTitle} deco-podium`}>{t.ranking}</h2>
          {ranked.length > RANKING && <button type="button" className={pill(false)} onClick={() => onNavigate("teams")}>{t.allTeams(ranked.length)}</button>}
        </Reveal>
        {ranked.length === 0 && <div className="py-6 text-sm text-zinc-300">{t.none}</div>}
        {/* sem caixas: linhas separadas por divisória fina, como no Explore; a cor da região fica no traço sob o número */}
        <div className="grid grid-cols-1 divide-y divide-zinc-200/10 lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0 lg:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-zinc-200/10">
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

      <section className="flex flex-col gap-4" aria-labelledby="home-explore">
        <Reveal><h2 id="home-explore" className={`${sectionTitle} deco-gem`}>{t.explore}</h2></Reveal>
        {/* sem caixas: as áreas são colunas separadas por um traço, como em "Quem faz o quê" */}
        <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
          {AREAS.map((a, i) => (
            <motion.li key={a} className="flex border-l border-zinc-200/15 pl-2" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...enter, delay: cascade(i, 0.06) }}>
              <AreaTile icon={AREA_ICON[a]} tier={areaTier(a)} title={t.areas[a][0]} text={t.areas[a][1]} meta={meta[a]} onClick={() => onNavigate(a)} />
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}


/** Atalho do Explore: ícone e nome na cor da raridade, para que serve e um número. Só acende um fundo no hover. */
function AreaTile({ icon, tier, title, text, meta, onClick }: { icon: IconName; tier: Tier; title: string; text: string; meta: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-1 cursor-pointer flex-col items-start gap-2 rounded-xl p-2 text-left transition-colors hover:bg-zinc-100/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/10"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span aria-hidden="true" style={{ color: tier.c, filter: `drop-shadow(0 0 ${3 + tier.lvl * 2}px ${tier.c})` }}><Icon name={icon} className="size-6" /></span>
        <Icon name="chevron-right" className="size-5 text-zinc-500 transition-[translate,color] duration-200 group-hover:translate-x-1 group-hover:text-zinc-200" />
      </span>
      <span className="font-display text-lg tracking-[0.11em] whitespace-nowrap uppercase title-depth" style={{ color: tier.c }}>{title}</span>
      <span className="text-sm text-pretty text-zinc-300">{text}</span>
      {meta && <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{meta}</span>}
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
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: Math.min(idx, 8) * 0.05, duration: 0.25, ease: easeOut }}
      whileHover="hover"
      variants={{ hover: { y: -2 } }}
      className={`${regionAccentClass(r.team.region)} flex min-h-28 cursor-pointer items-center gap-4 rounded-xl p-4 text-left transition-colors hover:bg-zinc-100/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/10 sm:gap-5 sm:px-5`}
    >
      <span className="w-9 shrink-0 border-b-2 border-(--team-accent) pb-0.5 text-center text-xl font-black text-zinc-300 tabular-nums sm:text-2xl">#{idx + 1}</span>
      <TeamLogo3D team={r.team} className="size-14 sm:size-16" radius={12} tilt={{ rotateX, rotateY }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="line-clamp-2 font-display text-base/tight font-extrabold tracking-wider text-balance text-dl-text uppercase sm:text-xl/tight">{r.team.name}</div>
        <div className="text-[14px] font-bold tracking-wider text-zinc-300 uppercase">{meta}</div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="team-ovr-chip team-ovr-chip--stack">
          <span className="team-ovr-num">{r.count ? r.rounded : "--"}</span>
          <span className="team-ovr-lbl">OVR</span>
        </div>
        {tier && <span className="rounded-md border border-black/25 px-2 py-0.5 text-xs font-black" style={{ background: tier.bg, color: tier.text }}>{tier.key}</span>}
      </div>
    </motion.button>
  );
}
