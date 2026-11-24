import { useId, useLayoutEffect, useRef, useState } from "react";
import { Card } from "../components/Card";
import { STAT_KEYS, getPlayerOvr, isAltHero, isMainCard, teamOf, useLabel } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { getCardTier } from "../lib/rarity";
import type { Player, Stats } from "../lib/types";
import { field, pageTitle, pill } from "../lib/ui";

const S = strings({
  pt: {
    title: "Comparar cartas",
    subtitle: "Escolha duas cartas e veja a diferença de OVR e de cada atributo.",
    player: (n: number) => `Jogador ${n}`,
    search: "Buscar nome, herói ou time…",
    select: "Selecione uma carta",
    none: "Nenhum jogador encontrado.",
    empty: "Escolha uma carta para comparar",
    main: "Principal",
    otherHero: "Herói jogado",
    special: "Versão especial",
    swap: "Trocar lados",
    attributes: "Atributos em confronto",
    attribute: "Atributo",
    caption: (a: string, b: string) => `Valores e diferenças entre ${a} e ${b}`,
    radar: (a: string, b: string) => `Radar de atributos: ${a} e ${b}`,
  },
  en: {
    title: "Compare cards",
    subtitle: "Pick two cards and see the difference in OVR and each attribute.",
    player: (n: number) => `Player ${n}`,
    search: "Search name, hero or team…",
    select: "Select a card",
    none: "No player found.",
    empty: "Pick a card to compare",
    main: "Main",
    otherHero: "Other hero",
    special: "Special version",
    swap: "Swap sides",
    attributes: "Head to head",
    attribute: "Attribute",
    caption: (a: string, b: string) => `Values and differences between ${a} and ${b}`,
    radar: (a: string, b: string) => `Attribute radar: ${a} and ${b}`,
  },
  es: {
    title: "Comparar cartas",
    subtitle: "Elige dos cartas y mira la diferencia de OVR y de cada atributo.",
    player: (n: number) => `Jugador ${n}`,
    search: "Buscar nombre, héroe o equipo…",
    select: "Selecciona una carta",
    none: "No se encontró ningún jugador.",
    empty: "Elige una carta para comparar",
    main: "Principal",
    otherHero: "Héroe jugado",
    special: "Versión especial",
    swap: "Cambiar lados",
    attributes: "Atributos frente a frente",
    attribute: "Atributo",
    caption: (a: string, b: string) => `Valores y diferencias entre ${a} y ${b}`,
    radar: (a: string, b: string) => `Radar de atributos: ${a} y ${b}`,
  },
});

const SERIES = [
  { shape: "fill-cyan-300/15 stroke-cyan-300", text: "text-cyan-300", mark: "━" },
  { shape: "fill-amber-400/15 stroke-amber-400", text: "text-amber-400", mark: "┄" },
] as const;

