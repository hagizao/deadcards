// Tempos e curvas das animações do site, num lugar só. Espelhados no guia em public/design/.
import { useEffect, useState } from "react";
import { easeOut } from "./ui";

/** Mola padrão de elementos que entram ou mudam de lugar (cartas, painéis). */
export const springSoft = { type: "spring", stiffness: 260, damping: 26 } as const;
/** Mola da carta voando da grade até o destaque e de volta. */
export const springFlight = { type: "spring", stiffness: 210, damping: 25, mass: 0.9 } as const;
/** Entrada curta de interface: abaixo de 300 ms. */
export const enter = { duration: 0.25, ease: easeOut } as const;

/** Atraso da cascata: cada item entra um pouco depois do anterior, com teto para listas longas não demorarem. */
export const cascade = (i: number, step = 0.035, max = 12) => Math.min(i, max) * step;

// Carta que abriu o destaque: guardamos onde ela estava para o destaque sair dali e voltar para lá.
let origin: { id: string; el: HTMLElement } | null = null;

export function setFlightOrigin(id: string, el: HTMLElement | null) {
  origin = el ? { id, el } : null;
}

/** Elemento de onde a carta `id` saiu, se ainda estiver na tela. */
export function flightOrigin(id: string) {
  return origin?.id === id && origin.el.isConnected ? origin.el : null;
}

/** `false` logo que a tela monta e `true` depois de `ms`: a cascata de entrada só vale na primeira vez, não a cada filtro. */
export function useSettled(ms = 900) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return settled;
}
