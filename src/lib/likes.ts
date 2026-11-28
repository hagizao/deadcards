/** Curtidas das cartas especiais: o total é público; `liked` diz se quem está logado já curtiu; `own`, se a arte é dele. */
export type CardLikes = { count: number; liked: boolean; own?: boolean };

export const likesPath = (id: string) => `/api/cards/${encodeURIComponent(id)}/likes`;
