// Regras e configuração do Cardslock Game: catálogo de habilidades e locais, carta padrão de cada jogador
// e validação da configuração que o admin salva no editor. Sem dependências do front: o worker importa este arquivo.

export const LOC_TYPES = ["none", "enter", "costLow", "costHigh", "slots", "endturn", "midboss", "urn", "loot", "zipline", "shrine", "patron", "ritual", "chaos", "shop"] as const;
export type LocType = (typeof LOC_TYPES)[number];

/** Campos que cada efeito de local usa: v = valor, n = número (custo, turno, espaços…). */
export const LOC_FIELDS: Record<LocType, ("v" | "n")[]> = {
  none: [], enter: ["v"], costLow: ["v", "n"], costHigh: ["v", "n"], slots: ["n"], endturn: ["v"], midboss: ["v", "n"],
  urn: ["v"], loot: ["v"], zipline: [], shrine: [], patron: [], ritual: [], chaos: ["n"], shop: ["v"],
};
export const LOC_N_RANGE: Partial<Record<LocType, [number, number]>> = { slots: [1, 4], costLow: [0, 8], costHigh: [0, 8], midboss: [1, 6], chaos: [1, 15] };
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
  { id: "l13", name: "Loja Secreta", type: "shop", v: 1, n: 1 },
].map((l) => ({ ...l, type: l.type as LocType, desc: "" }));

/**
 * Momento da habilidade, mostrado como selo na carta: r = ao revelar, c = constante (enquanto estiver no local),
 * f = fim do turno, x = movimento, a = reação (quando algo acontece com ela), - = nenhum.
 */
export type AbilityKind = "r" | "c" | "f" | "x" | "a" | "-";
export const ABILITY_KINDS: AbilityKind[] = ["r", "c", "f", "x", "a"];
type AbilityDef = { hero: boolean; kind: AbilityKind; v: number; pm: number; usesV: boolean };

const H = (kind: AbilityKind, v: number, pm: number, usesV = true): AbilityDef => ({ hero: true, kind, v, pm, usesV });
const G = (kind: AbilityKind, v: number, pm: number, usesV = true): AbilityDef => ({ hero: false, kind, v, pm, usesV });

/**
 * Chave = nome do herói no Deadlock (habilidade própria) ou id de uma habilidade genérica. pm = ajuste no poder padrão.
 * usesV = o texto usa o valor; sem valor, a Maestria dá poder em vez de valor. Regras completas em docs/cardslock-herois.md.
 */
