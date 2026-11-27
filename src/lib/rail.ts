import { useLayoutEffect, useState } from "react";
import type { PanInfo } from "motion/react";
import { springSoft } from "./motion";

/**
 * Faixa horizontal sem barra de rolagem: mede quantos itens cabem e anda de item em item pelas setas ou arrastando.
 * `el` é o elemento que corta a faixa (guardado com useState no componente, para medir também quando ele só aparece depois).
 * `item` é a largura mínima de cada item; com `fluid`, os itens esticam para preencher a largura (até `max` por vez).
 */
export function useRail(el: HTMLElement | null, count: number, { item, gap, max = Infinity, fluid = false }: { item: number; gap: number; max?: number; fluid?: boolean }) {
  const [width, setWidth] = useState(0);
  const [start, setStart] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const visible = Math.max(1, Math.min(max, count, Math.floor((width + gap) / (item + gap)) || 1));
  const size = fluid && width ? (width - gap * (visible - 1)) / visible : item;
  const step = size + gap;
  const last = Math.max(0, count - visible);
  const at = Math.min(start, last);
  const go = (d: number) => setStart(Math.max(0, Math.min(last, at + d)));

  return {
    visible, size, at, last, go,
    /** O que vai no `motion.ul` da faixa: posição, mola e arrastar para os lados. */
    track: {
      animate: { x: -at * step },
      transition: springSoft,
      drag: last > 0 ? ("x" as const) : false,
      dragConstraints: { left: -last * step, right: 0 },
      dragElastic: 0.12,
      onDragEnd: (_: unknown, info: PanInfo) => go(info.offset.x < -60 ? 1 : info.offset.x > 60 ? -1 : 0),
    },
    /** Classes do elemento que corta a faixa: esmaece as pontas que ainda têm itens escondidos. */
    fade: `rail-fade ${at > 0 ? "[--fade-l:4rem]" : ""} ${at < last ? "[--fade-r:4rem]" : ""}`,
    /** Igual a `fade`, mais longo: para faixas de cartas grandes, em que a ponta cortada fica mais aparente. */
    fadeStrong: `rail-fade ${at > 0 ? "[--fade-l:10rem]" : ""} ${at < last ? "[--fade-r:10rem]" : ""}`,
    /** Item fora da vista sai do Tab e do leitor de tela. */
    hidden: (i: number) => i < at || i >= at + visible,
  };
}
