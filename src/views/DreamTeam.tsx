import { useEffect, useRef, useState } from "react";
import { Picker, ScaledCard } from "../components/CardPicker";
import { ShareLinkButton } from "../components/ShareCardButton";
import { STAT_KEYS, getPlayerOvr, useLabel } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { SQUAD_MAX, SQUAD_NAME_MAX, squadName, squadPath } from "../lib/route";
import type { Player } from "../lib/types";
import { field, pill } from "../lib/ui";

const S = strings({
  pt: {
    subtitle: "Escolha 6 cartas, quaisquer que sejam, dê um nome ao elenco e compartilhe o link.",
    name: "Nome do elenco",
    placeholder: "Ex.: Melhor time dos EUA",
    fallback: "Elenco dos sonhos",
    share: "Compartilhar elenco",
    clear: "Limpar elenco",
    ovr: "OVR do elenco",
    count: (n: number) => `${n} de ${SQUAD_MAX} cartas`,
    averages: "Média dos atributos",
    slot: (n: number) => `Vaga ${n}`,
    pick: "Escolher carta",
    picking: (n: number) => `Escolhendo a vaga ${n}`,
    change: "Trocar",
    remove: "Tirar",
    done: "Pronto",
  },
  en: {
    subtitle: "Pick any 6 cards, name your squad and share the link.",
    name: "Squad name",
    placeholder: "E.g.: Best US team",
    fallback: "Dream team",
    share: "Share squad",
    clear: "Clear squad",
    ovr: "Squad OVR",
    count: (n: number) => `${n} of ${SQUAD_MAX} cards`,
    averages: "Average attributes",
    slot: (n: number) => `Slot ${n}`,
    pick: "Pick a card",
    picking: (n: number) => `Picking slot ${n}`,
    change: "Change",
    remove: "Remove",
    done: "Done",
  },
  es: {
    subtitle: "Elige 6 cartas cualesquiera, ponle nombre al equipo y comparte el enlace.",
    name: "Nombre del equipo",
    placeholder: "Ej.: Mejor equipo de EE. UU.",
    fallback: "Equipo soñado",
    share: "Compartir equipo",
    clear: "Vaciar equipo",
    ovr: "OVR del equipo",
    count: (n: number) => `${n} de ${SQUAD_MAX} cartas`,
    averages: "Promedio de atributos",
    slot: (n: number) => `Puesto ${n}`,
    pick: "Elegir carta",
    picking: (n: number) => `Eligiendo el puesto ${n}`,
    change: "Cambiar",
    remove: "Quitar",
    done: "Listo",
  },
});

const emptySlots = () => Array<string>(SQUAD_MAX).fill("");

/**
 * Elenco dos sonhos: 6 vagas livres, sem regra de função (4 carrys também vale, é o que gera debate).
 * O elenco vive no link (/lab/elenco/<ids>?n=<nome>), sem conta e sem banco.
 */
export function DreamTeam({ squad, onEdit, onOpenCard }: { squad?: string; onEdit: () => void; onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { players } = useData();
  // link compartilhado: as cartas nas vagas, na ordem; carta que não existe mais aparece como vaga vazia
  const [slots, setSlots] = useState(() => [...(squad ? squad.split(".") : []), ...emptySlots()].slice(0, SQUAD_MAX));
  const [name, setName] = useState(() => (squad ? squadName(new URLSearchParams(location.search).get("n")) : ""));
  const [picking, setPicking] = useState<number | null>(null);
  // o seletor abre acima das vagas: leva a tela até ele (no celular a vaga clicada pode estar bem abaixo)
  const panel = useRef<HTMLDivElement>(null);
  // só ao abrir: trocar de vaga com o painel aberto não mexe na rolagem
  const open = picking !== null;
  useEffect(() => {
    if (!open) return;
    panel.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [open]);

  const cards = slots.map((id) => (id ? players.find((p) => p.id === id) : undefined));
  const chosen = cards.filter((p): p is Player => !!p);
  const avg = (f: (p: Player) => number) => Math.round(chosen.reduce((a, p) => a + f(p), 0) / chosen.length);
  const roles = [...chosen.reduce((m, p) => m.set(p.position || "Flex", (m.get(p.position || "Flex") ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // mexer no elenco tira o link compartilhado da barra de endereço: o que está na tela já não é aquele link
  const edit = (next: string[]) => { setSlots(next); onEdit(); };
  const setSlot = (i: number, id: string) => edit(slots.map((s, j) => (j === i ? id : s)));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-zinc-400">{t.subtitle}</p>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.name}</span>
          <input className={`${field} w-full min-w-0`} maxLength={SQUAD_NAME_MAX} placeholder={t.placeholder} value={name}
            onChange={(e) => { setName(e.target.value); onEdit(); }} />
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <ShareLinkButton path={squadPath(chosen.map((p) => p.id), name)} label={t.share} title={squadName(name) || t.fallback} disabled={!chosen.length} />
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!chosen.length && !name}
            onClick={() => { setName(""); setPicking(null); edit(emptySlots()); }}>{t.clear}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex flex-col">
          <span className="font-display text-5xl leading-none font-black text-area tabular-nums title-depth">{chosen.length ? avg(getPlayerOvr) : "–"}</span>
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.ovr}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs text-zinc-400">{t.count(chosen.length)}</span>
          {!!roles.length && (
            <ul className="flex flex-wrap gap-2">
              {roles.map(([role, n]) => <li key={role} className="rounded-full bg-zinc-100/10 px-3 py-1 text-xs font-bold text-zinc-100">{n}× {label(role)}</li>)}
            </ul>
          )}
        </div>
        {!!chosen.length && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t.averages}>
            {STAT_KEYS.map((k) => (
              <div key={k} className="flex gap-1.5">
                <dt className="text-zinc-400">{k}</dt>
                <dd className="font-bold text-white tabular-nums">{avg((p) => Number(p.stats[k]) || 0)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {picking !== null && (
        <div ref={panel} className="flex scroll-mt-24 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold tracking-widest text-area uppercase title-depth">
              {/* clicar no título recolhe a lista, como o Pronto */}
              <button type="button" aria-expanded="true" onClick={() => setPicking(null)} className="flex cursor-pointer items-center gap-2 rounded-md text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-100 active:opacity-60">{t.picking(picking + 1)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5 shrink-0"><path d="m6 15 6-6 6 6" /></svg></button>
            </h2>
            <button type="button" className={pill(true)} onClick={() => setPicking(null)}>{t.done}</button>
          </div>
          <Picker label={t.pick} value={slots[picking]} onChange={(id) => setSlot(picking, id)} />
        </div>
      )}

      <ol className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((card, i) => (
          <li key={i} className="flex min-w-0 flex-col gap-3">
            <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.slot(i + 1)}</span>
            {card ? (
              <>
                <ScaledCard player={card} onOpen={() => onOpenCard(card.id)} />
                <p className="text-center text-xs wrap-break-word text-zinc-400"><span className="font-bold text-white">{card.name}</span> · {card.hero}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" aria-pressed={picking === i} className={pill(picking === i)} onClick={() => setPicking(i)}>{t.change}</button>
                  <button type="button" className={pill(false)} onClick={() => setSlot(i, "")}>{t.remove}</button>
                </div>
              </>
            ) : (
              <button type="button" aria-pressed={picking === i} onClick={() => setPicking(i)}
                className="flex aspect-295/430 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200/15 p-4 text-center text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-200/40 hover:bg-zinc-100/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/10 aria-pressed:border-area aria-pressed:text-area">
                <span aria-hidden="true" className="text-3xl leading-none">+</span>
                {t.pick}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
