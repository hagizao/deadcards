/** PNG de um elemento com carta, sem os efeitos animados que não ficam bons parados. */
export async function captureCard(node: HTMLElement, backgroundColor?: string): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor,
    style: { transform: "none", filter: "none" },
    filter: (n) => !(n instanceof Element && n.matches(".rk-particles, .rk-glint, .sp-card-fx, .card-hover-overlay")),
  });
  if (!blob?.size) throw new Error("Empty PNG");
  return blob;
}

export const pngName = (name: string) => `deadcards-${name.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "card"}.png`;

/** Baixa o PNG pelo navegador. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