export const ABILITIES = {
  "Abrams": H("r", 3, 0), "Apollo": H("a", 2, 0), "Baba": H("r", 1, -2), "Bebop": H("r", 0, 0, false),
  "Billy": H("r", 2, 0), "Calico": H("r", 1, 0), "Celeste": H("r", 2, 0), "Deadman Danny": H("r", 1, -1),
  "Drifter": H("r", 3, 0), "Dynamo": H("r", 1, -1), "Graves": H("f", 1, -1), "Grey Talon": H("r", 2, -1),
  "Haze": H("r", 0, 0, false), "Holliday": H("r", 0, -1, false), "Infernus": H("r", 2, -1), "Ivy": H("r", 2, -1),
  "Kelvin": H("r", 0, -1, false), "Lady Geist": H("r", 5, -3), "Lash": H("r", 1, -1), "McGinnis": H("r", 2, -1),
  "Mina": H("f", 1, -1), "Mirage": H("x", 2, 0), "Mo & Krill": H("c", 4, 0), "Nurse Harrow": H("c", 1, 0),
  "Paige": H("c", 1, -2), "Paradox": H("r", 0, 0, false), "Pocket": H("r", 2, -2), "Rat King": H("r", 0, 0, false),
  "Rem": H("r", 2, -1), "Seven": H("f", 1, -1), "Shiv": H("r", 3, 0), "Silver": H("a", 6, -2),
  "Sinclair": H("x", 0, 0, false), "Solomon": H("c", 5, -1), "The Doorman": H("r", 0, 0, false), "Venator": H("r", 3, 0),
  "Victor": H("c", 2, 2), "Vindicta": H("r", 3, 0), "Violet": H("f", 1, -2), "Viscous": H("r", 2, 0),
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
export type ItemOverride = { off?: boolean; v?: number };
/** Ajuste por herói: o atributo principal que define a Maestria, e o custo, o perfil e o poder base da carta. */
export type HeroOverride = { stat?: StatKey; cost?: number; prof?: Profile; base?: number };
export type GameConfig = { locs: GameLoc[]; cards: Record<string, CardOverride>; items: Record<string, ItemOverride>; heroes: Record<string, HeroOverride> };

/* ---------- atributos e Maestria ---------- */

/** Mesma ordem de src/lib/cards.ts (não importado aqui para o worker não puxar React). */
export const STAT_KEYS = ["MIR", "MAC", "SUP", "MOV", "POL", "CON"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type CardStatsBlock = Record<StatKey, number>;
export const isStat = (k: unknown): k is StatKey => typeof k === "string" && (STAT_KEYS as readonly string[]).includes(k);

/** Atributo principal padrão de cada herói (o admin pode trocar no editor). */
export const HERO_STAT: Partial<Record<AbilityKey, StatKey>> = {
  "Abrams": "CON", "Apollo": "CON", "Baba": "MAC", "Bebop": "MIR", "Billy": "CON", "Calico": "MOV", "Celeste": "MIR",
  "Deadman Danny": "MIR", "Drifter": "MIR", "Dynamo": "SUP", "Graves": "MAC", "Grey Talon": "MIR", "Haze": "MIR",
  "Holliday": "MIR", "Infernus": "CON", "Ivy": "SUP", "Kelvin": "SUP", "Lady Geist": "CON", "Lash": "MOV", "McGinnis": "MAC",
  "Mina": "MIR", "Mirage": "MOV", "Mo & Krill": "CON", "Nurse Harrow": "SUP", "Paige": "SUP", "Paradox": "MAC",
  "Pocket": "MOV", "Rat King": "MAC", "Rem": "SUP", "Seven": "CON", "Shiv": "MIR", "Silver": "CON", "Sinclair": "MAC",
  "Solomon": "MAC", "The Doorman": "MAC", "Venator": "MAC", "Victor": "CON", "Vindicta": "MIR", "Violet": "MAC",
  "Viscous": "SUP", "Vyper": "MIR", "Warden": "CON", "Wraith": "MOV", "Yamato": "CON",
};

/**
 * Perfil da carta: P = poder (carry: o OVR vira poder, 1 por faixa) ou H = habilidade (consistente/suporte: metade da faixa
 * vira poder e, com OVR a partir de HABILITY_AT, a habilidade ganha +1 no valor).
 */
export type Profile = "P" | "H";
export type HeroCard = { cost: number; prof: Profile; base: number };
const hc = (cost: number, prof: Profile, base: number): HeroCard => ({ cost, prof, base });

/**
 * Custo de cada herói (1 a 8) e o poder base. O custo vem só do herói; o jogador muda o poder pela faixa de OVR.
 * Números da proposta em docs/proposta-balanceamento.md (simulação no próprio motor).
 */
export const HERO_CARD: Partial<Record<AbilityKey, HeroCard>> = {
  "Calico": hc(1, "P", -1), "Holliday": hc(1, "P", -1), "Vyper": hc(1, "P", -2), "Venator": hc(1, "P", -1), "Violet": hc(1, "P", -2), "Graves": hc(1, "P", -2),
  "Abrams": hc(2, "P", 0), "Mina": hc(2, "P", -2), "Paige": hc(2, "H", 1), "Lash": hc(2, "P", 1), "Bebop": hc(2, "P", 1), "Rat King": hc(2, "P", 0),
  "Viscous": hc(3, "H", 2), "Kelvin": hc(3, "P", 1), "Nurse Harrow": hc(3, "H", 2), "Mirage": hc(3, "P", 1), "Seven": hc(3, "P", 0), "Dynamo": hc(3, "H", 3),
  "Billy": hc(4, "P", 3), "Celeste": hc(4, "P", 3), "Mo & Krill": hc(4, "P", 1), "Infernus": hc(4, "P", 3), "McGinnis": hc(4, "H", 4), "Warden": hc(4, "P", 3),
  "Pocket": hc(5, "P", 3), "Grey Talon": hc(5, "P", 5), "Rem": hc(5, "H", 4), "Apollo": hc(5, "P", 5), "Sinclair": hc(5, "P", 6), "The Doorman": hc(5, "P", 6),
  "Vindicta": hc(6, "P", 6), "Shiv": hc(6, "H", 7), "Ivy": hc(6, "H", 5), "Drifter": hc(6, "P", 6), "Silver": hc(6, "P", 4), "Deadman Danny": hc(6, "H", 6),
  "Wraith": hc(7, "P", 5), "Yamato": hc(7, "P", 6), "Lady Geist": hc(7, "H", 1), "Haze": hc(7, "P", 7),
  "Baba": hc(8, "P", 0), "Paradox": hc(8, "P", 7), "Victor": hc(8, "P", 8), "Solomon": hc(8, "P", 7),
};
/** Carta de herói sem habilidade própria (habilidade genérica da função). */
const GENERIC_CARD = hc(3, "P", 1);
export const PROFILES: Profile[] = ["P", "H"];
export const isProfile = (x: unknown): x is Profile => x === "P" || x === "H";

/** Faixa de OVR: sobe 1 a cada 10 pontos (até 64 = 0, 65–74 = 1, 75–84 = 2, 85–94 = 3, 95+ = 4). */
export const ovrBand = (ovr: number) => Math.max(0, Math.min(4, Math.floor(((ovr || 0) - 55) / 10)));
/** OVR a partir do qual o perfil habilidade ganha +1 no valor. */
export const HABILITY_AT = 85;

/** Custo, perfil e base de um herói, com o ajuste do admin. */
export function heroCard(hero: AbilityKey, heroes: GameConfig["heroes"] = {}): HeroCard {
  const d = (ABILITIES[hero].hero && HERO_CARD[hero]) || GENERIC_CARD;
  const o = heroes[hero] ?? {};
  return { cost: o.cost ?? d.cost, prof: o.prof ?? d.prof, base: o.base ?? d.base };
}

/** Teto de remoção: zerar, transformar, destruir ou trocar poder só pega alvos com até CAP_PER_COST × o custo da carta. */
export const CAP_PER_COST = 2;
/** Mina drena nos N turnos a partir do que revela; Violet ganha no máximo VIOLET_MAX; o portal do Doorman leva DOOR_MAX cartas. */
export const MINA_TURNS = 3;
export const VIOLET_MAX = 4;
export const DOOR_MAX = 2;

/** Heróis com habilidade própria (os 44 do catálogo). */
export const HERO_KEYS = ABILITY_KEYS.filter((k) => ABILITIES[k].hero);

/** Atributo principal do herói, com o ajuste do admin. Herói sem cadastro usa o maior atributo do jogador. */
export function heroStat(hero: string, heroes: GameConfig["heroes"], stats?: CardStatsBlock): StatKey {
  const o = heroes[hero]?.stat;
  if (o) return o;
  const d = isAbility(hero) ? HERO_STAT[hero] : undefined;
  if (d) return d;
  return stats ? STAT_KEYS.reduce((a, k) => ((stats[k] ?? 0) > (stats[a] ?? 0) ? k : a), STAT_KEYS[0] as StatKey) : "MIR";
}

/** Nível de Maestria: 0 Aprendiz, 1 Profissional, 2 Mestre. */
export type Mastery = 0 | 1 | 2;
export const MASTERY_AT = [82, 90] as const;
export const mastery = (v: number): Mastery => (v >= MASTERY_AT[1] ? 2 : v >= MASTERY_AT[0] ? 1 : 0);
/** Bônus de Profissional e Mestre: +1 no valor da habilidade (ou +1 de poder, se ela não tem valor). */
export const MASTERY_BONUS = 1;

/* ---------- itens da loja ---------- */

/** Turno em que cada lado escolhe 1 de 3 itens, e turno em que os itens são revelados e pagos. */
export const ITEM_OFFER_TURN = 5;
export const ITEM_REVEAL_TURN = 6;
export const ITEM_TIERS = [1, 2, 3, 4] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];
export type ItemSlot = "weapon" | "vitality" | "spirit";
/** Custo em almas no turno da revelação: tier 1..4 = 1..4 almas (800/1600/3200/6400 no jogo). */
export const itemCost = (tier: ItemTier) => tier;
type ItemDef = { tier: ItemTier; slot: ItemSlot; v: number; usesV: boolean };
const I = (tier: ItemTier, slot: ItemSlot, v: number, usesV = true): ItemDef => ({ tier, slot, v, usesV });

/** Chave = nome do item no Deadlock (inglês, igual à API), com o tier real do jogo. 2 de cada categoria por tier. */
export const ITEMS = {
  "High-Velocity Rounds": I(1, "weapon", 3), "Close Quarters": I(1, "weapon", 3),
  "Extra Health": I(1, "vitality", 1), "Healing Rite": I(1, "vitality", 2),
  "Extra Spirit": I(1, "spirit", 1), "Golden Goose Egg": I(1, "spirit", 1),
  "Swift Striker": I(2, "weapon", 3), "Long Range": I(2, "weapon", 7),
  "Battle Vest": I(2, "vitality", 5), "Healing Booster": I(2, "vitality", 4),
  "Arcane Surge": I(2, "spirit", 10), "Slowing Hex": I(2, "spirit", 10),
  "Toxic Bullets": I(3, "weapon", 2), "Sharpshooter": I(3, "weapon", 10),
  "Metal Skin": I(3, "vitality", 3), "Rescue Beam": I(3, "vitality", 8),
  "Surge of Power": I(3, "spirit", 5), "Superior Cooldown": I(3, "spirit", 3),
  "Glass Cannon": I(4, "weapon", 10), "Ricochet": I(4, "weapon", 10),
  "Colossus": I(4, "vitality", 10), "Unstoppable": I(4, "vitality", 8),
  "Echo Shard": I(4, "spirit", 10), "Refresher": I(4, "spirit", 5),
} satisfies Record<string, ItemDef>;
export type ItemKey = keyof typeof ITEMS;
export const ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];
export const isItem = (k: unknown): k is ItemKey => typeof k === "string" && Object.hasOwn(ITEMS, k);
export const ITEM_V_RANGE: [number, number] = [0, 10];

