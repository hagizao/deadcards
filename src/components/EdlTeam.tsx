import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, useData } from "../lib/data";
import type { EdlImportPreview, EdlImportResult, EdlRosterEntry, EdlTeam, EdlTeamField, Team } from "../lib/types";
import { ghost, input, plural, primary } from "../lib/ui";
import { EdlLogo } from "./EdlLogo";
import { AUTOFOCUS, StepModal } from "./StepModal";

const FIELD_LABEL: Record<EdlTeamField, string> = { name: "Nome", tag: "Tag", logo: "Logo", region: "Região" };
const edlUrl = (slug: string) => `https://edl.gg/teams/${encodeURIComponent(slug)}`;
const flag = (cc?: string) => (cc && /^[a-z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");

const Spinner = () => <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-zinc-500 border-t-dl-text motion-reduce:animate-none" />;

// ---------------------------------------------------------------- busca de time do EDL

function EdlTeamSearch({ onPick, onCancel }: { onPick: (t: EdlTeam) => void; onCancel?: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<EdlTeam[]>([]);
  const [state, setState] = useState<"idle" | "load" | "done" | "err">("idle");
  const [err, setErr] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(true);
  const ticket = useRef(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    const mine = ++ticket.current;
    if (term.length < 2) { setList([]); setState("idle"); return; }
    setState("load");
    const timer = setTimeout(async () => {
      try {
        const r = await api.edlTeams(term);
        if (mine !== ticket.current) return;
        setList(r); setActive(0); setOpen(true); setState("done");
      } catch (e) {
        if (mine !== ticket.current) return;
        setErr((e as Error).message); setState("err");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const showList = open && state === "done" && list.length > 0;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!list.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length);
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      onPick(list[active]);
    } else if (e.key === "Escape") {
      if (showList) { e.stopPropagation(); setOpen(false); } else if (onCancel) { e.stopPropagation(); onCancel(); }
    }
  };

  const status = state === "load" ? "Buscando no EDL…" : state === "err" ? `Erro: ${err}` : state === "done" ? (list.length ? plural(list.length, "time encontrado", "times encontrados") : "Nenhum time com esse nome no EDL.") : "Digite pelo menos 2 letras do nome ou da tag.";

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          {...AUTOFOCUS}
          type="search"
          role="combobox"
          aria-label="Buscar time no EDL"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className={`${input} min-h-11`}
          placeholder="Buscar time no EDL (nome ou tag)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
        />
        {onCancel && <button type="button" className={`${ghost} min-h-11`} onClick={onCancel}>Cancelar</button>}
      </div>
      <p role="status" aria-live="polite" className={`text-xs ${state === "err" ? "text-red-300" : "text-zinc-400"}`}>{status}</p>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Times do EDL" className="max-h-72 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200/10 bg-zinc-950/60 p-1.5">
          {list.map((t, i) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- teclado é tratado pelo combobox (setas + Enter)
            <li
              key={t.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(t)}
              onMouseMove={() => setActive(i)}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 ${i === active ? "bg-zinc-800" : ""}`}
            >
              <EdlLogo url={t.logoUrl} tag={t.tag} name={t.name} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-zinc-100">{t.name}</span>
                <span className="block truncate text-xs text-zinc-400">{[t.tag, t.region, flag(t.countryCode)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">{t.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bloco "Time no EDL" do formulário de time

// Time novo (sem id): a busca vira "Puxar do EDL" e o import só abre depois de salvar (o pai abre o modal).
export function EdlTeamBlock({ team, savedSlug, onSlug, onImported }: { team: Team; savedSlug?: string; onSlug: (slug?: string, picked?: EdlTeam) => void; onImported: (r: EdlImportResult) => void }) {
  const [info, setInfo] = useState<EdlTeam | null>(null);
  const [changing, setChanging] = useState(false);
  const [importing, setImporting] = useState(false);
  const slug = team.edlSlug;
  const isNew = !team.id;

  // Nome/logo vêm do EDL, não do banco; busca pelo slug ao abrir um time já ligado.
  useEffect(() => {
    if (!slug || info?.slug === slug) return;
    let alive = true;
    api.edlTeams(slug).then((r) => alive && setInfo(r.find((t) => t.slug === slug) ?? null)).catch(() => alive && setInfo(null));
    return () => { alive = false; };
  }, [slug, info?.slug]);

  const pick = (t: EdlTeam) => { setInfo(t); setChanging(false); onSlug(t.slug, t); };
  const shown = info?.slug === slug ? info : null;
  const synced = !!slug && slug === savedSlug;

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
      <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{isNew ? "Puxar do EDL" : "Time no EDL"}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={slug && !changing ? "linked" : "search"} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
          {slug && !changing ? (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3">
                <EdlLogo url={shown?.logoUrl} tag={shown?.tag} name={shown?.name} className="size-12" />
                <div className="min-w-40 flex-1">
                  <p className="truncate font-bold text-zinc-100">{shown?.name ?? slug}{shown?.tag && <span className="font-normal text-zinc-400"> ({shown.tag})</span>}</p>
                  <a href={edlUrl(slug)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-zinc-300 underline decoration-zinc-500 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:min-h-6">
                    edl.gg/teams/{slug}<span className="sr-only"> (abre em nova aba)</span><span aria-hidden="true">&nbsp;↗</span>
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={`${ghost} min-h-11`} onClick={() => setChanging(true)}>Trocar</button>
                  <button type="button" className={`${ghost} min-h-11`} onClick={() => { setInfo(null); onSlug(undefined); }}>Desligar</button>
                </div>
              </div>
              {isNew ? (
                <p className="text-xs text-zinc-400">Nome, tag e região foram preenchidos. O logo é importado na próxima etapa, depois de salvar.</p>
              ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={`${primary} min-h-11`} disabled={!synced} aria-describedby="edl-import-hint" aria-haspopup="dialog" onClick={() => setImporting(true)}>Importar do EDL</button>
                <p id="edl-import-hint" className="min-w-0 flex-1 basis-56 text-xs text-zinc-400">
                  {synced ? "Abre uma revisão: nada muda sem você marcar e aplicar." : "Salve o time com este vínculo para poder importar."}
                </p>
              </div>
              )}
            </>
          ) : (
            <>
              <EdlTeamSearch onPick={pick} onCancel={slug ? () => setChanging(false) : undefined} />
              {!slug && <p className="text-xs text-zinc-500">{isNew ? "Escolha um time do EDL para preencher nome, tag e região e importar logo e jogadores depois de salvar." : "Ligar um time ao EDL permite importar logo, região e elenco e mostrar as últimas séries na página Times."}</p>}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {importing && <EdlImportModal team={team} onClose={() => setImporting(false)} onApplied={onImported} />}
    </div>
  );
}

// ---------------------------------------------------------------- revisão da importação

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-100 ${checked ? "border-dl-text/60 bg-zinc-900" : "border-zinc-200/10 bg-zinc-950/50 hover:border-zinc-200/30"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-dl-text" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/30 p-3">
      <span aria-hidden="true" className="mt-2 ml-1.5 size-2 shrink-0 rounded-full bg-zinc-600" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Thumb({ url, name }: { url?: string; name: string }) {
  return url ? <img src={url} alt={name} loading="lazy" className="size-14 rounded-xl border border-zinc-200/10 bg-zinc-950/60 object-contain" /> : <span className="flex size-14 items-center justify-center rounded-xl border border-dashed border-zinc-200/20 text-center text-[10px] leading-tight text-zinc-500">sem logo</span>;
}

function PlayerLine({ r }: { r: EdlRosterEntry }) {
  const { heroById } = useData();
  const heroes = r.heroIds.slice(0, 5).map(heroById).filter((h) => h?.icon);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-bold text-zinc-100">{r.alias}</span>
      {r.countryCode && <span className="text-xs text-zinc-400"><span aria-hidden="true">{flag(r.countryCode)} </span>{r.countryCode.toUpperCase()}</span>}
      <span className="text-xs text-zinc-500 tabular-nums">{r.accountId !== undefined ? `ID ${r.accountId}` : "sem ID"}</span>
      {heroes.length > 0 && (
        <span className="flex items-center gap-1 sm:ml-auto" aria-label={`Heróis mais jogados: ${heroes.map((h) => h!.name).join(", ")}`}>
          {heroes.map((h) => <img key={h!.name} src={h!.icon!} alt="" title={h!.name} loading="lazy" className="size-7 rounded-md object-cover" />)}
        </span>
      )}
    </span>
  );
}

export function EdlImportModal({ team, onClose, onApplied }: { team: Team; onClose: () => void; onApplied: (r: EdlImportResult) => void }) {
  const { reload, players, heroById } = useData();
  const [preview, setPreview] = useState<EdlImportPreview | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Set<EdlTeamField>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [dest, setDest] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState("");
  const [result, setResult] = useState<EdlImportResult | null>(null);

  const load = () => {
    setLoadErr("");
    setPreview(null);
    api.edlImportPreview(team.id).then((p) => {
      setPreview(p);
      // Vincular já marcado só quando a carta é inequívoca: mesmo account, ou mesmo nome sem account nenhum.
      setPicked(new Set(p.roster.filter((r) => r.action === "link" && r.card && (r.card.by === "account" || r.card.accountId === undefined)).map((r) => r.slug)));
    }).catch((e: Error) => setLoadErr(e.message));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => { const n = new Set(set); if (on) n.add(v); else n.delete(v); return n; };
  const roster = preview?.roster ?? [];
  const links = roster.filter((r) => picked.has(r.slug) && r.action === "link" && r.card && r.accountId !== undefined);
  const creates = roster.filter((r) => picked.has(r.slug) && r.action === "create");
  const relinks = roster.filter((r) => picked.has(r.slug) && r.action === "relink" && r.card && r.accountId !== undefined);
  const leavers = preview?.leavers ?? [];
  const freeTeams = preview?.freeAgentTeams ?? [];
  const destOf = (playerId: string) => dest[playerId] ?? freeTeams[0]?.id;
  const releases = leavers.filter((l) => moved.has(l.playerId) && destOf(l.playerId));
  const count = fields.size + links.length + creates.length + relinks.length + releases.length;
  const cardName = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  const apply = async () => {
    setApplying(true);
    setApplyErr("");
    try {
      const r = await api.edlImportApply(team.id, {
        fields: [...fields],
        link: links.map((x) => ({ playerId: x.card!.playerId, accountId: x.accountId! })),
        create: creates.map((x) => ({ slug: x.slug })),
        relink: relinks.map((x) => ({ playerId: x.card!.playerId, accountId: x.accountId! })),
        release: releases.map((x) => ({ playerId: x.playerId, teamId: destOf(x.playerId)! })),
      });
      await reload();
      setResult(r);
      onApplied(r);
    } catch (e) {
      setApplyErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const info = result ? "Importação concluída." : applying ? "Aplicando…" : applyErr ? <span className="text-red-300">Erro: {applyErr}</span> : !preview ? (loadErr ? "" : "Lendo o EDL…") : plural(count, "alteração selecionada", "alterações selecionadas");
  const next = result ? { label: "Fechar", onClick: onClose }
    : step < 2 ? { label: "Avançar", onClick: () => setStep(step + 1), disabled: !preview }
    : { label: applying ? "Aplicando…" : "Aplicar selecionados", onClick: apply, disabled: count === 0 || applying };

  return (
    <StepModal title={`Importar do EDL · ${team.name}`} steps={["Dados do time", "Jogadores", "Revisar e aplicar"]} step={result ? 2 : step} onStep={(i) => !result && !applying && i < step && setStep(i)} onClose={onClose} info={info} next={next} hideBack={!!result}>
      {!preview && !loadErr && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-5 text-sm text-zinc-300">
          <Spinner />Lendo o EDL, pode levar uns 15 s…
        </div>
      )}
      {loadErr && (
        <div role="alert" className="space-y-3 rounded-xl border border-red-300/20 bg-red-400/5 p-4">
          <p className="text-sm text-red-200">Não deu para ler o EDL: {loadErr}</p>
          <button type="button" className={`${ghost} min-h-11`} onClick={load}>Tentar de novo</button>
        </div>
      )}

      {preview && !result && step === 0 && (
        <>
          <p className="text-sm text-zinc-400">Marque o que deve ser trocado pelo valor do EDL. Nada vem marcado: sem marcar, nada muda.</p>
          {preview.fields.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200/15 p-4 text-sm text-zinc-400">Nome, tag, logo e região já estão iguais ao EDL.</p>}
          <ul className="space-y-2">
            {preview.fields.map((f) => (
              <li key={f.key}>
                <Check checked={fields.has(f.key)} onChange={(on) => setFields((s) => toggle(s, f.key, on))}>
                  <span className="block text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{FIELD_LABEL[f.key]}</span>
                  {f.key === "logo" ? (
                    <span className="mt-1.5 flex items-center gap-3">
                      <Thumb url={f.current} name="Logo atual" />
                      <span aria-hidden="true" className="text-zinc-400">→</span>
                      <Thumb url={f.edl} name="Logo do EDL" />
                    </span>
                  ) : (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="text-zinc-400">{f.current || "—"}</span>
                      <span aria-label="para" className="text-zinc-500">→</span>
                      <span className="font-bold text-zinc-100">{f.edl}</span>
                    </span>
                  )}
                </Check>
              </li>
            ))}
          </ul>
        </>
      )}

      {preview && !result && step === 1 && (
        <>
          <p className="text-sm text-zinc-400">Elenco do EDL cruzado com as cartas existentes. Vincular grava o account ID na carta; trocar muda o account de uma carta já vinculada; criar gera uma carta nova.</p>
          {roster.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200/15 p-4 text-sm text-zinc-400">O EDL não listou jogadores para este time.</p>}
          <ul className="space-y-2">
            {roster.map((r) => (
              <li key={r.slug}>
                {r.action === "link" && r.card ? (
                  <Check checked={picked.has(r.slug)} onChange={(on) => setPicked((s) => toggle(s, r.slug, on))}>
                    <PlayerLine r={r} />
                    <span className="mt-1 block text-sm text-zinc-200">Vincular à carta <strong>{r.card.name}</strong></span>
                    <span className="block text-xs text-zinc-500">{r.card.by === "account" ? "Achada pelo account ID." : "Achada só pelo nome; confira se é a mesma pessoa."}</span>
                  </Check>
                ) : r.action === "relink" && r.card ? (
                  <Check checked={picked.has(r.slug)} onChange={(on) => setPicked((s) => toggle(s, r.slug, on))}>
                    <PlayerLine r={r} />
                    <span className="mt-1 block text-sm text-zinc-200">Trocar o perfil da carta <strong>{r.card.name}</strong>: <span className="tabular-nums">ID {r.card.accountId} → ID {r.accountId}</span></span>
                    <span className="mt-1 block text-xs text-zinc-400">
                      Conta antiga: {plural(r.oldMatches ?? 0, "partida guardada", "partidas guardadas")} (continuam guardadas).
                      {r.heroIds.length > 0 && <> Conta nova: mais jogou {r.heroIds.map((h) => heroById(h)?.name ?? `herói ${h}`).join(", ")}.</>}
                    </span>
                    <span className="mt-1 block text-xs text-amber-200/90">A ligação com o EDL é aproximada (herói por partida); confira antes de trocar.</span>
                  </Check>
                ) : r.action === "create" ? (
                  <Check checked={picked.has(r.slug)} onChange={(on) => setPicked((s) => toggle(s, r.slug, on))}>
                    <PlayerLine r={r} />
                    <span className="mt-1 block text-sm text-zinc-200">Criar carta <strong>{r.alias}</strong> neste time</span>
                    <span className="block text-xs text-zinc-500">Nenhuma carta encontrada. Fica desmarcado até você querer.</span>
                  </Check>
                ) : (
                  <Plain>
                    <PlayerLine r={r} />
                    {r.action === "linked" ? (
                      <span className="mt-1 block text-sm text-emerald-300">Já vinculado{r.card && <> à carta <strong>{r.card.name}</strong></>}</span>
                    ) : (
                      <span className="mt-1 block text-xs text-amber-200/90">{r.action === "conflict" ? "Conflito" : "Sem account ID"}{r.reason && `: ${r.reason}`}</span>
                    )}
                  </Plain>
                )}
              </li>
            ))}
          </ul>
          {leavers.length > 0 && (
            <section aria-labelledby="edl-leavers" className="space-y-2 pt-2">
              <h3 id="edl-leavers" className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Saíram do elenco do EDL</h3>
              <p className="text-sm text-zinc-400">Cartas ativas deste time que não batem com ninguém do elenco do EDL. A correlação é aproximada: o jogador pode estar com outro nick. Nada é movido sem você marcar.</p>
              <ul className="space-y-2">
                {leavers.map((l) => (
                  <li key={l.playerId} className="space-y-1.5">
                    {freeTeams.length ? (
                      <Check checked={moved.has(l.playerId)} onChange={(on) => setMoved((m) => toggle(m, l.playerId, on))}>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-bold text-zinc-100">{l.name}</span>
                          <span className="text-xs text-zinc-500 tabular-nums">{l.accountId !== undefined ? `ID ${l.accountId}` : "sem ID"}</span>
                        </span>
                        <span className="mt-1 block text-sm text-zinc-200">Mover para <strong>{freeTeams.find((t) => t.id === destOf(l.playerId))?.name}</strong></span>
                      </Check>
                    ) : (
                      <Plain>
                        <span className="font-bold text-zinc-100">{l.name}</span>
                        <span className="mt-1 block text-xs text-amber-200/90">Não dá para mover: crie um time com região Sem Time para mover.</span>
                      </Plain>
                    )}
                    {freeTeams.length > 1 && (
                      <select aria-label={`Destino de ${l.name}`} className={`${input} min-h-11`} value={destOf(l.playerId)} onChange={(e) => setDest((d) => ({ ...d, [l.playerId]: e.target.value }))}>
                        {freeTeams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {preview && !result && step === 2 && (
        <>
          <p className="text-sm text-zinc-400">{count ? "Confira o que será aplicado. Itens que o servidor recusar aparecem no resumo." : "Nada marcado. Volte e marque o que quiser aplicar."}</p>
          {fields.size > 0 && (
            <Group title="Dados do time">
              {preview.fields.filter((f) => fields.has(f.key)).map((f) => <li key={f.key}>{FIELD_LABEL[f.key]}: {f.key === "logo" ? "trocar pela logo do EDL" : <><span className="text-zinc-400">{f.current || "—"}</span> → <strong>{f.edl}</strong></>}</li>)}
            </Group>
          )}
          {links.length > 0 && <Group title="Vincular perfis">{links.map((r) => <li key={r.slug}><strong>{r.card!.name}</strong> recebe o account <span className="tabular-nums">{r.accountId}</span> ({r.alias})</li>)}</Group>}
          {relinks.length > 0 && <Group title="Trocar perfis">{relinks.map((r) => <li key={r.slug}><strong>{r.card!.name}</strong>: ID <span className="tabular-nums">{r.card!.accountId}</span> → <strong className="tabular-nums">{r.accountId}</strong> (as partidas da conta antiga continuam guardadas)</li>)}</Group>}
          {creates.length > 0 && <Group title="Criar cartas">{creates.map((r) => <li key={r.slug}>Carta <strong>{r.alias}</strong></li>)}</Group>}
          {releases.length > 0 && <Group title="Mover cartas">{releases.map((l) => <li key={l.playerId}><strong>{l.name}</strong> vai para <strong>{freeTeams.find((t) => t.id === destOf(l.playerId))?.name}</strong></li>)}</Group>}
        </>
      )}

      {result && (
        <>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-100">
            <p className="font-bold">Aplicado</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-emerald-100/90">
              {result.applied.fields.length > 0 && <li>Dados do time: {result.applied.fields.map((f) => FIELD_LABEL[f]).join(", ")}</li>}
              {result.applied.linked.length > 0 && <li>Perfis vinculados: {result.applied.linked.map(cardName).join(", ")}</li>}
              {result.applied.created.length > 0 && <li>Cartas criadas: {result.applied.created.map(cardName).join(", ")}</li>}
              {result.applied.relinked.length > 0 && <li>Perfis trocados: {result.applied.relinked.map(cardName).join(", ")}</li>}
              {result.applied.released.length > 0 && <li>Cartas movidas: {result.applied.released.map(cardName).join(", ")}</li>}
              {!result.applied.fields.length && !result.applied.linked.length && !result.applied.created.length && !result.applied.relinked.length && !result.applied.released.length && <li>Nada foi alterado.</li>}
            </ul>
          </div>
          {result.skipped.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm text-amber-100">
              <p className="font-bold">{plural(result.skipped.length, "item pulado", "itens pulados")}</p>
              <ul className="mt-1.5 space-y-0.5">{result.skipped.map((s) => <li key={s.item}><strong>{s.item}</strong>: {s.reason}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </StepModal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-4">
      <h3 className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{title}</h3>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-200">{children}</ul>
    </section>
  );
}
