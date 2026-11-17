import type { PoolCard } from "./config";
import type { Player } from "../types";
import { DECK_SIZE } from "./engine";

/** Chave do deck salvo no navegador: lista de ids das versões escolhidas. */
export const DECK_KEY = "cardslock-deck";

/** Deck a partir de ids salvos: só versões que ainda existem, uma por jogador, no máximo DECK_SIZE. */
export function resolveDeck(ids: unknown, versions: Map<string, PoolCard[]>): PoolCard[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map([...versions.values()].flat().map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: PoolCard[] = [];
  for (const id of ids) {
    const c = typeof id === "string" ? byId.get(id) : undefined;
    if (!c || seen.has(c.key) || out.length >= DECK_SIZE) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

/** Completa o deck com jogadores aleatórios (na versão principal) que ainda não estão nele. */
export function fillDeck(deck: PoolCard[], versions: Map<string, PoolCard[]>, rnd: () => number = Math.random): PoolCard[] {
  const used = new Set(deck.map((c) => c.key));
  const rest = [...versions.values()].map((l) => l[0]).filter((c) => !used.has(c.key));
  const out = [...deck];
  while (out.length < DECK_SIZE && rest.length) out.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  return out;
}

export function loadDeck(versions: Map<string, PoolCard[]>): PoolCard[] {
  try {
    return resolveDeck(JSON.parse(localStorage.getItem(DECK_KEY) ?? "null"), versions);
  } catch {
    return [];
  }
}

export function saveDeck(deck: PoolCard[]) {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(deck.map((c) => c.id)));
  } catch {
    /* sem storage: o deck vale só nesta visita */
  }
}

/** Jogador a desenhar na carta de uma versão: a versão de afinidade usa o herói dela (e a arte do herói, não a arte própria da carta). */
export function versionPlayer(byId: Map<string, Player>, c: { id?: string; hero: string | null }): Player | null {
  if (!c.id) return null;
  const p = byId.get(c.id);
  if (p) return p;
  const base = byId.get(c.id.split("~")[0]);
  return base && c.hero ? { ...base, hero: c.hero, art: undefined } : null;
}
