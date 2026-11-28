import { useId, useLayoutEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { getPlayerOvr, isAltHero, isMainCard, isRetired, teamOf } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import type { Player } from "../lib/types";
import { field } from "../lib/ui";

const S = strings({
  pt: { search: "Buscar jogador ou time…", selectPlayer: "Selecione um jogador", selectHero: "Selecione o herói", signature: "Assinatura", version: (tag: string) => `Versão ${tag}`, none: "Nenhum jogador encontrado.", otherHero: "Herói jogado", special: "Versão especial" },
  en: { search: "Search player or team…", selectPlayer: "Select a player", selectHero: "Select the hero", signature: "Signature", version: (tag: string) => `${tag} version`, none: "No player found.", otherHero: "Other hero", special: "Special version" },
  es: { search: "Buscar jugador o equipo…", selectPlayer: "Selecciona un jugador", selectHero: "Selecciona el héroe", signature: "Insignia", version: (tag: string) => `Versión ${tag}`, none: "No se encontró ningún jugador.", otherHero: "Héroe jugado", special: "Versión especial" },
});

/** Carta principal de quem é esta carta (a própria, se já for a principal). */
const mainIdOf = (p: Player) => p.variantOf || p.id;

/**
 * Dois passos: o jogador (cartas principais, agrupadas por time com o nome do time abrindo cada grupo)
 * e depois o herói, entre as cartas desse jogador. Escolher o jogador já mostra a carta de assinatura.
 */
export function Picker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const t = useT(S);
  const { players, teams } = useData();
  const [query, setQuery] = useState("");
  const id = useId();
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const current = players.find((p) => p.id === value);
  const mainId = current ? mainIdOf(current) : "";
  const mains = players.filter((p) => isMainCard(p) && !isRetired(p));
  const matches = mains.filter((p) => p.id === mainId || normalize(`${p.name} ${teamOf(teams, p).name} ${teamOf(teams, p).tag}`).includes(normalize(query)));
  // um grupo por time, em ordem alfabética; dentro dele, do maior OVR para o menor
  const byTeam = new Map<string, Player[]>();
  for (const p of matches) {
    const team = teamOf(teams, p).name;
    byTeam.set(team, [...(byTeam.get(team) ?? []), p]);
  }
  const groups = [...byTeam]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, list]) => [team, list.sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name))] as const);
  const versions = mainId
    ? players.filter((p) => mainIdOf(p) === mainId && (!isRetired(p) || p.id === value)).sort((a, b) => Number(!isMainCard(a)) - Number(!isMainCard(b)) || a.hero.localeCompare(b.hero))
    : [];
  const kind = (p: Player) => (isMainCard(p) ? t.signature : isAltHero(p) ? t.otherHero : p.special ? p.specialText || t.special : t.version(teamOf(teams, p).tag));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="text-xs font-bold tracking-widest text-zinc-400 uppercase" htmlFor={id}>{label}</label>
      <input id={id} type="search" className={`${field} w-full min-w-0`} placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className={`${field} w-full min-w-0`} aria-label={`${label}: ${t.selectPlayer}`} value={mainId} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.selectPlayer}</option>
        {groups.map(([team, list]) => (
          <optgroup key={team} label={team}>
            {list.map((p) => <option key={p.id} value={p.id}>{p.name} · {getPlayerOvr(p)}</option>)}
          </optgroup>
        ))}
      </select>
      <select className={`${field} w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-50`} aria-label={`${label}: ${t.selectHero}`} value={current ? value : ""} disabled={!versions.length} onChange={(e) => onChange(e.target.value)}>
        {!versions.length && <option value="">{t.selectHero}</option>}
        {versions.map((p) => <option key={p.id} value={p.id}>{p.hero} · {getPlayerOvr(p)} · {kind(p)}</option>)}
      </select>
      {!matches.length && <p className="text-xs text-zinc-400" role="status">{t.none}</p>}
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

