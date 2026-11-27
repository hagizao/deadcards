import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RitualBackdrop, grainTile } from "../lib/ritualBackdrop";

/** Cor do ritual fora de uma área (o bege do site, `--color-dl-text`). */
const BASE = "#ffefd7";

/**
 * Fundo do site: o ritual de longe (ver `lib/ritualBackdrop`), com granulação e vinheta por cima.
 * A cor segue a área da aba; com "menos movimento" fica um quadro parado; pausa quando a aba do navegador some.
 */
export function RitualBackground({ color = BASE }: { color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<RitualBackdrop | null>(null);
  const reduce = useReducedMotion();
  const [grain] = useState(grainTile);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const e = new RitualBackdrop(cv, color);
    engine.current = e;
    let timer = 0;
    const onResize = () => { clearTimeout(timer); timer = window.setTimeout(() => e.resize(), 150); };
    addEventListener("resize", onResize);
    return () => { e.stop(); removeEventListener("resize", onResize); clearTimeout(timer); engine.current = null; };
    // a cor entra pelo efeito de baixo: recriar o motor a cada aba recomeçaria o redemoinho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setColor(color); }, [color]);

  useEffect(() => {
    const e = engine.current;
    if (!e || reduce) return;
    const sync = () => (document.hidden ? e.stop() : e.start());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { document.removeEventListener("visibilitychange", sync); e.stop(); };
  }, [reduce]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b0d11]" aria-hidden="true">
      <canvas ref={ref} className="absolute inset-0 size-full" />
      {/* véu escuro: o ritual fica de fundo, sem competir com o texto */}
      <div className="absolute inset-0 bg-zinc-950/65" />
      <div className="ritual-grain" style={{ backgroundImage: `url(${grain})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_45%,rgb(0_0_0/0.7)_100%)]" />
    </div>
  );
}