export function Compare({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { players, teams, settings } = useData();
  const [ids, setIds] = useState(["", ""]);
  const selected = ids.map((id) => players.find((p) => p.id === id));
  const [left, right] = selected;

  return (
    <section className="space-y-6">
      <div className="noir-glass rounded-2xl p-5 sm:p-7">
        <h1 className={pageTitle}>{t.title}</h1>
        <p className="mt-1.5 text-xs text-zinc-400">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-8">
        {selected.map((p, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-4">
            <Picker label={t.player(i + 1)} value={ids[i]} onChange={(id) => setIds(i ? [ids[0], id] : [id, ids[1]])} />
            {p ? (
              <>
                <ScaledCard player={p} onOpen={() => onOpenCard(p.id)} />
                <div className="flex flex-col gap-1 text-center text-xs wrap-break-word text-zinc-400 sm:text-sm">
                  <p className="font-bold text-white">{p.name}</p>
                  <p>{teamOf(teams, p).name} · {label(p.position)}</p>
                  <p>{p.hero} · {getCardTier(p, settings.tierConfig!).name}</p>
                </div>
              </>
            ) : (
              <div className="flex aspect-295/430 items-center justify-center rounded-2xl bg-zinc-900/60 p-4 text-center text-xs text-zinc-400">{t.empty}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => setIds([ids[1], ids[0]])} disabled={!ids[0] && !ids[1]}>⇄ {t.swap}</button>
      </div>

      {left && right && (
        <div className="noir-glass grid gap-6 rounded-2xl p-5 sm:p-7 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <h2 className="text-sm font-extrabold tracking-widest text-zinc-100 uppercase">{t.attributes}</h2>
            <table className="w-full table-fixed text-center">
              <caption className="sr-only">{t.caption(left.name, right.name)}</caption>
              <thead className="text-xs text-zinc-400">
                <tr><th className="p-2 wrap-break-word">{left.name}</th><th className="p-2">{t.attribute}</th><th className="p-2 wrap-break-word">{right.name}</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/10">
                {(["OVR", ...STAT_KEYS] as const).map((k) => {
                  const a = k === "OVR" ? getPlayerOvr(left) : left.stats[k];
                  const b = k === "OVR" ? getPlayerOvr(right) : right.stats[k];
                  return (
                    <tr key={k}>
                      <Diff value={a} other={b} />
                      <th className="p-2 text-xs text-zinc-400">{k}</th>
                      <Diff value={b} other={a} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Radar label={t.radar(left.name, right.name)} series={[left, right]} />
        </div>
      )}
    </section>
  );
}

function Diff({ value, other }: { value: number; other: number }) {
  const color = value > other ? "text-emerald-300" : value < other ? "text-red-300" : "text-zinc-300";
  return (
    <td className={`p-2 text-base font-extrabold sm:text-lg ${color}`}>
      {value} <small className="text-xs">{value === other ? "=" : `${value > other ? "+" : "−"}${Math.abs(value - other)}`}</small>
    </td>
  );
}

function Picker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const t = useT(S);
  const { players, teams } = useData();
  const [query, setQuery] = useState("");
  const id = useId();
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matches = players.filter((p) => normalize(`${p.name} ${p.hero} ${teamOf(teams, p).name}`).includes(normalize(query)));
  const current = players.find((p) => p.id === value);
  const options = current && !matches.includes(current) ? [current, ...matches] : matches;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="text-xs font-bold tracking-widest text-zinc-400 uppercase" htmlFor={id}>{label}</label>
      <input id={id} type="search" className={`${field} w-full min-w-0`} placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className={`${field} w-full min-w-0`} aria-label={`${label}: ${t.select}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.select}</option>
        {options.map((p) => <option key={p.id} value={p.id}>{p.name} · {getPlayerOvr(p)} · {isMainCard(p) ? t.main : isAltHero(p) ? t.otherHero : p.specialText || t.special} · {p.hero} · {teamOf(teams, p).tag}</option>)}
      </select>
      {!matches.length && <p className="text-xs text-zinc-400" role="status">{t.none}</p>}
    </div>
  );
}

// Card tem tamanho fixo (295px); escala para caber duas lado a lado no celular.
function ScaledCard({ player, onOpen }: { player: Player; onOpen: () => void }) {
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

function Radar({ label, series }: { label: string; series: { name: string; stats: Stats }[] }) {
  const point = (i: number, value: number) => {
    const angle = i * Math.PI / 3 - Math.PI / 2;
    return [160 + Math.cos(angle) * value, 150 + Math.sin(angle) * value];
  };
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <svg viewBox="0 0 320 300" role="img" aria-label={label} className="mx-auto w-full max-w-96">
        {[25, 50, 75, 99].map((v) => <polygon key={v} points={STAT_KEYS.map((_, i) => point(i, v).join(",")).join(" ")} className="fill-none stroke-zinc-700" />)}
        {STAT_KEYS.map((k, i) => {
          const [x, y] = point(i, 124);
          const [endX, endY] = point(i, 99);
          return (
            <g key={k}>
              <line x1="160" y1="150" x2={endX} y2={endY} className="stroke-zinc-700" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-zinc-300">{k}</text>
            </g>
          );
        })}
        {series.map((s, i) => (
          <polygon key={i} points={STAT_KEYS.map((k, j) => point(j, s.stats[k]).join(",")).join(" ")} className={SERIES[i].shape} strokeWidth="2" strokeDasharray={i ? "5 3" : undefined}>
            <title>{s.name}: {STAT_KEYS.map((k) => `${k} ${s.stats[k]}`).join(", ")}</title>
          </polygon>
        ))}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-4 text-xs">
        {series.map((s, i) => <span key={i} className={SERIES[i].text}>{SERIES[i].mark} {s.name}</span>)}
      </figcaption>
    </figure>
  );
}
