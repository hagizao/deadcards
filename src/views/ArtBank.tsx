import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Card";
import { HoldButton } from "../components/HoldButton";
import { Spotlight } from "../components/Spotlight";
import { ART_REJECT_REASON_MAX, ART_SUBMISSIONS_PATH, previewCard, type ArtSubmission } from "../lib/artSubmissions";
import { isMainCard } from "../lib/cards";
import { useData } from "../lib/data";
import { FRAME_PRESETS } from "../lib/rarity";
import type { Player } from "../lib/types";
import { field, pill, primaryBtn } from "../lib/ui";

// Editor (só admin, em português como o resto do Editor): o banco de artes enviadas pelas pessoas.
// O fluxo é ver a arte numa carta, baixar e aplicar à mão no Editor da carta; "Usada" marca que já foi.
const STATUS = { pending: "Em análise", saved: "Guardada", used: "Usada", rejected: "Recusada" } as const;
const TONE = { pending: "text-amber-200", saved: "text-sky-300", used: "text-emerald-300", rejected: "text-zinc-400" } as const;
// abaixo disso a arte tende a ficar borrada na carta grande e no PNG exportado
const MIN_W = 600;
const MIN_H = 840;
// todas as artes na mesma carta, para comparar umas com as outras
const BASE_NAME = "mikaels";
// motivos comuns, para recusar com um clique (dá para editar antes de confirmar)
const REASONS = [
  "Resolução baixa: a arte fica borrada na carta.",
  "Não parece ser uma arte original.",
  "Não combina com o estilo das cartas.",
  "O link do crédito não leva ao seu trabalho.",
];

