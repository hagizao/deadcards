import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, useData } from "../lib/data";
import { DEFAULT_TIER_CONFIG, POSITIONS, REGIONS, STAT_KEYS, calculateOVR, getPlayerHistory, getPlayerOvr } from "../lib/cards";
import { FRAME_PRESETS, getCardTier, type Tier } from "../lib/rarity";
import type { BgSettings, Player, Stats, Team, TierBand } from "../lib/types";
import { Card } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { HoldButton } from "../components/HoldButton";
import { Range } from "../components/Range";
import {
  ABILITIES, ABILITY_KEYS, ABILITY_V_RANGE, COST_RANGE, DEFAULT_LOCS, DESC_MAX, LOC_FIELDS, LOC_TYPES, LOC_V_RANGE, MIN_LOCS, NAME_MAX, POWER_RANGE,
  ITEMS, ITEM_KEYS, ITEM_OFFER_TURN, ITEM_REVEAL_TURN, ITEM_TIERS, ITEM_V_RANGE,
  cardStats, gameConfig, itemCost, itemStats, nRange, type AbilityKey, type CardOverride, type GameConfig, type GameLoc, type ItemKey, type ItemOverride, type LocType, type PoolCard,
} from "../lib/game/config";
import { cardPool } from "../lib/game/engine";
import { GAME_TEXT } from "../lib/game/text";

