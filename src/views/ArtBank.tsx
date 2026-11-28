import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { HoldButton } from "../components/HoldButton";
import { ART_SUBMISSIONS_PATH, previewCard, type ArtSubmission } from "../lib/artSubmissions";
import { getPlayerOvr, teamOf } from "../lib/cards";
import { useData } from "../lib/data";
import { field, pill, primaryBtn } from "../lib/ui";

// Editor (só admin, em português como o resto do Editor): o banco de artes enviadas pelas pessoas.
const STATUS = { pending: "Em análise", used: "Usada", rejected: "Recusada" } as const;
const TONE = { pending: "text-amber-200", used: "text-emerald-300", rejected: "text-zinc-400" } as const;

async function call(path: string, method: string, body?: unknown) {
  const r = await fetch(`${ART_SUBMISSIONS_PATH}/${path}`, {
    method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Falhou");
}

export function ArtBank() {
  const { reload } = useData();
  const [list, setList] = useState<ArtSubmission[]>();
  const [status, setStatus] = useState<ArtSubmission["status"] | undefined>("pending");
  const [msg, setMsg] = useState("");
  const load = () => fetch(`${ART_SUBMISSIONS_PATH}?all=1`).then((r) => (r.ok ? r.json() as Promise<ArtSubmission[]> : [])).then(setList, () => setList([]));
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<void>, ok: string, data = false) => {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      await load();
      if (data) await reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const shown = (list ?? []).filter((s) => !status || s.status === status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Banco de artes</h2>
        <p className="text-sm text-zinc-300">Artes enviadas pelas pessoas, com o ajuste que elas testaram. Usar uma arte copia a imagem para a carta especial escolhida, com o crédito.</p>
      </div>
      <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!status} onClick={() => setStatus(undefined)} className={pill(!status)}>Todas <span className="tabular-nums opacity-70">{list?.length ?? 0}</span></button>
        {(Object.keys(STATUS) as ArtSubmission["status"][]).map((k) => (
          <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={pill(status === k)}>
            {STATUS[k]} <span className="tabular-nums opacity-70">{list?.filter((s) => s.status === k).length ?? 0}</span>
          </button>
        ))}
      </div>
      {msg && <p role="status" className="text-sm text-zinc-200">{msg}</p>}
      {list && !shown.length && <p className="text-sm text-zinc-300">Nenhuma arte aqui.</p>}
      <ul className="grid gap-8 md:grid-cols-2 2xl:grid-cols-3">
        {shown.map((s) => <Submission key={s.id} s={s} run={run} />)}
      </ul>
    </div>
  );
}

function Submission({ s, run }: { s: ArtSubmission; run: (fn: () => Promise<void>, ok: string, data?: boolean) => Promise<void> }) {
  const { players, teams } = useData();
  // artes do banco só vão em cartas especiais
  const specials = players.filter((p) => p.special).sort((a, b) => a.name.localeCompare(b.name) || getPlayerOvr(b) - getPlayerOvr(a));
  const base = players.find((p) => p.id === s.layout.playerId) ?? specials[0] ?? players[0];
  const [target, setTarget] = useState(base?.special ? base.id : specials[0]?.id ?? "");
  const used = players.find((p) => p.id === s.usedPlayerId);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
  return (
    <li className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      {base && <div className="w-fit shrink-0"><Card player={previewCard(base, s.layout, s.image, s.fg, s.credit)} variant="medium" /></div>}
      <div className="flex w-full min-w-0 flex-col gap-4 text-sm">
        <div className="flex flex-col gap-2">
          <span className={`text-xs font-bold tracking-wider uppercase ${TONE[s.status]}`}>{STATUS[s.status]}{used && ` · ${used.name}`}</span>
          <span className="font-bold text-zinc-100">
            {s.credit.url ? <a href={s.credit.url} target="_blank" rel="noopener noreferrer" className="underline decoration-zinc-500 underline-offset-2 hover:decoration-zinc-100">{s.credit.name}</a> : s.credit.name}
          </span>
          <span className="text-xs text-zinc-400">Enviada por {s.user} · {date.format(s.createdAt)}</span>
          <span className="text-xs text-zinc-400">Moldura testada: {s.layout.frame ?? "padrão"}{s.fg ? " · com camada da frente" : ""}</span>
          <a href={s.image} target="_blank" rel="noopener noreferrer" className={`${pill(false)} self-start`}>Abrir imagem</a>
        </div>
        {s.status === "pending" && (
          <label className="flex flex-col gap-1.5 text-xs font-bold tracking-wider text-zinc-300 uppercase">
            Carta especial
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
              {!specials.length && <option value="">Nenhuma carta especial</option>}
              {specials.map((p) => <option key={p.id} value={p.id}>{p.name} · {teamOf(teams, p).tag} · {p.hero}{p.specialText ? ` · ${p.specialText}` : ""}</option>)}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {/* só arte em análise vai para uma carta: cada uso copia as imagens */}
          {s.status === "pending" && (
            <HoldButton disabled={!target} className={primaryBtn} label="Usar esta arte na carta escolhida (troca a arte atual dela)"
              onConfirm={() => void run(() => call(`${s.id}/use`, "POST", { playerId: target }), "Arte aplicada na carta.", true)}>
              Segure p/ usar
            </HoldButton>
          )}
          {s.status === "pending" && <button type="button" className={pill(false)} onClick={() => void run(() => call(s.id, "PATCH", { status: "rejected" }), "Arte recusada.")}>Recusar</button>}
          {s.status === "rejected" && <button type="button" className={pill(false)} onClick={() => void run(() => call(s.id, "PATCH", { status: "pending" }), "De volta para análise.")}>Voltar p/ análise</button>}
          <HoldButton className={pill(false)} label="Apagar esta arte do banco" onConfirm={() => void run(() => call(s.id, "DELETE"), "Arte apagada.")}>Segure p/ apagar</HoldButton>
        </div>
      </div>
    </li>
  );
}
