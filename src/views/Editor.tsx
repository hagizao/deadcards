import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useData } from "../lib/data";
import { DEFAULT_TIER_CONFIG, POSITIONS, REGIONS, STAT_KEYS, calculateOVR, getPlayerHistory, getPlayerOvr, isMainCard } from "../lib/cards";
import { FRAME_PRESETS, getCardTier, type Tier } from "../lib/rarity";
import type { BackfillCandidate, BackfillResult, BgSettings, EdlMatch, MatchLookup, MatchLookupPlayer, Player, Stats, Team, TierBand } from "../lib/types";
import { Card } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { HoldButton } from "../components/HoldButton";
import { Range } from "../components/Range";
import { AUTOFOCUS, StepModal } from "../components/StepModal";
import { danger, ghost, input, plural, primary, slugName } from "../lib/ui";

const SECTIONS = [
  { id: "card", label: "Carta" },
  { id: "teams", label: "Times" },
  { id: "heroes", label: "Heróis" },
  { id: "look", label: "Aparência" },
  { id: "codes", label: "Códigos" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const today = () => new Date().toISOString().slice(0, 10);
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function ImagePick({ folder, onUrl, label = "Enviar imagem" }: { folder: Parameters<typeof api.upload>[0]; onUrl: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`${ghost} inline-flex items-center gap-2 ${busy ? "opacity-50" : ""}`}>
      {busy ? "Enviando…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try { onUrl(await api.upload(folder, f)); } catch (err) { alert((err as Error).message); } finally { setBusy(false); }
        }}
      />
    </label>
  );
}

