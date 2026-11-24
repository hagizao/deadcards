import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "../lib/data";
import { isAltHero, isMainCard } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import type { InventoryPack, PackKind } from "../lib/packs";
import { easeOut, pill, primaryBtn } from "../lib/ui";
import { Card } from "./Card";
import { PackArt } from "./Pack";
import { captureCard, downloadBlob, pngName } from "../lib/cardImage";

const S = strings({
  pt: {
    dialog: (name: string) => `Abrir ${name}`,
    tap: "Toque para abrir",
    opening: "Abrindo…",
    skip: "Pular animação",
    kind: { alt: "Herói jogado", signature: "Herói de assinatura!", special: "Carta especial!" } as Record<PackKind, string>,
    test: "Pack de teste: nada foi gravado",
    view: "Ver carta",
    again: "Abrir outro teste",
    close: "Fechar",
    share: "Compartilhar",
    download: "Baixar imagem",
    making: "Gerando imagem…",
    shareFailed: "Não deu para gerar a imagem. Tente de novo.",
    shareText: (card: string, pack: string) => `Tirei ${card} no ${pack} do Cardslock!`,
    exhausted: "Você já tem todas as cartas que podem sair neste pack. Ele continua fechado no seu inventário.",
    failed: "Não deu para abrir o pack agora. Ele continua no seu inventário.",
  },
  en: {
    dialog: (name: string) => `Open ${name}`,
    tap: "Tap to open",
    opening: "Opening…",
    skip: "Skip animation",
    kind: { alt: "Played hero", signature: "Signature hero!", special: "Special card!" },
    test: "Test pack: nothing was saved",
    view: "View card",
    again: "Open another test",
    close: "Close",
    share: "Share",
    download: "Download image",
    making: "Creating image…",
    shareFailed: "Couldn't create the image. Try again.",
    shareText: (card: string, pack: string) => `I pulled ${card} from the Cardslock ${pack}!`,
    exhausted: "You already own every card this pack can give. It stays closed in your inventory.",
    failed: "Couldn't open the pack right now. It's still in your inventory.",
  },
  es: {
    dialog: (name: string) => `Abrir ${name}`,
    tap: "Toca para abrir",
    opening: "Abriendo…",
    skip: "Saltar animación",
    kind: { alt: "Héroe jugado", signature: "¡Héroe insignia!", special: "¡Carta especial!" },
    test: "Pack de prueba: no se guardó nada",
    view: "Ver carta",
    again: "Abrir otra prueba",
    close: "Cerrar",
    share: "Compartir",
    download: "Descargar imagen",
    making: "Generando imagen…",
    shareFailed: "No se pudo generar la imagen. Inténtalo de nuevo.",
    shareText: (card: string, pack: string) => `¡Saqué ${card} en el ${pack} de Cardslock!`,
    exhausted: "Ya tienes todas las cartas que puede dar este pack. Sigue cerrado en tu inventario.",
    failed: "No se pudo abrir el pack ahora. Sigue en tu inventario.",
  },
});

// cor do brilho entrega a raridade antes de a carta virar
const GLOW: Record<PackKind | "none", string> = { none: "bg-zinc-200/15", alt: "bg-sky-400/45", signature: "bg-amber-300/60", special: "bg-fuchsia-400/55" };
const PACK_GLOW: Record<PackKind | "none", string> = {
  none: "",
  alt: "drop-shadow-[0_0_28px_rgb(56_189_248/0.85)]",
  signature: "drop-shadow-[0_0_34px_rgb(252_211_77/0.95)]",
  special: "drop-shadow-[0_0_30px_rgb(232_121_249/0.9)]",
};
const KIND_TEXT: Record<PackKind, string> = { alt: "text-sky-200", signature: "text-amber-200", special: "text-fuchsia-200" };

