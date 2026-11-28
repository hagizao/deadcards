import { useEffect, useRef, useState } from "react";
import { Picker, ScaledCard } from "../components/CardPicker";
import { STAT_KEYS, getPlayerOvr, teamOf, useLabel } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { getCardTier } from "../lib/rarity";
import type { Stats } from "../lib/types";
import { pill } from "../lib/ui";

const S = strings({
  pt: {
    subtitle: "Escolha duas cartas e veja a diferença de OVR e de cada atributo.",
    player: (n: number) => `Jogador ${n}`,
    sides: ["Âmbar", "Safira"],
    empty: "Escolha uma carta para comparar",
    pick: "Escolher carta",
    change: "Trocar carta",
    picking: (side: string) => `Escolhendo a carta ${side}`,
    done: "Pronto",
    swap: "Trocar lados",
    attributes: "Atributos em confronto",
    attribute: "Atributo",
    caption: (a: string, b: string) => `Valores e diferenças entre ${a} e ${b}`,
    radar: (a: string, b: string) => `Radar de atributos: ${a} e ${b}`,
  },
  en: {
    subtitle: "Pick two cards and see the difference in OVR and each attribute.",
    player: (n: number) => `Player ${n}`,
    sides: ["Amber", "Sapphire"],
    empty: "Pick a card to compare",
    pick: "Pick a card",
    change: "Change card",
    picking: (side: string) => `Picking the ${side} card`,
    done: "Done",
    swap: "Swap sides",
    attributes: "Head to head",
    attribute: "Attribute",
    caption: (a: string, b: string) => `Values and differences between ${a} and ${b}`,
    radar: (a: string, b: string) => `Attribute radar: ${a} and ${b}`,
  },
  es: {
    subtitle: "Elige dos cartas y mira la diferencia de OVR y de cada atributo.",
    player: (n: number) => `Jugador ${n}`,
    sides: ["Ámbar", "Zafiro"],
    empty: "Elige una carta para comparar",
    pick: "Elegir carta",
    change: "Cambiar carta",
    picking: (side: string) => `Eligiendo la carta ${side}`,
    done: "Listo",
    swap: "Cambiar lados",
    attributes: "Atributos frente a frente",
    attribute: "Atributo",
    caption: (a: string, b: string) => `Valores y diferencias entre ${a} y ${b}`,
    radar: (a: string, b: string) => `Radar de atributos: ${a} y ${b}`,
  },
});

// os dois lados do confronto têm as cores dos dois times do jogo: Âmbar à esquerda, Safira à direita
const SERIES = [
  { shape: "fill-amber-hand/15 stroke-amber-hand", text: "text-amber-hand", mark: "━" },
  { shape: "fill-sapphire/15 stroke-sapphire", text: "text-sapphire", mark: "┄" },
] as const;
const SIDES = [
  { label: "deco-fan text-amber-hand", glow: "side-glow [--side:var(--color-amber-hand)]" },
  { label: "deco-flame text-sapphire", glow: "side-glow [--side:var(--color-sapphire)]" },
] as const;

export function Compare({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { players, teams, settings } = useData();
  const [ids, setIds] = useState(["", ""]);
  const selected = ids.map((id) => players.find((p) => p.id === id));
  const [left, right] = selected;
  // o seletor abre na largura toda, acima das cartas (nas duas colunas ele ficava espremido)
  const [picking, setPicking] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (picking === null) return;
    panel.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [picking]);

  return (
    <section className="space-y-6">
      <p className="text-xs text-zinc-400">{t.subtitle}</p>

      {picking !== null && (
        <div ref={panel} className="flex scroll-mt-24 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold tracking-widest text-area uppercase title-depth">{t.picking(t.sides[picking])}</h2>
            <button type="button" className={pill(true)} onClick={() => setPicking(null)}>{t.done}</button>
          </div>
          <Picker label={t.player(picking + 1)} value={ids[picking]} onChange={(id) => setIds(picking ? [ids[0], id] : [id, ids[1]])} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-8">
        {selected.map((p, i) => (
          <div key={i} className={`${SIDES[i].glow} relative isolate flex min-w-0 flex-col gap-4`}>
            <span className={`deco-title font-display text-lg font-extrabold tracking-[0.14em] uppercase title-depth sm:text-2xl ${SIDES[i].label}`}>{t.sides[i]}</span>
            <button type="button" aria-pressed={picking === i} className={`${pill(picking === i)} self-start`} onClick={() => setPicking(i)}>{p ? t.change : t.pick}</button>
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
              <div className="flex aspect-295/430 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200/15 p-4 text-center text-xs text-zinc-400">{t.empty}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => setIds([ids[1], ids[0]])} disabled={!ids[0] && !ids[1]}>⇄ {t.swap}</button>
      </div>

      {left && right && (
        <div className="grid gap-6 border-t border-zinc-200/15 pt-6 md:grid-cols-2">
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
