import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { grainTile } from "../lib/ritualBackdrop";

/** Cor do ritual fora de uma área (o bege do site, `--color-dl-text`). */
const BASE = "#ffefd7";

/**
 * Fundo do site: o ritual de longe, gravado em vídeo por `scripts/render-ritual.mjs` a partir de `lib/ritualBackdrop`.
 * Desenhar o canvas a cada quadro ocupava a thread principal e travava a rolagem; o vídeo decodifica fora dela.
 * O vídeo é neutro: a cor da aba entra por cima (mistura "color"). Com "menos movimento", só o pôster parado.
 */
export function RitualBackground({ color = BASE }: { color?: string }) {
  const reduce = useReducedMotion();
  const [grain] = useState(grainTile);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b0d11]" aria-hidden="true">
      {/* o olho fica a 70% da largura e 30% da altura: no celular o corte do vídeo mantém ele à vista */}
      {reduce ? (
        <img src="/ritual/ritual-poster.webp" alt="" className="absolute inset-0 size-full object-cover object-[70%_30%]" />
      ) : (
        <video autoPlay muted loop playsInline poster="/ritual/ritual-poster.webp" className="absolute inset-0 size-full object-cover object-[70%_30%]">
          <source src="/ritual/ritual.webm" type="video/webm" />
          <source src="/ritual/ritual.mp4" type="video/mp4" />
        </video>
      )}
      {/* a cor da aba pinta o vídeo neutro */}
      <div className="absolute inset-0 mix-blend-color transition-colors duration-700 motion-reduce:transition-none" style={{ backgroundColor: color }} />
      {/* véu escuro: o ritual fica de fundo, sem competir com o texto */}
      <div className="absolute inset-0 bg-zinc-950/65" />
      <div className="ritual-grain" style={{ backgroundImage: `url(${grain})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_45%,rgb(0_0_0/0.7)_100%)]" />
    </div>
  );
}
