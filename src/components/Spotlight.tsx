import { animate, motion, usePresence, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { STAT_NAMES } from "../lib/statNames";
import { STAT_KEYS, getPlayerOvr, isAltHero, isMainCard, isRetired, teamOf, useLabel } from "../lib/cards";
import { getCardTier } from "../lib/rarity";
import type { Player } from "../lib/types";
import { Card } from "./Card";
import { CardExportButton } from "./CardExportButton";
import { Icon } from "./Icon";
import { easeOut, pill } from "../lib/ui";
import { cascade, enter, flightOrigin, springFlight } from "../lib/motion";
import { CountUp, FillBar } from "./Motion";
import { MAX_FAVORITES } from "../lib/profile";
import { toggleFavorite, useMyCards, type FavoriteResult } from "../lib/myCards";
import type { ArtCredit } from "../lib/types";

gsap.registerPlugin(SplitText);
const revealed = new Set<string>();

const S = strings({
  pt: { notOwned: "Você não possui esta carta", favorite: "Favoritar", favorited: "Favorita", limit: `Até ${MAX_FAVORITES} favoritas. Abra uma favorita e desmarque para marcar outra.`, failed: "Não foi possível salvar a favorita.",
    owners: (n: number) => (n === 0 ? "Ninguém tem esta carta ainda" : n === 1 ? "1 conta tem esta carta" : `${n.toLocaleString("pt-BR")} contas têm esta carta`),
    cardOf: (name: string) => `Carta de ${name}`, close: "Fechar", special: "Especial", edit: "Editar carta", versions: "Versões", main: "Principal", version: "Versão", artBy: "Arte por",
    stats: "Atributos" },
  en: { notOwned: "You don't own this card", favorite: "Favorite", favorited: "Favorite", limit: `Up to ${MAX_FAVORITES} favorites. Open one and unmark it to pick another.`, failed: "Could not save the favorite.",
    owners: (n: number) => (n === 0 ? "Nobody owns this card yet" : n === 1 ? "1 account owns this card" : `${n.toLocaleString("en-US")} accounts own this card`),
    cardOf: (name: string) => `${name}'s card`, close: "Close", special: "Special", edit: "Edit card", versions: "Versions", main: "Main", version: "Version", artBy: "Art by",
    stats: "Attributes" },
  es: { notOwned: "No tienes esta carta", favorite: "Marcar favorita", favorited: "Favorita", limit: `Hasta ${MAX_FAVORITES} favoritas. Abre una y desmárcala para marcar otra.`, failed: "No se pudo guardar la favorita.",
    owners: (n: number) => (n === 0 ? "Nadie tiene esta carta todavía" : n === 1 ? "1 cuenta tiene esta carta" : `${n.toLocaleString("es")} cuentas tienen esta carta`),
    cardOf: (name: string) => `Carta de ${name}`, close: "Cerrar", special: "Especial", edit: "Editar carta", versions: "Versiones", main: "Principal", version: "Versión", artBy: "Arte de",
    stats: "Atributos" },
});

/** `preview`: uma carta que não está nos dados (a prévia de uma arte enviada), sem donos, versões nem favoritar. */
export function Spotlight({ playerId, onClose, onSwitch, onEdit, preview }: { playerId: string; onClose: () => void; onSwitch: (id: string) => void; onEdit?: (id: string) => void; preview?: Player }) {
  const t = useT(S);
  const statNames = useT(STAT_NAMES);
  const label = useLabel();
  const { teams, players, settings, heroIcon, me } = useData();
  const player = preview ?? players.find((p) => p.id === playerId);
  const cardRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [exportReadyId, setExportReadyId] = useState<string>();
  const { owned, favorites } = useMyCards();
  const [favIssue, setFavIssue] = useState<{ id: string; r: Exclude<FavoriteResult, "ok"> }>();
  const [favBusy, setFavBusy] = useState(false);
  const owners = useOwnerCount(player?.special && !preview ? playerId : undefined);
  const tier = player ? getCardTier(player, settings.tierConfig!) : null;
  const ovr = player ? getPlayerOvr(player) : 0;
  const reveal = useMemo(
    () => !!tier && !revealed.has(playerId) && (tier.lvl >= 3 || !!tier.custom) && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    [playerId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const still = useReducedMotion();
  const [fly] = useState(() => !still && !!flightOrigin(playerId));

  useLayoutEffect(() => {
    if (!reveal || !cardRef.current) return;
    revealed.add(playerId);
    const ovrEl = cardRef.current.querySelector("[data-ovr]")?.firstChild;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.12, onComplete: () => setExportReadyId(playerId) });
      tl.fromTo(flashRef.current, { opacity: 0, scale: 0.5 }, { opacity: 0.9, scale: 1.1, duration: 0.25, ease: "power2.out" })
        .to(flashRef.current, { opacity: 0, scale: 1.35, duration: 0.5, ease: "power2.in" });
      // vindo da grade a carta já chega voando; o pulo da revelação fica só para quando ela abre do nada
      if (!fly) tl.from(cardRef.current, { y: 40, scale: 0.85, opacity: 0, duration: 0.6, ease: "back.out(1.6)", clearProps: "transform,opacity" }, 0.05);
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

  // a carta sai de onde estava na grade, cresce até aqui e, ao fechar, volta para o mesmo lugar
  const flyRef = useRef<HTMLDivElement>(null);
  // o painel rola por dentro (overflow) e cortaria a carta enquanto ela voa de fora dele: durante o voo ele deixa vazar
  const scrollRef = useRef<HTMLDivElement>(null);
  const unclip = () => { if (scrollRef.current) scrollRef.current.style.overflow = "visible"; };
  const reclip = () => { if (scrollRef.current) scrollRef.current.style.overflow = ""; };
  const [isPresent, safeToRemove] = usePresence();
  const [firstId] = useState(playerId);
  const flightGap = (from: HTMLElement, el: HTMLElement) => {
    const a = from.getBoundingClientRect(), b = el.getBoundingClientRect();
    return { x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2), scale: a.width / b.width };
  };
  useLayoutEffect(() => {
    const from = flightOrigin(firstId), el = flyRef.current;
    if (!fly || !from || !el) return;
    unclip();
    const g = flightGap(from, el);
    from.style.visibility = "hidden";
    const a = animate(el, { x: [g.x, 0], y: [g.y, 0], scale: [g.scale, 1] }, springFlight);
    a.then(reclip);
    return () => { a.stop(); reclip(); from.style.visibility = ""; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- só na abertura; trocar de versão não voa de novo
  useEffect(() => {
    if (isPresent) return;
    const from = flightOrigin(firstId), el = flyRef.current;
    const done = () => { if (from) from.style.visibility = ""; safeToRemove(); };
    if (!el || still) { done(); return; }
    // volta para a grade só se ainda é a mesma carta que abriu; senão some no lugar
    const flyBack = fly && from && playerId === firstId;
    if (flyBack) unclip();
    const back = flyBack ? flightGap(from, el) : null;
    const a = back
      ? animate(el, { x: back.x, y: back.y, scale: back.scale }, { duration: 0.3, ease: easeOut })
      : animate(el, { opacity: 0, scale: 0.95 }, { duration: 0.18 });
    a.then(done);
    return () => a.stop();
  }, [isPresent]); // eslint-disable-line react-hooks/exhaustive-deps -- roda uma vez, quando o destaque começa a fechar

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;
  const team = teamOf(teams, player);
  if (!tier) return null;
  const groupKey = player.variantOf || player.id;
  // herói jogado aposentado só aparece para quem tem a carta (ou quando é a carta aberta)
  const versions = preview ? [player] : players.filter((p) => (p.id === groupKey || p.variantOf === groupKey) && (!isRetired(p) || p.id === player.id || !!owned?.has(p.id)));
  // só dá para favoritar carta que está na sua coleção
  const canFavorite = !!owned?.has(player.id);
  const fav = favorites.includes(player.id);
  const flipFavorite = async () => {
    setFavBusy(true);
    setFavIssue(undefined);
    const r = await toggleFavorite(player.id);
    setFavBusy(false);
    if (r !== "ok") setFavIssue({ id: player.id, r });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.cardOf(player.name)}
    >
      {/* fundo e vidro animam separados da carta, para a carta voar sem sumir junto com eles; clicar no fundo fecha (Esc também) */}
      <motion.div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
      <div className="relative flex max-h-[92dvh] w-full max-w-4xl">
        <motion.div
          aria-hidden="true"
          className="noir-glass-strong absolute inset-0 rounded-3xl"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
        />
      {/* sem rolagem lateral: o clarão da revelação passa da largura do painel no celular */}
      <div
        ref={scrollRef}
        className="relative flex max-h-[92dvh] w-full flex-col items-center gap-8 overflow-x-hidden overflow-y-auto rounded-3xl p-4 sm:p-8 md:flex-row md:items-start"
      >
        <div ref={flyRef} className="relative z-10 max-w-full">
        <motion.div key={player.id} className="relative max-w-full" initial={reveal || fly ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: easeOut }}>
          {reveal && (
            <div ref={flashRef} aria-hidden="true" className="pointer-events-none absolute -inset-16 rounded-full opacity-0" style={{ background: `radial-gradient(circle, ${tier.hi} 0%, ${tier.c}99 30%, transparent 68%)` }} />
          )}
          <div ref={cardRef} className="relative">
            <Card player={player} variant="editor" signature={isMainCard(player) && versions.some(isAltHero)} />
          </div>
        </motion.div>
        </div>

        <motion.div className="w-full min-w-0 flex-1 space-y-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...enter, delay: 0.08 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-black tracking-[0.12em] text-dl-text uppercase"><span ref={nameRef} key={player.id + player.name}>{player.name}</span></h2>
              <p className="mt-1 text-sm text-zinc-300">{label(team.name)} ({team.tag}) · {label(player.position || "Flex")} · {player.hero}</p>
              {player.special && owners !== undefined && (
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-amber-200">
                  <Icon name="cards" className="size-4" />
                  {t.owners(owners)}
                </p>
              )}
              {me && owned && !preview && !owned.has(player.id) && (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-zinc-800/80 px-3 py-1 text-xs font-bold text-zinc-300">
                  <span aria-hidden="true" className="size-2 rounded-full bg-zinc-500" />
                  {t.notOwned}
                </p>
              )}
              {player.art?.credit && <ArtCreditLine credit={player.art.credit} label={t.artBy} />}
            </div>
            <button type="button" onClick={onClose} aria-label={t.close} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-800/60 text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:size-9"><Icon name="x" /></button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.custom ? t.special : tier.name}</span>
            {canFavorite && (
              <button type="button" aria-pressed={fav} disabled={favBusy} onClick={flipFavorite}
                className={`${pill(fav)} disabled:cursor-wait disabled:opacity-60`}>
                <Icon name="star" className={`size-4 ${fav ? "fill-current" : ""}`} />
                {fav ? t.favorited : t.favorite}
              </button>
            )}
            <CardExportButton key={player.id} cardRef={cardRef} name={player.name} disabled={reveal && exportReadyId !== playerId} />
            {onEdit && <button type="button" onClick={() => onEdit(player.id)} className={`${pill(true)} ml-auto hover:bg-white`}>{t.edit}</button>}
            {player.special && player.specialText && <span className="text-xs font-bold text-amber-200">✦ {player.specialText}</span>}
          </div>
          {favIssue?.id === player.id && <p role="alert" className="text-sm text-red-300">{t[favIssue.r]}</p>}

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.stats}</h3>
            {/* barras enchem uma depois da outra; ao trocar de versão elas andam até o valor novo */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {STAT_KEYS.map((k, i) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <dt className="font-mono font-bold text-zinc-100">{k}</dt>
                    <dd className="min-w-0 flex-1 truncate text-zinc-400">{statNames[k]}</dd>
                    <dd className="font-bold text-zinc-100 tabular-nums"><CountUp value={player.stats[k]} delay={0.15 + cascade(i, 0.05)} /></dd>
                  </div>
                  <FillBar pct={((player.stats[k] - 40) / 59) * 100} delay={0.15 + cascade(i, 0.05)} className="h-1.5 rounded-full bg-zinc-800" style={{ background: `linear-gradient(90deg, ${tier.lo}, ${tier.c})` }} />
                </div>
              ))}
            </dl>
          </div>


          {versions.length > 1 && (
            <div>
              <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.versions} ({versions.length})</h3>
              <div className="flex flex-wrap gap-3">
                {versions.map((v) => {
                  const icon = heroIcon(v.hero);
                  const on = v.id === player.id;
                  // herói jogado é só o rosto do herói; principal, especial e versão de outro time ganham legenda
                  const caption = isAltHero(v) ? null : isMainCard(v) ? t.main : `${v.special ? t.special : t.version} · ${teamOf(teams, v).tag}`;
                  // versão que você não tem fica em preto e branco
                  const missing = !!me && !!owned && !owned.has(v.id);
                  return (
                    <button key={v.id} type="button" onClick={() => onSwitch(v.id)} aria-pressed={on} aria-label={caption ? `${caption} · ${v.hero}` : v.hero} title={v.hero}
                      className="group flex w-16 cursor-pointer flex-col items-center gap-1 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100">
                      <span className={`flex size-14 items-center justify-center overflow-hidden rounded-full bg-zinc-900 transition group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none ${on ? "ring-2 ring-dl-text ring-offset-2 ring-offset-zinc-950" : "ring-1 ring-zinc-200/15"} ${missing ? "opacity-60 grayscale" : ""}`}>
                        {icon ? <img src={icon} alt="" className="size-full scale-110 object-cover" /> : <span className="text-[10px] font-bold text-zinc-300">{v.hero.slice(0, 3)}</span>}
                      </span>
                      {caption && <span className={`max-w-full truncate text-[10px] font-bold tracking-wider uppercase ${on ? "text-dl-text" : "text-zinc-400"}`}>{caption}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
      </div>
    </div>
  );
}

/** Quantas contas têm a carta; `undefined` enquanto carrega, se falhar ou sem carta. */
function useOwnerCount(id: string | undefined) {
  const [result, setResult] = useState<{ id: string; count: number }>();
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/cards/${encodeURIComponent(id)}/owners`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : Promise.reject(new Error(String(r.status)))))
      .then(({ count }) => setResult({ id, count }))
      .catch(() => { /* sem contagem: a linha simplesmente não aparece */ });
    return () => controller.abort();
  }, [id]);
  return id && result?.id === id ? result.count : undefined;
}

export function ArtCreditLine({ credit, label }: { credit: ArtCredit; label: string }) {
  return (
    <p className="mt-1 text-xs text-zinc-400">
      {label}{" "}
      {credit.url && /^https?:\/\//i.test(credit.url) ? (
        <a href={credit.url} target="_blank" rel="noopener noreferrer" className="rounded-sm font-bold text-zinc-100 underline decoration-zinc-500 underline-offset-2 transition hover:decoration-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:text-white">
          {credit.name}
        </a>
      ) : (
        <span className="font-bold text-zinc-100">{credit.name}</span>
      )}
    </p>
  );
}