type Phase = "ready" | "shaking" | "burst" | "reveal" | "error";
const SHAKE_MS = 1100;
const BURST_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Abertura de pack em tela cheia: o pack treme, o brilho mostra a raridade, estoura e a carta vira. */
export function PackOpening({ pack, onClose, onOpened, onOpenCard }: {
  pack: InventoryPack;
  onClose: () => void;
  onOpened: (cardId: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const t = useT(S);
  const { players, me } = useData();
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  // celular: menu nativo de compartilhar com a imagem; no resto, baixar a imagem
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<{ id: string; kind: PackKind } | null>(null);
  const [error, setError] = useState("");
  // "pular" corta as esperas que ainda estão rodando
  const skipped = useRef(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && phase !== "shaking" && phase !== "burst") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);
  useEffect(() => { firstButton.current?.focus(); }, [phase]);

  const start = async () => {
    skipped.current = false;
    setResult(null);
    setError("");
    setPhase("shaking");
    const minWait = sleep(reduce ? 0 : SHAKE_MS);
    try {
      const res = await api.openPack(pack.id);
      const card = res.cards[0];
      setResult(card);
      if (!res.test) onOpened(card.id);
      if (skipped.current) return setPhase("reveal");
      await minWait;
      if (skipped.current) return;
      setPhase("burst");
      await sleep(reduce ? 0 : BURST_MS);
      if (!skipped.current) setPhase("reveal");
    } catch (e) {
      setError((e as { code?: string }).code === "exhausted" ? t.exhausted : t.failed);
      setPhase("error");
    }
  };
  const skip = () => {
    skipped.current = true;
    if (result) setPhase("reveal");
  };

  const card = result ? players.find((p) => p.id === result.id) : undefined;
  const shareImage = async (mode: "share" | "download") => {
    if (!shareRef.current || !card) return;
    setSharing(true);
    setShareError(false);
    try {
      const blob = await captureCard(shareRef.current, "#09090b");
      const file = new File([blob], pngName(`${card.name}-${card.hero}`), { type: "image/png" });
      if (mode === "share" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${t.shareText(`${card.name} (${card.hero})`, pack.type.name)} ${location.origin}` });
      } else downloadBlob(blob, file.name);
    } catch (e) {
      // fechar o menu de compartilhar não é erro
      if ((e as Error).name !== "AbortError") setShareError(true);
    } finally {
      setSharing(false);
    }
  };
  const signature = !!card && isMainCard(card) && players.some((p) => isAltHero(p) && p.variantOf === card.id);
  const packGlow = PACK_GLOW[result && phase === "shaking" ? result.kind : "none"];
  const glow = GLOW[result && phase !== "ready" ? result.kind : "none"];

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={t.dialog(pack.type.name)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-zinc-950/90 p-4 backdrop-blur-sm">
      <div className="relative flex min-h-[460px] w-full max-w-sm items-center justify-center">
        {/* brilho atrás do pack/carta */}
        <motion.div aria-hidden="true" className={`absolute size-96 rounded-full blur-3xl transition-colors duration-300 ${glow}`}
          animate={phase === "shaking" ? { scale: [0.8, 1.15, 0.95, 1.25] } : phase === "reveal" ? { scale: 1.2 } : { scale: 0.9 }}
          transition={phase === "shaking" ? { duration: SHAKE_MS / 1000, ease: "easeInOut" } : { duration: 0.3 }} />

        <AnimatePresence mode="wait">
          {(phase === "ready" || phase === "shaking" || phase === "error") && (
            <motion.button key="pack" ref={phase === "ready" ? firstButton : undefined} type="button" disabled={phase !== "ready"} onClick={start}
              aria-label={phase === "ready" ? t.tap : t.opening}
              className="relative cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dl-text disabled:cursor-default"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={phase === "shaking"
                ? { scale: 1.04, opacity: 1, rotate: [0, -2, 2, -3, 3, -4, 4, -2, 0], x: [0, -2, 2, -3, 3, -4, 4, 0] }
                : { scale: 1, opacity: 1, rotate: 0, x: 0 }}
              transition={phase === "shaking" ? { duration: 0.55, repeat: Infinity, ease: "linear" } : { duration: 0.25, ease: easeOut }}
              exit={{ scale: 1.25, opacity: 0, filter: "brightness(2.5)", transition: { duration: BURST_MS / 1000, ease: easeOut } }}
              whileHover={phase === "ready" ? { scale: 1.03, y: -4 } : undefined}>
              <span className={`block transition-[filter] duration-300 ${packGlow}`}>
                <PackArt name={pack.type.name} art={pack.type.art} size="lg" />
              </span>
            </motion.button>
          )}
          {phase === "reveal" && card && result && (
            <motion.div key="card" className="relative flex flex-col items-center gap-4 perspective-distant"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              {/* o que vai para a imagem de compartilhar: carta, tipo, pack e quem tirou */}
              <div ref={shareRef} className="flex flex-col items-center gap-3 rounded-3xl p-4">
                <motion.div initial={{ rotateY: 100, scale: 0.85 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.5, ease: easeOut }}>
                  <Card player={card} signature={signature} onOpen={() => { onOpenCard(card.id); onClose(); }} />
                </motion.div>
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.25 }}
                  className={`text-sm font-extrabold tracking-[0.2em] uppercase ${KIND_TEXT[result.kind]}`}>{t.kind[result.kind]}</motion.p>
                <p className="text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
                  {pack.type.name}{me?.handle ? ` · @${me.handle}` : ""} · Cardslock
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-11 flex-col items-center gap-3 text-center">
        {phase === "ready" && <p className="text-xs font-bold tracking-[0.2em] text-zinc-300 uppercase">{t.tap}</p>}
        {(phase === "shaking" || phase === "burst") && (
          <button type="button" onClick={skip} className={pill(false)}>{t.skip}</button>
        )}
        {phase === "error" && <p role="alert" className="max-w-sm text-sm text-red-300">{error}</p>}
        {phase === "reveal" && pack.test && <p className="text-xs text-zinc-400">{t.test}</p>}
        {shareError && <p role="alert" className="text-xs text-red-300">{t.shareFailed}</p>}
        {(phase === "reveal" || phase === "error") && (
          <div className="flex flex-wrap justify-center gap-2">
            {phase === "reveal" && card && (
              <>
                <button ref={firstButton} type="button" className={primaryBtn} disabled={sharing} onClick={() => shareImage(canShare ? "share" : "download")}>
                  {sharing ? t.making : canShare ? t.share : t.download}
                </button>
                {canShare && <button type="button" className={pill(false)} disabled={sharing} onClick={() => shareImage("download")}>{t.download}</button>}
                <button type="button" className={pill(false)} onClick={() => { onOpenCard(card.id); onClose(); }}>{t.view}</button>
              </>
            )}
            {pack.test && <button type="button" className={pill(false)} onClick={() => setPhase("ready")}>{t.again}</button>}
            <button ref={phase === "error" ? firstButton : undefined} type="button" className={pill(false)} onClick={onClose}>{t.close}</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
