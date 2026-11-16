import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { api, useData } from "../lib/data";
import type { PlayerMatch } from "../lib/types";
import { strings, useLocale, useT } from "../lib/i18n";
import { STAT_KEYS, effectiveAccountId, getPlayerHistory, getPlayerOvr, getPlayerTrend, isMainCard, teamOf, useLabel } from "../lib/cards";
import { getCardTier } from "../lib/rarity";
import { Card } from "./Card";
import { CardExportButton } from "./CardExportButton";
import { TrendBadge } from "./TrendBadge";
import { Icon } from "./Icon";
import { easeOut, pill } from "../lib/ui";

gsap.registerPlugin(SplitText);
const revealed = new Set<string>();

const M = strings({
  pt: { matches: "Partidas de campeonato", games: (n: number) => `${n} ${n === 1 ? "partida" : "partidas"}`, wins: "V", losses: "D", win: "Vitória", loss: "Derrota", topHeroes: "Mais jogados", rate: (n: number) => `${n}% de vitórias`, minutes: (n: number) => `${n} min` },
  en: { matches: "Tournament matches", games: (n: number) => `${n} ${n === 1 ? "match" : "matches"}`, wins: "W", losses: "L", win: "Win", loss: "Loss", topHeroes: "Most played", rate: (n: number) => `${n}% win rate`, minutes: (n: number) => `${n} min` },
  es: { matches: "Partidas de campeonato", games: (n: number) => `${n} ${n === 1 ? "partida" : "partidas"}`, wins: "V", losses: "D", win: "Victoria", loss: "Derrota", topHeroes: "Más jugados", rate: (n: number) => `${n}% de victorias`, minutes: (n: number) => `${n} min` },
});

const S = strings({
  pt: { cardOf: (name: string) => `Carta de ${name}`, close: "Fechar", special: "Especial", edit: "Editar carta", history: "Histórico de OVR", versions: "Versões", main: "Principal", version: "Versão",
    stats: "Atributos", statNames: { MIR: "Mira", MAC: "Macro", SUP: "Suporte", MOV: "Movimentação", POL: "Pool de heróis", CON: "Consistência" }, ...M.pt },
  en: { cardOf: (name: string) => `${name}'s card`, close: "Close", special: "Special", edit: "Edit card", history: "OVR history", versions: "Versions", main: "Main", version: "Version",
    stats: "Attributes", statNames: { MIR: "Aim", MAC: "Macro", SUP: "Support", MOV: "Movement", POL: "Hero pool", CON: "Consistency" }, ...M.en },
  es: { cardOf: (name: string) => `Carta de ${name}`, close: "Cerrar", special: "Especial", edit: "Editar carta", history: "Historial de OVR", versions: "Versiones", main: "Principal", version: "Versión",
    stats: "Atributos", statNames: { MIR: "Puntería", MAC: "Macro", SUP: "Apoyo", MOV: "Movimiento", POL: "Pool de héroes", CON: "Consistencia" }, ...M.es },
});

