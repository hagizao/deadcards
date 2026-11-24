import { useEffect, useSyncExternalStore } from "react";
import { useData } from "./data";
import { favoritePath } from "./profile";

/** Cartas e favoritas de quem está logado, compartilhadas entre Coleção, destaque da carta e perfil. */
type State = { userId: string | null; owned: Set<string> | null; favorites: string[] };

let state: State = { userId: null, owned: null, favorites: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

async function load(userId: string) {
  const [owned, profile] = await Promise.all([
    fetch("/api/collection").then((r) => (r.ok ? (r.json() as Promise<string[]>) : [])).catch(() => [] as string[]),
    fetch(`/api/users/${encodeURIComponent(userId)}`).then((r) => (r.ok ? (r.json() as Promise<{ favorites: string[] }>) : null)).catch(() => null),
  ]);
  if (state.userId === userId) set({ owned: new Set(owned), favorites: profile?.favorites ?? [] });
}

export type FavoriteResult = "ok" | "limit" | "failed";

/** Marca ou desmarca a favorita; o servidor recusa a quarta com 409. */
export async function toggleFavorite(id: string): Promise<FavoriteResult> {
  const was = state.favorites.includes(id);
  const before = state.favorites;
  set({ favorites: was ? before.filter((x) => x !== id) : [id, ...before] });
  try {
    const res = await fetch(favoritePath(id), { method: was ? "DELETE" : "PUT" });
    if (res.status === 409) { set({ favorites: before }); return "limit"; }
    if (!res.ok) throw new Error(String(res.status));
    set({ favorites: ((await res.json()) as { favorites: string[] }).favorites });
    return "ok";
  } catch {
    set({ favorites: before });
    return "failed";
  }
}

export const addOwned = (id: string) => set({ owned: new Set(state.owned).add(id) });

export function useMyCards() {
  const { me } = useData();
  const userId = me?.id ?? null;
  useEffect(() => {
    if (state.userId === userId) return;
    set({ userId, owned: null, favorites: [] });
    if (userId) void load(userId);
  }, [userId]);
  const s = useSyncExternalStore(subscribe, () => state);
  return s.userId === userId ? s : { userId, owned: null, favorites: [] };
}
