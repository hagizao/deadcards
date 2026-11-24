import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useData } from "../lib/data";
import { DEFAULT_TIER_CONFIG, POSITIONS, REGIONS, STAT_KEYS, calculateOVR, cardVersions, getPlayerHistory, getPlayerOvr, isAltHero, isMainCard, ALT_HERO_DROP } from "../lib/cards";
import { FRAME_PRESETS, getCardTier, type Tier } from "../lib/rarity";
import { HOME_FEATURED_MAX, type BgSettings, type Player, type Stats, type Team, type TierBand } from "../lib/types";
import { Card } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { HoldButton } from "../components/HoldButton";
import { Range } from "../components/Range";

const SECTIONS = [
  { id: "card", label: "Carta" },
  { id: "teams", label: "Times" },
  { id: "heroes", label: "Heróis" },
  { id: "look", label: "Aparência" },
  { id: "codes", label: "Códigos" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const input = "w-full rounded-xl bg-zinc-950/80 border border-zinc-200/20 focus:border-zinc-200/70 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none";
const btn = "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${btn} bg-zinc-100 hover:bg-white text-zinc-950`;
const ghost = `${btn} border border-zinc-200/20 text-zinc-300 hover:text-white bg-zinc-900/60`;
const chip = `${btn} min-h-11 sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:opacity-80`;
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
  const [versionOf, setVersionOf] = useState<string | null>(null);
  // a nova versão é de outro herói que o jogador joga (e não um time ou carta especial)
  const [altHero, setAltHero] = useState(false);
  if (editId !== prevEditId) {
    setPrevEditId(editId);
    if (editId) {
      setSection("card");
      setVersionOf(null);
    }
  }
  const pick = (id: string | null) => {
    setVersionOf(null);
    onEditId(id);
  };
  const newVersion = (mainId: string, hero = false) => {
    setVersionOf(mainId);
    setAltHero(hero);
    onEditId(null);
  };
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
          {section === "card" && <PlayerForm key={editId ?? (versionOf ? `new:${versionOf}:${altHero}` : "new")} editId={editId} onEditId={pick} versionOf={versionOf} altHero={altHero} onNewVersion={newVersion} />}
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

/**
 * Heróis jogados pelo jogador, além do de assinatura: cada um vira uma carta-versão com tudo ALT_HERO_DROP abaixo.
 * Clicar num herói sem carta cria a carta; num que já tem, abre a carta para editar.
 */
function PlayedHeroes({ main, onOpen }: { main: Player; onOpen: (id: string) => void }) {
  const { players, heroNames, heroIcon, reload } = useData();
  const { busy, msg, run } = useSaver(reload);
  const [q, setQ] = useState("");
  const byHero = new Map(cardVersions(players, main).filter(isAltHero).map((c) => [c.hero, c]));
  const add = (hero: string) => {
    const id = newId("p");
    const ovr = Math.max(1, getPlayerOvr(main) - ALT_HERO_DROP);
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(1, main.stats[k] - ALT_HERO_DROP)])) as Stats;
    const body: Player = { ...structuredClone(main), id, hero, stats, ovr, variantOf: main.id, altHero: true, history: [{ date: today(), ovr, base: true }],
      special: undefined, specialText: undefined, frame: undefined, art: undefined, inactive: undefined };
    run(() => api.save("players", id, body), `Carta de ${main.name} com ${hero} criada (OVR ${ovr}).`);
  };
  // depois de mudar a principal (atributos, OVR ou trocar qual é a principal), as cartas de heróis jogados voltam a ficar ALT_HERO_DROP abaixo
  const ovr = Math.max(1, getPlayerOvr(main) - ALT_HERO_DROP);
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(1, main.stats[k] - ALT_HERO_DROP)])) as Stats;
  const stale = [...byHero.values()].filter((c) => getPlayerOvr(c) !== ovr || STAT_KEYS.some((k) => c.stats[k] !== stats[k]));
  const resync = () => run(async () => {
    for (const c of stale) {
      const history = [...c.history.filter((h) => h.date !== today()), { date: today(), ovr }];
      await api.save("players", c.id, { ...c, stats, ovr, history });
    }
  }, `${stale.length} ${stale.length === 1 ? "carta atualizada" : "cartas atualizadas"} para OVR ${ovr}.`);
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
          Heróis jogados <span className="text-zinc-100">{byHero.size}</span>
          <span className="ml-2 tracking-normal normal-case">clique para criar a carta ({ALT_HERO_DROP} abaixo da assinatura) ou abrir a que já existe</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {stale.length > 0 && (
            <button type="button" disabled={busy} onClick={resync} className={`${chip} bg-amber-300 text-zinc-950 hover:bg-amber-200 disabled:opacity-50`}
              title={`Deixa as cartas de heróis jogados com tudo ${ALT_HERO_DROP} abaixo desta carta`}>
              Recalcular {stale.length} (assinatura − {ALT_HERO_DROP})
            </button>
          )}
          <input className={`${input} max-w-48 py-1.5`} placeholder="Buscar herói" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-9">
        {heroNames.filter((h) => h !== main.hero && h.toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => Number(byHero.has(b)) - Number(byHero.has(a)))
          .map((h) => {
            const icon = heroIcon(h);
            const card = byHero.get(h);
            return (
              <button key={h} type="button" disabled={busy} onClick={() => (card ? onOpen(card.id) : add(h))} aria-pressed={!!card}
                title={card ? `${h}: abrir carta (OVR ${getPlayerOvr(card)})` : `${h}: criar carta`}
                className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-zinc-900 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:cursor-wait disabled:opacity-50 ${card ? "border-amber-300 shadow-[0_0_10px_rgb(252_211_77/0.45)]" : "border-zinc-200/10 opacity-50 grayscale hover:opacity-100 hover:grayscale-0"}`}>
                {icon ? <img src={icon} alt={h} className="size-full object-cover" loading="lazy" /> : <span className="text-[9px] text-zinc-300">{h}</span>}
                {card && <span className="absolute right-0.5 bottom-0.5 rounded-sm bg-zinc-950/85 px-1 text-[9px] font-black text-amber-200">{getPlayerOvr(card)}</span>}
              </button>
            );
          })}
      </div>
      <Toast msg={msg} />
    </div>
  );
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

function PlayerForm({ editId, onEditId, versionOf, altHero, onNewVersion }: { editId: string | null; onEditId: (id: string | null) => void; versionOf: string | null; altHero: boolean; onNewVersion: (mainId: string, hero?: boolean) => void }) {
  const { players, teams, heroNames, heroIcon, settings, reload } = useData();
  const existing = editId ? players.find((p) => p.id === editId) : undefined;
  const base = !existing && versionOf ? players.find((p) => p.id === versionOf) : undefined;
  const [d, setD] = useState<Player>(() => {
    if (existing) return structuredClone({ ...existing, ovr: getPlayerOvr(existing) });
    if (base && altHero) {
      // herói jogado: tudo ALT_HERO_DROP abaixo da principal (OVR incluso), com o primeiro herói que ele ainda não tem
      const taken = new Set(cardVersions(players, base).map((c) => c.hero));
      const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(1, base.stats[k] - ALT_HERO_DROP)])) as Stats;
      return { ...structuredClone(base), stats, ovr: Math.max(1, getPlayerOvr(base) - ALT_HERO_DROP), hero: heroNames.find((h) => !taken.has(h)) ?? base.hero,
        id: "", variantOf: base.id, altHero: true, history: [], inactive: undefined, special: undefined, specialText: undefined, frame: undefined, art: undefined };
    }
    if (base) return { ...structuredClone(base), ovr: getPlayerOvr(base), id: "", variantOf: base.id, altHero: undefined, history: [], inactive: undefined, special: true };
    return blankPlayer(teams[0]?.id ?? "");
  });
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
    run(async () => { await api.save("players", id, body); await reload(); onEditId(id); }, `Carta de "${body.name}" salva!`);
  };
  const remove = () => {
    if (!d.id) return;
    run(async () => { await api.remove("players", d.id); onEditId(null); }, "Carta excluída.");
  };
  const main = existing ? players.find((p) => p.id === (existing.variantOf || existing.id)) ?? existing : base;
  const versions = main ? cardVersions(players, main) : [];
  const tagOf = (p: Player) => teams.find((t) => t.id === p.teamId)?.tag ?? "?";

  if (!teams.length) return <p className="text-zinc-300">Crie um time na aba Times antes de criar cartas.</p>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="noir-glass space-y-6 rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="rk-chip">{d.id ? "Modo Edição" : "Modo Criação"}</span>
            <h2 className="mt-2 text-2xl font-black tracking-[0.12em] text-white uppercase">{d.id ? `Editar: ${existing?.name ?? d.name}` : base ? `${altHero ? "Novo herói jogado" : "Nova versão"} de ${base.name}` : "Criar Novo Jogador"}</h2>
          </div>
          <select className={`${input} min-h-11 w-auto sm:min-h-0`} value={main && isMainCard(main) ? main.id : ""} onChange={(e) => onEditId(e.target.value || null)} aria-label="Jogador">
            <option value="">+ Novo jogador</option>
            {players.filter(isMainCard).sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name} · {tagOf(p)}</option>)}
          </select>
        </div>

        {main && (
          <div className="flex flex-wrap gap-2">
            {versions.map((c) => {
              const active = c.id === d.id;
              return (
                <button key={c.id} type="button" aria-pressed={active} onClick={() => onEditId(c.id)} className={`${chip} ${active ? "bg-zinc-100 text-zinc-950" : "border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white"}`}>
                  {isMainCard(c) ? `Principal · ${c.hero}` : isAltHero(c) ? c.hero : `${c.special ? "Especial" : "Versão"} · ${tagOf(c)}`} · {getPlayerOvr(c)}
                </button>
              );
            })}
            <button type="button" className={`${chip} border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white`} onClick={() => onNewVersion(main.id, true)}>+ Herói jogado</button>
            <button type="button" className={`${chip} border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white`} onClick={() => onNewVersion(main.id)}>+ Nova versão</button>
          </div>
        )}

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
          <div className="sm:col-span-2">
            {!isMainCard(d) || cardVersions(players, d).length <= 1 ? (
              <Field label="Jogador desta versão (vazio = carta principal)">
                <select className={input} value={d.variantOf ?? ""} onChange={(e) => set({ variantOf: e.target.value || undefined })}>
                  <option value="">Carta principal</option>
                  {players.filter((p) => isMainCard(p) && p.id !== d.id).map((p) => <option key={p.id} value={p.id}>{p.name} · {tagOf(p)} · {getPlayerOvr(p)}</option>)}
                </select>
              </Field>
            ) : (
              <p className="text-xs text-zinc-400">Carta principal de {cardVersions(players, d).length - 1} versões. Para trocar, abra uma versão e use Tornar principal.</p>
            )}
            {!isMainCard(d) && (
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={!!d.altHero} onChange={(e) => set({ altHero: e.target.checked || undefined })} className="accent-amber-300" />
                Herói jogado (o mesmo jogador com outro herói; fica fora do elenco e da tier list)
              </label>
            )}
          </div>
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

        {isMainCard(d) && (existing
          ? <PlayedHeroes main={existing} onOpen={onEditId} />
          : <p className="text-xs text-zinc-400">Salve a carta para adicionar os heróis jogados além do herói de assinatura.</p>)}

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
          {d.art && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Artista (crédito)">
                <input className={input} maxLength={60} placeholder="@artista" value={d.art.credit?.name ?? ""}
                  onChange={(e) => set({ art: { ...d.art!, credit: e.target.value ? { ...d.art!.credit, name: e.target.value } : undefined } })} />
              </Field>
              <Field label="Link do artista (Twitter, Instagram…)">
                <input className={input} type="url" maxLength={300} placeholder="https://x.com/artista" disabled={!d.art.credit?.name} value={d.art.credit?.url ?? ""}
                  onChange={(e) => set({ art: { ...d.art!, credit: { name: d.art!.credit!.name, url: e.target.value || undefined } } })} />
              </Field>
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
          {d.id && !isMainCard(d) && <button type="button" className={ghost} disabled={busy} onClick={() => run(async () => { await api.promote(d.id); await reload(); set({ variantOf: undefined, inactive: undefined }); onEditId(d.id); }, `${d.name} agora é a carta principal.`)}>Tornar principal</button>}
          {d.id && isMainCard(d) && <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={!!d.inactive} onChange={(e) => set({ inactive: e.target.checked || undefined })} className="accent-zinc-100" />Fora do elenco (versão guardada)</label>}
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
  const { settings, players, teams, reload } = useData();
  const [bg, setBg] = useState(settings.bg);
  const [homeHero, setHomeHero] = useState(settings.homeHero);
  const [featured, setFeatured] = useState(() => Array.from({ length: HOME_FEATURED_MAX }, (_, i) => settings.homeFeatured?.[i] ?? ""));
  const options = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const tagOf = (p: Player) => teams.find((t) => t.id === p.teamId)?.tag ?? "FA";
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
        <fieldset className="space-y-3 rounded-2xl border border-zinc-200/10 p-4">
          <legend className="px-1 text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Cartas em destaque (Home)</legend>
          <p className="text-xs text-zinc-400">A primeira fica no centro. Sem nenhuma escolhida, a Home mostra as maiores OVR.</p>
          {featured.map((id, i) => (
            <select key={i} className={input} value={id} aria-label={`Destaque ${i + 1}`} onChange={(e) => setFeatured((f) => f.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">{i + 1}. —</option>
              {options.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id !== id && featured.includes(p.id)}>
                  {i + 1}. {p.name} · {tagOf(p)} · {getPlayerOvr(p)}{p.special ? " · especial" : ""}
                </option>
              ))}
            </select>
          ))}
        </fieldset>
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
        <button type="button" className={primary} disabled={busy} onClick={() => run(() => api.save("settings", "app", { bg: bg ?? null, homeHero: homeHero ?? null, homeFeatured: featured.filter(Boolean), tierConfig: tiers }), "Aparência salva!")}>
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
