import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useData } from "../lib/data";
import { DEFAULT_TIER_CONFIG, POSITIONS, REGIONS, STAT_KEYS, calculateOVR, cardVersions, getPlayerHistory, getPlayerOvr, isAltHero, isMainCard, isRetired, ALT_HERO_DROP } from "../lib/cards";
import { asPlayedHero, playedStats } from "../lib/cardKinds";
import { UniversalCollection } from "../components/UniversalCollection";
import { FRAME_PRESETS, RARITY_TIERS, getCardTier, type Tier } from "../lib/rarity";
import { RARITY_KEYS, rarityKeyOf, type RarityKey } from "../lib/rarityBands";
import { HOME_FEATURED_MAX, SCHEDULE_LABEL_MAX, TOURNAMENT_DESC_MAX, TOURNAMENT_NAME_MAX, type ScheduleEntry, type Tournament, type BgSettings, type Player, type Stats, type Team, type TierBand } from "../lib/types";
import { Card } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { TournamentLogo } from "../components/TournamentLogo";
import { HoldButton } from "../components/HoldButton";
import { Icon } from "../components/Icon";
import { Range } from "../components/Range";
import { PackArt } from "../components/Pack";
import { downloadBlob } from "../lib/cardImage";
import { PACK_SOUNDS, hasPackFile, previewPackSound, renderPackSoundWav, type PackSoundId, type SoundHandle } from "../lib/packSounds";
import { DEFAULT_PACK_ODDS, DEFAULT_RARITY_ODDS, PACK_KINDS, PACK_NAME_MAX, cardChances, chanceSummary, drawCard, packKind, packPool, type PackKind, type PackType, type RarityOf } from "../lib/packs";

