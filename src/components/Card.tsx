import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { CSSProperties, PointerEvent } from "react";
import type { Player } from "../lib/types";
import { getPlayerOvr, getPlayerTrend, hexToRgba, teamOf, useLabel } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import { getCardTier, ornamentSVG, particleSpecs, rarityStyleVars, ringSVG } from "../lib/rarity";
import { useData } from "../lib/data";
import { TeamLogo3D } from "./TeamLogo3D";
import { TrendBadge } from "./TrendBadge";

type Variant = "team" | "medium" | "editor";

const S = strings({
  pt: { view: "Visualizar Carta", viewOf: (name: string) => `Visualizar carta de ${name}`, signature: "Assinatura" },
  en: { view: "View Card", viewOf: (name: string) => `View ${name}'s card`, signature: "Signature" },
  es: { view: "Ver Carta", viewOf: (name: string) => `Ver la carta de ${name}`, signature: "Firma" },
});

const STAT_ORDER = ["MIR", "MOV", "MAC", "POL", "SUP", "CON"] as const;

/** `signature`: mostra a tag de herói de assinatura (onde as cartas de heróis jogados aparecem junto). */
export function Card({ player, variant = "team", onOpen, signature }: { player: Player; variant?: Variant; onOpen?: () => void; signature?: boolean }) {
  const { teams, settings, heroArt } = useData();
  const t = useT(S);
  const label = useLabel();
  const team = teamOf(teams, player);
  const ovr = getPlayerOvr(player);
  const rk = getCardTier(player, settings.tierConfig!);
  const medium = variant === "medium";
  const editor = variant === "editor";
  const art = player.art?.url ? { url: player.art.url, zoom: player.art.zoom ?? 100, x: player.art.x ?? 50, y: player.art.y ?? 50 } : heroArt(player.hero);

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(useTransform(ry, [-0.5, 0.5], [9, -9]), { stiffness: 220, damping: 18 });
  const rotateY = useSpring(useTransform(rx, [-0.5, 0.5], [-11, 11]), { stiffness: 220, damping: 18 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    rx.set((e.clientX - r.left) / r.width - 0.5);
    ry.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { rx.set(0); ry.set(0); };

  const sizeClass = editor ? "card-size-editor" : medium ? "card-size-team-medium" : "card-size-team";
  const topPad = rk.custom ? rk.topPad || undefined : rk.lvl >= 3 ? 26 : undefined;
  const footerSize = Number.isFinite(Number(player.footerSize)) ? Number(player.footerSize) : 12;
  const footerColor = /^#[0-9a-f]{6}$/i.test(String(player.footerColor)) ? player.footerColor : "#f4f4f5";

  return (
    <motion.div
      className={`rk-wrap${player.special ? " sp-card" : ""}`}
      data-rarity={rk.key}
      style={{ ...(rarityStyleVars(rk) as CSSProperties), rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className={`deadlock-card-shell ${sizeClass} group select-none`}>
        <div className="deadlock-card-inner flex flex-col justify-between p-4 sm:p-5" style={topPad ? { paddingTop: topPad } : undefined}>
          {art ? (
            <div className="hero-bg-wrap pointer-events-none absolute inset-0 overflow-hidden">
              <img
                src={art.url}
                alt={player.hero}
                draggable={false}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", objectFit: "cover",
                  objectPosition: `${art.x}% ${art.y}%`, transform: `scale(${art.zoom / 100})`, transformOrigin: `${art.x}% ${art.y}%`,
                  filter: "contrast(1.08) saturate(1.12)", userSelect: "none",
                }}
              />
            </div>
          ) : (
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 30%, #3f3f46 0%, #09090b 100%)" }} />
          )}

          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${hexToRgba(player.c2, 0)} 52%, ${hexToRgba(player.c2, 0.5)} 80%, rgba(9, 9, 11, 0.78) 100%)` }}
          />
          {rk.custom ? (
            <svg className="fr-orn" aria-hidden="true" viewBox="0 0 295 430" preserveAspectRatio="none" dangerouslySetInnerHTML={{ __html: ornamentSVG(rk) }} />
          ) : (
            <svg className={`rk-ring${rk.lvl >= 3 ? " rk-ring-pulse" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ringSVG(rk) }} />
          )}
          {(rk.custom ? rk.glint : rk.lvl >= 3) && <div className="rk-glint" />}
          <Particles tierKey={rk} />
          {player.special && !rk.noSweep && <div className="sp-card-fx" />}

          <div className="relative z-10 flex items-start justify-between gap-2">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5">
                <span data-ovr className={`${editor ? "text-6xl" : medium ? "text-4xl" : "text-5xl"} leading-none font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]`}>{ovr}</span>
                <TrendBadge delta={getPlayerTrend(player)} size={editor ? "editor" : "card"} />
              </div>
              <span className="mt-1.5 rounded-sm border border-white/25 bg-black/65 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-zinc-100 uppercase">
                {label(player.position || "Flex")}
              </span>
              {team.logo ? (
                <div className="mt-1.5"><TeamLogo3D team={team} className={editor ? "size-12" : "size-10"} radius={8} /></div>
              ) : (
                <span className="mt-1.5 rounded-sm border border-white/35 bg-white/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-white uppercase">{team.tag || "FA"}</span>
              )}
            </div>
            {/* herói de assinatura: selo dourado com estrela, sem texto em cima da arte */}
            {signature && (
              <span role="img" aria-label={t.signature} title={t.signature}
                className={`${editor ? "size-9" : medium ? "size-6" : "size-7"} flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-amber-100 via-amber-300 to-amber-600 text-amber-950 shadow-[0_0_14px_rgb(252_211_77/0.55)] ring-1 ring-amber-100/70`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[55%] fill-current drop-shadow-[0_1px_0_rgb(255_255_255/0.4)]"><path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" /></svg>
              </span>
            )}
          </div>

          <div className={`relative z-10 mt-auto ${medium ? "pb-5" : editor ? "pb-9" : "pb-8"}`}>
            <div className={`mb-2 border-b border-zinc-200/45 pb-1.5 text-center ${medium ? "" : "mx-2"}`}>
              <h3 className={`${editor ? "text-2xl" : medium ? "text-lg" : "text-xl"} truncate font-black tracking-[0.12em] text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]`}>
                {player.name}
              </h3>
            </div>
            {!medium && (
              <div className={`grid grid-cols-2 gap-x-5 ${editor ? "px-5" : "px-4"} card-txt-shadow gap-y-1.5 py-1`}>
                {STAT_ORDER.map((k) => (
                  <div key={k} className="flex items-center justify-between leading-none">
                    <span className={`${editor ? "text-base" : "text-sm"} font-extrabold tracking-wider text-zinc-200`}>{k}</span>
                    <span className={`${editor ? "text-xl" : "text-lg"} font-black text-white`}>{player.stats[k]}</span>
                  </div>
                ))}
              </div>
            )}
            <div
              className={`text-center ${medium ? "mt-2" : "mt-3"} leading-tight font-black uppercase`}
              style={{ fontSize: medium ? Math.round(footerSize * 0.85) : footerSize, letterSpacing: "0.2em", color: footerColor, textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
            >
              {player.footer ?? "Cardslock"}
            </div>
          </div>

          {onOpen && (
            <button type="button" className="card-hover-overlay border-0" onClick={onOpen} aria-label={t.viewOf(player.name)}>
              <span className={`card-hover-cta w-full ${medium ? "max-w-[170px]" : "max-w-[215px]"} rounded-xl bg-zinc-100 px-4 py-2.5 text-xs font-extrabold tracking-wider text-zinc-950 uppercase shadow-[0_0_24px_rgba(255,255,255,0.4)]`}>
                {t.view}
              </span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Particles({ tierKey }: { tierKey: ReturnType<typeof getCardTier> }) {
  const specs = particleSpecs(tierKey);
  if (!specs.length) return null;
  const f = (n: number) => n.toFixed(2);
  return (
    <div className="rk-particles" aria-hidden="true">
      {specs.map((sp, i) => (
        <span
          key={i}
          className={sp.type === "rise" ? "rk-p" : sp.type === "twinkle" ? "rk-tw" : "rk-streak"}
          style={{ "--x": `${f(sp.x)}%`, "--y": `${f(sp.y)}%`, "--s": `${f(sp.s)}px`, "--d": `${f(sp.d)}s`, "--dl": `${f(sp.dl)}s`, "--dx": `${f(sp.dx)}px`, "--po": f(sp.po), "--pc": sp.color } as CSSProperties}
        />
      ))}
    </div>
  );
}
