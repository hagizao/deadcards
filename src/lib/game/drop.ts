// Arrastar cartas até um local: o local (`data-drop`) sob o ponteiro.

/** Local (`data-drop`) sob o ponto da tela. */
export function dropUnder(x: number, y: number): number | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const v = (el as HTMLElement).dataset?.drop;
    if (v !== undefined) return Number(v);
  }
  return null;
}
/** Ponto do evento de mouse, toque ou ponteiro. */
export const pointOf = (e: MouseEvent | TouchEvent | PointerEvent) => ("clientX" in e ? { x: e.clientX, y: e.clientY } : { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