export function Spotlight({ playerId, onClose, onSwitch, onEdit }: { playerId: string; onClose: () => void; onSwitch: (id: string) => void; onEdit?: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { teams, players, settings } = useData();
  const player = players.find((p) => p.id === playerId);
  const cardRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [exportReadyId, setExportReadyId] = useState<string>();
  const tier = player ? getCardTier(player, settings.tierConfig!) : null;
  const ovr = player ? getPlayerOvr(player) : 0;
  const reveal = useMemo(
    () => !!tier && !revealed.has(playerId) && (tier.lvl >= 3 || !!tier.custom) && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    [playerId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useLayoutEffect(() => {
    if (!reveal || !cardRef.current) return;
    revealed.add(playerId);
    const ovrEl = cardRef.current.querySelector("[data-ovr]")?.firstChild;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.12, onComplete: () => setExportReadyId(playerId) });
      tl.fromTo(flashRef.current, { opacity: 0, scale: 0.5 }, { opacity: 0.9, scale: 1.1, duration: 0.25, ease: "power2.out" })
        .to(flashRef.current, { opacity: 0, scale: 1.35, duration: 0.5, ease: "power2.in" });
      tl.from(cardRef.current, { y: 40, scale: 0.85, opacity: 0, duration: 0.6, ease: "back.out(1.6)", clearProps: "transform,opacity" }, 0.05);
      if (ovrEl) {
        const n = { v: 0 };
        ovrEl.nodeValue = "0";
        tl.to(n, { v: ovr, duration: 0.5, ease: "power2.out", onUpdate: () => { ovrEl.nodeValue = String(Math.round(n.v)); } }, 0.3);
      }
      if (nameRef.current) {
        const split = SplitText.create(nameRef.current, { type: "chars" });
        tl.from(split.chars, { opacity: 0, y: 12, duration: 0.3, stagger: 0.025, ease: "power2.out" }, 0.4);
      }
    });
    return () => { ctx.revert(); if (ovrEl) ovrEl.nodeValue = String(ovr); };
  }, [reveal, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;
  const team = teamOf(teams, player);
  if (!tier) return null;
  const history = getPlayerHistory(player);
  const groupKey = player.variantOf || player.id;
  const versions = players.filter((p) => p.id === groupKey || p.variantOf === groupKey);
  const accountId = effectiveAccountId(players, player);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.cardOf(player.name)}
    >
      <motion.div
        className="noir-glass-strong flex max-h-[92dvh] w-full max-w-4xl flex-col items-center gap-8 overflow-y-auto rounded-3xl p-4 sm:p-8 md:flex-row md:items-start"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div key={player.id} className="relative max-w-full" initial={reveal ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: easeOut }}>
          {reveal && (
            <div ref={flashRef} aria-hidden="true" className="pointer-events-none absolute -inset-16 rounded-full opacity-0" style={{ background: `radial-gradient(circle, ${tier.hi} 0%, ${tier.c}99 30%, transparent 68%)` }} />
          )}
          <div ref={cardRef} className="relative">
            <Card player={player} variant="editor" />
          </div>
        </motion.div>

        <div className="w-full min-w-0 flex-1 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-black tracking-[0.12em] text-dl-text uppercase"><span ref={nameRef} key={player.id + player.name}>{player.name}</span></h2>
              <p className="mt-1 text-sm text-zinc-300">{label(team.name)} ({team.tag}) · {label(player.position || "Flex")} · {player.hero}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t.close} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-800/60 text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:size-9"><Icon name="x" /></button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.custom ? t.special : tier.name}</span>
            <TrendBadge delta={getPlayerTrend(player)} size="editor" />
            <CardExportButton key={player.id} cardRef={cardRef} name={player.name} disabled={reveal && exportReadyId !== playerId} />
            {onEdit && <button type="button" onClick={() => onEdit(player.id)} className={`${pill(true)} ml-auto hover:bg-white`}>{t.edit}</button>}
            {player.special && player.specialText && <span className="text-xs font-bold text-amber-200">✦ {player.specialText}</span>}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.stats}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              {STAT_KEYS.map((k) => (
                <div key={k} className="flex items-baseline gap-2">
                  <dt className="font-mono font-bold text-zinc-100">{k}</dt>
                  <dd className="min-w-0 flex-1 truncate text-zinc-400">{t.statNames[k]}</dd>
                  <dd className="font-bold text-zinc-100 tabular-nums">{player.stats[k]}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.history}</h3>
            <HistoryChart points={history} color={tier.c} />
          </div>

          {accountId !== undefined && <TournamentMatches key={groupKey} playerId={groupKey} />}

          {versions.length > 1 && (
            <div>
              <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.versions} ({versions.length})</h3>
              <div className="flex flex-wrap gap-2">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSwitch(v.id)}
                    className={pill(v.id === player.id)}
                  >
                    {isMainCard(v) ? t.main : v.special ? t.special : t.version} · {teamOf(teams, v).tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Resumo (V–D, heróis mais jogados) + últimas partidas de campeonato; some quando não há partidas.
function TournamentMatches({ playerId }: { playerId: string }) {
  const t = useT(M);
  const locale = useLocale();
  const { heroById } = useData();
  const [list, setList] = useState<PlayerMatch[]>([]);

  useEffect(() => {
    let live = true;
    api.playerMatches(playerId, "edl").then((l) => live && setList(l)).catch(() => {});
    return () => { live = false; };
  }, [playerId]);

  if (!list.length) return null;
  const wins = list.filter((m) => m.won).length;
  const rate = Math.round((wins / list.length) * 100);
  const counts = new Map<number, number>();
  for (const m of list) counts.set(m.heroId, (counts.get(m.heroId) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const date = (unix: number) => new Date(unix * 1000).toLocaleDateString(locale, { day: "2-digit", month: "short" });

  return (
    <motion.section aria-label={t.matches} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.matches}</h3>
      <div className="space-y-3 rounded-xl border border-zinc-200/10 bg-black/40 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <p className="font-display text-2xl leading-none font-black tracking-[0.08em] text-dl-text tabular-nums">
              <span className="text-emerald-300">{wins}{t.wins}</span> – <span className="text-rose-300">{list.length - wins}{t.losses}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">{t.games(list.length)} · {t.rate(rate)}</p>
          </div>
          <ul aria-label={t.topHeroes} className="ml-auto flex gap-1.5">
            {top.map(([id, n]) => {
              const h = heroById(id);
              return (
                <li key={id} title={`${h?.name ?? `#${id}`} ×${n}`} className="relative">
                  {h?.icon ? <img src={h.icon} alt={h.name} className="size-9 rounded-lg border border-zinc-200/15 object-cover" /> : <span className="flex size-9 items-center justify-center rounded-lg border border-zinc-200/15 text-[10px] text-zinc-400">#{id}</span>}
                  <span className="absolute -right-1 -bottom-1 rounded-full bg-zinc-950 px-1 text-[10px]/4 font-bold text-zinc-200 tabular-nums ring-1 ring-zinc-200/20">{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div aria-hidden="true" className="flex h-1.5 gap-px overflow-hidden rounded-full">
          <div className="bg-emerald-400/80" style={{ flex: wins }} />
          <div className="bg-rose-400/80" style={{ flex: list.length - wins }} />
        </div>
        <ul className="space-y-1.5">
          {list.slice(0, 5).map((m, i) => {
            const h = heroById(m.heroId);
            return (
              <motion.li key={m.matchId} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: 0.05 + i * 0.03 }}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg border-l-[3px] bg-zinc-900/60 py-1 pr-2.5 pl-2 ${m.won ? "border-emerald-400" : "border-rose-400"}`}>
                {h?.icon ? <img src={h.icon} alt="" className="size-8 shrink-0 rounded-md object-cover" /> : <span aria-hidden="true" className="size-8 shrink-0 rounded-md bg-zinc-800" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-100">{h?.name ?? `#${m.heroId}`}</p>
                  <p className="truncate text-xs text-zinc-400">{[date(m.startTime), m.event, t.minutes(Math.round(m.durationS / 60))].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-zinc-200 tabular-nums">{m.kills}/{m.deaths}/{m.assists}</span>
                <span className={`w-14 shrink-0 text-right text-[11px] font-extrabold tracking-widest uppercase ${m.won ? "text-emerald-300" : "text-rose-300"}`}>{m.won ? t.win : t.loss}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.section>
  );
}

function HistoryChart({ points, color }: { points: { date: string; ovr: number }[]; color: string }) {
  const locale = useLocale();
  // Datas são ISO (YYYY-MM-DD); formata dia/mês na ordem do idioma, caindo no texto original se não for data válida.
  const short = (iso: string) => {
    const d = new Date(iso);
    return isNaN(+d) ? iso : d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  };
  const W = 420, H = 160, P = 32;
  const vals = points.map((p) => p.ovr);
  const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ovr).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-zinc-200/10 bg-black/40">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.ovr)} r="4" fill="#09090b" stroke={color} strokeWidth="2" />
          <text x={x(i)} y={y(p.ovr) - 12} textAnchor="middle" fontSize="16" fontWeight="800" fill="#f4f4f5">{p.ovr}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="15" fill="#a1a1aa">{short(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}
