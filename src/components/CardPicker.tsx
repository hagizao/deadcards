import { useId, useLayoutEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { RegionIcon } from "./RegionIcon";
import { RoleIcon } from "./RoleIcon";
import { TeamLogo } from "./TeamLogo";
import { POSITIONS, REGIONS, getPlayerOvr, isAltHero, isMainCard, isRetired, teamOf, useLabel } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { getCardTier } from "../lib/rarity";
import type { Player, Team } from "../lib/types";
import { field } from "../lib/ui";

const S = strings({
  pt: { search: "Buscar jogador, time ou herói…", players: "Jogadores", hero: "Herói", signature: "Assinatura", version: (tag: string) => `Versão ${tag}`, none: "Nenhum jogador encontrado.", special: "Especial", region: "Região", role: "Função" },
  en: { search: "Search player, team or hero…", players: "Players", hero: "Hero", signature: "Signature", version: (tag: string) => `${tag} version`, none: "No player found.", special: "Special", region: "Region", role: "Role" },
  es: { search: "Buscar jugador, equipo o héroe…", players: "Jugadores", hero: "Héroe", signature: "Insignia", version: (tag: string) => `Versión ${tag}`, none: "No se encontró ningún jugador.", special: "Especial", region: "Región", role: "Función" },
});

/** Carta principal de quem é esta carta (a própria, se já for a principal). */
const mainIdOf = (p: Player) => p.variantOf || p.id;
const regionOf = (team: Team) => team.region || "Europa";
// filtro ligado fica na cor da área (o roxo do título do Lab); clicar de novo desliga
const chip = "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-100/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/15 aria-pressed:bg-area/15 aria-pressed:text-area sm:min-h-9";
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Rosto do herói num círculo; sem ícone, as três primeiras letras. */
function HeroFace({ hero, className }: { hero: string; className: string }) {
  const { heroIcon } = useData();
  const icon = heroIcon(hero);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 ${className}`}>
      {icon ? <img src={icon} alt="" className="size-full scale-110 object-cover" /> : <span className="text-[10px] font-bold text-zinc-300">{hero.slice(0, 3)}</span>}
    </span>
  );
}

/**
 * Dois passos: o jogador (lista com busca, agrupada por time, com o rosto do herói e o OVR na cor da raridade)
 * e depois o herói, entre as versões desse jogador. Escolher o jogador já põe a carta de assinatura.
 */
export function Picker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const t = useT(S);
  const role = useLabel();
  const { players, teams, settings } = useData();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [position, setPosition] = useState("");
  const id = useId();
  const current = players.find((p) => p.id === value);
  const mainId = current ? mainIdOf(current) : "";
  const q = normalize(query.trim());
  const mains = players.filter((p) => isMainCard(p) && !isRetired(p));
  // só as regiões e funções que têm alguém, na ordem do site
  const regions = REGIONS.filter((r) => mains.some((p) => regionOf(teamOf(teams, p)) === r));
  const positions = POSITIONS.filter((r) => mains.some((p) => p.position === r));
  const matches = mains.filter((p) => {
    const team = teamOf(teams, p);
    if (region && regionOf(team) !== region) return false;
    if (position && p.position !== position) return false;
    return !q || normalize(`${p.name} ${team.name} ${team.tag} ${p.hero}`).includes(q);
  });
  // um grupo por time, em ordem alfabética; dentro dele, do maior OVR para o menor
  const byTeam = new Map<string, { team: Team; list: Player[] }>();
  for (const p of matches) {
    const team = teamOf(teams, p);
    const group = byTeam.get(team.id) ?? { team, list: [] };
    group.list.push(p);
    byTeam.set(team.id, group);
  }
  const groups = [...byTeam.values()]
    .sort((a, b) => a.team.name.localeCompare(b.team.name))
    .map((g) => ({ ...g, list: g.list.sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name)) }));
  const versions = mainId
    ? players.filter((p) => mainIdOf(p) === mainId && (!isRetired(p) || p.id === value)).sort((a, b) => Number(!isMainCard(a)) - Number(!isMainCard(b)) || a.hero.localeCompare(b.hero))
    : [];
  // herói jogado é só o rosto e o OVR; assinatura, especial e versão de outro time ganham legenda
  const caption = (p: Player) => (isMainCard(p) ? t.signature : isAltHero(p) ? null : p.special ? p.specialText || t.special : t.version(teamOf(teams, p).tag));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={id} className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{label}</label>
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-zinc-500">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input id={id} type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)}
          className={`${field} w-full min-w-0 pl-6`} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="group" aria-label={t.region} className="flex flex-wrap items-center gap-1">
          {regions.map((r) => (
            <button key={r} type="button" aria-pressed={region === r} className={chip} onClick={() => setRegion(region === r ? "" : r)}>
              <RegionIcon region={r} className="size-4" />{role(r)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t.role} className="flex flex-wrap items-center gap-1">
          {positions.map((r) => (
            <button key={r} type="button" aria-pressed={position === r} className={chip} onClick={() => setPosition(position === r ? "" : r)}>
              <RoleIcon position={r} className="size-4" />{role(r)}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label={t.players} className="max-h-120 overflow-y-auto overscroll-contain">
        {groups.map(({ team, list }) => (
          <div key={team.id} className="flex flex-col">
            <p className="flex items-center gap-3 px-2 pt-5 pb-2 text-[22px] font-bold tracking-widest text-area uppercase">
              <span className="size-10 shrink-0 overflow-hidden rounded-md"><TeamLogo team={team} /></span>
              <span className="truncate">{team.name}</span>
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-2 p-1">
              {list.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === mainId} onClick={() => onChange(p.id)}
                  className="flex min-h-16 min-w-0 cursor-pointer items-center gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-100/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/15 aria-pressed:bg-zinc-100/15 aria-pressed:ring-1 aria-pressed:ring-dl-text">
                  <HeroFace hero={p.hero} className="size-14 ring-1 ring-zinc-200/15" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-lg font-bold text-white">{p.name}</span>
                    <span className="truncate text-sm text-zinc-400">{role(p.position)} · {p.hero}</span>
                  </span>
                  <span className="font-display text-3xl font-black tabular-nums" style={{ color: getCardTier(p, settings.tierConfig!).c }}>{getPlayerOvr(p)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!matches.length && <p className="p-4 text-center text-xs text-zinc-400" role="status">{t.none}</p>}
      </div>

      {versions.length > 1 && (
        <div role="group" aria-label={t.hero} className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.hero}</span>
          <div className="flex flex-wrap gap-2">
            {versions.map((v) => {
              const on = v.id === value;
              const cap = caption(v);
              return (
                <button key={v.id} type="button" aria-pressed={on} onClick={() => onChange(v.id)} title={`${v.hero} · ${getPlayerOvr(v)}`}
                  aria-label={`${v.hero} · ${getPlayerOvr(v)}${cap ? ` · ${cap}` : ""}`}
                  className="group flex w-14 cursor-pointer flex-col items-center gap-1 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                  <HeroFace hero={v.hero} className={`size-12 transition group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none ${on ? "ring-2 ring-dl-text ring-offset-2 ring-offset-zinc-950" : "ring-1 ring-zinc-200/15"}`} />
                  <span className={`max-w-full truncate text-[10px] font-bold tracking-wider uppercase ${on ? "text-dl-text" : "text-zinc-400"}`}>{cap ?? getPlayerOvr(v)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Card tem tamanho fixo (295px); escala para caber duas lado a lado no celular.
export function ScaledCard({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(295);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(295, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="mx-auto w-full max-w-[295px]" style={{ height: width * 430 / 295 }}>
      <div className="w-[295px] origin-top-left" style={{ transform: `scale(${width / 295})` }}><Card player={player} onOpen={onOpen} /></div>
    </div>
  );
}