async function call(path: string, method: string, body?: unknown) {
  const r = await fetch(`${ART_SUBMISSIONS_PATH}/${path}`, {
    method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Falhou");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "arte";
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const full = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
function ago(ms: number) {
  const min = Math.round((ms - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

/** Tamanho real da imagem, lido no navegador. */
function useImageSize(url: string) {
  const [size, setSize] = useState<{ w: number; h: number }>();
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => { img.onload = null; };
  }, [url]);
  return size;
}

type Run = (fn: () => Promise<void>, ok: string) => Promise<void>;

export function ArtBank() {
  const { players } = useData();
  const [list, setList] = useState<ArtSubmission[]>();
  const [status, setStatus] = useState<ArtSubmission["status"] | undefined>("pending");
  const [artist, setArtist] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<Player>();
  const load = () => fetch(`${ART_SUBMISSIONS_PATH}?all=1`).then((r) => (r.ok ? r.json() as Promise<ArtSubmission[]> : [])).then(setList, () => setList([]));
  useEffect(() => { void load(); }, []);

  const base = useMemo(() => {
    const named = players.filter((p) => norm(p.name) === BASE_NAME);
    return named.find(isMainCard) ?? named[0] ?? players[0];
  }, [players]);

  const run: Run = async (fn, ok) => {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const artists = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of list ?? []) count.set(s.user ?? "?", (count.get(s.user ?? "?") ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [list]);
  const byArtist = (list ?? []).filter((s) => !artist || s.user === artist);
  const shown = byArtist.filter((s) => !status || s.status === status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Banco de artes</h2>
        <p className="max-w-3xl text-sm text-zinc-300">
          Artes enviadas pelas pessoas, todas na carta de {base?.name ?? "um jogador"} para comparar. Clique na carta para ver grande, baixe a arte e aplique no Editor da carta; depois marque como usada.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!status} onClick={() => setStatus(undefined)} className={pill(!status)}>Todas <span className="tabular-nums opacity-70">{byArtist.length}</span></button>
          {(Object.keys(STATUS) as ArtSubmission["status"][]).map((k) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={pill(status === k)}>
              {STATUS[k]} <span className="tabular-nums opacity-70">{byArtist.filter((s) => s.status === k).length}</span>
            </button>
          ))}
        </div>
        {artists.length > 1 && (
          <label className="flex min-w-48 flex-col gap-1 text-xs font-bold tracking-wider text-zinc-300 uppercase">
            Artista
            <select value={artist} onChange={(e) => setArtist(e.target.value)} className={field}>
              <option value="">Todos ({list?.length ?? 0})</option>
              {artists.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
            </select>
          </label>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-zinc-200">{msg}</p>}
      {list && !shown.length && <p className="text-sm text-zinc-300">Nenhuma arte aqui.</p>}
      {base && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-6 gap-y-12">
          {shown.map((s) => <Submission key={s.id} s={s} base={base} run={run} onOpen={setOpen} />)}
        </ul>
      )}
      <AnimatePresence>
        {open && <Spotlight key="art-preview" playerId={open.id} preview={open} onClose={() => setOpen(undefined)} onSwitch={() => {}} />}
      </AnimatePresence>
    </div>
  );
}

function Submission({ s, base, run, onOpen }: { s: ArtSubmission; base: Player; run: Run; onOpen: (p: Player) => void }) {
  const { players } = useData();
  const [frame, setFrame] = useState(s.layout.frame ?? "");
  const [withFg, setWithFg] = useState(true);
  const [copied, setCopied] = useState(false);
  // recusa em dois passos: abre o campo do motivo, depois confirma
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const size = useImageSize(s.image);
  const small = !!size && (size.w < MIN_W || size.h < MIN_H);
  const used = players.find((p) => p.id === s.usedPlayerId);
  const otherName = !!s.user && norm(s.user) !== norm(s.credit.name);

  const card: Player = {
    // as cores que o artista escolheu valem só na moldura que ele testou
    ...previewCard(base, { ...s.layout, frame: frame || undefined, frameTune: frame === s.layout.frame ? s.layout.frameTune : undefined }, s.image, withFg ? s.fg : undefined, s.credit),
    id: `art-${s.id}`,
    specialText: undefined,
  };
  const name = `${slug(s.credit.name)}-${day(s.createdAt)}`;
  const layoutText = [
    `Zoom ${s.layout.zoom} · X ${s.layout.x} · Y ${s.layout.y}`,
    s.layout.fg && `Frente: zoom ${s.layout.fg.zoom} · X ${s.layout.fg.x} · Y ${s.layout.fg.y}`,
    s.layout.frame && `Moldura: ${FRAME_PRESETS[s.layout.frame]?.name ?? s.layout.frame}`,
    s.layout.frameTune && [s.layout.frameTune.c1 && `Cor ${s.layout.frameTune.c1}`, s.layout.frameTune.c2 && `brilho ${s.layout.frameTune.c2}`, s.layout.frameTune.pad && `espessura ${s.layout.frameTune.pad}`].filter(Boolean).join(" · "),
  ].filter(Boolean).join("\n");
  const copy = () => void navigator.clipboard.writeText(layoutText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <li className="flex flex-col gap-4">
      <div className="self-center"><Card player={card} variant="medium" onOpen={() => onOpen(card)} /></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold tracking-wider text-zinc-300 uppercase">
          Moldura
          <select value={frame} onChange={(e) => setFrame(e.target.value)} className={field}>
            <option value="">Padrão da carta</option>
            {Object.entries(FRAME_PRESETS).map(([key, pr]) => <option key={key} value={key}>{pr.name}{key === s.layout.frame ? " (testada)" : ""}</option>)}
          </select>
        </label>
        {s.fg && <button type="button" aria-pressed={withFg} onClick={() => setWithFg((v) => !v)} className={pill(withFg)}>Frente</button>}
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className={`text-xs font-bold tracking-wider uppercase ${TONE[s.status]}`}>{STATUS[s.status]}{used && ` · na carta de ${used.name}`}</span>
        <span className="font-bold text-zinc-100">
          {s.credit.url ? <a href={s.credit.url} target="_blank" rel="noopener noreferrer" className="rounded-sm underline decoration-zinc-500 underline-offset-2 hover:decoration-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">{s.credit.name}</a> : s.credit.name}
          {s.credit.url && <span className="ml-1.5 text-xs font-normal text-zinc-400">{new URL(s.credit.url).hostname.replace(/^www\./, "")}</span>}
        </span>
        <span className="text-xs text-zinc-400">
          Enviada por {s.user} · <time dateTime={new Date(s.createdAt).toISOString()} title={full.format(s.createdAt)}>{ago(s.createdAt)}</time>
        </span>
        {s.reason && <span className="text-xs text-zinc-300">Motivo: {s.reason}</span>}
        {otherName && <span className="text-xs font-bold text-amber-200">Crédito diferente da conta que enviou</span>}
        <span className="text-xs text-zinc-400">
          {size ? `${size.w}×${size.h} px` : "…"} · {s.ext.toUpperCase()}{s.fg ? " · com camada da frente" : ""}
        </span>
        {small && <span className="text-xs font-bold text-amber-200">Pequena: menos de {MIN_W}×{MIN_H} px, pode ficar borrada</span>}
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 font-sans text-xs whitespace-pre-wrap text-zinc-300">{layoutText}</pre>
          <button type="button" onClick={copy} className={pill(false)} aria-label="Copiar o ajuste testado">{copied ? "Copiado" : "Copiar"}</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={s.image} download={`${name}.${s.ext}`} className={primaryBtn}>Baixar</a>
        {s.fg && <a href={s.fg} download={`${name}-frente.${s.fgExt ?? s.ext}`} className={pill(false)}>Baixar frente</a>}
        {s.status === "pending" && <button type="button" className={pill(false)} onClick={() => void run(() => call(s.id, "PATCH", { status: "saved" }), "Arte guardada no banco para usar depois.")}>Guardar p/ depois</button>}
        {(s.status === "pending" || s.status === "saved") && <button type="button" className={pill(false)} onClick={() => void run(() => call(s.id, "PATCH", { status: "used" }), "Marcada como usada.")}>Marcar usada</button>}
        {s.status === "pending" && !rejecting && <button type="button" className={pill(false)} onClick={() => setRejecting(true)}>Recusar</button>}
        {s.status !== "pending" && !s.usedPlayerId && <button type="button" className={pill(false)} onClick={() => void run(() => call(s.id, "PATCH", { status: "pending" }), "De volta para análise.")}>Voltar p/ análise</button>}
        <HoldButton className={pill(false)} label="Apagar esta arte do banco" onConfirm={() => void run(() => call(s.id, "DELETE"), "Arte apagada.")}>Segure p/ apagar</HoldButton>
      </div>
      {rejecting && (
        <form className="flex flex-col gap-3 rounded-xl bg-zinc-950/60 p-3"
          onSubmit={(e) => { e.preventDefault(); void run(() => call(s.id, "PATCH", { status: "rejected", reason }), "Arte recusada.").then(() => setRejecting(false)); }}>
          <label className="flex flex-col gap-1.5 text-xs font-bold tracking-wider text-zinc-300 uppercase">
            Motivo da recusa (quem enviou vê)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={ART_REJECT_REASON_MAX} rows={2}
              placeholder="Escreva ou escolha abaixo" className={`${field} resize-none py-1.5 font-normal tracking-normal normal-case`} />
          </label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className="min-h-11 cursor-pointer rounded-lg bg-zinc-100/5 px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-zinc-100/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/15 aria-pressed:bg-zinc-100 aria-pressed:text-zinc-950 sm:min-h-9">{r}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryBtn}>Confirmar recusa</button>
            <button type="button" className={pill(false)} onClick={() => { setRejecting(false); setReason(""); }}>Cancelar</button>
          </div>
        </form>
      )}
    </li>
  );
}
