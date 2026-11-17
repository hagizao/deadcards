import type { PoolCard } from "./config";
import type { Player } from "../types";
import { DECK_SIZE } from "./engine";

/** Chave antiga: um deck só, como lista de ids. Lida uma vez e migrada para a coleção de baralhos. */
export const DECK_KEY = "cardslock-deck";
/** Coleção de baralhos salvos no navegador. */
export const DECKS_KEY = "cardslock-decks";
export const MAX_DECKS = 12;
export const DECK_NAME_MAX = 24;

/** Baralho salvo: ids das versões escolhidas e a carta de capa. */
export type SavedDeck = { id: string; name: string; cards: string[]; cover?: string };
export type DeckBook = { decks: SavedDeck[]; current: string };

const newId = () => Math.random().toString(36).slice(2, 10);
export const newDeck = (name: string, cards: string[] = []): SavedDeck => ({ id: newId(), name, cards });

/** Coleção de baralhos limpa: nomes curtos, ids de carta como texto, sem repetir, no máximo MAX_DECKS e sempre com um escolhido. */
export function sanitizeBook(raw: unknown, name: (n: number) => string): DeckBook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof DeckBook, unknown>>;
  const seen = new Set<string>();
  const decks = (Array.isArray(r.decks) ? r.decks : []).flatMap((x): SavedDeck[] => {
    const d = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = typeof d.id === "string" && d.id && !seen.has(d.id) ? d.id : newId();
    seen.add(id);
    const cards = Array.isArray(d.cards) ? [...new Set(d.cards.filter((c): c is string => typeof c === "string"))].slice(0, DECK_SIZE) : [];
    const nm = typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, DECK_NAME_MAX) : name(seen.size);
    return [{ id, name: nm, cards, ...(typeof d.cover === "string" && cards.includes(d.cover) ? { cover: d.cover } : {}) }];
  }).slice(0, MAX_DECKS);
  if (!decks.length) decks.push(newDeck(name(1)));
  const current = typeof r.current === "string" && decks.some((d) => d.id === r.current) ? r.current : decks[0].id;
  return { decks, current };
}

export function loadBook(name: (n: number) => string): DeckBook {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (raw) return sanitizeBook(JSON.parse(raw), name);
    // deck único da versão anterior vira o primeiro baralho
    const old = JSON.parse(localStorage.getItem(DECK_KEY) ?? "null");
    return sanitizeBook({ decks: [{ name: name(1), cards: Array.isArray(old) ? old : [] }] }, name);
  } catch {
    return sanitizeBook(null, name);
  }
}

export function saveBook(b: DeckBook) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(b));
  } catch {
    /* sem storage: os baralhos valem só nesta visita */
  }
}

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

/** Jogador a desenhar na carta de uma versão: a versão de afinidade usa o herói dela (e a arte do herói, não a arte própria da carta). */
export function versionPlayer(byId: Map<string, Player>, c: { id?: string; hero: string | null }): Player | null {
  if (!c.id) return null;
  const p = byId.get(c.id);
  if (p) return p;
  const base = byId.get(c.id.split("~")[0]);
  return base && c.hero ? { ...base, hero: c.hero, art: undefined } : null;
}