const SECTIONS = [
  { id: "card", label: "Carta" },
  { id: "teams", label: "Times" },
  { id: "heroes", label: "Heróis" },
  { id: "look", label: "Aparência" },
  { id: "tournaments", label: "Torneios" },
  { id: "calendar", label: "Calendário" },
  { id: "packs", label: "Packs" },
  { id: "codes", label: "Códigos" },
  { id: "universal", label: "Coleção universal" },
  { id: "sounds", label: "Sons" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const input = "w-full rounded-xl bg-zinc-950/80 border border-zinc-200/20 focus:border-zinc-200/70 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none";
const btn = "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${btn} bg-zinc-100 hover:bg-white text-zinc-950`;
const ghost = `${btn} border border-zinc-200/20 text-zinc-300 hover:text-white bg-zinc-900/60`;
const chip = `${btn} min-h-11 sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:opacity-80`;
const danger = `${btn} bg-red-600/90 hover:bg-red-500 text-white`;
const today = () => new Date().toISOString().slice(0, 10);
// heróis jogados além do de assinatura: cada um vira uma carta com tudo ALT_HERO_DROP abaixo
const MAX_PLAYED = 5;
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
  const newVersion = (mainId: string) => {
    setVersionOf(mainId);
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
          {section === "card" && <PlayerForm key={editId ?? (versionOf ? `new:${versionOf}` : "new")} editId={editId} onEditId={pick} versionOf={versionOf} onNewVersion={newVersion} />}
          {section === "teams" && <TeamsForm />}
          {section === "heroes" && <HeroesForm />}
          {section === "look" && <LookForm />}
          {section === "tournaments" && <TournamentsForm />}
          {section === "calendar" && <CalendarForm />}
          {section === "packs" && <PacksForm />}
          {section === "codes" && <CodesForm />}
          {section === "universal" && <UniversalCollection onEdit={pick} />}
          {section === "sounds" && <SoundsForm />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function blankPlayer(teamId: string): Player {
  const stats = { MIR: 88, MAC: 86, SUP: 82, MOV: 87, POL: 85, CON: 86 };
  return { id: "", teamId, name: "", position: "Carry", hero: "Abrams", stats, ovr: calculateOVR(stats), c1: "#0e7490", c2: "#082f49", history: [], footer: "Cardslock" };
}

function withHistory(p: Player, date: string): Player {
  const ovr = Math.min(99, Math.max(1, Math.round(p.ovr ?? calculateOVR(p.stats))));
  const history = (p.id ? getPlayerHistory(p) : []).map((h) => ({ ...h }));
  const same = history.find((h) => h.date === date);
  if (same) same.ovr = ovr; else history.push({ date, ovr });
  history.sort((a, b) => a.date.localeCompare(b.date));
  return { ...p, ovr, history };
}

function PlayerForm({ editId, onEditId, versionOf, onNewVersion }: { editId: string | null; onEditId: (id: string | null) => void; versionOf: string | null; onNewVersion: (mainId: string) => void }) {
  const { players, teams, heroNames, heroIcon, settings, reload } = useData();
  const existing = editId ? players.find((p) => p.id === editId) : undefined;
  const base = !existing && versionOf ? players.find((p) => p.id === versionOf) : undefined;
  const [d, setD] = useState<Player>(() => {
    if (existing) return structuredClone({ ...existing, ovr: getPlayerOvr(existing) });
    if (base) return { ...structuredClone(base), ovr: getPlayerOvr(base), id: "", variantOf: base.id, altHero: undefined, history: [], inactive: undefined, exclusive: undefined };
    return blankPlayer(teams[0]?.id ?? "");
  });
  const [date, setDate] = useState(today);
  const [heroQuery, setHeroQuery] = useState("");
  // a mesma área de heróis serve para o de assinatura (1) e, na carta principal, para os heróis jogados (até MAX_PLAYED)
  const [heroTab, setHeroTab] = useState<"signature" | "played">("signature");
  const altsOf = (id: string) => players.filter((p) => p.variantOf === id && isAltHero(p));
  const [played, setPlayed] = useState<string[]>(() => (existing && isMainCard(existing) ? altsOf(existing.id).filter((c) => !isRetired(c)).map((c) => c.hero) : []));
  // heróis com carta aposentada: marcar de novo reativa a mesma carta
  const retired = new Set(existing && isMainCard(existing) ? altsOf(existing.id).filter(isRetired).map((c) => c.hero) : []);
  const { busy, msg, run } = useSaver(reload);
  // toda mudança passa pela regra do herói jogado: versão comum com outro herói no mesmo time fica 2 abaixo da principal
  const set = (patch: Partial<Player>) => setD((p) => asPlayedHero({ ...p, ...patch }, players));
  const isPlayed = !!asPlayedHero(d, players).altHero;
  const setStat = (k: keyof Stats, v: number) => setD((p) => { const stats = { ...p.stats, [k]: v }; return { ...p, stats, ovr: calculateOVR(stats) }; });
  const preview = withHistory({ ...d, name: d.name || "NOVO JOGADOR" }, date);
  const frame = d.frame ?? { style: "deco" };

  const save = () => {
    const id = d.id || newId("p");
    const body = { ...asPlayedHero(preview, players), id, name: d.name.trim() || "NOVO JOGADOR", footer: d.footer?.trim().slice(0, 30), specialText: d.special ? d.specialText?.trim().slice(0, 400) : undefined, frame: d.special ? frame : undefined };
    run(async () => {
      await api.save("players", id, body);
      if (isMainCard(body)) await syncPlayed(body);
      await reload();
      onEditId(id);
    }, `Carta de "${body.name}" salva!`);
  };
  // cria, apaga e atualiza as cartas de heróis jogados para ficarem iguais à seleção, tudo ALT_HERO_DROP abaixo da principal
  const syncPlayed = async (main: Player) => {
    const { stats, ovr } = playedStats(main) as { stats: Stats; ovr: number };
    const have = altsOf(main.id);
    // primeiro cria, reativa e atualiza; só depois tira as desmarcadas, para uma falha não deixar a seleção pela metade
    for (const hero of played) {
      const c = have.find((x) => x.hero === hero);
      if (!c) {
        const id = newId("p");
        await api.save("players", id, { ...structuredClone(main), id, hero, stats, ovr, variantOf: main.id, altHero: true, history: [{ date: today(), ovr, base: true }],
          special: undefined, specialText: undefined, frame: undefined, art: undefined, inactive: undefined, exclusive: undefined });
        continue;
      }
      const same = !c.inactive && getPlayerOvr(c) === ovr && STAT_KEYS.every((k) => c.stats[k] === stats[k]) && c.name === main.name && c.teamId === main.teamId && c.position === main.position;
      if (same) continue;
      const history = getPlayerOvr(c) === ovr ? c.history : [...c.history.filter((h) => h.date !== today()), { date: today(), ovr }];
      await api.save("players", c.id, { ...c, name: main.name, teamId: main.teamId, position: main.position, stats, ovr, history, inactive: undefined });
    }
    // desmarcada: apaga; se alguém já tem a carta, aposenta (quem tem continua com ela)
    for (const c of have) {
      if (played.includes(c.hero) || c.inactive) continue;
      try {
        await api.remove("players", c.id);
      } catch (e) {
        if ((e as { code?: string }).code !== "owned") throw e;
        await api.save("players", c.id, { ...c, inactive: true });
      }
    }
  };
  const rank = (h: string) => (played.includes(h) ? 2 : retired.has(h) ? 1 : 0);
  const pickHero = (h: string) => {
    if (heroTab === "signature") {
      set({ hero: h });
      setPlayed((list) => list.filter((x) => x !== h));
    } else {
      setPlayed((list) => (list.includes(h) ? list.filter((x) => x !== h) : list.length < MAX_PLAYED ? [...list, h] : list));
    }
  };
  const remove = () => {
    if (!d.id) return;
    run(async () => { await api.remove("players", d.id); onEditId(null); }, "Carta excluída.");
  };
  const playedTab = heroTab === "played" && isMainCard(d);
  const main = existing ? players.find((p) => p.id === (existing.variantOf || existing.id)) ?? existing : base;
  const versions = main ? cardVersions(players, main) : [];
  const tagOf = (p: Player) => teams.find((t) => t.id === p.teamId)?.tag ?? "?";

  if (!teams.length) return <p className="text-zinc-300">Crie um time na aba Times antes de criar cartas.</p>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="rk-chip">{d.id ? "Modo Edição" : "Modo Criação"}</span>
            <h2 className="mt-2 text-2xl font-black tracking-[0.12em] text-white uppercase">{d.id ? `Editar: ${existing?.name ?? d.name}` : base ? `Nova versão de ${base.name}` : "Criar Novo Jogador"}</h2>
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
                  {isMainCard(c) ? `Principal · ${c.hero}` : isAltHero(c) ? `${c.hero}${c.inactive ? " (aposentada)" : ""}` : `${c.special ? "Especial" : "Versão"} · ${tagOf(c)}`} · {getPlayerOvr(c)}{c.exclusive && " · exclusiva"}
                </button>
              );
            })}
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
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
              {playedTab
                ? <>Heróis jogados <span className="text-amber-200">{played.length}/{MAX_PLAYED}</span></>
                : <>Herói de assinatura: <span className="text-zinc-100">{d.hero}</span></>}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {isMainCard(d) && (
                <button type="button" aria-pressed={playedTab} onClick={() => setHeroTab(playedTab ? "signature" : "played")}
                  className={`${chip} ${playedTab ? "bg-amber-300 text-zinc-950 hover:bg-amber-200" : "border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white"}`}>
                  {playedTab ? "Voltar ao herói de assinatura" : `Heróis jogados (${played.length}/${MAX_PLAYED})`}
                </button>
              )}
              <input className={`${input} max-w-48 py-1.5`} placeholder="Buscar herói" aria-label="Buscar herói" value={heroQuery} onChange={(e) => setHeroQuery(e.target.value)} />
            </div>
          </div>
          <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto p-1 sm:grid-cols-9">
            {heroNames.filter((h) => h.toLowerCase().includes(heroQuery.toLowerCase()))
              // nos heróis jogados, os escolhidos vêm primeiro e os aposentados logo depois, para não sumirem no fim da lista
              .sort((x, y) => (playedTab ? rank(y) - rank(x) : 0))
              .map((h) => {
              const icon = heroIcon(h);
              const on = playedTab ? played.includes(h) : d.hero === h;
              // nos heróis jogados, o de assinatura fica travado e a seleção para em MAX_PLAYED
              const locked = playedTab && (h === d.hero || (!on && played.length >= MAX_PLAYED));
              return (
                <button key={h} type="button" onClick={() => pickHero(h)} title={playedTab && h === d.hero ? `${h} (assinatura)` : playedTab && retired.has(h) ? `${h} (carta aposentada)` : h} aria-pressed={on} disabled={locked}
                  className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-zinc-900 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-25 disabled:grayscale disabled:hover:scale-100 motion-reduce:transition-none ${
                    on ? (playedTab ? "border-amber-300 shadow-[0_0_12px_rgb(252_211_77/0.5)]" : "border-white shadow-[0_0_12px_rgba(255,255,255,0.5)]") : "border-zinc-200/10 opacity-70 hover:opacity-100"}`}>
                  {icon ? <img src={icon} alt={h} className="size-full object-cover" loading="lazy" /> : <span className="text-[9px] text-zinc-300">{h}</span>}
                  {playedTab && retired.has(h) && !on && <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-amber-300 ring-2 ring-zinc-950" />}
                </button>
              );
            })}
          </div>
          {playedTab && (
            <p className="text-xs text-zinc-400">
              Cada herói jogado vira uma carta com tudo {ALT_HERO_DROP} abaixo da assinatura. Aplica ao salvar.
              {retired.size > 0 && <> <span className="text-amber-200">●</span> carta aposentada: alguém já tinha, então ela ficou com quem tem; marcar de novo reativa a mesma carta.</>}
            </p>
          )}
        </div>

        {isPlayed && (
          <p className="text-xs text-amber-200">Carta de herói jogado: atributos e OVR ficam {ALT_HERO_DROP} abaixo da principal e acompanham quando ela muda. Para valores próprios, marque Carta especial.</p>
        )}
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {STAT_KEYS.map((k) => <Range key={k} label={k} value={d.stats[k]} min={1} max={99} disabled={isPlayed} onChange={(v) => setStat(k, v)} />)}
        </div>

        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Field label={`OVR (média ${calculateOVR(d.stats)})`}>
            <input type="number" min={1} max={99} className={`${input} disabled:cursor-not-allowed disabled:opacity-40`} disabled={isPlayed} value={d.ovr ?? ""} onChange={(e) => set({ ovr: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Cor 1"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.c1} onChange={(e) => set({ c1: e.target.value })} /></Field>
          <Field label="Cor 2"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.c2} onChange={(e) => set({ c2: e.target.value })} /></Field>
          <Field label="Rodapé"><input className={input} maxLength={30} value={d.footer ?? ""} onChange={(e) => set({ footer: e.target.value })} /></Field>
          <Field label="Cor do rodapé"><input type="color" className="h-10 w-full cursor-pointer rounded-lg bg-transparent" value={d.footerColor ?? "#f4f4f5"} onChange={(e) => set({ footerColor: e.target.value })} /></Field>
        </div>
        <Range label="Tamanho do rodapé (px)" value={d.footerSize ?? 12} min={8} max={20} onChange={(v) => set({ footerSize: v })} />

        <div className="space-y-3 border-l border-zinc-200/15 pl-4">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Camada da frente (PNG transparente, opcional)</span>
              <div className="flex gap-2">
                <ImagePick folder="players" label={d.art.fg ? "Trocar camada" : "Enviar camada"} onUrl={(url) => set({ art: { ...d.art!, fg: { url, zoom: 100, x: 50, y: 50 } } })} />
                {d.art.fg && <button type="button" className={ghost} onClick={() => set({ art: { ...d.art!, fg: undefined } })}>Remover camada</button>}
              </div>
            </div>
          )}
          {d.art?.fg && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Range label="Zoom da frente" value={d.art.fg.zoom ?? 100} min={50} max={300} onChange={(v) => set({ art: { ...d.art!, fg: { ...d.art!.fg!, zoom: v } } })} />
              <Range label="X da frente" value={d.art.fg.x ?? 50} min={0} max={100} onChange={(v) => set({ art: { ...d.art!, fg: { ...d.art!.fg!, x: v } } })} />
              <Range label="Y da frente" value={d.art.fg.y ?? 50} min={0} max={100} onChange={(v) => set({ art: { ...d.art!, fg: { ...d.art!.fg!, y: v } } })} />
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

        <div className="space-y-3 border-l-2 border-amber-200/30 pl-4">
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300 sm:min-h-0">
            <input type="checkbox" checked={!!d.exclusive} onChange={(e) => set({ exclusive: e.target.checked || undefined })} className="accent-zinc-100" />
            Carta exclusiva (não sai em packs)
          </label>
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
      <div className="space-y-2">
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
          <motion.div key={d.id || "new"} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="space-y-4 border-t border-zinc-200/15 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
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
    <div className="space-y-3 border-l border-zinc-200/15 pl-4">
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
      <div className="space-y-5">
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
  const [guide, setGuide] = useState(settings.homeGuide ?? "");
  const options = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const tagOf = (p: Player) => teams.find((t) => t.id === p.teamId)?.tag ?? "FA";
  const [tiers, setTiers] = useState<TierBand[]>(() => structuredClone(settings.tierConfig ?? DEFAULT_TIER_CONFIG));
  const { busy, msg, run } = useSaver(reload);
  const setTier = (i: number, patch: Partial<TierBand>) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // mínimo e máximo andam juntos com a faixa vizinha: sem buraco nem sobreposição entre letras
  const setMin = (i: number, min: number) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, min } : j === i + 1 ? { ...x, max: min - 1 } : x)));
  const setMax = (i: number, max: number) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, max } : j === i - 1 ? { ...x, min: max + 1 } : x)));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Fundo e capa</h2>
        <BgFields bg={bg} onChange={setBg} folder="bg" title="Fundo do site" />
        <div className="space-y-3 border-l border-zinc-200/15 pl-4">
          <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Imagem da capa (Home)</span>
          {homeHero && <img src={homeHero} alt="" className="h-28 rounded-lg object-cover" />}
          <div className="flex gap-2">
            <ImagePick folder="home" onUrl={setHomeHero} />
            {homeHero && <button type="button" className={ghost} onClick={() => setHomeHero(undefined)}>Remover</button>}
          </div>
        </div>
        <fieldset className="space-y-3 border-l border-zinc-200/15 pl-4">
          <legend className="px-1 text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Conheça o competitivo (Home)</legend>
          <p className="text-xs text-zinc-400">As cartas do palco no topo da Home, na ordem em que giram. Sem nenhuma escolhida, a Home mostra as maiores OVR.</p>
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
        <label className="block space-y-2 border-l border-zinc-200/15 pl-4">
          <span className="block text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Como ler uma carta (Home)</span>
          <span className="block text-xs text-zinc-400">A carta usada para explicar cada parte. Sem escolha, usa a primeira do palco.</span>
          <select className={input} value={guide} onChange={(e) => setGuide(e.target.value)}>
            <option value="">— A primeira do palco</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {tagOf(p)} · {getPlayerOvr(p)}{p.special ? " · especial" : ""}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-3 border-t border-zinc-200/15 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Tier List</h2>
          <button type="button" className={ghost} onClick={() => setTiers(structuredClone(DEFAULT_TIER_CONFIG))}>Padrão</button>
        </div>
        {tiers.map((t, i) => (
          <div key={t.key} className="grid grid-cols-[3rem_1fr_1fr_2.5rem_2.5rem] items-center gap-2">
            <span className="flex h-9 items-center justify-center rounded-lg font-black" style={{ background: t.bg, color: t.text }}>{t.key}</span>
            <input type="number" className={input} value={t.min} aria-label={`Mínimo ${t.key}`} onChange={(e) => setMin(i, Number(e.target.value))} />
            <input type="number" className={input} value={t.max} aria-label={`Máximo ${t.key}`} onChange={(e) => setMax(i, Number(e.target.value))} />
            <input type="color" className="h-9 w-full cursor-pointer rounded-sm bg-transparent" value={t.bg} aria-label={`Cor ${t.key}`} onChange={(e) => setTier(i, { bg: e.target.value })} />
            <input type="color" className="h-9 w-full cursor-pointer rounded-sm bg-transparent" value={t.text} aria-label={`Texto ${t.key}`} onChange={(e) => setTier(i, { text: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="button" className={primary} disabled={busy} onClick={() => run(() => api.save("settings", "app", { bg: bg ?? null, homeHero: homeHero ?? null, homeFeatured: featured.filter(Boolean), homeGuide: guide || null, tierConfig: tiers }), "Aparência salva!")}>
          {busy ? "Salvando…" : "Salvar aparência"}
        </button>
        <Toast msg={msg} />
      </div>
    </div>
  );
}

const KIND_LABEL: Record<PackKind, string> = { alt: "Herói jogado", signature: "Herói de assinatura", special: "Especial e outras versões" };
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: n < 0.01 ? 2 : 1 })}%`;

const KIND_SHORT: Record<PackKind, string> = { alt: "Herói jogado", signature: "Assinatura", special: "Especial" };
const filterChip = (on: boolean) => `${chip} shrink-0 whitespace-nowrap ${on ? "bg-zinc-100 text-zinc-950" : "border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white"}`;

/** Grade de cartas para escolher a dedo o que sai no pack: busca, filtros e um toque para marcar. */
function CardPicker({ value, onChange, rarityOf }: { value: string[]; onChange: (ids: string[]) => void; rarityOf: RarityOf }) {
  const { players, teams, heroArt } = useData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PackKind | null>(null);
  const [rar, setRar] = useState<RarityKey | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const on = new Set(value);
  const tagOf = (p: Player) => teams.find((t) => t.id === p.teamId)?.tag ?? "";
  const term = q.trim().toLowerCase();
  // escolhida aparece mesmo inativa, para dar para desmarcar
  const visible = players.filter((p) => (showInactive || !p.inactive || on.has(p.id)) && (!kind || packKind(p) === kind) && (!rar || rarityOf(p) === rar)
    && (!term || `${p.name} ${p.hero} ${tagOf(p)}`.toLowerCase().includes(term)));
  const pickable = visible.filter((p) => !isRetired(p) && !on.has(p.id));
  const missing = value.filter((id) => !players.some((p) => p.id === id));
  const inactive = players.filter((p) => p.inactive).length;
  const clear = () => { setQ(""); setKind(null); setRar(null); };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className={`${input} min-h-11 sm:max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, herói ou time" aria-label="Buscar carta" />
        <span className="flex-1 text-sm text-zinc-300" aria-live="polite"><b className="text-zinc-100">{value.length - missing.length}</b> escolhidas</span>
        <button type="button" className={`${ghost} min-h-11 sm:min-h-0`} disabled={!pickable.length} onClick={() => onChange([...value, ...pickable.map((p) => p.id)])}>
          Marcar visíveis ({pickable.length})
        </button>
        <HoldButton className={`${ghost} min-h-11 sm:min-h-0`} disabled={!value.length} onConfirm={() => onChange([])} label="Segure para desmarcar todas">Desmarcar todas</HoldButton>
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" role="group" aria-label="Filtros">
        {PACK_KINDS.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)} className={filterChip(kind === k)}>{KIND_SHORT[k]}</button>)}
        {RARITY_TIERS.map((tier) => {
          const r = tier.key as RarityKey;
          return (
            <button key={r} type="button" aria-pressed={rar === r} onClick={() => setRar(rar === r ? null : r)} className={`${filterChip(rar === r)} flex items-center gap-1.5`}>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tier.c }} />{tier.name}
            </button>
          );
        })}
        {inactive > 0 && <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive(!showInactive)} className={filterChip(showInactive)}>Mostrar inativas ({inactive})</button>}
      </div>

      {missing.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
          {missing.length === 1 ? "1 carta escolhida foi apagada." : `${missing.length} cartas escolhidas foram apagadas.`}
          <button type="button" className="cursor-pointer font-bold underline hover:text-amber-200" onClick={() => onChange(value.filter((id) => !missing.includes(id)))}>Tirar da lista</button>
        </p>
      )}
      {value.length === 0 && <p className="text-sm text-amber-300">Nenhuma carta escolhida: toque nas cartas abaixo para colocar no pack.</p>}

      {/* quem rola é o contêiner: grade com altura limitada espreme as linhas e os blocos se sobrepõem */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-zinc-950/40 p-2">
      <div role="group" aria-label="Cartas" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {visible.map((p) => {
          const sel = on.has(p.id);
          const retired = isRetired(p);
          const tier = RARITY_TIERS.find((x) => x.key === rarityOf(p))!;
          const art = p.art?.url ? { url: p.art.url, x: p.art.x ?? 50, y: p.art.y ?? 50 } : heroArt(p.hero);
          const tag = retired ? "aposentada" : p.exclusive ? "exclusiva" : p.inactive ? "inativa" : null;
          return (
            <button key={p.id} type="button" aria-pressed={sel} disabled={retired && !sel} onClick={() => onChange(sel ? value.filter((x) => x !== p.id) : [...value, p.id])}
              title={`${p.name} · ${p.hero} · ${tagOf(p)}${retired ? " · herói aposentado, não sai em pack" : ""}`}
              className={`relative flex aspect-4/5 cursor-pointer flex-col justify-end overflow-hidden rounded-xl bg-zinc-900 text-left transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 ${sel ? "ring-2 ring-zinc-100" : "opacity-60 hover:opacity-100"}`}>
              {art && <img src={art.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${art.x}% ${art.y}%` }} />}
              <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: tier.c }} />
              {tag && <span className="absolute top-2 left-2 rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-200 uppercase">{tag}</span>}
              {sel && <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-zinc-100 text-zinc-950"><Icon name="check" className="size-4" /></span>}
              <span className="relative flex min-w-0 flex-col gap-0.5 p-2.5 pb-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl leading-none" style={{ color: tier.c }}>{getPlayerOvr(p)}</span>
                  <span className="text-[10px] font-bold tracking-wider text-zinc-300 uppercase">{tier.name}</span>
                </span>
                <span className="truncate text-sm font-bold text-zinc-100">{p.name}</span>
                <span className="truncate text-xs text-zinc-400">{p.hero} · {KIND_SHORT[packKind(p)]} · {tagOf(p)}</span>
              </span>
            </button>
          );
        })}
        {!visible.length && (
          <div className="col-span-full flex flex-col items-center gap-3 p-8 text-center text-sm text-zinc-400">
            Nenhuma carta com esses filtros.
            <button type="button" className={ghost} onClick={clear}>Limpar filtros</button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/** Tipos de pack: nome, arte, chances por tipo de carta e times do pool, com a prévia das chances reais. */
// pack salvo sem chances por raridade abre com as padrão (salvar passa a gravá-las)
const editable = (t: PackType | undefined): PackType | null => (t ? { ...structuredClone(t), rarity: t.rarity ? { ...t.rarity } : { ...DEFAULT_RARITY_ODDS } } : null);

function PacksForm() {
  const { players, teams, settings } = useData();
  const [types, setTypes] = useState<PackType[]>([]);
  const [d, setD] = useState<PackType | null>(null);
  const picker = useRef<HTMLDialogElement>(null);
  const [sim, setSim] = useState<{ kind: Record<PackKind, number>; rarity: Record<RarityKey, number>; top: [string, number][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = (pick?: string) => api.packTypes().then((t) => {
    setTypes(t);
    setD((cur) => editable(t.find((x) => x.id === (pick ?? cur?.id)) ?? t[0]));
  }).catch((e: Error) => setMsg(`Erro: ${e.message}`));
  useEffect(() => { load(); }, []);

  const blank = (): PackType => ({ id: newId("pack"), name: "Novo pack", cards: 1, odds: { ...DEFAULT_PACK_ODDS }, rarity: { ...DEFAULT_RARITY_ODDS }, teams: [] });
  const set = (patch: Partial<PackType>) => { setD((p) => (p ? { ...p, ...patch } : p)); setSim(null); };
  const run = async (fn: () => Promise<unknown>, ok: string, pick?: string) => {
    setBusy(true);
    setMsg("");
    try { await fn(); await load(pick); setMsg(ok); } catch (e) { setMsg(`Erro: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  // prévia para quem ainda não tem nenhuma carta do pool; raridade pelas faixas de overall do Editor
  const rarityOf: RarityOf = (p) => rarityKeyOf(getPlayerOvr(p), settings.tierConfig ?? []);
  const pool = d ? packPool(players, d, new Set()) : [];
  const chances = d ? chanceSummary(pool, cardChances(pool, d, rarityOf), rarityOf) : null;
  const inPool = Object.fromEntries(RARITY_KEYS.map((r) => [r, pool.filter((p) => rarityOf(p) === r).length])) as Record<RarityKey, number>;
  const sum = d ? PACK_KINDS.reduce((a, k) => a + d.odds[k], 0) : 0;
  const rarity = d?.rarity ?? DEFAULT_RARITY_ODDS;
  const raritySum = RARITY_KEYS.reduce((a, r) => a + rarity[r], 0);
  const valid = sum === 100 && raritySum === 100;
  const isDefault = !!d && PACK_KINDS.every((k) => d.odds[k] === DEFAULT_PACK_ODDS[k]) && RARITY_KEYS.every((r) => rarity[r] === DEFAULT_RARITY_ODDS[r]);
  const simulate = () => {
    if (!d) return;
    const kind = { alt: 0, signature: 0, special: 0 } as Record<PackKind, number>;
    const rarity = Object.fromEntries(RARITY_KEYS.map((r) => [r, 0])) as Record<RarityKey, number>;
    const hits = new Map<string, number>();
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const c = drawCard(pool, d, rarityOf);
      if (!c) break;
      kind[packKind(c)]++;
      rarity[rarityOf(c)]++;
      hits.set(c.id, (hits.get(c.id) ?? 0) + 1);
    }
    const name = (id: string) => { const p = players.find((x) => x.id === id); return p ? `${p.name} · ${p.hero}` : id; };
    setSim({ kind, rarity, top: [...hits].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => [name(id), n]) });
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {types.map((t) => (
            <button key={t.id} type="button" aria-pressed={d?.id === t.id} onClick={() => { setD(editable(t)); setSim(null); }}
              className={`${chip} ${d?.id === t.id ? "bg-zinc-100 text-zinc-950" : "border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white"}`}>{t.name}</button>
          ))}
          <button type="button" onClick={() => { setD(blank()); setSim(null); }} className={`${chip} border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white`}>+ Novo pack</button>
        </div>

        {d && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome"><input className={input} value={d.name} maxLength={PACK_NAME_MAX} onChange={(e) => set({ name: e.target.value })} /></Field>
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Arte da embalagem</span>
                <div className="flex flex-wrap items-center gap-2">
                  <ImagePick folder="packs" onUrl={(url) => set({ art: url })} />
                  {d.art && <button type="button" className={ghost} onClick={() => set({ art: undefined })}>Usar padrão</button>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
                  Chances por tipo de carta <span className={sum === 100 ? "text-emerald-300" : "text-red-300"}>{sum}/100</span>
                </span>
                <button type="button" className={`${ghost} min-h-11 sm:min-h-0`} disabled={isDefault} title="Volta tipo e raridade para as chances padrão"
                  onClick={() => set({ odds: { ...DEFAULT_PACK_ODDS }, rarity: { ...DEFAULT_RARITY_ODDS } })}>
                  Restaurar % padrão
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {PACK_KINDS.map((k) => (
                  <Field key={k} label={KIND_LABEL[k]}>
                    <input type="number" min={0} max={100} className={input} value={d.odds[k]} onChange={(e) => set({ odds: { ...d.odds, [k]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } })} />
                  </Field>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
                Chances por raridade <span className={raritySum === 100 ? "text-emerald-300" : "text-red-300"}>{raritySum}/100</span>
              </span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {RARITY_TIERS.map((tier) => {
                  const r = tier.key as RarityKey;
                  return (
                    <Field key={r} label={`${tier.name} (${inPool[r]})`}>
                      <input type="number" min={0} max={100} className={input} value={rarity[r]} style={{ borderColor: tier.c }}
                        onChange={(e) => set({ rarity: { ...rarity, [r]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } })} />
                    </Field>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-500">Vale dentro do tipo sorteado. Raridade sem carta naquele tipo sai da conta e divide a chance entre as outras; 0 = nunca sai.</p>
            </div>

            <div className="space-y-3">
              <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Cartas que podem sair</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Como escolher as cartas">
                <button type="button" aria-pressed={!d.players} onClick={() => set({ players: undefined })} className={filterChip(!d.players)}>Por time</button>
                {/* começa com o pool que já saía por time, para nada mudar até você mexer */}
                <button type="button" aria-pressed={!!d.players} onClick={() => d.players || set({ players: pool.map((p) => p.id) })} className={filterChip(!!d.players)}>Cartas escolhidas</button>
              </div>
              {d.players ? (
                <>
                  <p className="text-xs text-zinc-500">Só as cartas marcadas saem neste pack, até exclusivas e inativas. Os times deixam de valer.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className={ghost} onClick={() => picker.current?.showModal()}>Escolher cartas</button>
                    <span className="text-sm text-zinc-300"><b className="text-zinc-100">{pool.length}</b> {pool.length === 1 ? "carta pode sair" : "cartas podem sair"}</span>
                  </div>
                  <dialog ref={picker} aria-labelledby="pick-title" closedby="any"
                    className="m-auto h-[min(52rem,calc(100dvh-2rem))] w-[min(80rem,calc(100%-2rem))] max-w-none rounded-3xl bg-zinc-900 p-0 text-zinc-100 backdrop:bg-zinc-950/80">
                    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
                      <div className="flex items-center gap-3">
                        <h2 id="pick-title" className="flex-1 truncate text-lg font-extrabold tracking-[0.12em] uppercase">Cartas de {d.name || "pack"}</h2>
                        <button type="button" className={primary} onClick={() => picker.current?.close()}>Pronto</button>
                      </div>
                      <CardPicker value={d.players} onChange={(players) => set({ players })} rarityOf={rarityOf} />
                    </div>
                  </dialog>
                </>
              ) : (
                <>
                  <span className="block text-xs text-zinc-500">Times do pool {d.teams.length === 0 && <span className="text-zinc-100">· todos</span>}</span>
                  <div className="flex flex-wrap gap-2">
                    {teams.map((t) => {
                      const on = d.teams.includes(t.id);
                      return (
                        <button key={t.id} type="button" aria-pressed={on} onClick={() => set({ teams: on ? d.teams.filter((x) => x !== t.id) : [...d.teams, t.id] })}
                          className={`${chip} ${on ? "bg-amber-300 text-zinc-950 hover:bg-amber-200" : "border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white"}`}>{t.tag}</button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {chances && (
              <div className="space-y-2 rounded-2xl bg-zinc-950/40 p-4">
                <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">Chances reais para quem não tem nenhuma carta · {pool.length} cartas no pool</span>
                {pool.length === 1 && <p className="text-xs text-amber-300">Só uma carta: quem já tem ela não consegue abrir este pack.</p>}
                <span className="block pt-1 text-[11px] font-bold tracking-[0.18em] text-zinc-500 uppercase">Por tipo</span>
                <ul className="grid gap-1 text-sm text-zinc-200">
                  {PACK_KINDS.map((k) => {
                    const c = chances.kind[k];
                    return (
                      <li key={k} className="flex flex-wrap justify-between gap-2">
                        <span>{KIND_LABEL[k]} <span className="text-zinc-500">({c.cards})</span></span>
                        <span className="font-bold">{pct(c.chance)}{c.cards > 0 && !d.rarity && <span className="font-normal text-zinc-400"> · cada carta {pct(c.chance / c.cards)}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
                <span className="block pt-2 text-[11px] font-bold tracking-[0.18em] text-zinc-500 uppercase">Por raridade</span>
                <ul className="grid gap-1 text-sm text-zinc-200">
                  {RARITY_TIERS.map((tier) => {
                    const c = chances.rarity[tier.key as RarityKey];
                    return (
                      <li key={tier.key} className="flex flex-wrap justify-between gap-2">
                        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: tier.c }} />{tier.name} <span className="text-zinc-500">({c.cards})</span></span>
                        <span className="font-bold">{pct(c.chance)}{c.cards > 0 && <span className="font-normal text-zinc-400"> · cada carta {pct(c.chance / c.cards)}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button type="button" onClick={simulate} disabled={!pool.length || !valid} className={ghost}>Simular 1000 aberturas</button>
                  {sim && (
                    <p className="text-xs text-zinc-300">
                      {PACK_KINDS.map((k) => `${KIND_LABEL[k]}: ${sim.kind[k]}`).join(" · ")}
                      <span className="block">{RARITY_TIERS.map((tier) => `${tier.name}: ${sim.rarity[tier.key as RarityKey]}`).join(" · ")}</span>
                      <span className="block text-zinc-500">Mais saíram: {sim.top.map(([n, c]) => `${n} (${c})`).join(", ")}</span>
                    </p>
                  )}
                </div>
                <p className="text-xs text-zinc-500">Quem já tem cartas do pool não tira repetida: a chance delas passa para as outras. O pack de teste fica no seu inventário na aba Resgatar.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} disabled={busy || !valid || !d.name.trim() || !pool.length}
                onClick={() => run(() => api.savePackType(d.id, { name: d.name.trim(), art: d.art, odds: d.odds, rarity: d.rarity, teams: d.teams, players: d.players }), `Pack "${d.name.trim()}" salvo!`, d.id)}>Salvar pack</button>
              {!pool.length && <span className="text-xs text-amber-300">Nenhuma carta pode sair: escolha cartas ou times.</span>}
              {types.some((t) => t.id === d.id) && (
                <button type="button" className={danger} disabled={busy}
                  onClick={() => { if (confirm(`Apagar o pack "${d.name}"?`)) run(() => api.removePackType(d.id), "Pack apagado.", ""); }}>Apagar</button>
              )}
              <Toast msg={msg} />
            </div>
          </>
        )}
        {!d && <Toast msg={msg} />}
      </div>
      {d && (
        <div className="flex flex-col items-center gap-3 lg:sticky lg:top-24">
          <PackArt name={d.name || "Pack"} art={d.art} size="lg" />
          <span className="text-xs text-zinc-400">1 carta por pack</span>
        </div>
      )}
    </div>
  );
}

type Code = { code: string; player_id: string | null; pack_type_id: string | null; max_uses: number; uses: number; starts_at: number | null; expires_at: number | null };

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
  // o código dá uma carta ou um pack (que vai fechado para o inventário)
  const [gives, setGives] = useState<"card" | "pack">("card");
  const [packTypes, setPackTypes] = useState<PackType[]>([]);
  const [packPick, setPackPick] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const label = (p: Player) => `${p.name} · ${p.hero} · ${teams.find((t) => t.id === p.teamId)?.tag ?? ""}`;
  const byLabel = new Map(players.filter((p) => !isRetired(p)).map((p) => [label(p), p.id]));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const giftOf = (c: Code) => (c.pack_type_id ? `Pack · ${packTypes.find((t) => t.id === c.pack_type_id)?.name ?? c.pack_type_id}` : nameOf(c.player_id ?? ""));

  const load = () =>
    fetch("/api/codes")
      .then((r) => (r.ok ? (r.json() as Promise<Code[]>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c) => { setCodes(c); setNow(Math.floor(Date.now() / 1000)); })
      .catch((e: Error) => setMsg(`Erro: ${e.message}`));

  useEffect(() => {
    load();
    api.packTypes().then((t) => { setPackTypes(t); setPackPick((cur) => cur || t[0]?.id || ""); }).catch(() => setPackTypes([]));
  }, []);

  const expireIn = (ms: number | null) => setExpiresAt(ms === null ? "" : localInput(new Date(Date.now() + ms)));

  const create = async () => {
    const playerId = gives === "card" ? byLabel.get(pick) : undefined;
    if (gives === "card" && !playerId) return setMsg("Erro: escolha uma carta da lista");
    if (gives === "pack" && !packPick) return setMsg("Erro: crie um pack na seção Packs");
    setBusy(true);
    setMsg("");
    try {
      await api.createCode({ code, ...(gives === "card" ? { playerId } : { packTypeId: packPick }), maxUses, startsAt: toTs(startsAt), expiresAt: toTs(expiresAt) });
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
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Novo código</h2>
          <p className="mt-1 text-xs text-zinc-400">Quem digitar o código na aba Resgatar ganha a carta escolhida, ou o pack, que fica fechado no inventário até a pessoa abrir.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="1. Código">
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${input} font-bold tracking-[0.15em]`} />
              <button type="button" onClick={() => setCode(randomCode())} className={ghost}>Gerar</button>
            </div>
          </Field>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">2. Dá</span>
              {(["card", "pack"] as const).map((g) => (
                <button key={g} type="button" aria-pressed={gives === g} onClick={() => setGives(g)}
                  className={`${quick} ${gives === g ? "border-zinc-100 bg-zinc-100 text-zinc-950 hover:text-zinc-950" : ""}`}>{g === "card" ? "Carta" : "Pack"}</button>
              ))}
            </div>
            {gives === "card" ? (
              <>
                <input list="codes-players" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Digite o nome do jogador…" aria-label="Carta" className={input} />
                <datalist id="codes-players">
                  {players.filter((p) => !isRetired(p)).sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={label(p)} />)}
                </datalist>
              </>
            ) : (
              <select value={packPick} onChange={(e) => setPackPick(e.target.value)} aria-label="Pack" className={input}>
                {packTypes.length === 0 && <option value="">Nenhum pack: crie na seção Packs</option>}
                {packTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

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
          <button type="button" onClick={create} disabled={busy || !code || (gives === "card" ? !pick : !packPick)} className={primary}>{busy ? "Criando…" : "Criar código"}</button>
          <Toast msg={msg} />
        </div>
      </div>

      <div className="space-y-3 border-t border-zinc-200/15 pt-6">
        <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Códigos criados</h2>
        {codes.length === 0 && <p className="text-xs text-zinc-400">Nenhum código ainda.</p>}
        {codes.map((c) => {
          const st = codeStatus(c, now);
          return (
            <div key={c.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-zinc-200/10 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-200">
              <span className="font-extrabold tracking-[0.15em] text-zinc-100">{c.code}</span>
              <span className="max-w-48 truncate">{giftOf(c)}</span>
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

/** Todos os sons da abertura de pack, para ouvir um por um e baixar os que ainda são gerados no navegador. */
function SoundsForm() {
  const ids = Object.keys(PACK_SOUNDS) as PackSoundId[];
  const [msg, setMsg] = useState("");
  // um som por vez: tocar outro (ou sair da aba) corta o anterior, como o riser de 17 s
  const playing = useRef<SoundHandle | null>(null);
  useEffect(() => () => playing.current?.stop(), []);
  const play = (id: PackSoundId) => { playing.current?.stop(); playing.current = previewPackSound(id); };
  const download = async (id: PackSoundId) => {
    const wav = await renderPackSoundWav(id).catch(() => null);
    if (wav) downloadBlob(wav, `${id}.wav`);
    else setMsg(`Erro: não deu para gerar ${id}.wav`);
  };
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-extrabold tracking-[0.12em] text-zinc-100 uppercase">Sons da abertura de pack</h2>
        <p className="text-sm text-zinc-400">
          Na ordem em que tocam. Para trocar um som, o arquivo vai em <code className="text-zinc-200">src/assets/sounds/pack/&lt;id&gt;.mp3</code>. Toca mesmo com o mudo ligado.
        </p>
      </div>
      <ul className="grid gap-2">
        {ids.map((id) => {
          const file = hasPackFile(id);
          return (
            <li key={id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-950/50 p-3">
              <button type="button" onClick={() => play(id)} aria-label={`Tocar ${id}`} className={`${chip} bg-zinc-100 text-zinc-950 hover:bg-white`}>Tocar</button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm font-bold text-zinc-100">{id}</code>
                  <span className={`text-[11px] font-bold tracking-wider uppercase ${file ? "text-emerald-300" : "text-amber-300"}`}>{file ? "arquivo" : "gerado no navegador"}</span>
                </div>
                <p className="text-xs text-zinc-400">{PACK_SOUNDS[id].when}</p>
              </div>
              {!file && (
                <button type="button" onClick={() => void download(id)} className={`${chip} border border-zinc-200/20 bg-zinc-900/60 text-zinc-300 hover:text-white`}>Baixar WAV</button>
              )}
            </li>
          );
        })}
      </ul>
      <Toast msg={msg} />
    </div>
  );
}

/** <input type="datetime-local"> trabalha no fuso de quem edita; o banco guarda segundos UTC. */
const toLocalInput = (sec: number) => {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => { const t = new Date(v).getTime(); return v && Number.isFinite(t) ? Math.round(t / 1000) : null; };

/** Torneios: nome, logo, descrição (o balão do calendário) e link. Os dias ficam na aba Calendário. */
function TournamentsForm() {
  const { tournaments, schedule, reload } = useData();
  const [d, setD] = useState<Tournament | null>(null);
  const { busy, msg, run } = useSaver(reload);
  const set = (patch: Partial<Tournament>) => setD((t) => (t ? { ...t, ...patch } : t));
  const [now] = useState(() => Date.now() / 1000);
  const upcoming = (id: string) => schedule.filter((s) => s.tournamentId === id && s.startsAt >= now - 86400).length;

  const save = () => {
    if (!d || !d.name.trim()) return;
    const id = d.id || newId("tour");
    run(async () => { await api.save("tournaments", id, { ...d, id }); setD(null); }, `Torneio "${d.name.trim()}" salvo!`);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Torneios ({tournaments.length})</h2>
          <button type="button" className={primary} onClick={() => setD({ id: "", name: "", description: "" })}>+ Novo torneio</button>
        </div>
        <p className="text-sm text-zinc-400">Crie o torneio uma vez, com logo e descrição; depois, na aba Calendário, é só marcar os dias.</p>
        {tournaments.map((t) => (
          <motion.div layout key={t.id} className="flex items-center gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/50 p-2.5">
            <TournamentLogo t={t} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-zinc-100">{t.name}</p>
              <p className="text-xs text-zinc-400">{upcoming(t.id)} {upcoming(t.id) === 1 ? "dia marcado" : "dias marcados"} daqui em diante</p>
            </div>
            <button type="button" className={ghost} onClick={() => setD(structuredClone(t))}>Editar</button>
            <HoldButton className={danger} disabled={busy} onConfirm={() => run(async () => { await api.remove("tournaments", t.id); if (d?.id === t.id) setD(null); }, "Torneio e dias excluídos.")} label={`Excluir ${t.name} e todos os dias dele`}>✕</HoldButton>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {d && (
          <motion.div key={d.id || "new"} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="space-y-4 border-t border-zinc-200/15 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <h3 className="text-lg font-black tracking-[0.12em] text-white uppercase">{d.id ? `Editar ${d.name}` : "Novo torneio"}</h3>
            <Field label="Nome"><input className={input} value={d.name} maxLength={TOURNAMENT_NAME_MAX} onChange={(e) => set({ name: e.target.value })} /></Field>
            <div className="flex flex-wrap items-end gap-3">
              <TournamentLogo t={d} className="size-16 text-lg" />
              <ImagePick folder="events" label={d.logo ? "Trocar logo" : "Enviar logo"} onUrl={(logo) => set({ logo })} />
              {d.logo && <button type="button" className={ghost} onClick={() => set({ logo: undefined })}>Remover</button>}
            </div>
            <Field label={`Descrição: aparece no balão do calendário (${d.description.length}/${TOURNAMENT_DESC_MAX})`}>
              <textarea className={input} rows={3} maxLength={TOURNAMENT_DESC_MAX} value={d.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="Link (opcional)"><input className={input} type="url" placeholder="https://" value={d.url ?? ""} maxLength={200} onChange={(e) => set({ url: e.target.value || undefined })} /></Field>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} disabled={busy || !d.name.trim()} onClick={save}>{busy ? "Salvando…" : "Salvar torneio"}</button>
              <button type="button" className={ghost} onClick={() => setD(null)}>Cancelar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="lg:col-span-2"><Toast msg={msg} /></div>
    </div>
  );
}

/** Calendário: marca um torneio já criado num dia e hora. A logo e a descrição vêm do torneio. */
function CalendarForm() {
  const { tournaments, schedule, reload } = useData();
  const { busy, msg, run } = useSaver(reload);
  const [tour, setTour] = useState("");
  const [when, setWhen] = useState("");
  const [label, setLabel] = useState("");
  const [brazil, setBrazil] = useState(false);
  const tournamentId = tour || tournaments[0]?.id || "";
  const at = fromLocalInput(when);
  const add = () => {
    if (at === null || !tournamentId) return;
    run(async () => { await api.save("schedule", newId("day"), { tournamentId, startsAt: at, label: label.trim(), brazil }); setWhen(""); setLabel(""); setBrazil(false); }, "Dia marcado.");
  };
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const months = new Map<string, ScheduleEntry[]>();
  for (const s of schedule) {
    const m = monthName.format(new Date(s.startsAt * 1000));
    months.set(m, [...(months.get(m) ?? []), s]);
  }

  if (!tournaments.length) return <p className="text-sm text-zinc-400">Crie um torneio na aba Torneios para marcar dias no calendário.</p>;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-black tracking-[0.12em] text-white uppercase">Marcar um dia</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Torneio">
            <select className={input} value={tournamentId} onChange={(e) => setTour(e.target.value)}>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Dia e hora (no seu fuso)"><input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Edição (opcional, ex.: EU #67)"><input className={input} value={label} maxLength={SCHEDULE_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-zinc-200"><input type="checkbox" checked={brazil} onChange={(e) => setBrazil(e.target.checked)} className="size-4 accent-br-green" />Brasil joga</label>
          <button type="button" className={primary} disabled={busy || at === null} onClick={add}>+ Marcar</button>
        </div>
        <p className="text-xs text-zinc-400">"Brasil joga" pinta o dia de verde e amarelo no calendário da Home. Cada visitante vê no fuso dele. Dias de mais de um mês atrás saem da lista e do site.</p>
      </div>
      {[...months].map(([m, days]) => (
        <div key={m} className="space-y-2 border-t border-zinc-200/15 pt-4">
          <h3 className="text-sm font-black tracking-[0.12em] text-white uppercase">{m}</h3>
          {days.map((s) => <ScheduleRow key={`${s.id}:${s.startsAt}:${s.label}:${s.tournamentId}:${s.brazil}`} entry={s} tournaments={tournaments} />)}
        </div>
      ))}
      <Toast msg={msg} />
    </div>
  );
}

function ScheduleRow({ entry, tournaments }: { entry: ScheduleEntry; tournaments: Tournament[] }) {
  const { reload } = useData();
  const { busy, run } = useSaver(reload);
  const [tour, setTour] = useState(entry.tournamentId);
  const [when, setWhen] = useState(() => toLocalInput(entry.startsAt));
  const [label, setLabel] = useState(entry.label);
  const [brazil, setBrazil] = useState(entry.brazil);
  const at = fromLocalInput(when);
  const changed = tour !== entry.tournamentId || at !== entry.startsAt || label.trim() !== entry.label || brazil !== entry.brazil;
  const t = tournaments.find((x) => x.id === tour);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {t && <TournamentLogo t={t} className="size-9 text-xs" />}
      <select aria-label="Torneio" className={`${input} w-auto`} value={tour} onChange={(e) => setTour(e.target.value)}>
        {tournaments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <input aria-label="Dia e hora" className={`${input} w-auto`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <input aria-label="Edição" className={`${input} w-28`} value={label} maxLength={SCHEDULE_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} />
      <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={brazil} onChange={(e) => setBrazil(e.target.checked)} className="size-4 accent-br-green" />Brasil joga</label>
      <button type="button" className={ghost} disabled={busy || !changed || at === null} onClick={() => run(() => api.save("schedule", entry.id, { tournamentId: tour, startsAt: at, label: label.trim(), brazil }), "Dia atualizado.")}>Salvar</button>
      <HoldButton className={danger} disabled={busy} onConfirm={() => run(() => api.remove("schedule", entry.id), "Dia excluído.")} label="Excluir este dia">✕</HoldButton>
    </div>
  );
}
