import gsap from "gsap";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { teamOf, useLabel } from "../lib/cards";
import { captureCard } from "../lib/cardImage";
import { api, useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import type { CaseLevel, CaseLook, CardSpot, PackCase } from "../lib/packCase";
import type { InventoryPack, PackKind } from "../lib/packs";
import { SOUND_PEAK, isMuted, playPackSound, playReveal, preloadPackSounds, setMuted, type RevealLevel, type SoundHandle } from "../lib/packSounds";
import { getCardTier, levelOf } from "../lib/rarity";
import { Card } from "./Card";
import { RegionIcon } from "./RegionIcon";
import { RoleIcon } from "./RoleIcon";
import { TeamLogo } from "./TeamLogo";

const S = strings({
  pt: {
    dialog: (name: string) => `Abrir ${name}`,
    loading: "Trazendo a maleta…",
    drag: "Arraste as travas para baixo",
    tap: "Toque nas travas",
    other: "Agora a outra",
    latch: ["Soltar trava esquerda", "Soltar trava direita"],
    open: "Abrir o pack",
    close: "Fechar",
    keep: "Guardar na sua coleção",
    region: "Região",
    position: "Posição",
    team: "Time",
    signature: "Assinatura",
    kind: { alt: "Herói jogado", signature: "Herói de assinatura", special: "Carta especial" } as Record<PackKind, string>,
    test: "Pack de teste: nada foi gravado",
    free: "Packs são grátis e nunca serão vendidos",
    soundOn: "Desligar som",
    soundOff: "Ligar som",
    exhausted: "Você já tem todas as cartas que podem sair neste pack. Ele continua fechado no seu inventário.",
    failed: "Não deu para abrir o pack agora. Ele continua no seu inventário.",
  },
  en: {
    dialog: (name: string) => `Open ${name}`,
    loading: "Bringing the case…",
    drag: "Drag the latches down",
    tap: "Tap the latches",
    other: "Now the other one",
    latch: ["Release left latch", "Release right latch"],
    open: "Open the pack",
    close: "Close",
    keep: "Add to your collection",
    region: "Region",
    position: "Position",
    team: "Team",
    signature: "Signature",
    kind: { alt: "Played hero", signature: "Signature hero", special: "Special card" },
    test: "Test pack: nothing was saved",
    free: "Packs are free and will never be sold",
    soundOn: "Turn sound off",
    soundOff: "Turn sound on",
    exhausted: "You already own every card this pack can give. It stays closed in your inventory.",
    failed: "Couldn't open the pack right now. It's still in your inventory.",
  },
  es: {
    dialog: (name: string) => `Abrir ${name}`,
    loading: "Trayendo el maletín…",
    drag: "Arrastra los cierres hacia abajo",
    tap: "Toca los cierres",
    other: "Ahora el otro",
    latch: ["Soltar cierre izquierdo", "Soltar cierre derecho"],
    open: "Abrir el pack",
    close: "Cerrar",
    keep: "Guardar en tu colección",
    region: "Región",
    position: "Posición",
    team: "Equipo",
    signature: "Insignia",
    kind: { alt: "Héroe jugado", signature: "Héroe insignia", special: "Carta especial" },
    test: "Pack de prueba: no se guardó nada",
    free: "Los packs son gratis y nunca se venderán",
    soundOn: "Apagar sonido",
    soundOff: "Encender sonido",
    exhausted: "Ya tienes todas las cartas que puede dar este pack. Sigue cerrado en tu inventario.",
    failed: "No se pudo abrir el pack ahora. Sigue en tu inventario.",
  },
});

/** loading → arrive → latches → waiting (servidor) → show (tampa, walkout, carta) → done; ou error. `flat` = sem WebGL2. */
type Stage = "loading" | "arrive" | "latches" | "flat" | "waiting" | "show" | "done" | "error";
type Drawn = { id: string; kind: PackKind };

const CASE_LV: Record<RevealLevel, CaseLevel> = { base: 0, ascendant: 1, special: 1, eternus: 2 };
const NEUTRAL = { c: "#ffefd7", hi: "#ffefd7" };
/** Espaço embaixo da carta para o resultado e o aviso. */
const BOTTOM = 136;

/**
 * Abertura de pack como maleta de contrabando em 3D: chega na mesa, a pessoa arrasta as duas travas, a tampa abre
 * com a luz da raridade; 88+ e especiais ganham o walkout do FIFA (região → posição → time) antes da carta.
 */
export function PackOpening({ pack, onClose, onOpened }: { pack: InventoryPack; onClose: () => void; onOpened: (cardId: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { players, teams, settings } = useData();
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState<Stage>("loading");
  const [opened, setOpened] = useState([false, false]);
  const [result, setResult] = useState<Drawn | null>(null);
  const [error, setError] = useState("");
  const [spot, setSpot] = useState<(CardSpot & { w: number; h: number }) | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  // "guardar": para onde a carta voa (centro da aba Coleção, relativo ao centro da carta)
  const [stash, setStash] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const walk = useRef<HTMLDivElement>(null);
  const latchBtns = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const kase = useRef<PackCase | null>(null);
  const shot = useRef<HTMLDivElement>(null);
  const front = useRef<Promise<void> | null>(null);
  const riser = useRef<SoundHandle | null>(null);
  useEffect(() => () => riser.current?.stop(), []);
  const server = useRef<Promise<Drawn | null> | null>(null);

  const card = result ? players.find((p) => p.id === result.id) : undefined;
  const tier = card ? getCardTier(card, settings.tierConfig!) : null;
  const level = levelOf(tier);
  const colors = tier && level !== "base" ? { c: tier.c, hi: tier.hi } : NEUTRAL;
  const team = card ? teamOf(teams, card) : null;
  const signature = result?.kind === "signature";

  // assim que a carta sorteada chega, tira um PNG dela (fora da tela) para a frente da carta 3D
  const shotKey = card && result ? `${card.id}:${result.kind}` : null;
  useEffect(() => {
    const node = shot.current?.querySelector<HTMLElement>(".rk-wrap");
    if (!shotKey || !node) return;
    front.current = captureCard(node)
      .then(async (blob) => {
        const url = URL.createObjectURL(blob);
        try { await kase.current?.setFront(url); } finally { URL.revokeObjectURL(url); }
      })
      .catch(() => { /* sem PNG: a carta 3D gira só com o verso */ });
  }, [shotKey]);

  const request = () => (server.current ??= api.openPack(pack.id).then(
    (res) => {
      const drawn = res.cards[0];
      setResult(drawn);
      if (!res.test) onOpened(drawn.id);
      return drawn;
    },
    (e: { code?: string }) => {
      setError(e.code === "exhausted" ? t.exhausted : t.failed);
      setStage("error");
      return null;
    },
  ));

  /** Segundos do walkout (mesma conta da linha do tempo abaixo). */
  const walkoutTime = (lv: CaseLevel) => 0.45 + (walk.current?.children.length ?? 0) * (1.75 - lv * 0.1);
  const walkout = (lv: CaseLevel) => new Promise<void>((resolve) => {
    const el = walk.current;
    if (!el) return resolve();
    kase.current?.dim();
    const beats = [...el.children];
    const hold = 1 - lv * 0.1, step = hold + 0.75;
    const tl = gsap.timeline({ onComplete: resolve }).to(el, { autoAlpha: 1, duration: 0.4 }, 0);
    beats.forEach((b, i) => {
      const at = 0.35 + i * step;
      tl.fromTo(b, { autoAlpha: 0, scale: reduce ? 1 : 1.18 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "power3.out" }, at)
        .add(() => kase.current?.beat(i), at)
        .to(b, { autoAlpha: 0, scale: reduce ? 1 : 0.94, duration: 0.3, ease: "power2.in" }, at + 0.45 + hold);
    });
    tl.to(el, { autoAlpha: 0, duration: 0.2 }, 0.25 + beats.length * step);
  });

  const place = (s: CardSpot) => {
    const r = root.current?.getBoundingClientRect();
    setSpot({ ...s, w: r?.width ?? 0, h: r?.height ?? 0 });
  };

  // a resposta do servidor já chegou ou chega aqui; daí a tampa, o walkout e a carta
  const play = useEffectEvent(async () => {
    setStage("waiting");
    const drawn = await request();
    const c = kase.current;
    if (!drawn || !c) return;
    const p = players.find((x) => x.id === drawn.id);
    const tr = p ? getCardTier(p, settings.tierConfig!) : null;
    const lvl = levelOf(tr);
    const lv = CASE_LV[lvl];
    // especial: a luz alterna entre as duas cores da moldura
    const look: CaseLook | null = tr && lvl !== "base" ? { c: tr.c, hi: tr.hi, alt: lvl === "special" ? { c: tr.hi, hi: tr.c } : undefined } : null;
    setStage("show");
    // Eternus e especial: o riser começa com a fresta e o estouro dele cai na hora em que a carta aparece
    // (com a faixa de assinatura a abertura fica mais longa: o riser começa um pouco depois)
    const sig = drawn.kind === "signature";
    let t0 = performance.now() + (sig ? 1000 : 0);
    let peak = 0;
    if (lvl === "eternus" || lvl === "special") {
      riser.current = playPackSound("riser-eternus", { delay: sig ? 1 : 0 });
      peak = SOUND_PEAK["riser-eternus"];
    }
    await c.crack(lv, look);
    // assinatura logo depois da cor da luz: a faixa dourada se estende dentro da tampa
    if (drawn.kind === "signature") await c.ribbon(t.signature);
    // Ascendant: a tensão sobe durante o walkout e o pico cai na revelação
    if (lvl === "ascendant") {
      const delay = Math.max(0, walkoutTime(lv) + 0.3 - (SOUND_PEAK.tension - c.riseTime(lv)));
      riser.current = playPackSound("tension", { delay });
      t0 = performance.now() + delay * 1000;
      peak = SOUND_PEAK.tension;
    }
    if (lvl !== "base") await walkout(lv);
    // a frente 3D costuma estar pronta; se o PNG atrasar, a carta gira só com o verso
    await Promise.race([front.current, new Promise((r) => setTimeout(r, 1500))]);
    if (peak) {
      // posição real do áudio (cobre o atraso para começar); sem som, o relógio
      const at = riser.current?.position() ?? (performance.now() - t0) / 1000;
      const left = peak - c.riseTime(lv) - at;
      if (left > 0.05) await c.charge(left);
    }
    const s = await c.rise(lv);
    place(s);
    playReveal(lvl);
    setStage("done");
  });

  const onLatch = useEffectEvent((i: number, remaining: number) => {
    void request();
    setOpened((o) => o.map((v, k) => v || k === i));
    if (!remaining) void play();
  });

  useEffect(() => {
    preloadPackSounds();
    let dead = false;
    const el = canvas.current;
    if (!el) return;
    import("../lib/packCase")
      .then(({ createPackCase }) => createPackCase(el, {
        name: pack.type.name,
        reduce,
        latchButtons: latchBtns.current,
        onLatch: (i, r) => onLatch(i, r),
        onSound: (id, o) => { playPackSound(id, o); },
      }))
      .catch(() => null)
      .then((c) => {
        if (dead) return c?.dispose();
        if (!c) return setStage("flat");
        kase.current = c;
        setStage("arrive");
        void c.arrive().then(() => setStage("latches"));
      });
    return () => {
      dead = true;
      kase.current?.dispose();
      kase.current = null;
    };
    // a cena nasce uma vez por abertura; reduce e o nome não mudam com o diálogo aberto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sem WebGL2: um botão abre e a carta aparece direto
  const openFlat = async () => {
    setStage("waiting");
    const drawn = await request();
    if (!drawn) return;
    const p = players.find((x) => x.id === drawn.id);
    const lvl = levelOf(p && getCardTier(p, settings.tierConfig!));
    const r = root.current?.getBoundingClientRect();
    place({ x: (r?.width ?? 0) / 2, y: ((r?.height ?? 0) - BOTTOM) / 2, scale: 0.6 });
    playReveal(lvl);
    setStage("done");
  };

  useEffect(() => {
    if (stage === "done" || stage === "error") closeBtn.current?.focus();
    else if (stage === "latches") latchBtns.current.find((b) => b && !b.disabled)?.focus({ preventScroll: true });
  }, [stage, opened]);

  const closable = stage !== "waiting" && stage !== "show";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && closable) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, onClose]);

  const navTab = () => [...document.querySelectorAll<HTMLElement>('[data-nav="collection"]')].find((el) => el.getBoundingClientRect().width > 0);
  const keep = () => {
    const r = root.current?.getBoundingClientRect();
    const tab = navTab()?.getBoundingClientRect();
    if (reduce || !r || !tab) return onClose();
    setStash({ x: tab.left + tab.width / 2 - r.width / 2, y: tab.top + tab.height / 2 - (r.height - BOTTOM) / 2 });
  };

  const toggleSound = () => { setMuted(!muted); setMutedState(!muted); };
  const hint = stage === "loading" ? t.loading : stage === "latches" ? (opened.some(Boolean) ? t.other : reduce ? t.tap : t.drag) : stage === "waiting" ? "…" : "";

  // a carta real nasce onde o verso 3D estava e vai para o centro, no tamanho que cabe
  const fit = spot ? Math.min(1, (spot.h - BOTTOM - 100) / 430, (spot.w - 32) / 295) : 1;
  const from = spot ? { x: spot.x - spot.w / 2, y: spot.y - (spot.h - BOTTOM) / 2, scale: spot.scale } : null;

  return (
    <motion.div ref={root} role="dialog" aria-modal="true" aria-label={t.dialog(pack.type.name)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 overflow-hidden transition-colors duration-500 pack-stage" style={stash ? { background: "transparent" } : undefined}>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 block size-full touch-none transition-opacity duration-300" style={stash ? { opacity: 0 } : undefined} />

      {[0, 1].map((i) => (
        <button key={i} ref={(b) => { latchBtns.current[i] = b; }} type="button" aria-label={t.latch[i]} disabled={stage !== "latches" || opened[i]}
          onClick={() => kase.current?.openLatch(i)}
          className="pointer-events-none absolute -m-6 size-12 rounded-xl opacity-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100" />
      ))}

      {stage === "flat" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pb-34">
          <button type="button" onClick={() => void openFlat()}
            className="min-h-11 cursor-pointer rounded-full bg-dl-text px-6 py-3 text-sm font-extrabold tracking-[0.2em] text-dl-black uppercase transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-97">
            {t.open}
          </button>
        </div>
      )}

      {card && result && (
        <div ref={shot} aria-hidden="true" inert className="pointer-events-none fixed top-0 left-[-9999px]">
          <Card player={card} signature={signature} />
        </div>
      )}

      {level !== "base" && card && team && (
        <div ref={walk} aria-live="polite" className="pointer-events-none invisible absolute inset-0 z-20 grid place-items-center opacity-0 pack-walk">
          <Beat label={t.region}>
            <b className="pack-beat">{label(team.region)}</b>
            <span className="grid size-[clamp(76px,20vw,108px)] place-items-center rounded-full border-3 bg-black/50 text-dl-text" style={{ borderColor: colors.c }}>
              <RegionIcon region={team.region} className="size-3/5" />
            </span>
          </Beat>
          <Beat label={t.position}>
            <b className="pack-beat">{label(card.position)}</b>
            <span className="grid size-[clamp(76px,20vw,108px)] place-items-center rounded-full border-3 bg-black/50 text-dl-text" style={{ borderColor: colors.c }}>
              <RoleIcon position={card.position} className="size-1/2" />
            </span>
          </Beat>
          <Beat label={t.team}>
            <span className="grid size-[clamp(154px,39vw,224px)] place-items-center overflow-hidden rounded-full border-3 bg-black/50 font-display text-[clamp(56px,15vw,90px)] font-extrabold tracking-wider text-dl-text"
              style={{ borderColor: colors.c }}>
              <TeamLogo team={team} />
            </span>
          </Beat>
        </div>
      )}

      {stage === "done" && card && result && from && (
        <>
          {level !== "base" && !reduce && (
            <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30" style={{ background: `radial-gradient(circle at ${spot!.x}px ${spot!.y}px, ${colors.hi}, transparent 60%)` }}
              initial={{ opacity: 0 }} animate={{ opacity: [0, level === "eternus" ? 0.95 : 0.65, 0] }} transition={{ duration: level === "eternus" ? 1.1 : 0.7, times: [0, 0.15, 1] }} />
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center" style={{ bottom: BOTTOM }}>
            <motion.div className="pointer-events-auto" initial={reduce ? { opacity: 0, scale: fit } : { ...from, opacity: 1 }}
              animate={stash ? { x: stash.x, y: stash.y, scale: 0.06, rotate: -10, opacity: [1, 1, 0] } : { x: 0, y: 0, scale: fit, opacity: 1 }}
              transition={stash ? { duration: 0.7, ease: [0.45, 0, 0.7, 0.4], opacity: { duration: 0.7, times: [0, 0.92, 1], ease: "linear" } } : reduce ? { duration: 0.2 } : { type: "spring", stiffness: 170, damping: 17 }}
              onAnimationComplete={() => {
                if (!stash) return;
                // a aba Coleção "recebe" a carta com um pulo rápido
                navTab()?.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 280, easing: "ease-out" });
                onClose();
              }}>
              <Card player={card} signature={result.kind === "signature"} />
            </motion.div>
          </div>
        </>
      )}

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3 p-4 text-center transition-opacity duration-200 ${stash ? "opacity-0" : ""}`}>
        {stage === "done" && card && tier && result && (
          <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.5, duration: 0.3 }}>
            <span className="font-display text-lg font-extrabold tracking-[0.25em] uppercase" style={{ color: level === "base" ? NEUTRAL.hi : tier.hi }}>{level === "special" ? t.kind.special : tier.name}</span>
            {level !== "special" && <span className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.kind[result.kind]}</span>}
            {pack.test && <span className="text-[11px] text-zinc-500">{t.test}</span>}
          </motion.div>
        )}
        {stage === "error" && <p role="alert" className="max-w-sm text-sm text-red-300">{error}</p>}
        {hint && <p aria-live="polite" className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">{hint}</p>}
        {stage === "done" && (
          <button ref={closeBtn} type="button" onClick={keep} disabled={!!stash}
            className="pointer-events-auto min-h-11 cursor-pointer rounded-full bg-dl-text px-6 text-xs font-extrabold tracking-[0.2em] text-dl-black uppercase transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-97 disabled:cursor-default disabled:opacity-60">
            {t.keep}
          </button>
        )}
        {stage === "error" && (
          <button ref={closeBtn} type="button" onClick={onClose}
            className="pointer-events-auto min-h-11 cursor-pointer rounded-full bg-zinc-800/80 px-6 text-xs font-extrabold tracking-[0.2em] text-zinc-100 uppercase transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-97">
            {t.close}
          </button>
        )}
        <p className="text-[10px] tracking-[0.18em] text-zinc-500 uppercase">{t.free}</p>
      </div>

      <button type="button" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? t.soundOff : t.soundOn} title={muted ? t.soundOff : t.soundOn}
        className="absolute top-4 right-4 z-50 flex size-11 cursor-pointer items-center justify-center rounded-full bg-zinc-800/80 text-zinc-200 transition hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
        </svg>
      </button>

      {closable && stage !== "done" && stage !== "error" && (
        <button type="button" onClick={onClose} aria-label={t.close}
          className="absolute top-4 left-4 z-50 flex size-11 cursor-pointer items-center justify-center rounded-full bg-zinc-800/80 text-zinc-200 transition hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 [stroke-linecap:round]"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      )}
    </motion.div>
  );
}

function Beat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="invisible col-start-1 row-start-1 flex flex-col items-center gap-3 text-center opacity-0">
      <small className="pl-[0.4em] text-[11px] tracking-[0.4em] text-zinc-400 uppercase">{label}</small>
      {children}
    </div>
  );
}
