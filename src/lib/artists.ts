/** Área de artista no perfil público: as cartas com a arte da pessoa e as curtidas somadas delas. */
export type ArtistInfo = { cards: string[]; likes: number };

/** O que o admin vê no perfil: se a conta é artista e as cartas vinculadas (mesmo com o selo desligado). */
export type ArtistAdmin = { artist: boolean; cards: string[] };

export const ARTISTS_PATH = "/api/artists";
export const artistPath = (userId: string) => `${ARTISTS_PATH}/${encodeURIComponent(userId)}`;
export const artistLikesPath = (userId: string) => `${artistPath(userId)}/likes`;
export const artistCardPath = (userId: string, playerId: string) => `${artistPath(userId)}/cards/${encodeURIComponent(playerId)}`;