const SECTIONS = [
  { id: "card", label: "Carta" },
  { id: "teams", label: "Times" },
  { id: "heroes", label: "Heróis" },
  { id: "look", label: "Aparência" },
  { id: "codes", label: "Códigos" },
  { id: "game", label: "Cardslock Game" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const input = "w-full rounded-xl bg-zinc-950/80 border border-zinc-200/20 focus:border-zinc-200/70 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none";
const btn = "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${btn} bg-zinc-100 hover:bg-white text-zinc-950`;
const ghost = `${btn} border border-zinc-200/20 text-zinc-300 hover:text-white bg-zinc-900/60`;
const danger = `${btn} bg-red-600/90 hover:bg-red-500 text-white`;
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
          {section === "game" && <GameForm />}
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
    const body = { ...preview, id, name: d.name.trim() || "NOVO JOGADOR", footer: d.footer?.trim().slice(0, 30), specialText: d.special ? d.specialText?.trim().slice(0, 400) : undefined, frame: d.special ? frame : undefined };
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

/* ---------- Cardslock Game ---------- */

const GT = GAME_TEXT.pt;
const LOC_N_LABEL: Partial<Record<LocType, string>> = { slots: "Espaços", costLow: "Custo", costHigh: "Custo", midboss: "Turno", chaos: "Poder máximo" };
const clampTo = (x: number, [a, b]: [number, number]) => Math.max(a, Math.min(b, Math.round(x)));

function NumField({ label, value, range, onChange }: { label: string; value: number; range: [number, number]; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" inputMode="numeric" className={input} min={range[0]} max={range[1]} value={value}
        onChange={(e) => { if (e.target.value !== "" && Number.isFinite(+e.target.value)) onChange(clampTo(+e.target.value, range)); }} />
    </Field>
  );
}

function GameForm() {
  const { players, settings, heroIcon, heroArt, reload } = useData();
  const pool = useMemo(() => cardPool(players).sort((a, b) => a.name.localeCompare(b.name)), [players]);
  const [cfg, setCfg] = useState<GameConfig>(() => structuredClone(gameConfig(settings.game)));
  const [li, setLi] = useState(0);
  const [query, setQuery] = useState("");
  const [cardId, setCardId] = useState(pool[0]?.id ?? "");
  const { busy, msg, run } = useSaver(reload);

  const loc = cfg.locs[li];
  const setLoc = (patch: Partial<GameLoc>) => setCfg((c) => ({ ...c, locs: c.locs.map((l, i) => (i === li ? { ...l, ...patch } : l)) }));
  const setType = (type: LocType) => {
    const r = nRange(type);
    setLoc({ type, n: clampTo(loc.n || r[0], r), v: LOC_FIELDS[type].includes("v") && !loc.v ? 1 : loc.v });
  };
  const addLoc = () => { setCfg((c) => ({ ...c, locs: [...c.locs, { id: newId("l"), name: "Novo local", type: "enter", v: 1, n: 1, desc: "" }] })); setLi(cfg.locs.length); };
  const removeLoc = () => { setCfg((c) => ({ ...c, locs: c.locs.filter((_, i) => i !== li) })); setLi(Math.max(0, li - 1)); };

  const q = query.trim().toLowerCase();
  const shown = pool.filter((p) => !q || `${p.name} ${p.hero} ${p.position} ${GT.abilities[cardStats(p, cfg.cards).ab].name}`.toLowerCase().includes(q));
  const card = shown.find((p) => p.id === cardId) ?? shown[0];
  const stats = card && cardStats(card, cfg.cards);
  const override = card ? cfg.cards[card.id] : undefined;
  const setCard = (patch: CardOverride) => {
    if (!card) return;
    setCfg((c) => {
      const o: CardOverride = { ...c.cards[card.id], ...patch };
      if (!o.desc?.trim()) delete o.desc;
      if (o.v === undefined) delete o.v;
      return { ...c, cards: { ...c.cards, [card.id]: o } };
    });
  };
  const setItem = (k: ItemKey, patch: ItemOverride) => setCfg((c) => {
    const o: ItemOverride = { ...c.items[k], ...patch };
    if (!o.off) delete o.off;
    if (o.v === ITEMS[k].v) delete o.v;
    const items = { ...c.items, [k]: o };
    if (!Object.keys(o).length) delete items[k];
    return { ...c, items };
  });
  const resetCard = () => {
    if (!card) return;
    setCfg((c) => { const cards = { ...c.cards }; delete cards[card.id]; return { ...c, cards }; });
  };

  const save = () => {
    if (cfg.locs.length < MIN_LOCS) return;
    run(() => api.save("settings", "game", { game: cfg }), "Cardslock Game salvo! Vale a partir da próxima partida.");
  };

  const art = card ? heroIcon(card.hero) ?? heroArt(card.hero)?.url : undefined;
  const optLabel = (p: PoolCard) => `${p.name} · ${p.hero} · ${p.position}${cfg.cards[p.id] ? " (editada)" : ""}`;
  const kind = stats ? GT.kinds[ABILITIES[stats.ab].kind] : "";

  return (
    <div className="flex flex-col gap-6">
      <section className="noir-glass flex flex-col gap-4 rounded-3xl p-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Localizações</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-[1_1_14rem]">
            <Field label="Escolha o local">
              <select className={input} value={li} onChange={(e) => setLi(+e.target.value)}>
                {cfg.locs.map((l, i) => <option key={l.id + i} value={i}>{l.name || "Sem nome"} — {GT.locs[l.type].label}</option>)}
              </select>
            </Field>
          </div>
          <button type="button" className={ghost} onClick={addLoc}>+ Novo local</button>
          <button type="button" className={ghost} onClick={removeLoc} disabled={cfg.locs.length <= MIN_LOCS}>Remover este local</button>
        </div>
        <p className="text-xs text-zinc-400">Cada partida sorteia 3 dos {cfg.locs.length} locais.</p>
        {loc && (
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome"><input className={input} maxLength={NAME_MAX} value={loc.name} onChange={(e) => setLoc({ name: e.target.value })} /></Field>
                <Field label="Efeito">
                  <select className={input} value={loc.type} onChange={(e) => setType(e.target.value as LocType)}>
                    {LOC_TYPES.map((k) => <option key={k} value={k}>{GT.locs[k].label}</option>)}
                  </select>
                </Field>
              </div>
              {LOC_FIELDS[loc.type].length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {LOC_FIELDS[loc.type].includes("v") && <NumField label="Valor" value={loc.v} range={LOC_V_RANGE} onChange={(v) => setLoc({ v })} />}
                  {LOC_FIELDS[loc.type].includes("n") && <NumField label={LOC_N_LABEL[loc.type] ?? "Número"} value={loc.n} range={nRange(loc.type)} onChange={(n) => setLoc({ n })} />}
                </div>
              )}
              <Field label="Descrição">
                <textarea className={`${input} min-h-16 resize-y`} rows={3} maxLength={DESC_MAX} placeholder={GT.locs[loc.type].text(loc)} value={loc.desc} onChange={(e) => setLoc({ desc: e.target.value })} />
              </Field>
              <p className="text-xs text-zinc-400">Em branco, o jogo mostra o texto automático do efeito (o texto cinza no campo).</p>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl bg-zinc-950/60 p-4 text-center">
              <b className="font-display tracking-wide text-dl-text">{loc.name || "Sem nome"}</b>
              <span className="text-sm text-zinc-300">{loc.desc.trim() || GT.locs[loc.type].text(loc)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="noir-glass flex flex-col gap-4 rounded-3xl p-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Cartas</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-[1_1_14rem]">
            <Field label="Buscar"><input className={input} value={query} placeholder="Jogador, herói, role ou habilidade…" onChange={(e) => setQuery(e.target.value)} /></Field>
          </div>
          <div className="min-w-0 flex-[1_1_14rem]">
            <Field label="Escolha a carta">
              <select className={input} value={card?.id ?? ""} onChange={(e) => setCardId(e.target.value)}>
                {shown.length ? shown.map((p) => <option key={p.id} value={p.id}>{optLabel(p)}</option>) : <option value="">Nenhuma carta encontrada</option>}
              </select>
            </Field>
          </div>
        </div>
        {card && stats ? (
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex flex-col gap-3">
              {override && <span className="text-[10px] font-bold tracking-[0.12em] text-game-brass uppercase">Carta editada</span>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField label="Custo (almas)" value={stats.cost} range={COST_RANGE} onChange={(cost) => setCard({ cost })} />
                <NumField label="Poder" value={stats.power} range={POWER_RANGE} onChange={(power) => setCard({ power })} />
                {ABILITIES[stats.ab].usesV && <NumField label="Valor da habilidade" value={stats.v} range={ABILITY_V_RANGE} onChange={(v) => setCard({ v })} />}
              </div>
              <Field label="Habilidade">
                <select className={input} value={stats.ab} onChange={(e) => setCard({ ab: e.target.value as AbilityKey, v: undefined })}>
                  <optgroup label="Heróis do Deadlock">
                    {ABILITY_KEYS.filter((k) => ABILITIES[k].hero).map((k) => <option key={k} value={k}>{k} — {GT.abilities[k].name}</option>)}
                  </optgroup>
                  <optgroup label="Genéricas">
                    {ABILITY_KEYS.filter((k) => !ABILITIES[k].hero).map((k) => <option key={k} value={k}>{GT.abilities[k].name}</option>)}
                  </optgroup>
                </select>
              </Field>
              <p className="text-xs text-zinc-400">
                Padrão desta carta: {GT.abilities[stats.def.ab].name}{ABILITIES[stats.def.ab].hero ? ` (${stats.def.ab})` : ""}, custo {stats.def.cost}, poder {stats.def.power}.
              </p>
              <Field label="Descrição">
                <textarea className={`${input} min-h-16 resize-y`} rows={3} maxLength={DESC_MAX} placeholder={GT.abilities[stats.ab].text(stats.v)} value={override?.desc ?? ""} onChange={(e) => setCard({ desc: e.target.value })} />
              </Field>
              <p className="text-xs text-zinc-400">A descrição é só o texto da carta: quem decide o efeito é a habilidade escolhida. Em branco, usa o texto automático.</p>
              <div><button type="button" className={ghost} onClick={resetCard} disabled={!override}>Voltar esta carta ao padrão</button></div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-60 w-44 overflow-hidden rounded-xl text-white ring-1 ring-white/40" style={{ background: `linear-gradient(160deg, ${card.c1}, ${card.c2})` }}>
                {art && <img src={art} alt="" className="absolute inset-x-0 top-0 h-[72%] w-full object-cover" />}
                <i className="absolute top-1.5 left-1.5 flex size-9 items-center justify-center rounded-full border-2 border-white bg-blue-600 font-display text-lg font-extrabold not-italic">{stats.cost}</i>
                <b className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full border-2 border-white bg-game-brass font-display text-lg font-extrabold text-dl-black">{stats.power}</b>
                <span className="absolute inset-x-0 bottom-0 bg-black/85 px-1.5 py-2 text-center font-display text-sm tracking-wide">{card.name}</span>
              </div>
              <p className="text-sm/snug">
                <span className="font-bold text-game-brass">{GT.abilities[stats.ab].name}{kind ? ` (${kind})` : ""}:</span>{" "}
                {stats.desc || GT.abilities[stats.ab].text(stats.v)}
              </p>
            </div>
          </div>
        ) : <p className="text-xs text-zinc-400">Nenhuma carta para editar.</p>}
      </section>

      <section className="noir-glass flex flex-col gap-4 rounded-3xl p-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Itens da loja</h2>
        <p className="text-xs text-zinc-400">
          No turno {ITEM_OFFER_TURN} cada lado escolhe 1 entre 3 itens (mesma combinação de tiers para você e a IA). O item é revelado e pago no turno {ITEM_REVEAL_TURN}: tier 1 a 4 custa 1 a 4 almas. Item desligado não aparece no sorteio.
        </p>
        {ITEM_TIERS.map((tier) => (
          <div key={tier} className="flex flex-col gap-2">
            <h3 className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Tier {tier} · custa {itemCost(tier)} {itemCost(tier) === 1 ? "alma" : "almas"}</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {ITEM_KEYS.filter((k) => ITEMS[k].tier === tier).map((k) => {
                const it = itemStats(k, cfg.items);
                return (
                  <div key={k} className={`flex flex-col gap-2 rounded-2xl bg-zinc-950/60 p-3 ${it.on ? "" : "opacity-60"}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-zinc-100">
                      <input type="checkbox" className="size-4 accent-zinc-100" checked={it.on} onChange={(e) => setItem(k, { off: !e.target.checked })} />
                      {k} <span className="text-xs font-normal text-zinc-400">· {GT.slots[ITEMS[k].slot]}</span>
                    </label>
                    <p className="text-xs text-zinc-300">{GT.items[k](it.v)}</p>
                    {ITEMS[k].usesV && (
                      <div className="w-32"><NumField label="Valor" value={it.v} range={ITEM_V_RANGE} onChange={(v) => setItem(k, { v })} /></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="noir-glass sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <button type="button" className={primary} disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
        <button type="button" className={ghost} onClick={() => { setCfg({ locs: structuredClone(DEFAULT_LOCS), cards: {}, items: {} }); setLi(0); }}>Restaurar tudo ao padrão</button>
        <Toast msg={msg} />
      </div>
    </div>
  );
}