/** Item como fica na partida: ligado/desligado e valor, com os ajustes do admin. */
export function itemStats(k: ItemKey, items: GameConfig["items"]): { on: boolean; v: number } {
  const o = items[k] ?? {};
  return { on: !o.off, v: o.v ?? ITEMS[k].v };
}

/** Ícone de cada item, vindo da API do Deadlock (só os da loja, tier 1 a 4). */
export type ItemIcon = { name: string; tier: number; slot: string; image: string };
export function trimItemIcons(raw: unknown): ItemIcon[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x: Record<string, unknown>) => {
    const tier = Number(x?.item_tier);
    const image = (x?.shop_image_webp ?? x?.image_webp) as unknown;
    if (x?.type !== "upgrade" || !x.shopable || !(tier >= 1 && tier <= 4) || typeof x.name !== "string" || typeof image !== "string") return [];
    return [{ name: x.name, tier, slot: String(x.item_slot_type ?? ""), image }];
  });
}

export const COST_RANGE: [number, number] = [0, 8];
export const BASE_RANGE: [number, number] = [-5, 20];
export const POWER_RANGE: [number, number] = [0, 30];
export const ABILITY_V_RANGE: [number, number] = [0, 10];
export const NAME_MAX = 24;
export const DESC_MAX = 160;
export const MIN_LOCS = 3;
const MAX_LOCS = 40;
const MAX_CARDS = 2000;