function useSaver(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg("");
    try { await fn(); await reload(); setMsg(ok); } catch (e) { setMsg(`Erro: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return { busy, msg, run };
}

function Toast({ msg }: { msg: string }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.p key={msg} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-sm ${msg.startsWith("Erro") ? "text-red-300" : "text-emerald-300"}`}>
          {msg}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function Editor({ editId, onEditId }: { editId: string | null; onEditId: (id: string | null) => void }) {
  const [section, setSection] = useState<Section>("card");
  const [prevEditId, setPrevEditId] = useState(editId);
  if (editId !== prevEditId) {
    setPrevEditId(editId);
    if (editId) setSection("card");
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSection(s.id)} className={`relative cursor-pointer rounded-xl border px-4 py-2 text-xs font-bold tracking-wider uppercase ${section === s.id ? "border-white text-zinc-950" : "border-zinc-200/15 bg-zinc-900/60 text-zinc-300 hover:text-white"}`}>
            {section === s.id && <motion.span layoutId="editor-pill" className="absolute inset-0 rounded-xl bg-zinc-100" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
            <span className="relative">{s.label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
          {section === "card" && <PlayerForm key={editId ?? "new"} editId={editId} onEditId={onEditId} />}
          {section === "teams" && <TeamsForm />}
          {section === "heroes" && <HeroesForm />}
          {section === "look" && <LookForm />}
          {section === "codes" && <CodesForm />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function blankPlayer(teamId: string): Player {
  const stats = { MIR: 88, MAC: 86, SUP: 82, MOV: 87, POL: 85, CON: 86 };
  return { id: "", teamId, name: "", position: "Carry", hero: "Abrams", stats, ovr: calculateOVR(stats), c1: "#0e7490", c2: "#082f49", history: [], footer: "Cardslock" };
}

function withHistory(p: Player, date: string, rebase: boolean): Player {
  const ovr = Math.min(99, Math.max(1, Math.round(p.ovr ?? calculateOVR(p.stats))));
  const history = (p.id ? getPlayerHistory(p) : []).map((h) => ({ ...h }));
  const same = history.find((h) => h.date === date);
  if (same) same.ovr = ovr; else history.push({ date, ovr });
  history.sort((a, b) => a.date.localeCompare(b.date));
  if (rebase) history[history.length - 1].base = true;
  return { ...p, ovr, history };
}

function PlayerForm({ editId, onEditId }: { editId: string | null; onEditId: (id: string | null) => void }) {
  const { players, teams, heroNames, heroIcon, settings, reload } = useData();
  const existing = editId ? players.find((p) => p.id === editId) : undefined;
  const [d, setD] = useState<Player>(() => (existing ? structuredClone({ ...existing, ovr: getPlayerOvr(existing) }) : blankPlayer(teams[0]?.id ?? "")));
  const [date, setDate] = useState(today);
  const [rebase, setRebase] = useState(false);
  const [heroQuery, setHeroQuery] = useState("");
  const { busy, msg, run } = useSaver(reload);
  const set = (patch: Partial<Player>) => setD((p) => ({ ...p, ...patch }));
  const setStat = (k: keyof Stats, v: number) => setD((p) => { const stats = { ...p.stats, [k]: v }; return { ...p, stats, ovr: calculateOVR(stats) }; });
  const preview = withHistory({ ...d, name: d.name || "NOVO JOGADOR" }, date, rebase);
  const frame = d.frame ?? { style: "deco" };

  const save = () => {
    const id = d.id || newId("p");
    const body = { ...preview, id, name: d.name.trim() || "NOVO JOGADOR", footer: d.footer?.trim().slice(0, 30), specialText: d.special ? d.specialText?.trim().slice(0, 400) : undefined, frame: d.special ? frame : undefined, ...(isMainCard(d) && { accountId: d.accountId ?? null }) };
    run(async () => { await api.save("players", id, body); onEditId(id); }, `Carta de "${body.name}" salva!`);
  };
  const remove = () => {
    if (!d.id) return;
    run(async () => { await api.remove("players", d.id); onEditId(null); }, "Carta excluída.");
  };

  if (!teams.length) return <p className="text-zinc-300">Crie um time na aba Times antes de criar cartas.</p>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="noir-glass space-y-6 rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="rk-chip">{d.id ? "Modo Edição" : "Modo Criação"}</span>
            <h2 className="mt-2 text-2xl font-black tracking-[0.12em] text-white uppercase">{d.id ? `Editar: ${existing?.name ?? d.name}` : "Criar Nova Carta"}</h2>
          </div>
          <div className="flex gap-2">
            <select className={`${input} w-auto`} value={editId ?? ""} onChange={(e) => onEditId(e.target.value || null)} aria-label="Carregar carta">
              <option value="">+ Nova carta</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.name} · {teams.find((t) => t.id === p.teamId)?.tag ?? "?"}{p.inactive ? " (versão)" : ""}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><input className={input} value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="NOVO JOGADOR" /></Field>
          <Field label="Time">
            <select className={input} value={d.teamId} onChange={(e) => set({ teamId: e.target.value })}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
            </select>
          </Field>
          <Field label="Posição">
            <select className={input} value={d.position} onChange={(e) => set({ position: e.target.value })}>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Data do registro"><input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value || today())} /></Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Herói: <span className="text-zinc-100">{d.hero}</span></span>
            <input className={`${input} max-w-48 py-1.5`} placeholder="Buscar herói" value={heroQuery} onChange={(e) => setHeroQuery(e.target.value)} />
          </div>
          <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-9">
            {heroNames.filter((h) => h.toLowerCase().includes(heroQuery.toLowerCase())).map((h) => {
              const icon = heroIcon(h);
              return (
                <motion.button key={h} type="button" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={() => set({ hero: h })} title={h} aria-pressed={d.hero === h}
                  className={`aspect-square cursor-pointer overflow-hidden rounded-lg border bg-zinc-900 ${d.hero === h ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.5)]" : "border-zinc-200/10 opacity-70 hover:opacity-100"}`}>
                  {icon ? <img src={icon} alt={h} className="size-full object-cover" loading="lazy" /> : <span className="text-[9px] text-zinc-300">{h}</span>}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {STAT_KEYS.map((k) => <Range key={k} label={k} value={d.stats[k]} min={1} max={99} onChange={(v) => setStat(k, v)} />)}
        </div>

        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Field label={`OVR (média ${calculateOVR(d.stats)})`}>
            <input type="number" min={1} max={99} className={input} value={d.ovr ?? ""} onChange={(e) => set({ ovr: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-zinc-300 sm:col-span-2">
            <input type="checkbox" checked={rebase} onChange={(e) => setRebase(e.target.checked)} className="accent-zinc-100" />
            Nova base de overall (zera a variação ▲/▼)
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Cor 1"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.c1} onChange={(e) => set({ c1: e.target.value })} /></Field>
          <Field label="Cor 2"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.c2} onChange={(e) => set({ c2: e.target.value })} /></Field>
          <Field label="Rodapé"><input className={input} maxLength={30} value={d.footer ?? ""} onChange={(e) => set({ footer: e.target.value })} /></Field>
          <Field label="Cor do rodapé"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.footerColor ?? "#f4f4f5"} onChange={(e) => set({ footerColor: e.target.value })} /></Field>
        </div>
        <Range label="Tamanho do rodapé (px)" value={d.footerSize ?? 12} min={8} max={20} onChange={(v) => set({ footerSize: v })} />

        <div className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Arte própria da carta</span>
            <div className="flex gap-2">
              <ImagePick folder="players" onUrl={(url) => set({ art: { url, zoom: 100, x: 50, y: 50 } })} />
              {d.art && <button type="button" className={ghost} onClick={() => set({ art: undefined })}>Usar arte do herói</button>}
            </div>
          </div>
          {d.art && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Range label="Zoom" value={d.art.zoom ?? 100} min={50} max={300} onChange={(v) => set({ art: { ...d.art!, zoom: v } })} />
              <Range label="X" value={d.art.x ?? 50} min={0} max={100} onChange={(v) => set({ art: { ...d.art!, x: v } })} />
              <Range label="Y" value={d.art.y ?? 50} min={0} max={100} onChange={(v) => set({ art: { ...d.art!, y: v } })} />
            </div>
          )}
        </div>

        <LinkProfile d={d} saved={existing?.accountId} onAccount={(accountId) => set({ accountId })} />

        <div className="space-y-3 rounded-2xl border border-amber-200/15 p-4">
          <label className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <input type="checkbox" checked={!!d.special} onChange={(e) => set({ special: e.target.checked || undefined })} className="accent-amber-300" />
            Carta especial
          </label>
          {d.special && (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(FRAME_PRESETS).map(([k, pr]) => (
                  <button key={k} type="button" onClick={() => set({ frame: { style: k } })} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold ${frame.style === k ? "border-white text-zinc-950" : "border-zinc-200/15 text-zinc-200"}`}
                    style={frame.style === k ? { background: `linear-gradient(135deg, ${pr.c1}, ${pr.c2})` } : undefined}>
                    {pr.name}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Cor da moldura"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={frame.c1 ?? FRAME_PRESETS[frame.style]?.c1 ?? "#d9a93a"} onChange={(e) => set({ frame: { ...frame, c1: e.target.value } })} /></Field>
                <Field label="Cor do brilho"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={frame.c2 ?? FRAME_PRESETS[frame.style]?.c2 ?? "#fff0b8"} onChange={(e) => set({ frame: { ...frame, c2: e.target.value } })} /></Field>
                <Range label="Espessura" value={frame.pad ?? FRAME_PRESETS[frame.style]?.pad ?? 4} min={2} max={10} onChange={(v) => set({ frame: { ...frame, pad: v } })} />
              </div>
              <Field label="Texto especial"><textarea className={input} rows={2} maxLength={400} value={d.specialText ?? ""} onChange={(e) => set({ specialText: e.target.value })} /></Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar carta"}</button>
          {d.id && <HoldButton className={danger} disabled={busy} onConfirm={remove} label={`Excluir a carta de ${d.name}`}>Segure p/ excluir</HoldButton>}
          {d.id && <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={!!d.inactive} onChange={(e) => set({ inactive: e.target.checked || undefined })} className="accent-zinc-100" />Fora do elenco (versão guardada)</label>}
          <Toast msg={msg} />
        </div>
      </div>

      <div className="flex justify-center lg:sticky lg:top-28">
        <motion.div key={d.hero + (d.special ? frame.style : "")} initial={{ rotateY: -25, opacity: 0.4 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} style={{ transformPerspective: 1200 }}>
          <TierPulse tier={getCardTier(preview, settings.tierConfig!)}>
            <Card player={preview} variant="editor" />
          </TierPulse>
        </motion.div>
      </div>
    </div>
  );
}

// ID de partida: aceita o número puro ou um link que o contenha.
const parseMatchId = (s: string) => Number(s.match(/\d{5,}/)?.[0]) || null;

const shortDate = (unix: number) => new Date(unix * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");

// Partidas do EDL agrupadas por série; clicar num jogo entrega o ID da partida.
function EdlPicker({ current, onPick }: { current: number | null; onPick: (matchId: number) => void }) {
  const [list, setList] = useState<EdlMatch[] | null>(null);
  const [state, setState] = useState<{ busy: "" | "load" | "refresh"; msg: string; ok: boolean }>({ busy: "load", msg: "", ok: true });
  const [text, setText] = useState("");
  const [event, setEvent] = useState("");

  const load = async (msg?: string) => {
    try {
      const l = await api.edlMatches();
      setList(l);
      setState({ busy: "", msg: msg ?? "", ok: true });
    } catch (e) {
      setState({ busy: "", msg: `Erro: ${(e as Error).message}`, ok: false });
    }
  };
  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setState({ busy: "refresh", msg: "", ok: true });
    try {
      const { total } = await api.edlRefresh();
      await load(`${total} partidas no EDL`);
    } catch (e) {
      setState({ busy: "", msg: `Erro: ${(e as Error).message}`, ok: false });
    }
  };

  const events = [...new Set((list ?? []).map((m) => m.event))];
  const q = text.trim().toLowerCase();
  const series = new Map<string, EdlMatch[]>();
  for (const m of list ?? []) {
    if (event && m.event !== event) continue;
    if (q && !`${m.teams ?? ""} ${slugName(m.event)}`.toLowerCase().includes(q)) continue;
    series.set(`${m.event}/${m.series}`, [...(series.get(`${m.event}/${m.series}`) ?? []), m]);
  }
  const busy = state.busy !== "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input {...AUTOFOCUS} type="search" className={`${input} min-w-48 flex-[2_1_12rem]`} aria-label="Buscar por time ou evento" placeholder="Buscar time ou evento" value={text} onChange={(e) => setText(e.target.value)} />
        <select className={`${input} flex-[1_1_10rem]`} aria-label="Filtrar por evento" value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">Todos os eventos</option>
          {events.map((ev) => <option key={ev} value={ev}>{slugName(ev)}</option>)}
        </select>
        <button type="button" className={`${ghost} min-h-11`} disabled={busy} onClick={refresh}>{state.busy === "refresh" ? "Atualizando…" : "Atualizar do EDL"}</button>
      </div>

      <p role="status" aria-live="polite" className={`text-xs ${state.busy ? "text-zinc-400" : state.ok ? "text-emerald-300" : "text-red-300"} ${state.busy || state.msg ? "" : "sr-only"}`}>
        {state.busy === "load" ? "Carregando partidas…" : state.busy === "refresh" ? "Buscando no EDL, pode levar uns 15 segundos…" : state.msg}
      </p>

      <div className="space-y-2">
        {list && !series.size && (
          <p className="rounded-xl border border-dashed border-zinc-200/15 p-4 text-sm text-zinc-400">
            {list.length ? "Nenhuma partida com esse filtro." : "Nenhuma partida carregada. Clique em Atualizar do EDL para buscar."}
          </p>
        )}
        {[...series.values()].map((games) => {
          const first = games[0];
          const phase = slugName(first.series.replace(`-${first.event}`, ""));
          const title = first.teams ?? phase;
          return (
            <section key={`${first.event}/${first.series}`} aria-label={title} className="rounded-xl border border-zinc-200/10 bg-zinc-900/40 p-3">
              <h4 className="font-bold text-zinc-100">{title}</h4>
              <p className="text-xs text-zinc-400">{slugName(first.event)}{first.teams && ` · ${phase}`}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {[...games].sort((a, b) => (a.game ?? 0) - (b.game ?? 0)).map((m) => (
                  <li key={m.matchId}>
                    <button type="button" aria-pressed={m.matchId === current} onClick={() => onPick(m.matchId)} title={`ID ${m.matchId}`}
                      className={`flex min-h-11 min-w-20 cursor-pointer flex-col items-center justify-center rounded-lg border px-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-200/60 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 ${m.matchId === current ? "border-white bg-zinc-800" : "border-zinc-200/15 bg-zinc-950/60"}`}>
                      <span>{m.game ? `Jogo ${m.game}` : m.matchId}</span>
                      {m.startTime && <span className="text-[11px] font-normal text-zinc-400 tabular-nums">{shortDate(m.startTime)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PlayerLinkModal({ initial, current, onLink, onClose }: { initial: { matchId: number | null; lookup: MatchLookup | null }; current?: number; onLink: (pl: MatchLookupPlayer) => void; onClose: () => void }) {
  const { heroById } = useData();
  const [step, setStep] = useState(initial.lookup ? 1 : 0);
  const [matchId, setMatchId] = useState(initial.matchId);
  const [lookup, setLookup] = useState(initial.lookup);
  const [picked, setPicked] = useState<MatchLookupPlayer | null>(initial.lookup?.players.find((p) => p.accountId === current) ?? null);
  const [state, setState] = useState({ busy: false, msg: "" });

  const advance = async () => {
    if (step === 0) {
      if (!matchId) return;
      if (lookup?.matchId !== matchId) {
        setState({ busy: true, msg: "" });
        try {
          const l = await api.matchLookup(matchId);
          setLookup(l);
          setPicked(l.players.find((p) => p.accountId === current) ?? null);
        } catch (e) {
          return setState({ busy: false, msg: `Erro: ${(e as Error).message}` });
        }
        setState({ busy: false, msg: "" });
      }
      return setStep(1);
    }
    if (step === 1) return picked && setStep(2);
    if (picked) onLink(picked);
  };
  const hero = picked ? heroById(picked.heroId) : null;
  const info = state.busy ? "Buscando a partida…" : state.msg ? <span className="text-red-300">{state.msg}</span>
    : step === 0 ? (matchId ? `Partida ${matchId} escolhida.` : "Escolha um jogo.")
    : step === 1 ? (picked ? `${picked.name ?? `ID ${picked.accountId}`} escolhido.` : "Clique no jogador que é ele.")
    : "Só vale na carta depois de Salvar carta.";

  return (
    <StepModal title="Vincular perfil" steps={["Partida", "Jogador", "Confirmar"]} step={step} onStep={(i) => { if (i < step) { setState({ busy: false, msg: "" }); setStep(i); } }} onClose={onClose} info={info}
      next={{ label: step === 2 ? "Vincular perfil" : "Avançar", onClick: advance, disabled: state.busy || (step === 0 && !matchId) || (step > 0 && !picked) }}>
      {step === 0 && <EdlPicker current={matchId} onPick={(id) => { setMatchId(id); setState({ busy: false, msg: "" }); }} />}

      {step === 1 && lookup && (
        <>
          <p className="text-sm text-zinc-400">Partida {lookup.matchId} · {Math.round(lookup.durationS / 60)} min. Clique em quem é o jogador desta carta.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((team) => (
              <section key={team} aria-label={`Time ${team}`} className="space-y-1.5">
                <h3 className="flex min-h-6 items-center justify-between text-[11px] font-bold tracking-[0.18em] text-zinc-300 uppercase">
                  <span>Time {team}</span>
                  {lookup.winningTeam === team && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-amber-200">Vencedor</span>}
                </h3>
                <ul className="space-y-1.5">
                  {lookup.players.filter((pl) => pl.team === team).map((pl) => {
                    const h = heroById(pl.heroId);
                    const on = pl.accountId === picked?.accountId;
                    return (
                      <li key={pl.accountId}>
                        <button type="button" aria-pressed={on} onClick={() => setPicked(pl)} title={`ID ${pl.accountId}`}
                          className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-zinc-950/60 p-1.5 pr-3 text-left transition-colors hover:border-zinc-200/60 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 ${on ? "border-dl-text bg-zinc-900" : "border-zinc-200/10"}`}>
                          {pl.avatar ? <img src={pl.avatar} alt="" loading="lazy" className="size-8 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-zinc-800" />}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{pl.name ?? `ID ${pl.accountId}`}</span>
                          {h?.icon ? <img src={h.icon} alt={h.name} title={h.name} loading="lazy" className="size-8 shrink-0 rounded-lg object-cover" /> : <span className="shrink-0 text-xs text-zinc-500">{h?.name ?? `#${pl.heroId}`}</span>}
                          <span className="w-16 shrink-0 text-right text-xs font-bold text-zinc-300 tabular-nums">{pl.kills}/{pl.deaths}/{pl.assists}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {step === 2 && picked && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
            {picked.avatar ? <img src={picked.avatar} alt="" className="size-16 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xl text-zinc-400">?</span>}
            <div className="min-w-40 flex-1">
              <p className="truncate text-xl font-extrabold text-zinc-100">{picked.name ?? `ID ${picked.accountId}`}</p>
              <p className="text-sm text-zinc-400 tabular-nums">ID {picked.accountId}</p>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-zinc-950/60 p-2 pr-3">
              {hero?.icon ? <img src={hero.icon} alt="" className="size-10 rounded-lg object-cover" /> : null}
              <div className="text-sm">
                <p className="font-semibold text-zinc-100">{hero?.name ?? `Herói #${picked.heroId}`}</p>
                <p className="text-xs text-zinc-400 tabular-nums">{picked.kills}/{picked.deaths}/{picked.assists} na partida {lookup?.matchId}</p>
              </div>
            </div>
          </div>
          <p className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-3 text-sm text-amber-100">
            Vincular só marca este perfil no editor da carta. Depois, clique em <strong>Salvar carta</strong> para gravar.
          </p>
        </>
      )}
    </StepModal>
  );
}

function BackfillModal({ player, accountId, nick, onClose }: { player: string; accountId: number; nick: string; onClose: () => void }) {
  const { teams, reload } = useData();
  const [list, setList] = useState<BackfillCandidate[] | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const load = () => {
    setErr("");
    setList(null);
    api.backfillCandidates(player).then(setList).catch((e: Error) => setErr(e.message));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = (c: BackfillCandidate) => c.accountId !== undefined;
  const free = (list ?? []).filter((c) => !blocked(c));
  const chosen = free.filter((c) => picked.has(c.playerId));
  const allOn = free.length > 0 && chosen.length === free.length;
  const teamOf = (id: string) => teams.find((t) => t.id === id);
  const nameOf = (id: string) => list?.find((c) => c.playerId === id)?.name ?? id;

  const apply = async () => {
    setApplying(true);
    setErr("");
    try {
      const r = await api.backfillApply(player, chosen.map((c) => c.playerId));
      await reload();
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const info = result ? "Concluído." : applying ? "Aplicando…" : !list ? (err ? "" : "Procurando cartas…") : plural(chosen.length, "carta marcada", "cartas marcadas");
  const next = result ? { label: "Fechar", onClick: onClose }
    : step === 0 ? { label: "Avançar", onClick: () => setStep(1), disabled: chosen.length === 0 }
    : { label: applying ? "Aplicando…" : "Aplicar perfil", onClick: apply, disabled: applying || chosen.length === 0 };

  return (
    <StepModal title="Aplicar nas outras versões" steps={["Cartas encontradas", "Confirmar"]} step={result ? 1 : step} onStep={(i) => !result && !applying && i < step && setStep(i)} onClose={onClose} info={info} next={next} hideBack={!!result}>
      {!list && !err && <p role="status" className="rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-5 text-sm text-zinc-300">Procurando outras versões e cartas com o mesmo nome…</p>}
      {err && !result && (
        <div role="alert" className="space-y-3 rounded-xl border border-red-300/20 bg-red-400/5 p-4">
          <p className="text-sm text-red-200">Erro: {err}</p>
          {!list && <button type="button" className={`${ghost} min-h-11`} onClick={load}>Tentar de novo</button>}
        </div>
      )}

      {list && !result && step === 0 && (
        <>
          <p className="text-sm text-zinc-400">Variações são cartas separadas e não herdam o perfil. Marque as que são do mesmo jogador; nada vem marcado.</p>
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200/15 p-4 text-sm text-zinc-400">Nenhuma outra carta com este nome ou ligada a esta como variação. Se a versão antiga tem outro nome, edite a carta e vincule o perfil nela.</p>
          ) : (
            <>
              {free.length > 1 && <button type="button" className={`${ghost} min-h-11`} onClick={() => setPicked(allOn ? new Set() : new Set(free.map((c) => c.playerId)))}>{allOn ? "Desmarcar todas" : "Marcar todas"}</button>}
              <ul className="space-y-2">
                {list.map((c) => {
                  const t = teamOf(c.teamId);
                  const off = blocked(c);
                  const body = (
                    <>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-bold text-zinc-100">{c.name}</span>
                        {c.inactive && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">versão guardada</span>}
                        <span className="text-xs text-zinc-500">{c.by === "variant" ? "variação desta carta" : "mesmo nome"}</span>
                      </span>
                      {t && <span className="mt-1 flex items-center gap-2 text-xs text-zinc-300"><span className="team-logo-frame size-6"><TeamLogo team={t} /></span>{t.name} ({t.tag})</span>}
                      {off && <span className="mt-1 block text-xs text-amber-200/90">{c.accountId === accountId ? "Já tem este perfil." : `Vinculada a outro perfil: ID ${c.accountId}. Não dá para sobrescrever.`}</span>}
                    </>
                  );
                  return (
                    <li key={c.playerId}>
                      {off ? (
                        <div className="flex items-start gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/30 p-3 opacity-80"><span aria-hidden="true" className="mt-2 ml-1.5 size-2 shrink-0 rounded-full bg-zinc-600" /><span className="min-w-0 flex-1">{body}</span></div>
                      ) : (
                        <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-100 ${picked.has(c.playerId) ? "border-dl-text/60 bg-zinc-900" : "border-zinc-200/10 bg-zinc-950/50 hover:border-zinc-200/30"}`}>
                          <input type="checkbox" checked={picked.has(c.playerId)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.playerId); else n.delete(c.playerId); return n; })} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-dl-text" />
                          <span className="min-w-0 flex-1">{body}</span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {list && !result && step === 1 && (
        <>
          <p className="text-base text-zinc-200">Aplicar o perfil <strong className="text-dl-text">{nick}</strong> <span className="text-zinc-400 tabular-nums">(ID {accountId})</span> em {plural(chosen.length, "carta", "cartas")}:</p>
          <ul className="list-inside list-disc space-y-1 rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-4 text-sm text-zinc-200">
            {chosen.map((c) => <li key={c.playerId}>{c.name}{c.inactive && <span className="text-zinc-400"> (versão guardada)</span>}{teamOf(c.teamId) && <span className="text-zinc-400"> · {teamOf(c.teamId)!.tag}</span>}</li>)}
          </ul>
          <p className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-3 text-sm text-amber-100">Grava direto nessas cartas, sem passar por Salvar carta.</p>
        </>
      )}

      {result && (
        <>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-100">
            <p className="font-bold">{plural(result.updated.length, "carta atualizada", "cartas atualizadas")}</p>
            {result.updated.length > 0 && <p className="mt-1 text-emerald-100/90">{result.updated.map(nameOf).join(", ")}</p>}
          </div>
          {result.skipped.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm text-amber-100">
              <p className="font-bold">{plural(result.skipped.length, "carta pulada", "cartas puladas")}</p>
              <ul className="mt-1.5 space-y-0.5">{result.skipped.map((s) => <li key={s.item}><strong>{nameOf(s.item)}</strong>: {s.reason}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </StepModal>
  );
}

function LinkProfile({ d, saved, onAccount }: { d: Player; saved?: number; onAccount: (id: number | undefined) => void }) {
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ matchId: number | null; lookup: MatchLookup | null } | null>(null);
  const [backfill, setBackfill] = useState(false);
  const [picked, setPicked] = useState<MatchLookupPlayer | null>(null);
  const [state, setState] = useState<{ busy: "" | "lookup" | "sync"; msg: string; ok: boolean }>({ busy: "", msg: "", ok: true });
  const matchId = parseMatchId(query);
  const linked = picked && picked.accountId === d.accountId ? picked : null;

  if (!isMainCard(d)) {
    return (
      <div className="rounded-2xl border border-zinc-200/10 p-4">
        <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Vincular perfil</span>
        <p className="mt-1.5 text-sm text-zinc-400">Herda o perfil da carta base.</p>
      </div>
    );
  }

  // Busca direta por ID: a partida já abre na etapa do jogador.
  const search = async () => {
    if (!matchId) return setState({ busy: "", msg: "Informe o ID da partida (ou cole o link).", ok: false });
    setState({ busy: "lookup", msg: "", ok: true });
    try {
      const lookup = await api.matchLookup(matchId);
      setState({ busy: "", msg: "", ok: true });
      setModal({ matchId, lookup });
    } catch (e) {
      setState({ busy: "", msg: `Erro: ${(e as Error).message}`, ok: false });
    }
  };
  const unlink = () => { setPicked(null); onAccount(undefined); setState({ busy: "", msg: "", ok: true }); };
  const sync = async () => {
    setState({ busy: "sync", msg: "", ok: true });
    try {
      const { added } = await api.syncMatches(d.id);
      setState({ busy: "", msg: added ? `${added} partida${added > 1 ? "s" : ""} nova${added > 1 ? "s" : ""}.` : "Nenhuma partida nova.", ok: true });
    } catch (e) {
      setState({ busy: "", msg: `Erro: ${(e as Error).message}`, ok: false });
    }
  };

  const searching = state.busy === "lookup";
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
      <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Vincular perfil</span>

      {d.accountId !== undefined && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3">
          {linked?.avatar ? <img src={linked.avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">?</span>}
          <div className="min-w-40 flex-1">
            <p className="truncate font-bold text-zinc-100">{linked?.name ?? "Perfil vinculado"}</p>
            <p className="text-xs text-zinc-400 tabular-nums">ID {d.accountId}{d.accountId !== saved && " · salve a carta para confirmar"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghost} onClick={() => setModal({ matchId: null, lookup: null })}>Trocar</button>
            <button type="button" className={ghost} onClick={unlink}>Desvincular</button>
            {d.id && d.accountId === saved && <button type="button" className={ghost} aria-haspopup="dialog" onClick={() => setBackfill(true)}>Aplicar nas outras versões</button>}
            <button type="button" className={ghost} disabled={state.busy === "sync" || !d.id || d.accountId !== saved} onClick={sync} title={d.id && d.accountId === saved ? undefined : "Salve a carta com este perfil antes de sincronizar"}>
              {state.busy === "sync" ? "Sincronizando…" : "Sincronizar partidas"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="ID da partida">
            <input id="match-id" className={input} inputMode="numeric" value={query} placeholder="Ex.: 12345678 ou link da partida" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
          </Field>
        </div>
        <button type="button" id="edl-toggle" className={`${ghost} min-h-11`} aria-haspopup="dialog" onClick={() => setModal({ matchId, lookup: null })}>Escolher do EDL</button>
        <button type="button" className={`${primary} min-h-11`} disabled={searching || !query.trim()} onClick={search}>{searching ? "Buscando…" : "Buscar"}</button>
      </div>
      <p className="text-xs text-zinc-500">Cole o ID de uma partida do jogador ou escolha uma do EDL, depois marque quem é ele entre os 12 participantes.</p>

      <p role="status" aria-live="polite" className={`text-sm ${state.msg ? (state.ok ? "text-emerald-300" : "text-red-300") : "sr-only"}`}>{state.msg}</p>

      {backfill && d.accountId !== undefined && <BackfillModal player={d.id} accountId={d.accountId} nick={linked?.name ?? `ID ${d.accountId}`} onClose={() => setBackfill(false)} />}
      {modal && (
        <PlayerLinkModal initial={modal} current={d.accountId} onClose={() => setModal(null)}
          onLink={(pl) => { setPicked(pl); onAccount(pl.accountId); setModal(null); }} />
      )}
    </div>
  );
}

function TierPulse({ tier, children }: { tier: Tier; children: ReactNode }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const id = `${tier.key}:${tier.frame ?? ""}`;
  const prev = useRef(id);
  useEffect(() => {
    if (prev.current === id) return;
    prev.current = id;
    animate(scope.current, { scale: [1, 1.04, 1] }, { duration: 0.4, ease: [0.22, 1, 0.36, 1] });
    animate("[data-glow]", { opacity: [0, 0.6, 0] }, { duration: 0.3 });
  }, [id, animate, scope]);
  return (
    <div ref={scope} className="relative">
      {children}
      <div data-glow aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[28px] opacity-0" style={{ boxShadow: `0 0 48px 12px ${tier.c}` }} />
    </div>
  );
}

function TeamsForm() {
  const { teams, players, reload } = useData();
  const [d, setD] = useState<Team | null>(null);
  const { busy, msg, run } = useSaver(reload);
  const set = (patch: Partial<Team>) => setD((t) => (t ? { ...t, ...patch } : t));

  const save = () => {
    if (!d || !d.name.trim() || !d.tag.trim()) return;
    const id = d.id || newId("t");
    run(async () => { await api.save("teams", id, { ...d, id, name: d.name.trim(), tag: d.tag.trim().toUpperCase().slice(0, 6) }); setD(null); }, `Time "${d.name}" salvo!`);
  };
  const remove = (t: Team) => {
    run(() => api.remove("teams", t.id), "Time excluído.");
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="noir-glass space-y-2 rounded-3xl p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Times ({teams.length})</h2>
          <button type="button" className={primary} onClick={() => setD({ id: "", name: "", tag: "", region: "Europa" })}>+ Novo time</button>
        </div>
        {teams.map((t) => (
          <motion.div layout key={t.id} className="flex items-center gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/50 p-2.5">
            <div className="size-10 shrink-0"><TeamLogo team={t} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-zinc-100">{t.name} <span className="text-zinc-400">({t.tag})</span></p>
              <p className="text-xs text-zinc-400">{t.region} · {players.filter((p) => p.teamId === t.id).length} cartas</p>
            </div>
            <button type="button" className={ghost} onClick={() => setD(structuredClone(t))}>Editar</button>
            <HoldButton className={danger} disabled={busy} onConfirm={() => remove(t)} label={`Excluir ${t.name} e suas ${players.filter((p) => p.teamId === t.id).length} cartas`}>✕</HoldButton>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {d && (
          <motion.div key={d.id || "new"} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="noir-glass space-y-4 rounded-3xl p-5">
            <h3 className="text-lg font-black tracking-[0.12em] text-white uppercase">{d.id ? `Editar ${d.name}` : "Novo time"}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome"><input className={input} value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Tag"><input className={input} value={d.tag} maxLength={6} onChange={(e) => set({ tag: e.target.value })} /></Field>
              <Field label="Região">
                <select className={input} value={d.region} onChange={(e) => set({ region: e.target.value })}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <div className="flex items-end gap-3">
                {d.logo && <div className="size-12"><TeamLogo team={d} /></div>}
                <ImagePick folder="teams" label="Logo" onUrl={(logo) => set({ logo })} />
                {d.logo && <button type="button" className={ghost} onClick={() => set({ logo: undefined })}>Remover</button>}
              </div>
            </div>
            <BgFields bg={d.bg} onChange={(bg) => set({ bg })} folder="teams" title="Fundo do time" />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} disabled={busy || !d.name.trim() || !d.tag.trim()} onClick={save}>{busy ? "Salvando…" : "Salvar time"}</button>
              <button type="button" className={ghost} onClick={() => setD(null)}>Cancelar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="lg:col-span-2"><Toast msg={msg} /></div>
    </div>
  );
}

const DEFAULT_BG: BgSettings = { enabled: true, color: "#09090b", imageOpacity: 60, overlayOpacity: 55, blur: 0, size: "cover" };

function BgFields({ bg, onChange, folder, title }: { bg?: BgSettings; onChange: (bg: BgSettings | undefined) => void; folder: "bg" | "teams"; title: string }) {
  const b = bg ?? DEFAULT_BG;
  const set = (patch: Partial<BgSettings>) => onChange({ ...b, ...patch });
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">{title}</span>
        <div className="flex gap-2">
          <ImagePick folder={folder} label="Imagem" onUrl={(imageUrl) => set({ imageUrl })} />
          {b.imageUrl && <button type="button" className={ghost} onClick={() => set({ imageUrl: undefined })}>Sem imagem</button>}
          {bg && <button type="button" className={ghost} onClick={() => onChange(undefined)}>Padrão</button>}
        </div>
      </div>
      {b.imageUrl && <img src={b.imageUrl} alt="" className="h-20 rounded-lg object-cover" />}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Cor"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={b.color} onChange={(e) => set({ color: e.target.value })} /></Field>
        <Field label="Ajuste">
          <select className={input} value={b.size} onChange={(e) => set({ size: e.target.value })}>
            <option value="cover">Cobrir</option><option value="contain">Conter</option><option value="auto">Original</option>
          </select>
        </Field>
        <Range label="Opacidade da imagem" value={b.imageOpacity} min={0} max={100} onChange={(v) => set({ imageOpacity: v })} />
        <Range label="Escurecer" value={b.overlayOpacity} min={0} max={100} onChange={(v) => set({ overlayOpacity: v })} />
        <Range label="Desfoque" value={b.blur} min={0} max={20} onChange={(v) => set({ blur: v })} />
      </div>
    </div>
  );
}

function HeroesForm() {
  const { heroNames, heroes, heroArt, heroIcon, players, teams, reload } = useData();
  const [name, setName] = useState(heroNames[0] ?? "Abrams");
  const [art, setArt] = useState(() => heroArt(name));
  const { busy, msg, run } = useSaver(reload);
  const sample: Player = { ...(players[0] ?? { id: "x", teamId: teams[0]?.id ?? "", position: "Flex", stats: { MIR: 85, MAC: 85, SUP: 85, MOV: 85, POL: 85, CON: 85 }, c1: "#0e7490", c2: "#082f49", history: [] }), name: name.toUpperCase(), hero: name, art: art ?? undefined, special: undefined };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="noir-glass space-y-5 rounded-3xl p-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Arte dos heróis</h2>
        <div className="grid max-h-52 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10">
          {heroNames.map((h) => {
            const icon = heroIcon(h);
            return (
              <button key={h} type="button" onClick={() => { setName(h); setArt(heroArt(h)); }} title={h} aria-pressed={name === h}
                className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-zinc-900 ${name === h ? "border-white" : "border-zinc-200/10 opacity-70 hover:opacity-100"}`}>
                {icon ? <img src={icon} alt={h} className="size-full object-cover" loading="lazy" /> : <span className="text-[9px] text-zinc-300">{h}</span>}
                {heroes[h] && <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-emerald-400" aria-label="arte própria" />}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-zinc-300"><b className="text-white">{name}</b> · {heroes[name] ? "arte própria salva" : "usando arte da deadlock-api"}</p>
        <div className="flex flex-wrap gap-2">
          <ImagePick folder="heroes" onUrl={(url) => setArt({ name, url, zoom: 100, x: 50, y: 30 })} />
          {heroes[name] && <button type="button" className={danger} disabled={busy} onClick={() => run(() => api.remove("heroes", name), "Arte própria removida.")}>Remover arte própria</button>}
        </div>
        {art && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Range label="Zoom" value={art.zoom} min={50} max={300} onChange={(zoom) => setArt({ ...art, zoom })} />
            <Range label="X" value={art.x} min={0} max={100} onChange={(x) => setArt({ ...art, x })} />
            <Range label="Y" value={art.y} min={0} max={100} onChange={(y) => setArt({ ...art, y })} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" className={primary} disabled={busy || !art?.url.startsWith("/img/")} onClick={() => run(() => api.save("heroes", name, art), `Arte de ${name} salva!`)}>
            {busy ? "Salvando…" : "Salvar arte"}
          </button>
          <Toast msg={msg} />
        </div>
      </div>
      <div className="flex justify-center lg:sticky lg:top-28"><Card player={sample} variant="editor" /></div>
    </div>
  );
}

function LookForm() {
  const { settings, reload } = useData();
  const [bg, setBg] = useState(settings.bg);
  const [homeHero, setHomeHero] = useState(settings.homeHero);
  const [tiers, setTiers] = useState<TierBand[]>(() => structuredClone(settings.tierConfig ?? DEFAULT_TIER_CONFIG));
  const { busy, msg, run } = useSaver(reload);
  const setTier = (i: number, patch: Partial<TierBand>) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="noir-glass space-y-5 rounded-3xl p-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Fundo e capa</h2>
        <BgFields bg={bg} onChange={setBg} folder="bg" title="Fundo do site" />
        <div className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
          <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Imagem da capa (Home)</span>
          {homeHero && <img src={homeHero} alt="" className="h-28 rounded-lg object-cover" />}
          <div className="flex gap-2">
            <ImagePick folder="home" onUrl={setHomeHero} />
            {homeHero && <button type="button" className={ghost} onClick={() => setHomeHero(undefined)}>Remover</button>}
          </div>
        </div>
      </div>
      <div className="noir-glass space-y-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Tier List</h2>
          <button type="button" className={ghost} onClick={() => setTiers(structuredClone(DEFAULT_TIER_CONFIG))}>Padrão</button>
        </div>
        {tiers.map((t, i) => (
          <div key={t.key} className="grid grid-cols-[3rem_1fr_1fr_2.5rem_2.5rem] items-center gap-2">
            <span className="flex h-9 items-center justify-center rounded-lg font-black" style={{ background: t.bg, color: t.text }}>{t.key}</span>
            <input type="number" className={input} value={t.min} aria-label={`Mínimo ${t.key}`} onChange={(e) => setTier(i, { min: Number(e.target.value) })} />
            <input type="number" className={input} value={t.max} aria-label={`Máximo ${t.key}`} onChange={(e) => setTier(i, { max: Number(e.target.value) })} />
            <input type="color" className="h-9 w-full cursor-pointer rounded-sm bg-transparent" value={t.bg} aria-label={`Cor ${t.key}`} onChange={(e) => setTier(i, { bg: e.target.value })} />
            <input type="color" className="h-9 w-full cursor-pointer rounded-sm bg-transparent" value={t.text} aria-label={`Texto ${t.key}`} onChange={(e) => setTier(i, { text: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="button" className={primary} disabled={busy} onClick={() => run(() => api.save("settings", "app", { bg: bg ?? null, homeHero: homeHero ?? null, tierConfig: tiers }), "Aparência salva!")}>
          {busy ? "Salvando…" : "Salvar aparência"}
        </button>
        <Toast msg={msg} />
      </div>
    </div>
  );
}

type Code = { code: string; player_id: string; max_uses: number; uses: number; starts_at: number | null; expires_at: number | null };

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");
const toTs = (v: string) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fmtTs = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem limite");

function codeStatus(c: Code, now: number) {
  if (c.uses >= c.max_uses) return { label: "esgotado", cls: "text-zinc-400" };
  if (c.expires_at && c.expires_at <= now) return { label: "expirado", cls: "text-red-300" };
  if (c.starts_at && c.starts_at > now) return { label: "agendado", cls: "text-amber-300" };
  return { label: "ativo", cls: "text-emerald-300" };
}

function CodesForm() {
  const { players, teams } = useData();
  const [codes, setCodes] = useState<Code[]>([]);
  const [now, setNow] = useState(0);
  const [code, setCode] = useState(randomCode);
  const [pick, setPick] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const label = (p: Player) => `${p.name} · ${p.hero} · ${teams.find((t) => t.id === p.teamId)?.tag ?? ""}`;
  const byLabel = new Map(players.map((p) => [label(p), p.id]));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  const load = () =>
    fetch("/api/codes")
      .then((r) => (r.ok ? (r.json() as Promise<Code[]>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c) => { setCodes(c); setNow(Math.floor(Date.now() / 1000)); })
      .catch((e: Error) => setMsg(`Erro: ${e.message}`));

  useEffect(() => { load(); }, []);

  const expireIn = (ms: number | null) => setExpiresAt(ms === null ? "" : localInput(new Date(Date.now() + ms)));

  const create = async () => {
    const playerId = byLabel.get(pick);
    if (!playerId) return setMsg("Erro: escolha uma carta da lista");
    setBusy(true);
    setMsg("");
    try {
      await api.createCode({ code, playerId, maxUses, startsAt: toTs(startsAt), expiresAt: toTs(expiresAt) });
      setMsg(`Código ${code} criado`);
      setCode(randomCode());
      await load();
    } catch (e) {
      setMsg(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: string) => {
    if (!confirm(`Apagar o código ${c}?`)) return;
    try {
      await api.removeCode(c);
      await load();
    } catch (e) {
      setMsg(`Erro: ${(e as Error).message}`);
    }
  };

  const quick = "px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-zinc-200/20 text-zinc-300 hover:text-white bg-zinc-900/60 cursor-pointer";

  return (
    <div className="space-y-6">
      <div className="noir-glass space-y-6 rounded-3xl p-5 sm:p-7">
        <div>
          <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Novo código</h2>
          <p className="mt-1 text-xs text-zinc-400">Quem digitar o código na aba Resgatar ganha a carta escolhida.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="1. Código">
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${input} font-bold tracking-[0.15em]`} />
              <button type="button" onClick={() => setCode(randomCode())} className={ghost}>Gerar</button>
            </div>
          </Field>

          <Field label="2. Carta">
            <input list="codes-players" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Digite o nome do jogador…" className={input} />
            <datalist id="codes-players">
              {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={label(p)} />)}
            </datalist>
          </Field>

          <Field label="3. Quantas pessoas podem resgatar">
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={`${input} w-28`} />
              {[1, 10, 100].map((n) => <button key={n} type="button" onClick={() => setMaxUses(n)} className={quick}>{n}</button>)}
            </div>
          </Field>

          <Field label="4. Validade">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => expireIn(null)} className={quick}>Sem prazo</button>
              <button type="button" onClick={() => expireIn(3600000)} className={quick}>1 hora</button>
              <button type="button" onClick={() => expireIn(86400000)} className={quick}>1 dia</button>
              <button type="button" onClick={() => expireIn(7 * 86400000)} className={quick}>7 dias</button>
            </div>
          </Field>

          <Field label="Começa em (opcional)">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={input} />
          </Field>

          <Field label="Expira em (opcional)">
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={input} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={create} disabled={busy || !code || !pick} className={primary}>{busy ? "Criando…" : "Criar código"}</button>
          <Toast msg={msg} />
        </div>
      </div>

      <div className="noir-glass space-y-3 rounded-3xl p-5 sm:p-7">
        <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Códigos criados</h2>
        {codes.length === 0 && <p className="text-xs text-zinc-400">Nenhum código ainda.</p>}
        {codes.map((c) => {
          const st = codeStatus(c, now);
          return (
            <div key={c.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-zinc-200/10 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-200">
              <span className="font-extrabold tracking-[0.15em] text-zinc-100">{c.code}</span>
              <span className="max-w-48 truncate">{nameOf(c.player_id)}</span>
              <span>{c.uses}/{c.max_uses} usos</span>
              <span className="text-zinc-400">{fmtTs(c.starts_at)} → {fmtTs(c.expires_at)}</span>
              <span className={`font-bold tracking-wider uppercase ${st.cls}`}>{st.label}</span>
              <button type="button" onClick={() => remove(c.code)} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-red-300 hover:bg-red-950/40">Apagar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
