import { useDeferredValue, useEffect, useState } from "react";
import { api, useData } from "../lib/data";
import { getPlayerOvr, isAltHero, isMainCard, isRetired, teamOf } from "../lib/cards";
import type { Player } from "../lib/types";

type Kind = "main" | "played" | "version" | "special" | "retired";
type SortKey = "ovr" | "owners" | "name";

const KINDS: { id: Kind | "ALL"; label: string }[] = [
  { id: "ALL", label: "Todos os tipos" },
  { id: "main", label: "Principal" },
  { id: "played", label: "Herói jogado" },
  { id: "version", label: "Versão" },
  { id: "special", label: "Especial" },
  { id: "retired", label: "Aposentada" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<Kind, string>;
const SORTS: { id: SortKey; label: string }[] = [
  { id: "ovr", label: "Overall" },
  { id: "owners", label: "Mais donos" },
  { id: "name", label: "Nome" },
];
const PAGE = 100;

const field = "min-h-11 rounded-xl border border-zinc-200/20 bg-zinc-950/80 px-3.5 py-2.5 text-sm text-zinc-100 focus:border-zinc-200/70 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100";

function kindOf(p: Player): Kind {
  if (isRetired(p)) return "retired";
  if (isMainCard(p)) return "main";
  if (isAltHero(p)) return "played";
  return p.special ? "special" : "version";
}

/** Todas as cartas do jogo com quantas contas têm cada uma (Editor). */
export function UniversalCollection({ onEdit }: { onEdit: (id: string) => void }) {
  const { players, teams, heroIcon } = useData();
  const [data, setData] = useState<{ owners: Record<string, number>; accounts: number } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [team, setTeam] = useState("ALL");
  const [kind, setKind] = useState<Kind | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("ovr");
  const [onlyUnowned, setOnlyUnowned] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const load = () => api.owners().then((d) => { setData(d); setError(""); }).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const owners = (id: string) => data?.owners[id] ?? 0;
  const accounts = data?.accounts ?? 0;
  const rows = players
    .map((p) => ({ p, team: teamOf(teams, p), ovr: getPlayerOvr(p), kind: kindOf(p), n: owners(p.id) }))
    .filter(({ p, team: t, kind: k, n }) =>
      (team === "ALL" || p.teamId === team) && (kind === "ALL" || k === kind) && (!onlyUnowned || n === 0) &&
      (!query || `${p.name} ${p.hero} ${t.name} ${t.tag}`.toLowerCase().includes(query)))
    .sort((a, b) =>
      sort === "owners" ? b.n - a.n || b.ovr - a.ovr
        : sort === "name" ? a.p.name.localeCompare(b.p.name) || b.ovr - a.ovr
          : b.ovr - a.ovr || b.n - a.n || a.p.name.localeCompare(b.p.name));
  const totalOwned = players.reduce((s, p) => s + owners(p.id), 0);
  const withOwner = players.filter((p) => owners(p.id) > 0).length;
  const pct = (n: number) => (accounts ? `${((n / accounts) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "–");

  return (
    <div className="noir-glass flex flex-col gap-5 rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Coleção universal</h2>
          <p className="text-xs text-zinc-400">
            {data ? <>{players.length} cartas · {accounts} contas · {withOwner} cartas com dono · {totalOwned} cartas nas coleções</> : error ? null : "Carregando donos…"}
          </p>
        </div>
        <button type="button" onClick={load} className="min-h-11 cursor-pointer rounded-xl border border-zinc-200/20 bg-zinc-900/60 px-4 py-2.5 text-xs font-bold tracking-wider text-zinc-300 uppercase transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:opacity-80">Atualizar</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">Erro ao carregar os donos: {error}</p>}

      <div className="flex flex-wrap gap-3">
        <input type="search" aria-label="Buscar carta" placeholder="Buscar jogador, herói ou time" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} className={`${field} min-w-0 flex-[2_1_14rem]`} />
        <select aria-label="Time" value={team} onChange={(e) => { setTeam(e.target.value); setLimit(PAGE); }} className={`${field} flex-[1_1_10rem]`}>
          <option value="ALL">Todos os times</option>
          {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Tipo de carta" value={kind} onChange={(e) => { setKind(e.target.value as Kind | "ALL"); setLimit(PAGE); }} className={`${field} flex-[1_1_9rem]`}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${field} flex-[1_1_8rem]`}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>Ordenar: {s.label}</option>)}
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={onlyUnowned} onChange={(e) => { setOnlyUnowned(e.target.checked); setLimit(PAGE); }} className="size-4 accent-zinc-100" />
          Só sem dono
        </label>
      </div>

      <p className="text-xs text-zinc-400">{rows.length} {rows.length === 1 ? "carta" : "cartas"}</p>
      <ol className="flex flex-col gap-1.5">
        {rows.slice(0, limit).map(({ p, team: t, ovr, kind: k, n }, i) => {
          const icon = heroIcon(p.hero);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onEdit(p.id)} title="Editar carta"
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl bg-zinc-900/60 px-3 py-2 text-left transition hover:bg-zinc-800/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:opacity-80 sm:gap-4 sm:px-4">
                <span className="w-7 shrink-0 text-right text-xs text-zinc-500 tabular-nums">{i + 1}</span>
                <span className="w-8 shrink-0 text-center text-lg font-black text-zinc-100 tabular-nums">{ovr}</span>
                {icon ? <img src={icon} alt="" className="size-9 shrink-0 rounded-lg bg-zinc-950 object-cover" /> : <span className="size-9 shrink-0 rounded-lg bg-zinc-950" />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-extrabold tracking-wider text-zinc-100 uppercase">{p.name}</span>
                  <span className="truncate text-xs text-zinc-400">{p.hero} · {t.tag || t.name} · {KIND_LABEL[k]}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`text-xl leading-none font-black tabular-nums ${n ? "text-zinc-100" : "text-zinc-600"}`}>{data ? n.toLocaleString("pt-BR") : "…"}</span>
                  <span className="text-[11px] text-zinc-400">{n === 1 ? "conta" : "contas"}{data && n > 0 ? ` · ${pct(n)}` : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="min-h-11 cursor-pointer self-center rounded-xl border border-zinc-200/20 bg-zinc-900/60 px-4 py-2.5 text-xs font-bold tracking-wider text-zinc-300 uppercase transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:opacity-80">
          Mostrar mais ({rows.length - limit})
        </button>
      )}
      {rows.length === 0 && <p className="text-sm text-zinc-400">Nenhuma carta com esses filtros.</p>}
    </div>
  );
}
