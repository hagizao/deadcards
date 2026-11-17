import type { PoolCard } from "./config";
import type { Player } from "../types";
import { DECK_SIZE } from "./engine";

/** Chave antiga: um deck só, como lista de ids. Lida uma vez e migrada para a coleção de baralhos. */
export const DECK_KEY = "cardslock-deck";
/** Coleção de baralhos salvos no navegador. */
export const DECKS_KEY = "cardslock-decks";
export const MAX_DECKS = 12;
export const DECK_NAME_MAX = 24;

/** Versos do baralho (desenhados em cards.css). */
export const DECK_LOOKS = ["noir", "deco", "sepia", "amber", "sapphire"] as const;
export type DeckLook = (typeof DECK_LOOKS)[number];
const isLook = (x: unknown): x is DeckLook => DECK_LOOKS.includes(x as DeckLook);

/** Baralho salvo: ids das versões escolhidas, a carta de capa e o verso. */
export type SavedDeck = { id: string; name: string; cards: string[]; cover?: string; look?: DeckLook };
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
    return [{ id, name: nm, cards, ...(typeof d.cover === "string" && cards.includes(d.cover) ? { cover: d.cover } : {}), ...(isLook(d.look) ? { look: d.look } : {}) }];
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

/** Deck a partir de ids salvos: só versões que ainda existem, uma por jogador, sem herói repetido, no máximo DECK_SIZE. */
export function resolveDeck(ids: unknown, versions: Map<string, PoolCard[]>): PoolCard[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map([...versions.values()].flat().map((c) => [c.id, c]));
  const seen = new Set<string>();
  const heroes = new Set<string>();
  const out: PoolCard[] = [];
  for (const id of ids) {
    const c = typeof id === "string" ? byId.get(id) : undefined;
    if (!c || seen.has(c.key) || heroes.has(c.hero) || out.length >= DECK_SIZE) continue;
    seen.add(c.key);
    heroes.add(c.hero);
    out.push(c);
  }
  return out;
}

/** Completa o deck com jogadores aleatórios que ainda não estão nele, numa versão de herói que o deck ainda não tem (a principal, se der). */
export function fillDeck(deck: PoolCard[], versions: Map<string, PoolCard[]>, rnd: () => number = Math.random): PoolCard[] {
  const used = new Set(deck.map((c) => c.key));
  const heroes = new Set(deck.map((c) => c.hero));
  const rest = [...versions.values()].filter((l) => !used.has(l[0].key));
  const out = [...deck];
  while (out.length < DECK_SIZE && rest.length) {
    const l = rest.splice(Math.floor(rnd() * rest.length), 1)[0];
    const c = l.find((v) => !heroes.has(v.hero));
    if (!c) continue;
    heroes.add(c.hero);
    out.push(c);
  }
  return out;
}

/** O herói da versão já está no deck em outro jogador? */
export const heroTaken = (deck: PoolCard[], c: PoolCard) => deck.some((x) => x.hero === c.hero && x.key !== c.key);
/** Carta do deck (de outro jogador) que já usa o herói da versão. */
export const heroHolder = (deck: PoolCard[], c: PoolCard) => deck.find((x) => x.hero === c.hero && x.key !== c.key);

/**
 * Troca a carta que usa o herói de c por c, no mesmo lugar do deck. Se o jogador de c já estava no deck com outra versão,
 * essa versão sai (o jogador continua uma vez só).
 */
export function swapHero(deck: PoolCard[], c: PoolCard): PoolCard[] {
  const holder = heroHolder(deck, c);
  if (!holder) return deck;
  return deck.filter((x) => x.key !== c.key).map((x) => (x.key === holder.key ? c : x));
}

/** Jogador a desenhar na carta de uma versão: a versão de afinidade usa o herói dela (e a arte do herói, não a arte própria da carta). */
export function versionPlayer(byId: Map<string, Player>, c: { id?: string; hero: string | null }): Player | null {
  if (!c.id) return null;
  const p = byId.get(c.id);
  if (p) return p;
  const base = byId.get(c.id.split("~")[0]);
  return base && c.hero ? { ...base, hero: c.hero, art: undefined } : null;
}
