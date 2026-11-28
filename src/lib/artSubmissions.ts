import type { ArtCredit, Player } from "./types";

/** Banco de artes: o que a pessoa envia e o ajuste que ela testou numa carta especial. */
export const ART_PENDING_MAX = 10;
export const ART_SUBMISSION_MAX_BYTES = 5 * 1024 * 1024;
export const ART_SUBMISSIONS_PATH = "/api/art-submissions";

export type ArtLayer = { zoom: number; x: number; y: number };
/** Cores e espessura da moldura, como no Editor da carta; sem elas, as da moldura escolhida. */
export type FrameTune = { c1?: string; c2?: string; pad?: number };
export type ArtLayout = ArtLayer & { fg?: ArtLayer; frame?: string; frameTune?: FrameTune; playerId?: string };

export type ArtSubmission = {
  id: string;
  status: "pending" | "used" | "rejected";
  /** Endereços privados (só quem enviou e admins abrem). */
  image: string;
  /** Extensão dos arquivos (png, jpg, webp), para o download sair com o nome certo. */
  ext: string;
  fg?: string;
  fgExt?: string;
  layout: ArtLayout;
  credit: ArtCredit;
  createdAt: number;
  usedPlayerId?: string;
  /** Nome de quem enviou: só na lista do admin. */
  user?: string;
};

/** A carta da prévia: a carta escolhida como especial, com a moldura e a arte testadas (e o crédito, se houver). */
export function previewCard(player: Player, layout: ArtLayout, image: string, fg?: string, credit?: ArtCredit): Player {
  return {
    ...player,
    special: true,
    frame: layout.frame ? { style: layout.frame, ...layout.frameTune } : player.frame,
    art: {
      url: image, zoom: layout.zoom, x: layout.x, y: layout.y,
      ...(fg && layout.fg ? { fg: { url: fg, ...layout.fg } } : {}),
      ...(credit?.name ? { credit } : {}),
    },
  };
}
