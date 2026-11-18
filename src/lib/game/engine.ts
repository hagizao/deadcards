// Motor do Cardslock Game: estado da partida, efeitos das habilidades e dos locais, e a IA.
// Sem React e sem texto: o log guarda chaves e parâmetros, traduzidos na tela. Regras em docs/cardslock-herois.md.
import { getPlayerOvr } from "../cards";
import type { Player } from "../types";
import {
  ABILITIES, ITEMS, ITEM_KEYS, SHOPS, MASTERY_BONUS, PRO_ON_POWER, phaseOf, REMOVAL_CAP, DOOR_MAX, MINA_TURNS, VIOLET_MAX, ROLE_ABILITY, cardStats, heroStat, itemCost, itemStats, mastery,
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
const nameKey = (n?: Name) => (typeof n === "object" ? `#${n.token}` : n);

/** De onde veio um efeito no poder: carta, item, local ou mecânica da partida. */
export type Cause = { k: "from" | "item" | "loc" | "burn" | "trap" | "hook" | "duel" | "mentor" | "move"; n?: Name; item?: ItemKey; loc?: string };

type Status = {
  /** Perdas e ganhos temporários; `src` diz de onde vieram. */
  tmp: { v: number; u: number; src?: Cause }[];
  /** Histórico do bônus permanente por origem (soma = bonus), para explicar o número da mesa. */
  fx?: (Cause & { v: number })[];
  burrow?: boolean; stun?: number; immune?: boolean; immU?: number; rip?: number; ripV?: number; chained?: boolean; silenced?: boolean; silU?: number;
  burn?: number; tburn?: { v: number; u: number }[];
  /** Aflição do Pocket Mestre: perde `v` no fim de cada turno, sem nunca passar de 1. */
  ail?: { v: number; src: Cause };
  vuln?: number; sleep?: number; root?: number; petri?: boolean; unstop?: boolean;
  /** Rato do Metrô: fica preso no Metrô (não se move nem troca de local). */
  home?: boolean;
  chan?: { u: number }; drainU?: number; grown?: number; cd?: boolean; wolf?: boolean; wolfAt?: number; exec?: { u: number; target?: number }; duel?: boolean; mvT?: number; grow?: number;
  /** Almas pagas ao jogar (devolvidas se a carta voltar para a mão neste turno). */
  paid?: number;
  /** Jardim: carta virada esperando o turno de revelar. */
  wait?: boolean;
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

/** Uma parte do poder da carta: de onde veio e quanto soma. */
export type PowPart = { k: "base" | "bonus" | "tmp" | "ab" | "stun" | "burrow" | Cause["k"]; v: number; n?: Name; ab?: AbilityKey; loc?: string; item?: ItemKey; tmp?: boolean };
export type LogEntry = { k: LogKey; c?: Name; t?: Name; a?: Name; loc?: string; v?: number; n?: number; ab?: AbilityKey; side?: Side; item?: ItemKey };
export type LogKey =
  | "riposte" | "push" | "wall" | "pigeon" | "hook" | "chain" | "calico" | "celeste" | "danny" | "drifter" | "dynamo" | "owl" | "owlBonus"
  | "haze" | "dance" | "holliday" | "infernus" | "ivy" | "kelvin" | "geist" | "lash" | "turret" | "move" | "burrow" | "harrow" | "paige"
  | "paradox" | "pocket" | "rats" | "rem" | "storm" | "shiv" | "mark" | "wolf" | "illusion" | "portal" | "trap" | "vindicta" | "fall"
  | "cube" | "petrify" | "wraith" | "liftEnd" | "yamato" | "chanEnd" | "extraSouls" | "hookPull" | "trapHit" | "urn" | "boss" | "zipline"
  | "item" | "itemLost" | "shop" | "prio" | "phase" | "comeback" | "bounty" | "duel" | "duelTie" | "mentor" | "lastStand" | "emerge" | "graves"
  | "back" | "burnt" | "gone" | "hoop" | "copy" | "ratLoc" | "bell" | "bet" | "smoke" | "stock" | "zero";

export type Result = { outcome: "win" | "loss" | "draw"; won: number; lost: number; myPower: number; aiPower: number; patron: boolean };
export type PlayError = "souls" | "frozen" | "full" | "closed" | "minCost";

/** Carta de uma linha do cadastro no formato do jogo, agrupada pela chave do jogador. */
const toPool = (p: Player, key: string): PoolCard => ({
  id: p.id, key, name: p.name, position: ROLE_ABILITY[p.position] ? p.position : "Flex", hero: p.hero, c1: p.c1 || "#334155", c2: p.c2 || "#0f172a", ovr: getPlayerOvr(p) || 0, stats: p.stats,
});

/**
 * Todas as versões jogáveis de cada jogador: a carta principal, as variantes cadastradas (inclusive as guardadas, fora do elenco)
 * e uma versão por herói de afinidade de cada uma dessas cartas. Duas cartas do mesmo herói convivem (a especial e a normal, por
 * exemplo): quem monta o baralho escolhe qual. Jogador só entra se alguma carta dele estiver no elenco; a ativa principal vem primeiro.
 */
export function cardVersions(players: Player[]): Map<string, PoolCard[]> {
  const groups = new Map<string, Player[]>();
  for (const p of players) {
    const k = p.variantOf || p.id;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out = new Map<string, PoolCard[]>();
  for (const [key, g] of groups) {
    if (g.every((p) => p.inactive)) continue;
    const real = [...g].sort((x, y) => Number(!!x.inactive) - Number(!!y.inactive) || Number(!!x.variantOf) - Number(!!y.variantOf));
    const list = real.map((p) => toPool(p, key));
    for (const p of real) {
      for (const hero of sanitizeHeroPool(p.heroPool, p.hero)) list.push({ ...toPool(p, key), id: `${p.id}~${hero}`, hero, alt: true });
    }
    out.set(key, list);
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
 * Deck da IA espelhando o seu (sem repetir herói dentro dele): para cada carta sua, uma do pool com o mesmo custo e OVR parecido (a IA pode repetir jogadores seus).
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
    // sem herói repetido no deck da IA (se o pool permitir)
    const used = new Set(out.map((x) => x.hero));
    let best = -1;
    for (let i = 0; i < free.length; i++) if (!used.has(free[i].hero) && (best < 0 || score(free[i]) < score(free[best]))) best = i;
    if (best < 0) best = free.reduce((b, p, i) => (score(p) < score(free[b]) ? i : b), 0);
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
        if (free[j].hero !== out[i].hero && out.some((x) => x.hero === free[j].hero)) continue;
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
  "Rapid Rounds": { card: isGun },
  "Rebuttal": { card: isFront },
  "Return Fire": { card: isFront },
  "Berserker": { card: isFront },
  "Headhunter": { card: isGun },
  "Fortitude": { card: isFront },
  "Healing Nova": { card: (c) => SUPPORT.has(c.ab) },
  "Frenzy": { card: isGun },
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
  pend: { t: number; f: () => void; cause?: Cause }[] = [];
  /** Origens em execução (a de dentro vale) e o bônus de cada carta quando cada uma começou. */
  private causes: Cause[] = [];
  private snaps: Map<GCard, { b: number; st: Status }>[] = [];
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
  /** Cartas compradas com a mão cheia (7): queimam e saem da partida para sempre, em ordem. */
  burned: { s: Side; c: GCard }[] = [];
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
  private say(e: LogEntry) { this.said++; this.log.unshift(e); this.log.length = Math.min(this.log.length, 3); }
  private said = 0;
  /** Habilidades que funcionaram (mudaram algo na partida), em ordem, para a tela tocar o som de cada uma. A tela esvazia a lista. */
  heard: { ab: AbilityKey; id: number; side: Side }[] = [];
  /** Retrato do que uma habilidade pode mudar: cartas, status, mãos, locais, efeitos marcados e o log. */
  private sig() {
    const cards = this.loc.map((l) => [l.s.p, l.s.a].map((a) => a.map((c) => [c.id, c.base, c.bonus, c.v, c.p.token, c.st, c.mv])));
    return JSON.stringify([cards, this.loc.map((l) => [l.trap, l.petri, l.lock, l.shield]), this.hand.length, this.ahand.length, this.pend.length, this.portals.length, this.hook, this.said]);
  }
  /** Roda a habilidade da carta e, se ela mudou alguma coisa, registra para o som. */
  private fire(c: GCard, f: () => void) {
    const before = this.sig();
    f();
    if (this.sig() !== before) this.heard.push({ ab: c.ab, id: c.id, side: c.side });
  }
  private handOf = (s: Side) => (s === "p" ? this.hand : this.ahand);
  private later(f: () => void, t = this.t + 1) { this.pend.push({ t, f, cause: this.causes.at(-1) }); }
  private by = (c: GCard): Cause => ({ k: "from", n: this.N(c) });
  /** Roda `f` atribuindo à origem `cause` o que mudar no bônus das cartas da mesa (para a caixa "de onde vem"). */
  private as<T>(cause: Cause, f: () => T): T {
    const snap = new Map(this.all().map((c) => [c, { b: c.bonus, st: c.st }]));
    this.causes.push(cause);
    this.snaps.push(snap);
    try { return f(); } finally {
      this.causes.pop();
      this.snaps.pop();
      snap.forEach((s, c) => {
        const d = c.bonus - s.b;
        // carta que virou outra (Pombo) ou voltou para a mão recomeça o histórico
        if (!d || c.st !== s.st) return;
        (c.st.fx ??= []).push({ ...cause, v: d });
        // o que já foi atribuído aqui dentro não conta de novo para as origens de fora
        this.snaps.forEach((o) => { const x = o.get(c); if (x) x.b += d; });
      });
    }
  }

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
  abilityOf = (c: GCard): AbilityKey => (c.st.silenced || c.st.petri || (c.st.silU ?? 0) >= this.t || this.ty(this.locOf(c), "nofx") ? "none" : c.ab);
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
  /** Alvos dentro do teto de remoção da habilidade (o número vem escrito na carta). */
  private capped = (k: keyof typeof REMOVAL_CAP, a: GCard[]) => a.filter((x) => this.pow(x) <= REMOVAL_CAP[k]);
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
    const sum = this.powParts(c, l).reduce((a, x) => a + x.v, 0);
    return (l ?? this.locOf(c)) ? Math.max(0, sum) : sum;
  }
  /** O poder da carta em partes (base, bônus, auras, local, status), para explicar o número da mesa. A soma, no mínimo 0, é o pow. */
  powParts(c: GCard, l?: Loc): PowPart[] {
    l = l ?? this.locOf(c);
    const out: PowPart[] = [{ k: "base", v: c.base }];
    // bônus permanente, um item por origem (o que sobrar sem origem conhecida vai junto em "bonus")
    const add = (q: PowPart) => {
      // efeito da própria carta aparece como a habilidade dela
      const p: PowPart = q.k === "from" && nameKey(q.n) === nameKey(this.N(c)) ? { k: "ab", ab: c.ab, v: q.v, tmp: q.tmp } : q;
      const same = out.find((x) => x.k === p.k && x.tmp === p.tmp && x.item === p.item && x.ab === p.ab && x.loc === p.loc && nameKey(x.n) === nameKey(p.n));
      if (same) same.v += p.v; else out.push({ ...p });
    };
    const fx = c.st.fx ?? [];
    fx.forEach((x) => add(x));
    const rest = c.bonus - fx.reduce((a, x) => a + x.v, 0);
    if (rest) add({ k: "bonus", v: rest });
    if (!l) return out.filter((x) => x.v !== 0 || x.k === "base");
    c.st.tmp.forEach((m) => { if (this.t <= m.u) add({ ...(m.src ?? { k: "tmp" }), v: m.v, tmp: true }); });
    l.s[c.side].forEach((o) => {
      if (o === c || !o.rev) return;
      const a = this.abilityOf(o);
      if (a === "aura" || a === "Paige") out.push({ k: "from", v: o.v, n: this.N(o) });
    });
    // Nurse Harrow: drena constante da inimiga mais forte daqui para o aliado mais fraco daqui
    [...l.s.p, ...l.s.a].forEach((o) => {
      if (!o.rev || o.st.burrow || this.abilityOf(o) !== "Nurse Harrow") return;
      const h = this.harrow(o, l);
      if (h.foe === c) out.push({ k: "from", v: -o.v, n: this.N(o) });
      if (h.ally === c) out.push({ k: "from", v: o.v, n: this.N(o) });
    });
    // Victor: aura contínua em todas as cartas daqui; o Mestre poupa o próprio lado
    [...l.s.p, ...l.s.a].forEach((o) => {
      if (o !== c && o.rev && this.abilityOf(o) === "Victor" && (o.side !== c.side || !this.master(o))) out.push({ k: "from", v: -o.v, n: this.N(o) });
    });
    const a = this.abilityOf(c);
    if (a === "Warden") out.push({ k: "ab", v: c.v * l.s[opp(c.side)].filter((o) => o.rev).length, ab: a });
    if (a === "Solomon" && l.s[c.side].length >= this.cap(l) - (this.master(c) ? 1 : 0)) out.push({ k: "ab", v: c.v, ab: a });
    if (a === "Mo & Krill" && this.final) out.push({ k: "ab", v: c.v, ab: a });
    const here = (v: number) => out.push({ k: "loc", v, loc: l.L.name });
    if (this.ty(l, "costLow") && c.cost <= l.L.n) here(l.L.v);
    if (this.ty(l, "costHigh") && c.cost >= l.L.n) here(l.L.v);
    if (this.ty(l, "gun") && isGun(c)) here(l.L.v);
    if (this.ty(l, "crew")) here(l.L.v * l.s[c.side].filter((o) => o !== c && o.rev).length);
    // entocada ou erguida: tudo acima conta, mas o total vira 0 (a parte mostra quanto foi anulado)
    const zero = c.st.burrow && !this.final ? "burrow" : (c.st.stun ?? 0) >= this.t ? "stun" : null;
    if (zero) out.push({ k: zero, v: -Math.max(0, out.reduce((a, x) => a + x.v, 0)) });
    return out.filter((x) => x.v !== 0 || x.k === "base" || x.k === zero);
  }
  /** Zerada por efeitos (com algum poder impresso, sem estar entocada nem erguida): sai da partida. */
  private zeroed = (c: GCard, l: Loc) => c.rev && c.base > 0 && !c.st.burrow && !((c.st.stun ?? 0) >= this.t) && this.pow(c, l) <= 0;
  /** Elimina as cartas zeradas. No Cemitério, voltam para a mão em vez disso. Repete enquanto alguém sair, porque as auras
   *  (Nurse Harrow, Victor, Paige...) mudam de alvo e podem zerar outra carta. */
  private sweep() {
    for (let gone = true; gone;) {
      gone = false;
      this.loc.forEach((l) => (["p", "a"] as Side[]).forEach((s) => [...l.s[s]].forEach((c) => {
        if (!this.zeroed(c, l)) return;
        if (this.ty(l, "grave")) { this.toHand(c, l); gone = true; return; }
        if (this.destroy(c)) { this.say({ k: "zero", c: this.N(c), loc: l.L.name }); gone = true; }
      })));
    }
  }
  total = (l: Loc, s: Side) => {
    const mine = l.s[s].filter((c) => c.rev);
    const rift = this.ty(l, "rift") && mine.length > l.s[opp(s)].filter((c) => c.rev).length ? l.L.v : 0;
    return mine.reduce((a, c) => a + this.pow(c, l), rift);
  };

  /** Dano: perder poder por efeito. Respeita imunidade, Santuário, escudo do Kelvin, Riposta e vulnerabilidade. */
  /** Tira poder de `t`. Com `floor`, a perda para em `floor` de poder (a Aflição do Pocket nunca zera ninguém). */
  private hurt(t: GCard | null | undefined, amt: number, src: GCard | null, until?: number, floor = 0): boolean {
    const l = t && this.locOf(t);
    if (!t || !l || amt <= 0) return false;
    if (this.immune(t) || t.st.unstop || this.ty(l, "shrine") || l.shield[t.side] >= this.t) return false;
    if (floor && this.pow(t, l) <= floor) return false;
    if ((t.st.rip ?? 0) > 0 && src && src.side !== t.side) {
      t.st.rip = (t.st.rip ?? 1) - 1;
      this.say({ k: "riposte", c: this.N(t), t: this.N(src) });
      if (this.locOf(src)) this.as(this.by(t), () => this.hurt(src, t.st.ripV ?? 2, null));
      return false;
    }
    if ((t.st.vuln ?? 0) >= this.t) { amt *= 2; t.st.vuln = 0; }
    if (floor) amt = Math.min(amt, this.pow(t, l) - floor);
    if (until) t.st.tmp.push({ v: -amt, u: until, src: this.causes.at(-1) });
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
    if (from === to || !this.room(to, c.side) || this.ty(to, "nomove") || c.st.home) return false;
    if (c.st.chained || c.st.petri || c.st.unstop || (c.st.root ?? 0) >= this.t) return false;
    if (self && from.s[opp(c.side)].some((o) => o.rev && this.abilityOf(o) === "Paige" && this.master(o))) return false;
    return true;
  }
  private move(c: GCard, from: Loc | undefined, to: Loc | undefined, self = false): boolean {
    if (!from || !to || !this.movable(c, from, to, self)) return false;
    from.s[c.side].splice(from.s[c.side].indexOf(c), 1);
    to.s[c.side].push(c);
    this.interrupt(c);
    if (this.ty(to, "arrive")) this.as({ k: "loc", loc: to.L.name }, () => { c.bonus += to.L.v; });
    return true;
  }
  private destroy(c: GCard): boolean {
    const l = this.locOf(c);
    if (!l || this.immune(c) || c.st.unstop) return false;
    l.s[c.side].splice(l.s[c.side].indexOf(c), 1);
    return true;
  }
  /** Tira a carta da mesa e devolve à mão do dono, limpa. Fichas somem; com a mão cheia, a carta se perde. */
  private toHand(c: GCard, why: Loc) {
    const l = this.locOf(c);
    if (!l) return;
    l.s[c.side].splice(l.s[c.side].indexOf(c), 1);
    this.say({ k: "back", c: this.N(c), loc: why.L.name });
    if (c.tok) return;
    Object.assign(c, { bonus: 0, rev: false, staged: false, st: nst(), mv: [], ch: undefined });
    const h = this.handOf(c.side);
    if (h.length < HAND_MAX) h.push(c);
  }
  /** Sua próxima carta do baralho, se The New York Oracle estiver revelado (a do adversário continua escondida). */
  peek(): GCard | null {
    if (!this.loc.some((l) => this.ty(l, "oracle"))) return null;
    return this.deck[this.deck.length - 1] ?? null;
  }
  private draw(s: Side) {
    const d = s === "p" ? this.deck : this.adeck, h = this.handOf(s);
    const c = d.pop();
    if (!c) return;
    if (h.length < HAND_MAX) return void h.push(c);
    this.burned.push({ s, c });
    this.say({ k: "burnt", c: this.N(c), side: s });
  }
  private wolfIn(c: GCard) {
    c.st.wolfAt = this.t + 1;
    this.later(() => this.as(this.by(c), () => {
      const l = this.locOf(c);
      if (!l || c.st.wolf) return;
      c.st.wolf = true;
      c.bonus += c.v;
      const t = this.master(c) ? this.weakest(this.capped("Silver", this.tg(this.foes(c, l)))) : null;
      this.say({ k: "wolf", c: this.N(c), t: t && this.destroy(t) ? this.N(t) : undefined });
    }), c.st.wolfAt);
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
    if (portal) { portal.n--; this.as({ k: "move" }, () => { c.bonus += portal.bonus; }); return true; }
    if (!charge) return true;
    charge.n--;
    this.as({ k: "move" }, () => { c.bonus += charge.bonus; });
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
  /** O Shiv alcança também quem está entocado (o Mo & Krill fica com 0 de poder embaixo da terra, e 0 sempre é executável). */
  private shivKill(c: GCard, l: Loc, v: number, t?: GCard | null): boolean {
    t = t ?? this.weakest(this.tg(l.s[opp(c.side)].filter((x) => x.rev)));
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
      const t = this.best(this.sh(this.capped("Baba", this.tg(this.foes(c, l)))), (x) => x.cost);
      if (!t) return;
      this.say({ k: "pigeon", t: this.N(t) });
      if (this.master(c) && t.cost >= 6) c.bonus += 3;
      t.p = { ...t.p, name: "", hero: null, c1: "#71717a", c2: "#27272a", token: "pigeon" };
      t.base = v; t.bonus = 0; t.ab = "none"; t.desc = ""; t.st = nst(); t.tok = true;
    } },
    "Bebop": { r: (c, l) => { this.hook[opp(c.side)] = { i: this.idx(l), m: this.master(c) }; this.say({ k: "hook", c: this.N(c), loc: l.L.name }); } },
    "Billy": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      // no Santuário ela não perde poder, mas a corrente prende mesmo assim
      if (!t || !(this.hurt(t, v, c) || v === 0 || this.ty(l, "shrine"))) return;
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
        // só a dorminhoca, se ainda estiver aqui: o sono ainda vale, então o dano sai dobrado
        if (t && this.locOf(t) === L) this.hurt(t, 3, c);
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
    // cura as aliadas daqui ao poder original: tira perdas de poder (fixas e temporárias), queimaduras e a Telecinese; os ganhos ficam
    "Kelvin": { r: (c, l) => {
      l.s[c.side].filter((x) => x.rev).forEach((x) => {
        x.bonus = Math.max(0, x.bonus);
        x.st.tmp = x.st.tmp.filter((m) => m.v >= 0);
        x.st.burn = 0;
        x.st.tburn = [];
        x.st.ail = undefined;
        // o gelo também solta quem a Wraith ergueu
        if ((x.st.stun ?? 0) >= this.t) { x.st.stun = 0; this.say({ k: "liftEnd", c: this.N(x) }); }
      });
      if (this.master(c)) this.foes(c, l).filter((t) => t.main === "MIR").forEach((t) => this.hurt(t, 2, c));
      this.say({ k: "kelvin", loc: l.L.name });
    } },
    "Lady Geist": { r: (c, l, v) => {
      const t = this.strongest(this.capped("Lady Geist", this.tg(this.foes(c, l))));
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
        .flatMap((L) => this.tg(L.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow && !x.st.chained && !x.st.petri && !x.st.home)).map((t) => [t, L] as const));
      const p = this.best(this.sh(opts), (x) => this.pow(x[0]));
      if (!p) return;
      const [t, L] = p;
      L.s[t.side].splice(L.s[t.side].indexOf(t), 1); l.s[t.side].push(t);
      l.s[c.side].splice(l.s[c.side].indexOf(c), 1); L.s[c.side].push(c);
      if (this.master(c)) this.hurt(t, 2, c);
      this.say({ k: "paradox", c: this.N(c), t: this.N(t) });
    } },
    "Pocket": { r: (c, l, v) => {
      // nunca zera: quem tem 1 fica com 1, e quem tem pouco desce até 1
      this.foes(c, l).forEach((t) => { if (this.hurt(t, v, c, undefined, 1) && this.master(c)) t.st.ail = { v: (t.st.ail?.v ?? 0) + 1, src: this.by(c) }; });
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
      if (n && this.master(c)) l.s[c.side].forEach((x) => { if (x.rev) x.st.tmp.push({ v: 1, u: this.t + 1, src: this.by(c) }); });
      if (n) this.say({ k: "rem", c: this.N(c), n });
    } },
    "Seven": {
      r: (c) => { c.st.chan = { u: this.t + 1 }; if (this.master(c)) c.st.unstop = true; this.say({ k: "storm", c: this.N(c) }); },
      f: (c, l, v) => { if (c.st.chan && c.st.chan.u >= this.t) this.foes(c, l).forEach((t) => this.hurt(t, v, c)); },
    },
    "Shiv": { r: (c, l, v) => { if (this.shivKill(c, l, v) && this.master(c)) this.shivKill(c, l, v); } },
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
      const t = this.strongest(this.capped("Wraith", this.tg(this.foes(c, l))));
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
      for (let i = 0, m = this.ty(this.locOf(c), "ritual") ? 2 : 1; i < m; i++) { const at = this.locOf(c); if (at && impl?.r) this.fire(c, () => this.as(this.by(c), () => impl.r?.(c, at, c.v))); }
    }
  }
  private cleanse(c: GCard) {
    const st = c.st;
    const bad = !!st.burn || !!st.tburn?.length || !!st.ail || !!st.petri || !!st.silenced || (st.stun ?? 0) >= this.t || (st.vuln ?? 0) >= this.t || st.tmp.some((m) => m.v < 0 && this.t <= m.u);
    st.burn = 0; st.tburn = []; st.ail = undefined; st.petri = false; st.silenced = false; st.stun = 0; st.vuln = 0; st.sleep = 0; st.tmp = st.tmp.filter((m) => m.v >= 0);
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

    // tier 1
    "Monster Rounds": (c, _s, v) => { const l = this.locOf(c); c.bonus += v + (l && [...l.s.p, ...l.s.a].some((x) => x.tok) ? 2 : 0); },
    "Rapid Rounds": (c, _s, v) => { c.bonus += 1; this.later(() => { if (this.locOf(c)) c.bonus += v; }); },
    "Extra Regen": (c, _s, v) => { c.bonus += v; for (const k of [1, 2]) this.later(() => { if (this.locOf(c)) c.bonus += v; }, this.t + k); },
    "Grit": (c, _s, v) => { c.bonus += v; c.st.immU = Math.max(c.st.immU ?? 0, this.t + 1); },
    "Rebuttal": (c, _s, v) => { c.bonus += v; c.st.rip = (c.st.rip ?? 0) + 1; c.st.ripV = Math.max(c.st.ripV ?? 0, 2); },
    "Spirit Strike": (c, _s, v) => { this.hurt(c, v, null); },
    "Rusted Barrel": (c, _s, v) => { this.hurt(c, v, null, this.t + 1); },
    // tier 2
    "Slowing Bullets": (c, _s, v) => {
      c.bonus += v;
      const l = this.locOf(c), t = l && this.strongest(this.tg(this.foes(c, l)));
      if (t) t.st.root = Math.max(t.st.root ?? 0, this.t + 1);
    },
    "Titanic Magazine": (c, _s, v) => { const l = this.locOf(c); c.bonus += v + Math.min(3, l ? this.friends(c, l).length : 0); },
    "Mystic Shot": (c, _s, v) => { c.bonus += v; const l = this.locOf(c); if (l) this.hurt(this.weakest(this.tg(this.foes(c, l))), 1, c); },
    "Guardian Ward": (c, _s, v) => { c.bonus += v; const l = this.locOf(c); if (l) this.friends(c, l).forEach((x) => { x.bonus += 1; }); },
    "Return Fire": (c, _s, v) => { c.bonus += v; c.st.rip = (c.st.rip ?? 0) + 2; c.st.ripV = Math.max(c.st.ripV ?? 0, 2); },
    "Healbane": (c, _s, v) => { if (this.hurt(c, v, null)) c.st.tmp = c.st.tmp.filter((m) => m.v < 0); },
    "Cold Front": (c, _s, v) => { const l = this.locOf(c); if (l) this.tg(l.s[c.side].filter((x) => x.rev && !x.st.burrow)).forEach((x) => this.hurt(x, v, null, this.t + 1)); },
    "Mystic Vulnerability": (c, _s, v) => { this.hurt(c, v, null); c.st.vuln = Math.max(c.st.vuln ?? 0, this.t + 1); },
    "Spirit Sap": (c, _s, v) => { this.hurt(c, v, null); if (ABILITIES[c.ab].usesV) c.v = Math.max(0, c.v - 1); },
    // tier 3
    "Berserker": (c, _s, v) => { const hit = this.pow(c) < c.base; c.bonus += v + (hit ? 2 : 0); },
    "Alchemical Fire": (c, _s, v) => {
      const l = this.locOf(c);
      if (!l || this.ty(l, "shrine")) return;
      this.tg(l.s[c.side].filter((x) => x.rev && !x.st.burrow)).forEach((x) => { (x.st.tburn ??= []).push({ v: x === c ? v : 1, u: this.t + 1 }); });
    },
    "Headhunter": (c, s, v) => { c.bonus += v; const l = this.locOf(c); if (l && this.leading(s, l)) this.extra[s] += 1; },
    "Fortitude": (c, _s, v) => { const clean = c.bonus >= 0 && !c.st.tmp.some((m) => m.v < 0 && this.t <= m.u); c.bonus += v + (clean ? 2 : 0); },
    "Dispel Magic": (c, _s, v) => { const l = this.locOf(c); const any = [c, ...(l ? this.friends(c, l) : [])].map((x) => this.cleanse(x)).some(Boolean); c.bonus += any ? v : 1; },
    "Healing Nova": (c, _s, v) => { const l = this.locOf(c); [c, ...(l ? this.friends(c, l) : [])].forEach((x) => { x.bonus += v; }); },
    "Decay": (c, _s, v) => { if (!this.ty(this.locOf(c), "shrine")) (c.st.tburn ??= []).push({ v, u: this.t + 2 }); },
    "Silence Wave": (c, _s, v) => {
      const l = this.locOf(c);
      this.hurt(c, v, null);
      if (l) this.tg(l.s[c.side].filter((x) => x.rev)).forEach((x) => { x.st.silU = Math.max(x.st.silU ?? 0, this.t + 1); this.interrupt(x); });
    },
    // tier 4
    "Frenzy": (c, s, v) => { const l = this.locOf(c); c.bonus += v + (l && this.losing(s, l) ? 4 : 0); },
    "Crippling Headshot": (c, _s, v) => { this.hurt(c, v, null); c.st.tmp = c.st.tmp.filter((m) => m.v < 0); c.st.vuln = Math.max(c.st.vuln ?? 0, this.t + 1); },
    "Cheat Death": (c, _s, v) => { this.cleanse(c); c.bonus += v; c.st.immU = Math.max(c.st.immU ?? 0, this.t + 1); },
    "Divine Barrier": (c, s, v) => { this.cleanse(c); c.bonus += v; const l = this.locOf(c); if (l) l.shield[s] = Math.max(l.shield[s], this.t + 1); },
    "Arctic Blast": (c, _s, v) => {
      const l = this.locOf(c);
      c.st.stun = Math.max(c.st.stun ?? 0, this.t + 1);
      this.interrupt(c);
      if (l) this.tg(l.s[c.side].filter((x) => x !== c && x.rev && !x.st.burrow)).forEach((x) => this.hurt(x, v, null, this.t + 1));
    },
    "Cursed Relic": (c, _s, v) => { this.hurt(c, v, null); this.silence(c); c.st.chained = true; },
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
      this.as({ k: "item", item: b.k }, () => this.ITEM_FX[b.k](c, s, this.itemV(b.k)));
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
    // a Aposta do Bar pode tirar almas, mas nunca abaixo de zero
    this.E = Math.max(0, this.t + this.extra.p);
    this.AE = Math.max(0, this.t + this.extra.a);
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

  /** Almas para jogar a carta no local (Buff de Movimento barateia, Troll cobra pedágio). */
  playCost = (c: GCard, l: Loc) => Math.max(0, c.cost - (this.ty(l, "cheap") ? l.L.v : 0) + (this.ty(l, "toll") ? l.L.v : 0));
  private playError(s: Side, c: GCard, l: Loc, souls: number): PlayError | null {
    if (this.ty(l, "noplay")) return "closed";
    if (this.ty(l, "costMin") && c.cost < l.L.n) return "minCost";
    if (this.playCost(c, l) > souls) return "souls";
    if (l.lock[s] >= this.t) return "frozen";
    if (!this.room(l, s)) return "full";
    return null;
  }
  canPlay(c: GCard, l: Loc): PlayError | null {
    return this.playError("p", c, l, this.E);
  }

  /** Coloca a carta (virada) num local; ela só revela no fim do turno. */
  play(c: GCard, l: Loc): PlayError | null {
    if (this.busy || !this.hand.includes(c)) return null;
    const err = this.canPlay(c, l);
    if (err) return err;
    this.hand.splice(this.hand.indexOf(c), 1);
    c.staged = true;
    c.ch = undefined;
    c.st.paid = this.playCost(c, l);
    l.s.p.push(c);
    this.E -= c.st.paid;
    return null;
  }

  /** Volta para a mão uma carta jogada neste turno e ainda não revelada. */
  unstage(c: GCard) {
    const l = this.locOf(c);
    if (this.busy || !l || !c.staged || c.side !== "p") return;
    l.s.p.splice(l.s.p.indexOf(c), 1);
    c.staged = false;
    c.ch = undefined;
    this.E += c.st.paid ?? c.cost;
    c.st.paid = undefined;
    this.hand.push(c);
  }

  private aiPlay() {
    let e = this.AE;
    for (const c of this.sh(this.ahand).sort((a, b) => b.cost - a.cost)) {
      const ls = this.sh(this.loc).filter((l) => !this.playError("a", c, l, e));
      if (!ls.length) continue;
      ls[0].s.a.push(c);
      c.staged = true;
      c.st.paid = this.playCost(c, ls[0]);
      this.ahand.splice(this.ahand.indexOf(c), 1);
      e -= c.st.paid;
    }
    // o que sobra conta para a Bolsa de Valores
    this.AE = e;
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
    this.loc.forEach((l) => {
      if (!this.ty(l, "smoke")) return;
      const now = (x: Side) => l.s[x].filter((c) => c.staged && !c.rev);
      const p = now("p"), a = now("a");
      if (!p.length || !a.length) return;
      [...p, ...a].forEach((c) => this.toHand(c, l));
      this.say({ k: "smoke", loc: l.L.name });
    });
    const waits = (c: GCard, l: Loc) => this.ty(l, "late") && this.t < l.L.n;
    const side = (s: Side): Act[] => [
      ...this.loc.flatMap((l) => l.s[s].filter((c) => c.st.exec?.target !== undefined && c.st.exec.u === this.t).map((c) => ({ c, l, exec: true }))),
      ...this.loc.flatMap((l) => l.s[s].filter((c) => !c.rev && !waits(c, l)).map((c) => ({ c, l }))),
    ];
    // as que esperam o Jardim deixam de ser "jogadas neste turno" (não voltam para a mão)
    this.loc.forEach((l) => (["p", "a"] as Side[]).forEach((x) => l.s[x].forEach((c) => { if (!c.rev && waits(c, l)) { c.staged = false; c.st.wait = true; } })));
    const [f, s] = this.order().map(side);
    const q: Act[] = [];
    while (f.length || s.length) { const x = f.shift(); if (x) q.push(x); const y = s.shift(); if (y) q.push(y); }
    return q;
  }

  act(a: Act) {
    if (a.exec) this.as(this.by(a.c), () => this.execute(a.c));
    else this.reveal(a.c, a.l);
    this.sweep();
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
        if (h.m) { c.rev = true; this.as({ k: "hook" }, () => this.hurt(c, 2, null)); c.st.chained = true; }
      }
    }
    // Museu: a carta pode ser roubada de volta para a mão antes de agir
    if (this.ty(l, "museum") && this.rnd() * 100 < l.L.n) { this.toHand(c, l); return; }
    c.rev = true;
    c.staged = false;
    c.st.wait = undefined;
    if (l.trap[s]) { const v = l.trap[s]; l.trap[s] = 0; if (this.as({ k: "trap" }, () => this.hurt(c, v, null))) this.say({ k: "trapHit", c: this.N(c), v }); }
    const pt = l.petri[s];
    if (pt) {
      l.petri[s] = null;
      if (!this.immune(c) && !c.st.unstop) { c.st.petri = true; this.say({ k: "petrify", c: this.N(c) }); if (pt.m) this.as({ k: "trap" }, () => this.hurt(c, 2, null)); }
    }
    const here = l;
    this.as({ k: "loc", loc: l.L.name }, () => {
      const l = here;
      if (this.ty(l, "enter")) c.bonus += l.L.v;
      if (this.ty(l, "chaos")) { c.base = 1 + Math.floor(this.rnd() * Math.max(1, l.L.n)); c.bonus = 0; }
      if (this.ty(l, "loot")) for (let i = 0; i < l.L.v; i++) this.draw(s);
      if (this.ty(l, "spirit")) { if (ABILITIES[c.ab].usesV) c.v += l.L.v; else c.bonus += 1; }
      if (this.ty(l, "hoop") && this.rnd() * 100 < l.L.n) { c.bonus += l.L.v; this.say({ k: "hoop", c: this.N(c) }); }
      if (this.ty(l, "sacrifice")) { c.bonus -= l.L.n; this.extra[s] += l.L.v; }
      if (this.ty(l, "ambush") && this.t >= l.L.n) c.bonus += l.L.v;
      if (this.ty(l, "teleport")) c.mv.push({ n: 1, u: TURNS, bonus: 0 });
    });
    this.as({ k: "mentor" }, () => this.mentor(c));
    this.as({ k: "duel" }, () => this.duel(c, here));
    const impl = this.IMPL[this.abilityOf(c)];
    if (impl?.r) for (let i = 0, n = this.ty(l, "ritual") ? 2 : 1; i < n; i++) { const at = this.locOf(c); if (at) this.fire(c, () => this.as(this.by(c), () => impl.r?.(c, at, c.v))); }
    // constante: toca só ao entrar em jogo, com a habilidade ativa
    else if (ABILITIES[c.ab].kind === "c" && this.abilityOf(c) === c.ab && this.locOf(c)) this.heard.push({ ab: c.ab, id: c.id, side: s });
    // Teatro: uma cópia com o mesmo poder, sem habilidade
    const at = this.locOf(c);
    if (at && this.ty(at, "copy") && !c.tok && this.room(at, s)) {
      const k = this.token(s, "illusion", this.raw(c));
      Object.assign(k, { p: { ...c.p }, cost: c.cost, rev: true });
      at.s[s].push(k);
      this.say({ k: "copy", c: this.N(c), loc: at.L.name });
    }
  }

  endOfTurn() {
    this.applyItems();
    this.sweep();
    this.loc.forEach((l) => this.order().flatMap((s) => l.s[s]).forEach((c) => {
      for (let i = 0, n = (c.st.cd ? 2 : 1) * (this.ty(l, "clock") ? 2 : 1); i < n; i++) {
        const L = this.locOf(c);
        const f = this.IMPL[this.abilityOf(c)]?.f;
        if (c.rev && L === l && f) this.fire(c, () => this.as(this.by(c), () => f(c, L, c.v)));
      }
    }));
    this.sweep();
    const due = this.pend.filter((p) => p.t === this.t);
    this.pend = this.pend.filter((p) => p.t !== this.t);
    due.forEach((p) => (p.cause ? this.as(p.cause, p.f) : p.f()));
    this.sweep();
    // queimaduras: permanentes e temporárias (Constante é imune)
    this.order().flatMap((s) => this.mine(s)).forEach((c) => {
      const b = (c.st.burn ?? 0) + (c.st.tburn ?? []).filter((x) => x.u >= this.t).reduce((a, x) => a + x.v, 0);
      if (b) this.as({ k: "burn" }, () => this.hurt(c, b, null));
      if (c.st.tburn) c.st.tburn = c.st.tburn.filter((x) => x.u > this.t);
      const ail = c.st.ail;
      if (ail) this.as(ail.src, () => this.hurt(c, ail.v, null, undefined, 1));
    });
    this.sweep();
    this.loc.forEach((l) => this.as({ k: "loc", loc: l.L.name }, () => {
      if (!l.rev) return;
      const p = this.total(l, "p"), a = this.total(l, "a"), lead: Side | null = p > a ? "p" : a > p ? "a" : null;
      if (this.ty(l, "endturn")) [...l.s.p, ...l.s.a].forEach((c) => { if (c.rev) c.bonus += l.L.v; });
      if (this.ty(l, "urn") && lead) { this.extra[lead] += l.L.v; this.say({ k: "urn", side: lead, loc: l.L.name }); }
      if (this.ty(l, "shop") && SHOPS[this.t + 1] && lead) { this.discount[lead] += l.L.v; this.say({ k: "shop", side: lead, v: l.L.v }); }
      if (this.ty(l, "midboss") && this.t === l.L.n && lead) { this.everywhere(lead).forEach(([x]) => (x.bonus += l.L.v)); this.say({ k: "boss", side: lead }); }
      this.locEnd(l, lead);
      // recompensa: quem vira um local que o outro segurava há BOUNTY_AT rounds ganha +1 alma
      if (lead && l.hold.side && lead !== l.hold.side && l.hold.n >= BOUNTY_AT) { this.extra[lead] += 1; this.say({ k: "bounty", side: lead, loc: l.L.name }); }
      if (lead) l.hold = lead === l.hold.side ? { side: lead, n: l.hold.n + 1 } : { side: lead, n: 1 };
      if (this.ty(l, "zipline")) this.order().forEach((s) => {
        const w = this.weakest(l.s[s].filter((x) => x.rev && !x.st.chained));
        const d = w && this.pickLoc(l, s);
        if (w && d && this.move(w, l, d)) this.say({ k: "zipline", c: this.N(w), loc: d.L.name });
      });
    }));
    this.sweep();
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

  /** Efeitos de fim de turno dos locais novos (depois das cartas, com o vencedor do local já calculado). */
  private locEnd(l: Loc, lead: Side | null) {
    const sides: Side[] = this.order();
    const rev = (x: Side) => l.s[x].filter((c) => c.rev);
    if (this.ty(l, "bet") && lead) { this.extra[lead] += l.L.v; this.extra[opp(lead)] -= l.L.v; this.say({ k: "bet", side: lead, loc: l.L.name }); }
    if (this.ty(l, "bell") && this.t === l.L.n && lead) { this.extra[lead] += l.L.v; this.say({ k: "bell", side: lead, v: l.L.v }); }
    if (this.ty(l, "stock")) sides.forEach((x) => {
      const left = Math.min(l.L.n, x === "p" ? this.E : this.AE);
      const w = this.weakest(rev(x));
      if (w && left > 0) { w.bonus += left; this.say({ k: "stock", c: this.N(w), v: left, loc: l.L.name }); }
    });
    if (this.ty(l, "heal")) [...rev("p"), ...rev("a")].forEach((c) => { c.bonus = Math.max(0, c.bonus); c.st.tmp = c.st.tmp.filter((m) => m.v > 0); });
    if (this.ty(l, "grave")) [...rev("p"), ...rev("a")].forEach((c) => { if (this.pow(c, l) === 0) this.toHand(c, l); });
    if (this.ty(l, "hotel") && this.t === l.L.n) sides.forEach((x) => { const w = this.weakest(rev(x)); if (w) this.toHand(w, l); });
    if (this.ty(l, "rats")) {
      const p = rev("p").length, a = rev("a").length;
      const few: Side | null = p < a ? "p" : a < p ? "a" : null;
      if (few && this.room(l, few)) { const k = this.token(few, "rat", l.L.v); k.rev = true; k.st.home = true; l.s[few].push(k); this.say({ k: "ratLoc", loc: l.L.name }); }
    }
    if (this.ty(l, "bull") && this.t === l.L.n && lead) rev(opp(lead)).forEach((c) => { if (this.destroy(c)) this.say({ k: "gone", c: this.N(c), loc: l.L.name }); });
  }

  get over() { return this.t >= TURNS; }

  finish(): Result {
    // Mestres que agem no fim da partida: Última Resistência do Warden e a emersão do Mo & Krill
    this.loc.forEach((l) => this.order().flatMap((s) => l.s[s]).forEach((c) => {
      if (!c.rev || !this.master(c)) return;
      const a = this.abilityOf(c);
      if (a === "Warden") {
        let n = 0;
        this.foes(c, l).forEach((t) => { if (this.as(this.by(c), () => this.hurt(t, 1, c))) n++; });
        if (n) this.say({ k: "lastStand", c: this.N(c), n });
      }
      if (a === "Mo & Krill" && c.st.burrow) { const t = this.strongest(this.foes(c, l)); if (t) this.as(this.by(c), () => this.hurt(t, 2, c)); this.say({ k: "emerge", c: this.N(c) }); }
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