export type PoolCard = { id: string; name: string; position: string; hero: string; c1: string; c2: string; ovr: number; stats?: CardStatsBlock };

/** Custo, poder e habilidade padrão de uma carta: o custo vem do herói, o poder do herói mais a faixa de OVR do jogador. */
export function defaultCard(p: PoolCard, heroes: GameConfig["heroes"] = {}): { cost: number; power: number; ab: AbilityKey; v: number } {
  const ab: AbilityKey = isAbility(p.hero) ? p.hero : ROLE_ABILITY[p.position] ?? "draw";
  const h = heroCard(ab, heroes);
  const band = ovrBand(p.ovr);
  const power = Math.max(1, h.base + (h.prof === "P" ? band : Math.floor(band / 2)));
  const a = ABILITIES[ab];
  const v = a.v + (h.prof === "H" && a.usesV && p.ovr >= HABILITY_AT ? 1 : 0);
  return { cost: h.cost, power, ab, v };
}

export type CardStats = { cost: number; power: number; ab: AbilityKey; v: number; desc: string; def: ReturnType<typeof defaultCard> };

/** Carta final: padrão + ajustes do admin. `desc` vazio = usar o texto automático da habilidade. */
export function cardStats(p: PoolCard, cards: GameConfig["cards"], heroes: GameConfig["heroes"] = {}): CardStats {
  const o = cards[p.id] ?? {};
  const def = defaultCard(p, heroes);
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

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Ajustes dos heróis: só heróis do catálogo e atributos conhecidos. */
function sanitizeHeroes(raw: unknown): GameConfig["heroes"] {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).flatMap(([k, o]) => {
    if (!isAbility(k) || !ABILITIES[k].hero || !isRecord(o)) return [];
    const r: HeroOverride = {};
    if (isStat(o.stat)) r.stat = o.stat;
    if (o.cost !== undefined) r.cost = clampInt(o.cost, [1, COST_RANGE[1]], 1);
    if (o.base !== undefined) r.base = clampInt(o.base, BASE_RANGE, 0);
    if (isProfile(o.prof)) r.prof = o.prof;
    return Object.keys(r).length ? [[k, r]] : [];
  }));
}

