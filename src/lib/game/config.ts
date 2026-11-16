// Regras e configuração do Cardslock Game: catálogo de habilidades e locais, carta padrão de cada jogador
// e validação da configuração que o admin salva no editor. Sem dependências do front: o worker importa este arquivo.

export const LOC_TYPES = ["none", "enter", "costLow", "costHigh", "slots", "endturn", "midboss", "urn", "loot", "zipline", "shrine", "patron", "ritual", "chaos"] as const;
export type LocType = (typeof LOC_TYPES)[number];

/** Campos que cada efeito de local usa: v = valor, n = número (custo, turno, espaços…). */
export const LOC_FIELDS: Record<LocType, ("v" | "n")[]> = {
  none: [], enter: ["v"], costLow: ["v", "n"], costHigh: ["v", "n"], slots: ["n"], endturn: ["v"], midboss: ["v", "n"],
  urn: ["v"], loot: ["v"], zipline: [], shrine: [], patron: [], ritual: [], chaos: ["n"],
};
export const LOC_N_RANGE: Partial<Record<LocType, [number, number]>> = { slots: [1, 4], costLow: [0, 6], costHigh: [0, 6], midboss: [1, 6], chaos: [1, 15] };
export const LOC_V_RANGE: [number, number] = [-10, 10];
export const nRange = (t: LocType): [number, number] => LOC_N_RANGE[t] ?? [1, 6];

export type GameLoc = { id: string; name: string; type: LocType; v: number; n: number; desc: string };

export const DEFAULT_LOCS: GameLoc[] = [
  { id: "l1", name: "Guardião", type: "costLow", v: 2, n: 2 },
  { id: "l2", name: "Walker", type: "costHigh", v: 3, n: 5 },
  { id: "l3", name: "Chefe do Meio", type: "midboss", v: 1, n: 4 },
  { id: "l4", name: "Urna de Almas", type: "urn", v: 1, n: 1 },
  { id: "l5", name: "Sacrifício do Pecador", type: "loot", v: 1, n: 1 },
  { id: "l6", name: "Tirolesa", type: "zipline", v: 0, n: 1 },
  { id: "l7", name: "Santuário", type: "shrine", v: 0, n: 1 },
  { id: "l8", name: "Patrono", type: "patron", v: 0, n: 1 },
  { id: "l9", name: "Círculo do Ritual", type: "ritual", v: 0, n: 1 },
  { id: "l10", name: "Maelstrom", type: "chaos", v: 0, n: 8 },
  { id: "l11", name: "Estação de Metrô", type: "slots", v: 0, n: 3 },
  { id: "l12", name: "Loja de Curiosidades", type: "enter", v: 1, n: 1 },
].map((l) => ({ ...l, type: l.type as LocType, desc: "" }));

/** Momento da habilidade: r = ao revelar, c = contínuo, f = fim do turno, x = especial, - = nenhum. */
export type AbilityKind = "r" | "c" | "f" | "x" | "-";
type AbilityDef = { hero: boolean; kind: AbilityKind; v: number; pm: number; usesV: boolean };

const H = (kind: AbilityKind, v: number, pm: number, usesV = true): AbilityDef => ({ hero: true, kind, v, pm, usesV });
const G = (kind: AbilityKind, v: number, pm: number, usesV = true): AbilityDef => ({ hero: false, kind, v, pm, usesV });

/** Chave = nome do herói no Deadlock (habilidade própria) ou id de uma habilidade genérica. pm = ajuste no poder padrão. */
export const ABILITIES = {
  "Abrams": H("r", 3, 0), "Apollo": H("c", 2, 0), "Baba": H("r", 1, -2), "Bebop": H("r", 0, 0, false),
  "Billy": H("r", 1, 0), "Calico": H("r", 2, 0), "Celeste": H("r", 2, 0), "Deadman Danny": H("r", 1, -2),
  "Drifter": H("r", 3, 0), "Dynamo": H("r", 1, -1), "Graves": H("f", 1, -2), "Grey Talon": H("r", 3, -1),
  "Haze": H("r", 1, -2), "Holliday": H("r", 3, -1), "Infernus": H("r", 1, -2), "Ivy": H("r", 2, -1),
  "Kelvin": H("r", 1, -1), "Lady Geist": H("r", 0, -3, false), "Lash": H("r", 1, -1), "McGinnis": H("r", 2, -1),
  "Mina": H("f", 1, -1), "Mirage": H("f", 2, 0), "Mo & Krill": H("c", 4, 0), "Nurse Harrow": H("r", 2, 0),
  "Paige": H("r", 1, -3), "Paradox": H("r", 0, 0, false), "Pocket": H("r", 1, -3), "Rat King": H("r", 1, -1),
  "Rem": H("r", 2, -1), "Seven": H("f", 1, -2), "Shiv": H("r", 3, 0), "Silver": H("f", 4, -1),
  "Sinclair": H("r", 0, 0, false), "Solomon": H("c", 5, -1), "The Doorman": H("r", 1, -1), "Venator": H("r", 3, 0),
  "Victor": H("x", 2, 1), "Vindicta": H("r", 3, 0), "Violet": H("f", 1, -2), "Viscous": H("r", 2, 0),
  "Vyper": H("r", 0, 0, false), "Warden": H("c", 1, -1), "Wraith": H("r", 0, -1, false), "Yamato": H("r", 4, 0),
  self: G("r", 2, 0), hit: G("r", 2, 0), aura: G("c", 1, 0), team: G("r", 1, 0), draw: G("r", 1, 0), none: G("-", 0, 2, false),
} satisfies Record<string, AbilityDef>;
export type AbilityKey = keyof typeof ABILITIES;
export const ABILITY_KEYS = Object.keys(ABILITIES) as AbilityKey[];
export const isAbility = (k: unknown): k is AbilityKey => typeof k === "string" && Object.hasOwn(ABILITIES, k);
export const ability = (k: AbilityKey): AbilityDef => ABILITIES[k];

