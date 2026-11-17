// Motor do Cardslock Game: estado da partida, efeitos das habilidades e dos locais, e a IA.
// Sem React e sem texto: o log guarda chaves e parâmetros, traduzidos na tela. Regras em docs/cardslock-herois.md.
import { getPlayerOvr } from "../cards";
import type { Player } from "../types";
import {
  ABILITIES, ITEMS, ITEM_KEYS, SHOPS, MASTERY_BONUS, PRO_ON_POWER, phaseOf, CAP_PER_COST, DOOR_MAX, MINA_TURNS, VIOLET_MAX, ROLE_ABILITY, cardStats, heroStat, itemCost, itemStats, mastery,
  sanitizeHeroPool, type AbilityKey, type CardStatsBlock, type GameConfig, type GameLoc, type ItemKey, type ItemTier, type LocType, type Mastery, type PoolCard, type StatKey,
} from "./config";

export type Side = "p" | "a";
export const opp = (s: Side): Side => (s === "p" ? "a" : "p");

export const TURNS = 8;
export const HAND_MAX = 7;
export const DECK_SIZE = 12;
const START_HAND = 3;
const LOC_COUNT = 3;
export const MIN_POOL = DECK_SIZE;
/** Pool de heróis a partir deste valor: nunca perde a habilidade num duelo de espelho. */
const DUEL_SAFE_POL = 90;
const RAT_GROW_MAX = 3;

export type Token = "pigeon" | "ghoul" | "turret" | "rat" | "illusion";
export type CardFace = { id?: string; name: string; hero: string | null; c1: string; c2: string; token?: Token; role?: string };
/** Nome para o log: texto do jogador ou ficha (traduzida na tela). */
export type Name = string | { token: Token };

type Status = {
  tmp: { v: number; u: number }[];
  burrow?: boolean; stun?: number; immune?: boolean; immU?: number; rip?: number; ripV?: number; chained?: boolean; silenced?: boolean; silU?: number;
  burn?: number; tburn?: { v: number; u: number }[]; vuln?: number; sleep?: number; root?: number; petri?: boolean; unstop?: boolean;
  chan?: { u: number }; drainU?: number; grown?: number; cd?: boolean; wolf?: boolean; wolfAt?: number; exec?: { u: number; target?: number }; duel?: boolean; mvT?: number; grow?: number;
};

/** Movimento disponível: quantas vezes, até que turno, bônus ao chegar, ilusão deixada para trás e destino só com inimigas. */
export type MoveCharge = { n: number; u: number; bonus: number; copy?: "half" | "full"; foes?: boolean };

export type GCard = {
  id: number; p: CardFace; cost: number; base: number; ab: AbilityKey; v: number; desc: string;
  bonus: number; side: Side; rev: boolean; staged: boolean; st: Status; tok?: boolean;
  /** Atributos do jogador, atributo principal do herói, nível de Maestria (0 a 2) e palavras-chave. */
  stats?: CardStatsBlock; main: StatKey | null; lvl: Mastery;
  /** Maestria máxima pelo atributo; a fase da partida libera um nível por vez (Profissional no mid, Mestre no late). */
  top: Mastery;
  /** Escolha feita ao jogar a carta: id da carta alvo e/ou índice do local. */
  ch?: { card?: number; loc?: number };
  mv: MoveCharge[];
};

export type Loc = {
  L: GameLoc; rev: boolean; s: Record<Side, GCard[]>; lock: Record<Side, number>; trap: Record<Side, number>;
  /** Kelvin: até que turno cada lado não sofre dano aqui. Vyper: petrificação armada contra cada lado. */
  shield: Record<Side, number>; petri: Record<Side, { m: boolean } | null>;
  /** Quem vence o local e há quantos rounds seguidos (recompensa por virar um local segurado). */
  hold: { side: Side | null; n: number };
};

/** Item comprado: o que é, em quem (id da carta) e no round em que foi aplicado. */
export type Bought = { k: ItemKey; target: number; t: number; name?: Name };
/** Rounds seguidos segurando um local para que virá-lo dê a recompensa. */
export const BOUNTY_AT = 2;

/** Passo da revelação: revelar uma carta, ou executar a marca do Shiv. */
export type Act = { c: GCard; l: Loc; exec?: boolean };
/** O que a carta pede ao ser jogada: alvo inimigo (daqui ou de qualquer local) e/ou um local. */
export type ChoiceSpec = { card?: "here" | "any"; loc?: boolean };

export type LogEntry = { k: LogKey; c?: Name; t?: Name; a?: Name; loc?: string; v?: number; n?: number; ab?: AbilityKey; side?: Side; item?: ItemKey };
export type LogKey =
  | "riposte" | "push" | "wall" | "pigeon" | "hook" | "chain" | "calico" | "celeste" | "danny" | "drifter" | "dynamo" | "owl" | "owlBonus"
  | "haze" | "dance" | "holliday" | "infernus" | "ivy" | "kelvin" | "geist" | "lash" | "turret" | "move" | "burrow" | "harrow" | "paige"
  | "paradox" | "pocket" | "rats" | "rem" | "storm" | "shiv" | "mark" | "wolf" | "illusion" | "portal" | "trap" | "vindicta" | "fall"
  | "cube" | "petrify" | "wraith" | "liftEnd" | "yamato" | "chanEnd" | "extraSouls" | "hookPull" | "trapHit" | "urn" | "boss" | "zipline"
  | "item" | "itemLost" | "shop" | "prio" | "phase" | "comeback" | "bounty" | "duel" | "duelTie" | "mentor" | "lastStand" | "emerge" | "graves";

export type Result = { outcome: "win" | "loss" | "draw"; won: number; lost: number; myPower: number; aiPower: number; patron: boolean };
export type PlayError = "souls" | "frozen" | "full";

/** Cartas que entram no baralho: jogadores ativos, uma por jogador (variantes ficam de fora). */
const toPool = (p: Player, key: string): PoolCard => ({
  id: p.id, key, name: p.name, position: ROLE_ABILITY[p.position] ? p.position : "Flex", hero: p.hero, c1: p.c1 || "#334155", c2: p.c2 || "#0f172a", ovr: getPlayerOvr(p) || 0, stats: p.stats,
});

/**
 * Todas as versões jogáveis de cada jogador ativo: a carta principal, as variantes já cadastradas e uma versão por herói de afinidade
 * (que ainda não tenha variante). A principal vem primeiro.
 */
export function cardVersions(players: Player[]): Map<string, PoolCard[]> {
  const out = new Map<string, PoolCard[]>();
  const active = players.filter((p) => !p.inactive);
  for (const p of [...active].sort((a, b) => Number(!!a.variantOf) - Number(!!b.variantOf))) {
    const key = p.variantOf || p.id;
    const list = out.get(key) ?? [];
    if (!list.some((c) => c.hero === p.hero)) list.push(toPool(p, key));
    out.set(key, list);
  }
  for (const p of active) {
    const list = out.get(p.id);
    if (p.variantOf || !list) continue;
    for (const hero of sanitizeHeroPool(p.heroPool, p.hero)) {
      if (!list.some((c) => c.hero === hero)) list.push({ ...list[0], id: `${p.id}~${hero}`, hero, alt: true });
    }
  }
  return out;
}

/** Uma carta por jogador (a versão principal). */
export function cardPool(players: Player[]): PoolCard[] {
  return [...cardVersions(players).values()].map((l) => l[0]);
}

const avgOvr = (d: PoolCard[]) => d.reduce((a, c) => a + c.ovr, 0) / Math.max(1, d.length);
/** Diferença de OVR médio que o deck da IA aceita em relação ao seu. */
export const AI_OVR_GAP = 1;

/**
 * Deck da IA espelhando o seu: para cada carta sua, uma do pool com o mesmo custo e OVR parecido (a IA pode repetir jogadores seus).
 * Depois troca cartas de mesmo custo até o OVR médio ficar a no máximo AI_OVR_GAP do seu.
 */
export function aiDeck(pool: PoolCard[], mine: PoolCard[], cfg: GameConfig, rnd: () => number = Math.random): PoolCard[] {
  const cost = new Map(pool.map((p) => [p.id, cardStats(p, cfg.cards, cfg.heroes).cost]));
  const costOf = (p: PoolCard) => cost.get(p.id) ?? cardStats(p, cfg.cards, cfg.heroes).cost;
  const free = [...pool];
  const out: PoolCard[] = [];
  for (const m of mine) {
    if (!free.length) break;
    const c = costOf(m);
    const score = (p: PoolCard) => Math.abs(costOf(p) - c) * 20 + Math.abs(p.ovr - m.ovr) + rnd() * 4;
    let best = 0;
    for (let i = 1; i < free.length; i++) if (score(free[i]) < score(free[best])) best = i;
    out.push(free.splice(best, 1)[0]);
  }
  const goal = avgOvr(mine);
  for (let n = 0; n < 40 && Math.abs(avgOvr(out) - goal) > AI_OVR_GAP; n++) {
    const high = avgOvr(out) > goal;
    let swap: [number, number, number] | null = null;
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < free.length; j++) {
        const d = free[j].ovr - out[i].ovr;
        if ((high ? d >= 0 : d <= 0) || costOf(free[j]) !== costOf(out[i])) continue;
        const gap = Math.abs(avgOvr(out) + d / out.length - goal);
        if (!swap || gap < swap[2]) swap = [i, j, gap];
      }
    }
    if (!swap) break;
    const [i, j] = swap;
    [out[i], free[j]] = [free[j], out[i]];
  }
  return out;
}