/** Ajustes dos itens: só chaves conhecidas; itens desconhecidos são ignorados. */
function sanitizeItems(raw: unknown): GameConfig["items"] {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).flatMap(([k, o]) => {
    if (!isItem(k) || !isRecord(o)) return [];
    const r: ItemOverride = {};
    if (o.off === true) r.off = true;
    if (o.v !== undefined) r.v = clampInt(o.v, ITEM_V_RANGE, ITEMS[k].v);
    return Object.keys(r).length ? [[k, r]] : [];
  }));
}

/** Valida a configuração salva pelo admin. Devolve null se o formato estiver errado. */
export function sanitizeGameConfig(raw: unknown): GameConfig | null {
  if (!isRecord(raw)) return null;
  const g = raw;
  if (!Array.isArray(g.locs) || g.locs.length < MIN_LOCS || g.locs.length > MAX_LOCS) return null;
  const cards = g.cards === undefined ? {} : g.cards;
  if (!isRecord(cards)) return null;
  if (g.items !== undefined && !isRecord(g.items)) return null;
  if (g.heroes !== undefined && !isRecord(g.heroes)) return null;
  const entries = Object.entries(cards);
  if (entries.length > MAX_CARDS || entries.some(([id]) => !ID_RE.test(id))) return null;
  return {
    locs: g.locs.map(sanitizeLoc),
    cards: Object.fromEntries(entries.map(([id, o]) => [id, sanitizeOverride(o)] as const).filter(([, o]) => Object.keys(o).length)),
    items: sanitizeItems(g.items),
    heroes: sanitizeHeroes(g.heroes),
  };
}

/** Configuração em uso: a salva, ou os locais padrão. */
export function gameConfig(saved: unknown): GameConfig {
  const g = (isRecord(saved) ? saved : {}) as Partial<GameConfig>;
  const locs = Array.isArray(g.locs) && g.locs.length >= MIN_LOCS ? g.locs.map(sanitizeLoc) : DEFAULT_LOCS.map((l) => ({ ...l }));
  const clean = sanitizeGameConfig({ locs, cards: isRecord(g.cards) ? g.cards : {}, items: isRecord(g.items) ? g.items : {}, heroes: isRecord(g.heroes) ? g.heroes : {} });
  return { locs, cards: clean?.cards ?? {}, items: clean?.items ?? {}, heroes: clean?.heroes ?? {} };
}