/** Habilidade genérica de cada função quando o herói não tem habilidade própria. */
export const ROLE_ABILITY: Record<string, AbilityKey> = { Carry: "self", OffCarry: "hit", Frontline: "aura", Suporte: "team", Flex: "draw" };

export type CardOverride = { ab?: AbilityKey; cost?: number; power?: number; v?: number; desc?: string };
export type GameConfig = { locs: GameLoc[]; cards: Record<string, CardOverride> };

export const COST_RANGE: [number, number] = [0, 6];
export const POWER_RANGE: [number, number] = [0, 30];
export const ABILITY_V_RANGE: [number, number] = [0, 10];
export const NAME_MAX = 24;
export const DESC_MAX = 160;
export const MIN_LOCS = 3;
const MAX_LOCS = 40;
const MAX_CARDS = 2000;

export type PoolCard = { id: string; name: string; position: string; hero: string; c1: string; c2: string; ovr: number };

const nameHash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

/** Custo, poder e habilidade padrão de uma carta, derivados do OVR, da função e do herói. */
export function defaultCard(p: PoolCard): { cost: number; power: number; ab: AbilityKey; v: number } {
  const cost = Math.max(1, Math.min(6, Math.round((p.ovr - 62) / 6)));
  const ab: AbilityKey = isAbility(p.hero) ? p.hero : ROLE_ABILITY[p.position] ?? "draw";
  const power = Math.max(1, cost + 1 + Math.floor(cost * 0.8) + ((Math.abs(nameHash(p.name)) % 3) - 1) + ABILITIES[ab].pm);
  return { cost, power, ab, v: ABILITIES[ab].v };
}

export type CardStats = { cost: number; power: number; ab: AbilityKey; v: number; desc: string; def: ReturnType<typeof defaultCard> };

/** Carta final: padrão + ajustes do admin. `desc` vazio = usar o texto automático da habilidade. */
export function cardStats(p: PoolCard, cards: GameConfig["cards"]): CardStats {
  const o = cards[p.id] ?? {};
  const def = defaultCard(p);
  const ab = o.ab && isAbility(o.ab) ? o.ab : def.ab;
  return { cost: o.cost ?? def.cost, power: o.power ?? def.power, ab, v: o.v ?? (ab === def.ab ? def.v : ABILITIES[ab].v), desc: (o.desc ?? "").trim(), def };
}

const clampInt = (x: unknown, [a, b]: [number, number], fallback: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : fallback;
};
const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const ID_RE = /^[\w-]{1,64}$/;

export function sanitizeLoc(raw: unknown, i = 0): GameLoc {
  const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // tipos antigos: "heavy" virou custo alto com valor negativo, "light" virou custo baixo
  let type = l.type === "heavy" ? "costHigh" : l.type === "light" ? "costLow" : l.type;
  if (!LOC_TYPES.includes(type as LocType)) type = "none";
  const t = type as LocType;
  const v = l.type === "heavy" ? -Math.abs(Number(l.v) || 0) : l.v;
  return {
    id: typeof l.id === "string" && ID_RE.test(l.id) ? l.id : `l${i + 1}`,
    name: text(l.name, NAME_MAX) || "Local",
    type: t,
    v: clampInt(v, LOC_V_RANGE, 0),
    n: clampInt(l.n, nRange(t), nRange(t)[0] || 1),
    desc: text(l.desc, DESC_MAX),
  };
}

export function sanitizeOverride(raw: unknown): CardOverride {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const r: CardOverride = {};
  if (isAbility(o.ab)) r.ab = o.ab;
  if (o.cost !== undefined) r.cost = clampInt(o.cost, COST_RANGE, 0);
  if (o.power !== undefined) r.power = clampInt(o.power, POWER_RANGE, 0);
  if (o.v !== undefined) r.v = clampInt(o.v, ABILITY_V_RANGE, 0);
  const desc = text(o.desc, DESC_MAX);
  if (desc) r.desc = desc;
  return r;
}

/** Valida a configuração salva pelo admin. Devolve null se o formato estiver errado. */
export function sanitizeGameConfig(raw: unknown): GameConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!Array.isArray(g.locs) || g.locs.length < MIN_LOCS || g.locs.length > MAX_LOCS) return null;
  const cards = g.cards === undefined ? {} : g.cards;
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) return null;
  const entries = Object.entries(cards as Record<string, unknown>);
  if (entries.length > MAX_CARDS || entries.some(([id]) => !ID_RE.test(id))) return null;
  return {
    locs: g.locs.map(sanitizeLoc),
    cards: Object.fromEntries(entries.map(([id, o]) => [id, sanitizeOverride(o)] as const).filter(([, o]) => Object.keys(o).length)),
  };
}

/** Configuração em uso: a salva, ou os locais padrão. */
export function gameConfig(saved: unknown): GameConfig {
  const g = (saved && typeof saved === "object" ? saved : {}) as Partial<GameConfig>;
  const locs = Array.isArray(g.locs) && g.locs.length >= MIN_LOCS ? g.locs.map(sanitizeLoc) : DEFAULT_LOCS.map((l) => ({ ...l }));
  return { locs, cards: sanitizeGameConfig({ locs, cards: g.cards ?? {} })?.cards ?? {} };
}