const nst = (): Status => ({ tmp: [] });

const isGun = (c: GCard) => c.p.role === "Carry" || c.p.role === "OffCarry";
const isFront = (c: GCard) => c.p.role === "Frontline";
const SUPPORT = new Set<AbilityKey>(["Ivy", "Kelvin", "Nurse Harrow", "Paige", "Viscous", "Dynamo", "Rem", "team", "aura"]);
const onReveal = (c: GCard) => ABILITIES[c.ab].kind === "r";

/** Com o que cada item combina: cartas (função, habilidade, custo) e tipo de local. Usado pela IA e pela tela do draft. */
const ITEM_FIT: Partial<Record<ItemKey, { card?: (c: GCard) => boolean; loc?: LocType }>> = {
  "High-Velocity Rounds": { card: isGun },
  "Extra Spirit": { card: (c) => ABILITIES[c.ab].hero && ABILITIES[c.ab].usesV },
  "Golden Goose Egg": { loc: "urn" },
  "Swift Striker": { card: (c) => c.cost <= 3 },
  "Battle Vest": { card: isFront },
  "Healing Booster": { card: (c) => SUPPORT.has(c.ab) },
  "Arcane Surge": { card: onReveal, loc: "ritual" },
  "Surge of Power": { card: onReveal },
  "Superior Cooldown": { card: (c) => ABILITIES[c.ab].kind === "f" },
  "Glass Cannon": { card: isGun },
  "Colossus": { card: isFront },
  "Echo Shard": { card: onReveal },
  "Refresher": { card: onReveal },
};

export type ItemFit = { cards: number; loc: string | null };

type Impl = { r?: (c: GCard, l: Loc, v: number) => void; f?: (c: GCard, l: Loc, v: number) => void };

export class Match {
  t = 0;
  /** Almas do jogador (E) e da IA (AE) neste turno. */
  E = 0;
  AE = 0;
  extra: Record<Side, number> = { p: 0, a: 0 };
  /** Gancho do Bebop armado contra cada lado: local de destino e se é de Mestre. */
  hook: Record<Side, { i: number; m: boolean } | null> = { p: null, a: null };
  pend: { t: number; f: () => void }[] = [];
  /** Portais do Doorman: no turno t, as cartas do lado podem viajar entre os locais a e b. */
  portals: { side: Side; a: number; b: number; t: number; bonus: number; n: number }[] = [];
  log: LogEntry[] = [];
  final = false;
  busy = false;
  loc: Loc[];
  deck: GCard[];
  adeck: GCard[];
  hand: GCard[] = [];
  ahand: GCard[] = [];
  result: Result | null = null;
  /** Loja aberta neste round: as 3 opções de cada lado (mesmos tiers, itens sorteados à parte). */
  offer: Record<Side, ItemKey[]> | null = null;
  /** Compra deste round, ainda não aplicada (a da IA fica escondida até o fim do turno). */
  buying: Record<Side, Bought | null> = { p: null, a: null };
  /** Itens já aplicados, em ordem. */
  owned: Record<Side, Bought[]> = { p: [], a: [] };
  /** Desconto na próxima loja para quem venceu a Loja Secreta no round anterior. */
  discount: Record<Side, number> = { p: 0, a: 0 };
  /** Quem age primeiro no turno: o Rei Oculto (você) no turno 1; depois, quem estiver ganhando a partida. */
  prio: Side = "p";
  private uid = 0;

  /** `decks.p` é o deck montado pelo jogador; sem ele, os dois decks saem aleatórios do pool. O da IA espelha o seu (ver aiDeck). */
  constructor(private cfg: GameConfig, pool: PoolCard[], private rnd: () => number = Math.random, decks: { p?: PoolCard[]; a?: PoolCard[] } = {}) {
    this.loc = this.sh(cfg.locs).slice(0, LOC_COUNT).map((L) => ({
      L, rev: false, s: { p: [], a: [] }, lock: { p: 0, a: 0 }, trap: { p: 0, a: 0 }, shield: { p: 0, a: 0 }, petri: { p: null, a: null }, hold: { side: null, n: 0 },
    }));
    const mine = decks.p?.length ? decks.p.slice(0, DECK_SIZE) : this.sh(pool).slice(0, DECK_SIZE);
    const theirs = decks.a ?? (decks.p?.length ? aiDeck(pool, mine, cfg, rnd) : this.sh(pool).slice(0, DECK_SIZE));
    this.deck = this.sh(mine).map((p) => this.mk(p, cfg, "p"));
    this.adeck = this.sh(theirs).map((p) => this.mk(p, cfg, "a"));
    for (let i = 0; i < START_HAND; i++) { this.draw("p"); this.draw("a"); }
    this.nextTurn();
  }

