/** Curtidas das cartas especiais: o total é público; `liked` diz se quem está logado já curtiu. */
export type CardLikes = { count: number; liked: boolean };

export const likesPath = (id: string) => `/api/cards/${encodeURIComponent(id)}/likes`;