  /* ---------- utilitários ---------- */
  private sh<T>(a: T[]): T[] {
    return a.map((x) => [this.rnd(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  }
  private mk(p: PoolCard, cfg: GameConfig, side: Side): GCard {
    const c = cardStats(p, cfg.cards, cfg.heroes);
    const main = p.hero ? heroStat(p.hero, cfg.heroes, p.stats) : null;
    const card: GCard = {
      id: ++this.uid, p: { id: p.id, name: p.name, hero: p.hero, c1: p.c1, c2: p.c2, role: p.position }, cost: c.cost, base: c.power, ab: c.ab,
      v: Number(c.v) || 0, desc: c.desc, bonus: 0, side, rev: false, staged: false, st: nst(),
      stats: p.stats, main, lvl: 0, top: 0, mv: [],
    };
    card.top = main && p.stats ? mastery(p.stats[main] ?? 0) : 0;
    this.levelTo(card, Math.min(card.top, phaseOf(this.t)) as Mastery);
    return card;
  }
  /** Sobe a Maestria: Profissional dá +1 no valor (ou no poder, se a habilidade não usa valor); Mestre libera a frase extra. */
  private levelTo(c: GCard, to: Mastery) {
    while (c.lvl < to) {
      if (c.lvl === 0) { if (ABILITIES[c.ab].usesV && !PRO_ON_POWER.has(c.ab)) c.v += MASTERY_BONUS; else c.base += MASTERY_BONUS; }
      c.lvl = (c.lvl + 1) as Mastery;
    }
  }
  private token(side: Side, token: Token, power: number): GCard {
    return { id: ++this.uid, p: { name: "", hero: null, c1: "#44403c", c2: "#1c1917", token }, cost: 1, base: power, ab: "none", v: 0, desc: "", bonus: 0, side, rev: false, staged: false, st: nst(), tok: true, main: null, lvl: 0, top: 0, mv: [] };
  }
  private N = (c: GCard): Name => (c.p.token ? { token: c.p.token } : c.p.name);
  private say(e: LogEntry) { this.log.unshift(e); this.log.length = Math.min(this.log.length, 3); }
  private handOf = (s: Side) => (s === "p" ? this.hand : this.ahand);
  private later(f: () => void, t = this.t + 1) { this.pend.push({ t, f }); }

  locOf = (c: GCard) => this.loc.find((l) => l.s[c.side].includes(c));
  live = (l: Loc) => l.rev;
  private ty = (l: Loc | undefined, t: GameLoc["type"]) => !!l && l.rev && l.L.type === t;
  cap = (l: Loc) => (this.ty(l, "slots") ? Math.max(1, Math.min(4, l.L.n)) : 4);
  room = (l: Loc, s: Side) => l.s[s].length < this.cap(l);
  private idx = (l: Loc) => this.loc.indexOf(l);
  private all = () => this.loc.flatMap((l) => [...l.s.p, ...l.s.a]);
  private byId = (id: number | undefined) => (id === undefined ? null : this.all().find((x) => x.id === id) ?? null);
  private foes = (c: GCard, l: Loc) => l.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow);
  immune = (c: GCard) => !!c.st.immune || (c.st.immU ?? 0) >= this.t;
  /** Cartas que podem sofrer efeitos inimigos (sem imunidade nem imparáveis). */
  private tg = (a: GCard[]) => a.filter((x) => !this.immune(x) && !x.st.unstop);
  private friends = (c: GCard, l: Loc) => l.s[c.side].filter((x) => x !== c && x.rev && !x.st.burrow);
  private everywhere = (s: Side) => this.loc.flatMap((l) => l.s[s].filter((x) => x.rev && !x.st.burrow).map((x) => [x, l] as const));
  private foeCards = (c: GCard) => this.everywhere(opp(c.side)).map((x) => x[0]);
  abilityOf = (c: GCard): AbilityKey => (c.st.silenced || c.st.petri || (c.st.silU ?? 0) >= this.t ? "none" : c.ab);
  /** A carta é Mestre e está com a habilidade ativa. */
  master = (c: GCard) => c.lvl === 2 && this.abilityOf(c) === c.ab;
  private best<T>(a: T[], f: (x: T) => number): T | null {
    return a.length ? a.reduce((x, y) => (f(y) > f(x) ? y : x)) : null;
  }
  private strongest = (a: GCard[]) => this.best(this.sh(a), (x) => this.pow(x));
  private weakest = (a: GCard[]) => this.best(this.sh(a), (x) => -this.pow(x));
  /** Alvo aleatório entre as inimigas válidas. */
  private pickFoe = (a: GCard[]) => this.sh(a)[0] ?? null;
  private pickLoc = (from: Loc, s: Side) => this.sh(this.loc.filter((L) => L !== from && this.room(L, s)))[0];
  private losing = (s: Side, l: Loc) => this.total(l, s) < this.total(l, opp(s));
  /** Alvos dentro do teto de remoção da carta (poder até CAP_PER_COST × custo). */
  private capped = (src: GCard, a: GCard[]) => a.filter((x) => this.pow(x) <= CAP_PER_COST * Math.max(1, src.cost));
  private raw = (c: GCard) => c.base + c.bonus;
  /** Alvos da Nurse Harrow (constante): a inimiga mais forte e o aliado mais fraco daqui, pelo poder sem auras (evita recursão). */
  private harrow(o: GCard, l: Loc) {
    const pick = (a: GCard[], f: (x: GCard) => number) => a.reduce<GCard | null>((x, y) => (!x || f(y) > f(x) || (f(y) === f(x) && y.id < x.id) ? y : x), null);
    const foes = l.s[opp(o.side)].filter((x) => x.rev && !x.st.burrow && !this.immune(x) && !x.st.unstop);
    const mine = l.s[o.side].filter((x) => x.rev && !x.st.burrow);
    return { foe: pick(foes, this.raw), ally: pick(mine, (x) => -this.raw(x)) };
  }

  /** Poder atual da carta no local (com bônus, auras, efeitos do local e status). */
  pow(c: GCard, l?: Loc): number {
    l = l ?? this.locOf(c);
    if (!l) return c.base + c.bonus;
    if (c.st.burrow && !this.final) return 0;
    if ((c.st.stun ?? 0) >= this.t) return 0;
    let x = c.base + c.bonus;
    c.st.tmp.forEach((m) => { if (this.t <= m.u) x += m.v; });
    l.s[c.side].forEach((o) => {
      if (o === c || !o.rev) return;
      const a = this.abilityOf(o);
      if (a === "aura" || a === "Paige") x += o.v;
    });
    // Nurse Harrow: drena constante da inimiga mais forte daqui para o aliado mais fraco daqui
    [...l.s.p, ...l.s.a].forEach((o) => {
      if (!o.rev || o.st.burrow || this.abilityOf(o) !== "Nurse Harrow") return;
      const h = this.harrow(o, l);
      if (h.foe === c) x -= o.v;
      if (h.ally === c) x += o.v;
    });
    // Victor: aura contínua em todas as cartas daqui; o Mestre poupa o próprio lado
    [...l.s.p, ...l.s.a].forEach((o) => { if (o !== c && o.rev && this.abilityOf(o) === "Victor" && (o.side !== c.side || !this.master(o))) x -= o.v; });
    const a = this.abilityOf(c);
    if (a === "Warden") x += c.v * l.s[opp(c.side)].filter((o) => o.rev).length;
    if (a === "Solomon" && l.s[c.side].length >= this.cap(l) - (this.master(c) ? 1 : 0)) x += c.v;
    if (a === "Mo & Krill" && this.final) x += c.v;
    if (this.ty(l, "costLow") && c.cost <= l.L.n) x += l.L.v;
    if (this.ty(l, "costHigh") && c.cost >= l.L.n) x += l.L.v;
    return Math.max(0, x);
  }
  total = (l: Loc, s: Side) => l.s[s].filter((c) => c.rev).reduce((a, c) => a + this.pow(c, l), 0);

  /** Dano: perder poder por efeito. Respeita imunidade, Santuário, escudo do Kelvin, Riposta e vulnerabilidade. */
  private hurt(t: GCard | null | undefined, amt: number, src: GCard | null, until?: number): boolean {
    const l = t && this.locOf(t);
    if (!t || !l || amt <= 0) return false;
    if (this.immune(t) || t.st.unstop || this.ty(l, "shrine") || l.shield[t.side] >= this.t) return false;
    if ((t.st.rip ?? 0) > 0 && src && src.side !== t.side) {
      t.st.rip = (t.st.rip ?? 1) - 1;
      this.say({ k: "riposte", c: this.N(t), t: this.N(src) });
      if (this.locOf(src)) this.hurt(src, t.st.ripV ?? 2, null);
      return false;
    }
    if ((t.st.vuln ?? 0) >= this.t) { amt *= 2; t.st.vuln = 0; }
    if (until) t.st.tmp.push({ v: -amt, u: until });
    else t.bonus -= amt;
    this.interrupt(t);
    if (this.abilityOf(t) === "Silver" && !t.st.wolf && t.st.wolfAt === undefined) this.wolfIn(t);
    return true;
  }
  /** Efeito canalizado acaba se a carta sofrer dano, for movida, atordoada ou perder a habilidade. */
  private interrupt(c: GCard) {
    if (c.st.chan && !c.st.unstop) { c.st.chan = undefined; this.say({ k: "chanEnd", c: this.N(c) }); }
  }
  private silence(c: GCard) {
    if (c.st.unstop) return false;
    c.st.silenced = true;
    c.st.rip = 0;
    this.interrupt(c);
    return true;
  }
  /** Pode ser movida de `from` para `to`? `self` = a própria carta escolhendo sair (a Paige Mestre impede). */
  private movable(c: GCard, from: Loc, to: Loc, self: boolean) {
    if (from === to || !this.room(to, c.side)) return false;
    if (c.st.chained || c.st.petri || c.st.unstop || (c.st.root ?? 0) >= this.t) return false;
    if (self && from.s[opp(c.side)].some((o) => o.rev && this.abilityOf(o) === "Paige" && this.master(o))) return false;
    return true;
  }
  private move(c: GCard, from: Loc | undefined, to: Loc | undefined, self = false): boolean {
    if (!from || !to || !this.movable(c, from, to, self)) return false;
    from.s[c.side].splice(from.s[c.side].indexOf(c), 1);
    to.s[c.side].push(c);
    this.interrupt(c);
    return true;
  }
  private destroy(c: GCard): boolean {
    const l = this.locOf(c);
    if (!l || this.immune(c) || c.st.unstop) return false;
    l.s[c.side].splice(l.s[c.side].indexOf(c), 1);
    return true;
  }
  private draw(s: Side) {
    const d = s === "p" ? this.deck : this.adeck, h = this.handOf(s);
    const c = d.pop();
    if (c && h.length < HAND_MAX) h.push(c);
    else if (c) d.push(c);
  }
  private wolfIn(c: GCard) {
    c.st.wolfAt = this.t + 1;
    this.later(() => {
      const l = this.locOf(c);
      if (!l || c.st.wolf) return;
      c.st.wolf = true;
      c.bonus += c.v;
      const t = this.master(c) ? this.weakest(this.capped(c, this.tg(this.foes(c, l)))) : null;
      this.say({ k: "wolf", c: this.N(c), t: t && this.destroy(t) ? this.N(t) : undefined });
    }, c.st.wolfAt);
  }

  /* ---------- escolhas ao jogar ---------- */
  /** O que a carta pede ao ser jogada (null = nada). */
  choiceOf(c: GCard): ChoiceSpec | null {
    switch (c.ab) {
      case "Grey Talon": case "Vindicta": return { card: "any" };
      case "Haze": return { card: "here" };
      case "Holliday": return { card: "here", loc: true };
      case "The Doorman": return { loc: true };
      case "Lash": return c.lvl === 2 ? { loc: true } : null;
      default: return null;
    }
  }
  /** Alvos válidos para a escolha da carta (já colocada num local). */
  choiceCards(c: GCard): GCard[] {
    const spec = this.choiceOf(c), l = this.locOf(c);
    if (!spec?.card || !l) return [];
    return this.tg(spec.card === "here" ? this.foes(c, l) : this.foeCards(c));
  }
  choiceLocs(c: GCard): Loc[] {
    const l = this.locOf(c);
    return this.choiceOf(c)?.loc && l ? this.loc.filter((L) => L !== l) : [];
  }
  /** Guarda a escolha da carta jogada neste turno (ainda virada). */
  choose(c: GCard, ch: { card?: GCard; loc?: Loc }) {
    if (!c.staged || c.side !== "p" || this.busy) return;
    c.ch = { ...c.ch, ...(ch.card ? { card: ch.card.id } : {}), ...(ch.loc ? { loc: this.idx(ch.loc) } : {}) };
  }
  private chosenFoe(c: GCard, here: Loc | null): GCard | null {
    const t = this.byId(c.ch?.card);
    if (!t || t.side === c.side || !t.rev || t.st.burrow || !this.tg([t]).length) return null;
    return here && this.locOf(t) !== here ? null : t;
  }
  private chosenLoc(c: GCard, not: Loc): Loc | null {
    const i = c.ch?.loc;
    const L = i === undefined ? null : this.loc[i] ?? null;
    return L && L !== not ? L : null;
  }

  /* ---------- movimento durante o turno ---------- */
  private charge = (c: GCard, to: Loc) => c.mv.find((m) => m.n > 0 && m.u >= this.t && (!m.foes || to.s[opp(c.side)].some((x) => x.rev)));
  private portal(c: GCard, from: Loc, to: Loc) {
    const i = this.idx(from), j = this.idx(to);
    return this.portals.find((p) => p.side === c.side && p.t === this.t && p.n > 0 && ((p.a === i && p.b === j) || (p.a === j && p.b === i)));
  }
  /** Para onde a carta pode se mover agora (cargas de movimento ou portal do Doorman). Uma vez por turno. */
  moveOptions(c: GCard): Loc[] {
    const from = this.locOf(c);
    if (!from || !c.rev || c.staged || c.st.mvT === this.t) return [];
    return this.loc.filter((to) => to !== from && (this.portal(c, from, to) || this.charge(c, to)) && this.movable(c, from, to, true));
  }
  moveCard(c: GCard, to: Loc): boolean {
    if ((c.side === "p" && this.busy) || !this.moveOptions(c).includes(to)) return false;
    const from = this.locOf(c)!;
    const portal = this.portal(c, from, to);
    const charge = portal ? undefined : this.charge(c, to);
    const pw = this.pow(c, from);
    if (!this.move(c, from, to, true)) return false;
    c.st.mvT = this.t;
    this.say({ k: "move", c: this.N(c), loc: to.L.name });
    if (portal) { portal.n--; c.bonus += portal.bonus; return true; }
    if (!charge) return true;
    charge.n--;
    c.bonus += charge.bonus;
    if (charge.copy && this.room(from, c.side)) {
      const k = this.token(c.side, "illusion", charge.copy === "full" ? pw : Math.floor(pw / 2));
      k.rev = true;
      from.s[c.side].push(k);
      this.say({ k: "illusion", c: this.N(c), loc: from.L.name });
    }
    return true;
  }

  /* ---------- execução do Shiv ---------- */
  /** Inimigas que o Shiv pode marcar neste turno (janela aberta quando não matou ao revelar). */
  markOptions(c: GCard): GCard[] {
    const l = this.locOf(c);
    if (!l || !c.rev || c.st.exec?.u !== this.t || this.abilityOf(c) !== "Shiv") return [];
    return this.tg(this.foes(c, l));
  }
  mark(c: GCard, t: GCard) {
    if ((c.side === "p" && this.busy) || !this.markOptions(c).includes(t)) return;
    c.st.exec = { u: this.t, target: t.id };
    this.say({ k: "mark", c: this.N(c), t: this.N(t) });
  }
  private shivKill(c: GCard, l: Loc, v: number, t?: GCard | null): boolean {
    t = t ?? this.weakest(this.tg(this.foes(c, l)));
    if (!t || this.locOf(t) !== l || this.pow(t, l) > v || !this.destroy(t)) return false;
    this.say({ k: "shiv", c: this.N(c), t: this.N(t) });
    return true;
  }
  private execute(c: GCard) {
    const l = this.locOf(c), target = this.byId(c.st.exec?.target);
    c.st.exec = undefined;
    if (!l || this.abilityOf(c) !== "Shiv") return;
    if (this.shivKill(c, l, c.v, target) && this.master(c)) this.shivKill(c, l, c.v);
  }

  /* ---------- habilidades ---------- */
  private IMPL: Partial<Record<AbilityKey, Impl>> = {
    "Abrams": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      const to = this.pickLoc(l, t.side);
      if (to && this.move(t, l, to)) this.say({ k: "push", c: this.N(c), t: this.N(t), loc: to.L.name });
      else if (this.hurt(t, v, c)) { this.say({ k: "wall", t: this.N(t), v }); if (this.master(c)) c.bonus += 2; }
    } },
    "Apollo": { r: (c, _l, v) => { c.st.rip = this.master(c) ? 2 : 1; c.st.ripV = v; } },
    "Baba": { r: (c, l, v) => {
      const t = this.best(this.sh(this.capped(c, this.tg(this.foes(c, l)))), (x) => x.cost);
      if (!t) return;
      this.say({ k: "pigeon", t: this.N(t) });
      if (this.master(c) && t.cost >= 6) c.bonus += 3;
      t.p = { ...t.p, name: "", hero: null, c1: "#71717a", c2: "#27272a", token: "pigeon" };
      t.base = v; t.bonus = 0; t.ab = "none"; t.desc = ""; t.st = nst(); t.tok = true;
    } },
    "Bebop": { r: (c, l) => { this.hook[opp(c.side)] = { i: this.idx(l), m: this.master(c) }; this.say({ k: "hook", c: this.N(c), loc: l.L.name }); } },
    "Billy": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t || !(this.hurt(t, v, c) || v === 0)) return;
      t.st.chained = true;
      if (this.master(c)) this.silence(t);
      this.say({ k: "chain", c: this.N(c), t: this.N(t) });
    } },
    "Calico": { r: (c, _l, v) => {
      this.later(() => {
        const l = this.locOf(c);
        if (!l || this.abilityOf(c) !== "Calico") return;
        this.foes(c, l).forEach((t) => this.hurt(t, v, c));
        c.st.immune = true;
        if (this.master(c)) c.mv.push({ n: 1, u: this.t + 1, bonus: 0 });
        this.say({ k: "calico", c: this.N(c), v });
      });
    } },
    "Celeste": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      this.hurt(t, v, c);
      for (let i = 0, n = this.master(c) ? 2 : 1; i < n; i++) this.hurt(this.pickFoe(this.tg(this.foeCards(c)).filter((x) => x !== t)), 1, c);
      this.say({ k: "celeste", c: this.N(c) });
    } },
    "Deadman Danny": { r: (c, l, v) => {
      this.tg(this.foes(c, l)).forEach((t) => { t.st.tburn = [...(t.st.tburn ?? []), { v, u: this.t + 1 }]; });
      if (this.master(c)) this.hurt(this.strongest(this.tg(this.foes(c, l))), 2, c);
      this.say({ k: "danny", c: this.N(c), loc: l.L.name });
    } },
    "Drifter": { r: (c, l, v) => {
      const f = this.foes(c, l);
      if (!(f.length === 1 || (f.length === 2 && this.master(c)))) return;
      const t = this.weakest(this.tg(f));
      if (t && this.hurt(t, v, c)) { c.bonus += v; this.say({ k: "drifter", c: this.N(c), t: this.N(t) }); }
    } },
    "Dynamo": { r: (c, l, v) => {
      let n = 0;
      this.loc.filter((L) => L !== l).forEach((L) => {
        const t = this.weakest(this.tg(L.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow)));
        if (t && this.move(t, L, l)) { n++; this.hurt(t, v, c); this.say({ k: "dynamo", t: this.N(t) }); }
      });
      if (n && this.master(c)) l.s[c.side].forEach((x) => { if (x.rev) x.bonus += n; });
    } },
    "Graves": { f: (c, l, v) => {
      if (this.room(l, c.side)) { const k = this.token(c.side, "ghoul", v); k.rev = true; l.s[c.side].push(k); }
      const o = opp(c.side);
      if (this.room(l, o)) { const k = this.token(o, "ghoul", this.master(c) ? 0 : v); k.rev = true; l.s[o].push(k); this.say({ k: "graves", c: this.N(c), loc: l.L.name }); }
    } },
    "Grey Talon": { r: (c, _l, v) => {
      const t = this.chosenFoe(c, null) ?? this.strongest(this.tg(this.foeCards(c)));
      if (!t || !this.hurt(t, v, c)) return;
      this.say({ k: "owl", t: this.N(t), v });
      if (this.pow(t) === 0) { const b = this.master(c) ? 4 : 2; c.bonus += b; this.say({ k: "owlBonus", c: this.N(c), v: b }); }
    } },
    "Haze": { r: (c, l) => {
      const t = this.chosenFoe(c, l) ?? this.strongest(this.tg(this.foes(c, l)));
      if (t) { t.st.vuln = this.t + 1; t.st.sleep = this.t + 1; this.say({ k: "haze", c: this.N(c), t: this.N(t) }); }
      if (!this.master(c)) return;
      c.st.chan = { u: this.t + 1 };
      this.later(() => {
        const L = this.locOf(c);
        if (!L || !c.st.chan) return;
        c.st.chan = undefined;
        this.foes(c, L).filter((x) => x !== t).forEach((x) => this.hurt(x, 3, c));
        this.say({ k: "dance", c: this.N(c) });
      });
    } },
    "Holliday": { r: (c, l) => {
      const to = this.chosenLoc(c, l) ?? this.sh(this.loc.filter((L) => L !== l && this.room(L, c.side) && this.room(L, opp(c.side))))[0];
      const t = this.chosenFoe(c, l) ?? this.strongest(this.tg(this.foes(c, l)));
      if (!to || !t || !this.room(to, c.side) || !this.move(t, l, to)) return;
      this.move(c, l, to);
      if (this.master(c)) this.hurt(t, 3, c);
      this.say({ k: "holliday", c: this.N(c), t: this.N(t), loc: to.L.name });
    } },
    "Infernus": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      t.st.tburn = [...(t.st.tburn ?? []), { v, u: this.t + 1 }];
      if (this.master(c)) { this.silence(t); t.st.root = this.t + 1; }
      this.say({ k: "infernus", c: this.N(c), t: this.N(t) });
    } },
    "Ivy": { r: (c, l, v) => {
      const a = this.strongest(this.loc.filter((L) => L !== l).flatMap((L) => L.s[c.side].filter((x) => x.rev)));
      if (!a) return;
      a.bonus += v; c.bonus += v;
      if (this.master(c)) { a.st.immU = this.t + 1; c.st.immU = this.t + 1; }
      this.say({ k: "ivy", c: this.N(c), t: this.N(a) });
    } },
    "Kelvin": { r: (c, l) => {
      l.shield[c.side] = this.t + 1;
      if (this.master(c)) this.foes(c, l).filter((t) => t.main === "MIR").forEach((t) => this.hurt(t, 2, c));
      this.say({ k: "kelvin", loc: l.L.name });
    } },
    "Lady Geist": { r: (c, l, v) => {
      const t = this.strongest(this.capped(c, this.tg(this.foes(c, l))));
      if (!t) return;
      const d = Math.min(v, this.pow(t, l) - this.pow(c, l));
      if (d <= 0 || !this.hurt(t, d, c)) return;
      c.bonus += d;
      if (this.master(c)) this.hurt(t, 2, c);
      this.say({ k: "geist", c: this.N(c), t: this.N(t) });
    } },
    "Lash": { r: (c, l, v) => {
      const pick = this.master(c) ? this.chosenLoc(c, l) : null;
      const ts: GCard[] = [];
      for (let i = 0; i < 2; i++) { const t = this.pickFoe(this.tg(this.foes(c, l)).filter((x) => !ts.includes(x))); if (t) ts.push(t); }
      ts.forEach((t) => {
        const d = pick && this.room(pick, t.side) ? pick : this.pickLoc(l, t.side);
        if (d && this.move(t, l, d)) { this.hurt(t, v, c); this.say({ k: "lash", c: this.N(c), t: this.N(t), loc: d.L.name }); }
      });
    } },
    "McGinnis": { r: (c, l, v) => {
      const L = this.pickLoc(l, c.side) ?? (this.room(l, c.side) ? l : null);
      if (!L) return;
      const k = this.token(c.side, "turret", this.master(c) ? Math.max(4, v) : v);
      k.rev = true;
      L.s[c.side].push(k);
      this.say({ k: "turret", c: this.N(c), loc: L.L.name });
    },
    },
    "Mina": {
      r: (c) => { c.st.drainU = this.t + MINA_TURNS - 1; if (this.master(c)) c.mv.push({ n: 1, u: this.t + 1, bonus: 0 }); },
      f: (c, l, v) => {
        if ((c.st.drainU ?? 0) < this.t) return;
        const t = this.pickFoe(this.tg(this.foes(c, l)));
        if (t && this.hurt(t, v, c)) c.bonus += v;
      },
    },
    "Mirage": { r: (c, _l, v) => { c.mv.push({ n: this.master(c) ? 2 : 1, u: Infinity, bonus: v }); } },
    "Mo & Krill": { r: (c) => { c.st.burrow = true; this.say({ k: "burrow", c: this.N(c) }); } },
    "Nurse Harrow": { r: (c, l) => { if (this.master(c)) l.lock[opp(c.side)] = this.t + 1; } },
    "Paradox": { r: (c, l) => {
      if (c.st.chained || c.st.petri || c.st.unstop || (c.st.root ?? 0) >= this.t || !this.room(l, opp(c.side))) return;
      const opts = this.loc.filter((L) => L !== l && this.room(L, c.side))
        .flatMap((L) => this.tg(L.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow && !x.st.chained && !x.st.petri)).map((t) => [t, L] as const));
      const p = this.best(this.sh(opts), (x) => this.pow(x[0]));
      if (!p) return;
      const [t, L] = p;
      L.s[t.side].splice(L.s[t.side].indexOf(t), 1); l.s[t.side].push(t);
      l.s[c.side].splice(l.s[c.side].indexOf(c), 1); L.s[c.side].push(c);
      if (this.master(c)) this.hurt(t, 2, c);
      this.say({ k: "paradox", c: this.N(c), t: this.N(t) });
    } },
    "Pocket": { r: (c, l, v) => {
      this.foes(c, l).forEach((t) => { if (this.hurt(t, v, c) && this.master(c)) t.st.burn = (t.st.burn ?? 0) + 1; });
      this.say({ k: "pocket", c: this.N(c) });
    } },
    "Rat King": { r: (c) => {
      const h = this.handOf(c.side);
      if (h.length >= HAND_MAX) return;
      const r = this.token(c.side, "rat", 1);
      r.cost = this.master(c) ? 0 : 1;
      r.st.grow = 0;
      h.push(r);
      this.say({ k: "rats", c: this.N(c) });
    } },
    "Rem": { r: (c, l, v) => {
      let n = 0;
      this.foes(c, l).forEach((t) => { if (this.hurt(t, v, c, this.t + 1)) { n++; t.st.sleep = this.t + 1; } });
      if (n && this.master(c)) l.s[c.side].forEach((x) => { if (x.rev) x.st.tmp.push({ v: 1, u: this.t + 1 }); });
      if (n) this.say({ k: "rem", c: this.N(c), n });
    } },
    "Seven": {
      r: (c) => { c.st.chan = { u: this.t + 1 }; if (this.master(c)) c.st.unstop = true; this.say({ k: "storm", c: this.N(c) }); },
      f: (c, l, v) => { if (c.st.chan && c.st.chan.u >= this.t) this.foes(c, l).forEach((t) => this.hurt(t, v, c)); },
    },
    "Shiv": { r: (c, l, v) => {
      if (this.shivKill(c, l, v)) { if (this.master(c)) this.shivKill(c, l, v); }
      else c.st.exec = { u: this.t + 1 };
    } },
    "Sinclair": { r: (c) => { c.mv.push({ n: 1, u: Infinity, bonus: 0, copy: this.master(c) ? "full" : "half" }); } },
    "The Doorman": { r: (c, l) => {
      const to = this.chosenLoc(c, l) ?? this.best(this.sh(this.loc.filter((L) => L !== l)), (L) => this.total(L, opp(c.side)) - this.total(L, c.side));
      if (!to) return;
      this.portals.push({ side: c.side, a: this.idx(l), b: this.idx(to), t: this.t + 1, bonus: this.master(c) ? 1 : 0, n: DOOR_MAX });
      this.say({ k: "portal", c: this.N(c), loc: to.L.name });
    } },
    "Venator": { r: (c, l, v) => {
      l.trap[opp(c.side)] = v;
      if (this.master(c)) { const o = this.sh(this.loc.filter((L) => L !== l))[0]; if (o) o.trap[opp(c.side)] = v; }
      this.say({ k: "trap", c: this.N(c), loc: l.L.name });
    } },
    "Vindicta": { r: (c, _l, v) => {
      const foes = this.tg(this.foeCards(c));
      const t = this.chosenFoe(c, null) ?? this.strongest(foes.filter((x) => this.pow(x) <= v)) ?? this.strongest(foes);
      if (!t || !this.hurt(t, v, c)) return;
      this.say({ k: "vindicta", c: this.N(c), t: this.N(t), v });
      if (this.pow(t) > 0 && !this.master(c)) { c.bonus -= v; this.say({ k: "fall", c: this.N(c), v }); }
    } },
    "Violet": { f: (c, _l, v) => {
      const n = this.loc.filter((L) => L.rev && (this.total(L, c.side) > this.total(L, opp(c.side)) || (this.master(c) && this.total(L, c.side) === this.total(L, opp(c.side))))).length;
      const g = Math.min(v * n, VIOLET_MAX - (c.st.grown ?? 0));
      if (g > 0) { c.bonus += g; c.st.grown = (c.st.grown ?? 0) + g; }
    } },
    "Viscous": { r: (c, l, v) => {
      const pool = [c, ...this.friends(c, l)].sort((x, y) => this.pow(x) - this.pow(y)).slice(0, this.master(c) ? 2 : 1);
      pool.forEach((a) => { a.st.immune = true; a.bonus += v; });
      this.say({ k: "cube", c: this.N(c), t: this.N(pool[0]) });
    } },
    "Vyper": { r: (c, l) => { l.petri[opp(c.side)] = { m: this.master(c) }; this.say({ k: "trap", c: this.N(c), loc: l.L.name }); } },
    "Wraith": { r: (c, l) => {
      const t = this.strongest(this.capped(c, this.tg(this.foes(c, l))));
      if (t) { t.st.stun = this.t + 1; this.interrupt(t); this.say({ k: "wraith", c: this.N(c), t: this.N(t) }); }
      if (!this.master(c)) return;
      this.later(() => {
        const L = this.locOf(c);
        const to = L && this.losing(c.side, L) ? this.pickLoc(L, c.side) : null;
        if (L && to && this.move(c, L, to)) this.say({ k: "move", c: this.N(c), loc: to.L.name });
      });
    } },
    "Yamato": { r: (c, l, v) => {
      if (this.total(l, c.side) - this.pow(c, l) >= this.total(l, opp(c.side))) return;
      c.bonus += v;
      c.st.immune = true;
      this.say({ k: "yamato", c: this.N(c) });
      if (!this.master(c)) return;
      this.later(() => { const L = this.locOf(c); if (L && this.losing(c.side, L)) c.mv.push({ n: 1, u: this.t + 1, bonus: 0, foes: true }); });
    } },
    self: { r: (c, _l, v) => { c.bonus += v; } },
    hit: { r: (c, l, v) => { this.hurt(this.pickFoe(this.tg(this.foes(c, l))), v, c); } },
    team: { r: (c, l, v) => { this.friends(c, l).forEach((x) => (x.bonus += v)); } },
    draw: { r: (c, _l, v) => { for (let i = 0; i < v; i++) this.draw(c.side); } },
  };

  /* ---------- Maestria entre cartas do mesmo herói ---------- */
  /** Mentoria: um jogador melhor do mesmo herói já em jogo ensina a carta nova (+1 nível, +1 de poder). */
  private mentor(c: GCard) {
    const m = c.main, mine = c.stats;
    if (c.tok || !c.p.hero || !m || !mine || c.lvl >= 2) return;
    const teacher = this.everywhere(c.side).find(([x]) => x !== c && !x.tok && x.p.hero === c.p.hero && (x.stats?.[m] ?? 0) > (mine[m] ?? 0));
    if (!teacher) return;
    this.levelTo(c, (c.lvl + 1) as Mastery);
    c.bonus += 1;
    this.say({ k: "mentor", c: this.N(c), t: this.N(teacher[0]) });
  }
  /** Duelo de espelho: mesmo herói dos dois lados no mesmo local. Quem tem mais Maestria ganha +2 por nível de diferença. */
  private duel(c: GCard, l: Loc) {
    if (c.tok || !c.p.hero || c.st.duel) return;
    const o = l.s[opp(c.side)].find((x) => x.rev && !x.tok && x.p.hero === c.p.hero && !x.st.duel);
    if (!o) return;
    c.st.duel = o.st.duel = true;
    const d = c.lvl - o.lvl;
    if (!d) { this.say({ k: "duelTie", c: this.N(c), t: this.N(o) }); return; }
    const [w, lo] = d > 0 ? [c, o] : [o, c];
    w.bonus += 2 * Math.abs(d);
    if ((lo.stats?.POL ?? 0) < DUEL_SAFE_POL && !lo.st.unstop) lo.st.silU = this.t;
    this.say({ k: "duel", c: this.N(w), t: this.N(lo), v: 2 * Math.abs(d) });
  }

  /* ---------- itens da loja ---------- */
  itemV = (k: ItemKey) => itemStats(k, this.cfg.items).v;
  private mine = (s: Side) => this.everywhere(s).map((x) => x[0]);
  private addSouls(s: Side, n: number) { if (s === "p") this.E += n; else this.AE += n; }
  private leading = (s: Side, l: Loc) => this.total(l, s) > this.total(l, opp(s));
  /** Repete o Ao revelar da carta (n vezes; 2× no Círculo do Ritual por vez). */
  private reReveal(c: GCard, n = 1) {
    for (let k = 0; k < n; k++) {
      const impl = this.IMPL[this.abilityOf(c)];
      for (let i = 0, m = this.ty(this.locOf(c), "ritual") ? 2 : 1; i < m; i++) { const at = this.locOf(c); if (at && impl?.r) impl.r(c, at, c.v); }
    }
  }
  private cleanse(c: GCard) {
    const st = c.st;
    const bad = !!st.burn || !!st.tburn?.length || !!st.petri || !!st.silenced || (st.stun ?? 0) >= this.t || (st.vuln ?? 0) >= this.t || st.tmp.some((m) => m.v < 0 && this.t <= m.u);
    st.burn = 0; st.tburn = []; st.petri = false; st.silenced = false; st.stun = 0; st.vuln = 0; st.sleep = 0; st.tmp = st.tmp.filter((m) => m.v >= 0);
    return bad;
  }

  /** Efeito de cada item na carta alvo, aplicado no fim do turno da compra (antes dos efeitos de fim do turno). */
  private ITEM_FX: Record<ItemKey, (c: GCard, s: Side, v: number) => void> = {
    "High-Velocity Rounds": (c, _s, v) => { c.bonus += isGun(c) ? v : v - 1; },
    "Close Quarters": (c, s, v) => { const l = this.locOf(c); c.bonus += l && l.s[opp(s)].filter((x) => x.rev).length >= l.s[s].filter((x) => x.rev).length ? v : 1; },
    "Extra Health": (c, _s, v) => { c.bonus += v; },
    "Healing Rite": (c, _s, v) => { this.cleanse(c); c.bonus += v; },
    "Extra Spirit": (c, _s, v) => { if (ABILITIES[c.ab].usesV) c.v += v; c.bonus += 1; },
    "Golden Goose Egg": (c, s, v) => { c.bonus += 1; this.extra[s] += v + (this.loc.some((l) => this.ty(l, "urn") && this.leading(s, l)) ? 1 : 0); },
    "Swift Striker": (c, _s, v) => { c.bonus += c.cost <= 3 ? v : 2; },
    "Long Range": (c, s, v) => { const l = this.locOf(c); c.bonus += l && this.leading(opp(s), l) ? v : 2; },
    "Battle Vest": (c, _s, v) => { c.bonus += isFront(c) ? v : 2; },
    "Healing Booster": (c, _s, v) => { c.bonus += v + (SUPPORT.has(this.abilityOf(c)) ? 2 : 0); },
    "Arcane Surge": (c, _s, v) => { c.bonus += v; this.reReveal(c); },
    "Slowing Hex": (c, _s, v) => { this.hurt(c, v, null); this.silence(c); },
    "Toxic Bullets": (c, _s, v) => { if (!this.ty(this.locOf(c), "shrine")) c.st.burn = (c.st.burn ?? 0) + v; },
    "Sharpshooter": (c, s, v) => { c.bonus += this.strongest(this.mine(s)) === c ? v : 4; },
    "Metal Skin": (c, _s, v) => { c.st.immune = true; c.bonus += v; },
    "Rescue Beam": (c, s, v) => {
      c.bonus += v;
      const from = this.locOf(c);
      const to = this.best(this.loc.filter((l) => l !== from && this.room(l, s) && this.leading(opp(s), l)), (l) => this.total(l, s) - this.total(l, opp(s)));
      this.move(c, from, to ?? undefined);
    },
    "Surge of Power": (c, _s, v) => { c.bonus += ABILITIES[c.ab].kind === "r" ? v : 4; },
    "Superior Cooldown": (c, _s, v) => { c.st.cd = true; c.bonus += v; },
    "Glass Cannon": (c, _s, v) => { c.bonus += isGun(c) ? v : 7; },
    "Ricochet": (c, _s, v) => {
      const l = this.locOf(c);
      this.hurt(c, v, null);
      if (l) this.tg(l.s[c.side].filter((x) => x !== c && x.rev && !x.st.burrow)).forEach((x) => this.hurt(x, 2, null));
    },
    "Colossus": (c, _s, v) => { c.st.immune = true; c.bonus += v + (isFront(c) ? 2 : 0); },
    "Unstoppable": (c, _s, v) => { this.cleanse(c); c.st.chained = false; c.st.root = 0; c.st.unstop = true; c.bonus += v; },
    "Echo Shard": (c, _s, v) => { c.bonus += v; this.reReveal(c, 2); },
    "Refresher": (c, _s, v) => { this.cleanse(c); c.bonus += v; this.reReveal(c); },
  };

  /** Quantas cartas suas (mão e mesa) e qual local em jogo combinam com o item. */
  itemFit(s: Side, k: ItemKey): ItemFit {
    const f = ITEM_FIT[k];
    const cards = f?.card ? [...this.handOf(s), ...this.loc.flatMap((l) => l.s[s])].filter((c) => !c.tok && f.card!(c)).length : 0;
    const loc = f?.loc ? this.loc.find((l) => l.L.type === f.loc)?.L.name ?? null : null;
    return { cards, loc };
  }

  /** Cartas que o item pode mirar: suas na mesa (inclusive as jogadas neste turno) ou, se for de ataque, inimigas reveladas. */
  itemTargets(s: Side, k: ItemKey): GCard[] {
    if ((ITEMS[k] as { foe?: boolean }).foe) return this.tg(this.everywhere(opp(s)).map((x) => x[0]));
    return this.loc.flatMap((l) => l.s[s].filter((c) => !c.st.burrow));
  }

  private itemsOfTier = (t: ItemTier) => ITEM_KEYS.filter((k) => ITEMS[k].tier === t && itemStats(k, this.cfg.items).on);

  private openShop(tiers0: ItemTier[]) {
    const avail = tiers0.filter((t) => this.itemsOfTier(t).length);
    if (!avail.length) return;
    // 3 opções nos tiers da loja; com 2 tiers, ao menos uma de cada
    const tiers = avail.length === 1 ? [avail[0], avail[0], avail[0]] : [...avail, this.sh(avail)[0]].sort((a, b) => a - b);
    const draft = () => {
      const out: ItemKey[] = [];
      for (const t of tiers) {
        const opts = this.itemsOfTier(t);
        out.push(this.sh(opts.filter((k) => !out.includes(k)))[0] ?? this.sh(opts)[0]);
      }
      return out;
    };
    this.offer = { p: draft(), a: draft() };
  }

  /** Custo final do item: almas do tier, menos o desconto da Loja Secreta. */
  itemPrice = (s: Side, k: ItemKey) => Math.max(0, itemCost(ITEMS[k].tier) - this.discount[s]);

  /** Dá para comprar este item agora (com a devolução da compra já feita neste round)? */
  canBuy = (k: ItemKey) => !!this.offer?.p.includes(k) && this.itemPrice("p", k) <= this.E + (this.buying.p ? this.itemPrice("p", this.buying.p.k) : 0) && this.itemTargets("p", k).length > 0;

  /** Compra o item e mira uma carta. Uma compra por loja; comprar outro troca a compra. */
  buy(k: ItemKey, target: GCard) {
    if (this.busy || !this.canBuy(k) || !this.itemTargets("p", k).includes(target)) return false;
    this.unbuy();
    this.E -= this.itemPrice("p", k);
    this.buying.p = { k, target: target.id, t: this.t };
    return true;
  }
  unbuy() {
    const b = this.buying.p;
    if (this.busy || !b) return;
    this.E += this.itemPrice("p", b.k);
    this.buying.p = null;
  }

  /** IA: escolhe o item que mais combina com a mesa e mira a carta que mais aproveita. */
  private aiShop() {
    if (!this.offer) return;
    const opts = this.offer.a.filter((k) => this.itemPrice("a", k) <= this.AE && this.itemTargets("a", k).length);
    const k = this.best(this.sh(opts), (x) => { const f = this.itemFit("a", x); return ITEMS[x].tier + 0.6 * f.cards + (f.loc ? 1.5 : 0) + this.rnd() * 1.5; });
    if (!k) return;
    const fit = ITEM_FIT[k]?.card;
    const margin = (c: GCard) => { const l = this.locOf(c); return l ? Math.abs(this.total(l, "a") - this.total(l, "p")) : 99; };
    const ts = this.itemTargets("a", k);
    const t = (ITEMS[k] as { foe?: boolean }).foe ? this.strongest(ts) : this.best(this.sh(ts), (c) => (fit?.(c) ? 10 : 0) - margin(c));
    if (!t) return;
    this.AE -= this.itemPrice("a", k);
    this.buying.a = { k, target: t.id, t: this.t };
  }

  /** Aplica as compras do round (quem tem prioridade primeiro). Se o alvo saiu da mesa, o item se perde. */
  private applyItems() {
    for (const s of this.order()) {
      const b = this.buying[s];
      if (!b) continue;
      this.buying[s] = null;
      const c = this.byId(b.target);
      const ok = !!c && !!this.locOf(c) && !!(ITEMS[b.k] as { foe?: boolean }).foe === (c.side !== s);
      this.owned[s].push({ ...b, name: c ? this.N(c) : undefined });
      if (!c || !ok) { this.say({ k: "itemLost", side: s, item: b.k }); continue; }
      this.say({ k: "item", side: s, item: b.k, t: this.N(c) });
      this.ITEM_FX[b.k](c, s, this.itemV(b.k));
    }
    if (this.offer) { this.offer = null; this.discount = { p: 0, a: 0 }; }
  }

  /* ---------- turnos ---------- */
  nextTurn() {
    this.t++;
    // troca de fase: todas as cartas sobem até o nível que o atributo permite
    const ph = phaseOf(this.t);
    if (ph > phaseOf(this.t - 1)) {
      [...this.deck, ...this.adeck, ...this.hand, ...this.ahand, ...this.all()].forEach((c) => { if (!c.tok) this.levelTo(c, Math.min(c.top, ph) as Mastery); });
      this.say({ k: "phase", n: ph });
    }
    this.E = this.t + this.extra.p;
    this.AE = this.t + this.extra.a;
    if (this.extra.p) this.say({ k: "extraSouls", n: this.extra.p });
    this.extra = { p: 0, a: 0 };
    // Ratos do Rat King crescem na mão
    [...this.hand, ...this.ahand].forEach((c) => { if (c.st.grow !== undefined && c.st.grow < RAT_GROW_MAX) { c.base++; c.st.grow++; } });
    this.draw("p");
    this.draw("a");
    if (this.t <= LOC_COUNT) this.loc[this.t - 1].rev = true;
    const shop = SHOPS[this.t];
    if (shop) this.openShop(shop);
    this.busy = false;
  }

  canPlay(c: GCard, l: Loc): PlayError | null {
    if (c.cost > this.E) return "souls";
    if (l.lock.p >= this.t) return "frozen";
    if (!this.room(l, "p")) return "full";
    return null;
  }

  /** Coloca a carta (virada) num local; ela só revela no fim do turno. */
  play(c: GCard, l: Loc): PlayError | null {
    if (this.busy || !this.hand.includes(c)) return null;
    const err = this.canPlay(c, l);
    if (err) return err;
    this.hand.splice(this.hand.indexOf(c), 1);
    c.staged = true;
    c.ch = undefined;
    l.s.p.push(c);
    this.E -= c.cost;
    return null;
  }

  /** Volta para a mão uma carta jogada neste turno e ainda não revelada. */
  unstage(c: GCard) {
    const l = this.locOf(c);
    if (this.busy || !l || !c.staged || c.side !== "p") return;
    l.s.p.splice(l.s.p.indexOf(c), 1);
    c.staged = false;
    c.ch = undefined;
    this.E += c.cost;
    this.hand.push(c);
  }

  private aiPlay() {
    let e = this.AE;
    for (const c of this.sh(this.ahand).sort((a, b) => b.cost - a.cost)) {
      if (c.cost > e) continue;
      const ls = this.sh(this.loc).filter((l) => this.room(l, "a") && l.lock.a < this.t);
      if (!ls.length) break;
      ls[0].s.a.push(c);
      c.staged = true;
      this.ahand.splice(this.ahand.indexOf(c), 1);
      e -= c.cost;
    }
    // Shiv com a janela aberta marca a inimiga mais fraca daqui
    this.mine("a").forEach((c) => { const t = this.weakest(this.markOptions(c)); if (t) this.mark(c, t); });
  }
  /** IA usa movimentos para virar um local sem perder o atual. */
  private aiMoves() {
    for (const c of this.mine("a")) {
      const from = this.locOf(c);
      const opts = this.moveOptions(c);
      if (!from || !opts.length) continue;
      const pw = this.pow(c, from), here = this.total(from, "a") - this.total(from, "p");
      if (!(here - pw > 0 || here < -pw)) continue;
      const to = this.best(opts.filter((L) => { const m = this.total(L, "a") - this.total(L, "p"); return m <= 0 && m + pw > 0; }), (L) => this.total(L, "a") - this.total(L, "p"));
      if (to) this.moveCard(c, to);
    }
  }

  /** Os dois lados, começando por quem tem prioridade. */
  order = (): Side[] => [this.prio, opp(this.prio)];

  /** Quantos locais revelados cada lado está vencendo agora. */
  score(): Record<Side, number> {
    const r = { p: 0, a: 0 };
    this.loc.forEach((l) => { if (!l.rev) return; const p = this.total(l, "p"), a = this.total(l, "a"); if (p > a) r.p++; else if (a > p) r.a++; });
    return r;
  }

  /** Fecha o turno: a IA joga e devolve a ordem de revelação (alternando lados; quem tem prioridade começa; execuções marcadas antes das cartas). */
  endTurn(): Act[] {
    if (this.busy) return [];
    this.busy = true;
    this.aiShop();
    this.aiPlay();
    this.aiMoves();
    const side = (s: Side): Act[] => [
      ...this.loc.flatMap((l) => l.s[s].filter((c) => c.st.exec?.target !== undefined && c.st.exec.u === this.t).map((c) => ({ c, l, exec: true }))),
      ...this.loc.flatMap((l) => l.s[s].filter((c) => !c.rev).map((c) => ({ c, l }))),
    ];
    const [f, s] = this.order().map(side);
    const q: Act[] = [];
    while (f.length || s.length) { const x = f.shift(); if (x) q.push(x); const y = s.shift(); if (y) q.push(y); }
    return q;
  }

  act(a: Act) {
    if (a.exec) this.execute(a.c);
    else this.reveal(a.c, a.l);
  }

  reveal(c: GCard, l: Loc) {
    const s = c.side;
    const cur = this.locOf(c);
    if (!cur) return;
    l = cur;
    const h = this.hook[s];
    if (h) {
      this.hook[s] = null;
      const T = this.loc[h.i];
      if (T !== l && this.move(c, l, T)) {
        this.say({ k: "hookPull", c: this.N(c), loc: T.L.name });
        l = T;
        if (h.m) { c.rev = true; this.hurt(c, 2, null); c.st.chained = true; }
      }
    }
    c.rev = true;
    c.staged = false;
    if (l.trap[s]) { const v = l.trap[s]; l.trap[s] = 0; if (this.hurt(c, v, null)) this.say({ k: "trapHit", c: this.N(c), v }); }
    const pt = l.petri[s];
    if (pt) {
      l.petri[s] = null;
      if (!this.immune(c) && !c.st.unstop) { c.st.petri = true; this.say({ k: "petrify", c: this.N(c) }); if (pt.m) this.hurt(c, 2, null); }
    }
    if (this.ty(l, "enter")) c.bonus += l.L.v;
    if (this.ty(l, "chaos")) { c.base = 1 + Math.floor(this.rnd() * Math.max(1, l.L.n)); c.bonus = 0; }
    if (this.ty(l, "loot")) for (let i = 0; i < l.L.v; i++) this.draw(s);
    // um Suporte revelado solta os aliados erguidos pela Wraith
    if (c.p.role === "Suporte") l.s[s].forEach((x) => { if (x !== c && (x.st.stun ?? 0) >= this.t) { x.st.stun = 0; this.say({ k: "liftEnd", c: this.N(x) }); } });
    this.mentor(c);
    this.duel(c, l);
    const impl = this.IMPL[this.abilityOf(c)];
    if (impl?.r) for (let i = 0, n = this.ty(l, "ritual") ? 2 : 1; i < n; i++) { const at = this.locOf(c); if (at) impl.r(c, at, c.v); }
  }

  endOfTurn() {
    this.applyItems();
    this.loc.forEach((l) => this.order().flatMap((s) => l.s[s]).forEach((c) => {
      for (let i = 0, n = c.st.cd ? 2 : 1; i < n; i++) {
        const L = this.locOf(c);
        if (c.rev && L === l) this.IMPL[this.abilityOf(c)]?.f?.(c, L, c.v);
      }
    }));
    const due = this.pend.filter((p) => p.t === this.t);
    this.pend = this.pend.filter((p) => p.t !== this.t);
    due.forEach((p) => p.f());
    // queimaduras: permanentes e temporárias (Constante é imune)
    this.order().flatMap((s) => this.mine(s)).forEach((c) => {
      const b = (c.st.burn ?? 0) + (c.st.tburn ?? []).filter((x) => x.u >= this.t).reduce((a, x) => a + x.v, 0);
      if (b) this.hurt(c, b, null);
      if (c.st.tburn) c.st.tburn = c.st.tburn.filter((x) => x.u > this.t);
    });
    this.loc.forEach((l) => {
      if (!l.rev) return;
      const p = this.total(l, "p"), a = this.total(l, "a"), lead: Side | null = p > a ? "p" : a > p ? "a" : null;
      if (this.ty(l, "endturn")) [...l.s.p, ...l.s.a].forEach((c) => { if (c.rev) c.bonus += l.L.v; });
      if (this.ty(l, "urn") && lead) { this.extra[lead] += l.L.v; this.say({ k: "urn", side: lead }); }
      if (this.ty(l, "shop") && SHOPS[this.t + 1] && lead) { this.discount[lead] += l.L.v; this.say({ k: "shop", side: lead, v: l.L.v }); }
      if (this.ty(l, "midboss") && this.t === l.L.n && lead) { this.everywhere(lead).forEach(([x]) => (x.bonus += l.L.v)); this.say({ k: "boss", side: lead }); }
      // recompensa: quem vira um local que o outro segurava há BOUNTY_AT rounds ganha +1 alma
      if (lead && l.hold.side && lead !== l.hold.side && l.hold.n >= BOUNTY_AT) { this.extra[lead] += 1; this.say({ k: "bounty", side: lead, loc: l.L.name }); }
      if (lead) l.hold = lead === l.hold.side ? { side: lead, n: l.hold.n + 1 } : { side: lead, n: 1 };
      if (this.ty(l, "zipline")) this.order().forEach((s) => {
        const w = this.weakest(l.s[s].filter((x) => x.rev && !x.st.chained));
        const d = w && this.pickLoc(l, s);
        if (w && d && this.move(w, l, d)) this.say({ k: "zipline", c: this.N(w), loc: d.L.name });
      });
    });
    // janelas que acabam neste turno
    this.all().forEach((c) => {
      if (c.st.exec && c.st.exec.u <= this.t) c.st.exec = undefined;
      if (c.st.chan && c.st.chan.u <= this.t) c.st.chan = undefined;
    });
    this.portals = this.portals.filter((p) => p.t > this.t);
    const sc = this.score();
    const lead: Side | null = sc.p > sc.a ? "p" : sc.a > sc.p ? "a" : null;
    if (lead && lead !== this.prio) { this.prio = lead; this.say({ k: "prio", side: lead }); }
    // comeback: quem está perdendo em mais locais ganha +1 alma no próximo round
    if (lead && !this.over) { this.extra[opp(lead)] += 1; this.say({ k: "comeback", side: opp(lead) }); }
  }

  get over() { return this.t >= TURNS; }

  finish(): Result {
    // Mestres que agem no fim da partida: Última Resistência do Warden e a emersão do Mo & Krill
    this.loc.forEach((l) => this.order().flatMap((s) => l.s[s]).forEach((c) => {
      if (!c.rev || !this.master(c)) return;
      const a = this.abilityOf(c);
      if (a === "Warden") {
        let n = 0;
        this.foes(c, l).forEach((t) => { if (this.hurt(t, 1, c)) n++; });
        if (n) this.say({ k: "lastStand", c: this.N(c), n });
      }
      if (a === "Mo & Krill" && c.st.burrow) { const t = this.strongest(this.foes(c, l)); if (t) this.hurt(t, 2, c); this.say({ k: "emerge", c: this.N(c) }); }
    }));
    this.final = true;
    let won = 0, lost = 0, myPower = 0, aiPower = 0;
    let pat: Side | null = null;
    this.loc.forEach((l) => {
      const p = this.total(l, "p"), a = this.total(l, "a");
      myPower += p; aiPower += a;
      if (p > a) won++; else if (a > p) lost++;
      if (this.ty(l, "patron")) pat = p > a ? "p" : a > p ? "a" : null;
    });
    let outcome: Result["outcome"];
    let patron = false;
    if (won !== lost) outcome = won > lost ? "win" : "loss";
    else if (pat) { outcome = pat === "p" ? "win" : "loss"; patron = true; }
    else if (myPower !== aiPower) outcome = myPower > aiPower ? "win" : "loss";
    else outcome = "draw";
    this.result = { outcome, won, lost, myPower, aiPower, patron };
    return this.result;
  }

  /** Fecha o turno de uma vez, sem a pausa entre revelações (testes e simulação). Sem escolha feita, fica com o primeiro item. */
  runEndTurn(): Result | null {
    for (const a of this.endTurn()) this.act(a);
    this.endOfTurn();
    if (this.over) return this.finish();
    this.nextTurn();
    return null;
  }
}
