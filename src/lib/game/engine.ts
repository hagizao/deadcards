// Motor do Cardslock Game: estado da partida, efeitos das habilidades e dos locais, e a IA.
// Sem React e sem texto: o log guarda chaves e parâmetros, traduzidos na tela.
import { getPlayerOvr } from "../cards";
import type { Player } from "../types";
import {
  ABILITIES, ITEMS, ITEM_KEYS, ITEM_OFFER_TURN, ITEM_REVEAL_TURN, ITEM_TIERS, ROLE_ABILITY, cardStats, itemCost, itemStats,
  type AbilityKey, type GameConfig, type GameLoc, type ItemKey, type ItemTier, type LocType, type PoolCard,
} from "./config";

export type Side = "p" | "a";
export const opp = (s: Side): Side => (s === "p" ? "a" : "p");

export const TURNS = 6;
export const HAND_MAX = 7;
const DECK_SIZE = 12;
const START_HAND = 3;
const LOC_COUNT = 3;
export const MIN_POOL = DECK_SIZE;

export type Token = "pigeon" | "ghoul" | "turret" | "rat";
export type CardFace = { id?: string; name: string; hero: string | null; c1: string; c2: string; token?: Token; role?: string };
/** Nome para o log: texto do jogador ou ficha (traduzida na tela). */
export type Name = string | { token: Token };

type Status = {
  tmp: { v: number; u: number }[];
  burrow?: boolean; stun?: number; immune?: boolean; riposte?: boolean; ripV?: number; chained?: boolean; silenced?: boolean;
  burn?: number; revived?: boolean; moved?: boolean; poison?: boolean; ch?: number; wolf?: boolean;
};

export type GCard = {
  id: number; p: CardFace; cost: number; base: number; ab: AbilityKey; v: number; desc: string;
  bonus: number; side: Side; rev: boolean; staged: boolean; st: Status; tok?: boolean;
};

export type Loc = { L: GameLoc; rev: boolean; s: Record<Side, GCard[]>; lock: Record<Side, number>; trap: Record<Side, number> };

export type LogEntry = { k: LogKey; c?: Name; t?: Name; a?: Name; loc?: string; v?: number; n?: number; ab?: AbilityKey; side?: Side; item?: ItemKey };
export type LogKey =
  | "riposte" | "victor" | "calicoBack" | "push" | "wall" | "pigeon" | "hook" | "chain" | "calico" | "celeste" | "danny" | "drifter"
  | "dynamo" | "owl" | "owlBonus" | "haze" | "barrel" | "infernus" | "ivy" | "kelvin" | "geist" | "lash" | "turret" | "mirage"
  | "burrow" | "harrow" | "paige" | "paradox" | "pocket" | "rats" | "rem" | "shiv" | "wolf" | "sinclair" | "hotel" | "trap"
  | "vindicta" | "cube" | "poison" | "wraith" | "yamato" | "extraSouls" | "hookPull" | "trapHit" | "urn" | "boss" | "zipline" | "hotelBack"
  | "item" | "shop";

export type Result = { outcome: "win" | "loss" | "draw"; won: number; lost: number; myPower: number; aiPower: number; patron: boolean };
export type PlayError = "souls" | "frozen" | "full";

/** Cartas que entram no baralho: jogadores ativos, uma por jogador (variantes ficam de fora). */
export function cardPool(players: Player[]): PoolCard[] {
  const seen = new Set<string>();
  const pool = players
    .filter((p) => !p.inactive)
    .filter((p) => {
      const k = p.variantOf || p.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p) => ({ id: p.id, name: p.name, position: ROLE_ABILITY[p.position] ? p.position : "Flex", hero: p.hero, c1: p.c1 || "#334155", c2: p.c2 || "#0f172a", ovr: getPlayerOvr(p) || 0 }));
  // custo pelo ranking de OVR: o baralho sempre tem a mesma curva de custos, por mais que os OVRs se aglomerem
  const sorted = pool.map((p) => p.ovr).sort((a, b) => a - b);
  return pool.map((p) => ({ ...p, rank: sorted.findIndex((o) => o >= p.ovr) / pool.length }));
}

const nst = (): Status => ({ tmp: [] });

const isGun = (c: GCard) => c.p.role === "Carry" || c.p.role === "OffCarry";
const isFront = (c: GCard) => c.p.role === "Frontline";
const SUPPORT = new Set<AbilityKey>(["Ivy", "Kelvin", "Nurse Harrow", "Paige", "Viscous", "team", "aura"]);
const onReveal = (c: GCard) => ABILITIES[c.ab].kind === "r";

/** Com o que cada item combina: cartas (função, habilidade, custo) e tipo de local. Usado pela IA e pela tela do draft. */
const ITEM_FIT: Partial<Record<ItemKey, { card?: (c: GCard) => boolean; loc?: LocType }>> = {
  "High-Velocity Rounds": { card: isGun },
  "Extra Spirit": { card: (c) => onReveal(c) && ABILITIES[c.ab].usesV },
  "Golden Goose Egg": { loc: "urn" },
  "Swift Striker": { card: (c) => c.cost <= 3, loc: "costLow" },
  "Battle Vest": { card: isFront },
  "Healing Booster": { card: (c) => SUPPORT.has(c.ab) },
  "Arcane Surge": { card: onReveal, loc: "ritual" },
  "Toxic Bullets": { card: isGun },
  "Superior Cooldown": { card: (c) => ABILITIES[c.ab].kind === "f", loc: "endturn" },
  "Glass Cannon": { card: isGun },
  "Colossus": { card: isFront },
  "Echo Shard": { card: onReveal, loc: "ritual" },
  "Refresher": { card: onReveal },
};

export type ItemFit = { cards: number; loc: string | null };

type Impl ={ r?: (c: GCard, l: Loc, v: number) => void; f?: (c: GCard, l: Loc, v: number) => void };

export class Match {
  t = 0;
  /** Almas do jogador (E) e da IA (AE) neste turno. */
  E = 0;
  AE = 0;
  extra: Record<Side, number> = { p: 0, a: 0 };
  hook: Record<Side, number | null> = { p: null, a: null };
  last: Record<Side, GCard | null> = { p: null, a: null };
  pend: { t: number; f: () => void }[] = [];
  hotel: { c: GCard; l: Loc; t: number; v: number }[] = [];
  log: LogEntry[] = [];
  final = false;
  busy = false;
  loc: Loc[];
  deck: GCard[];
  adeck: GCard[];
  hand: GCard[] = [];
  ahand: GCard[] = [];
  result: Result | null = null;
  /** Draft do turno 5: as 3 opções de cada lado (mesmos tiers, itens sorteados à parte) e a escolha. */
  offer: Record<Side, ItemKey[]> | null = null;
  picked: Record<Side, ItemKey | null> = { p: null, a: null };
  /** Itens revelados (turno 6 em diante) e quanto cada lado pagou. */
  itemsOn = false;
  paid: Record<Side, number> = { p: 0, a: 0 };
  /** Desconto no item para quem venceu a Loja Secreta no fim do turno 5. */
  discount: Record<Side, number> = { p: 0, a: 0 };
  private uid = 0;

  constructor(private cfg: GameConfig, pool: PoolCard[], private rnd: () => number = Math.random) {
    this.loc = this.sh(cfg.locs).slice(0, LOC_COUNT).map((L) => ({ L, rev: false, s: { p: [], a: [] }, lock: { p: 0, a: 0 }, trap: { p: 0, a: 0 } }));
    this.deck = this.sh(pool).slice(0, DECK_SIZE).map((p) => this.mk(p, cfg, "p"));
    this.adeck = this.sh(pool).slice(0, DECK_SIZE).map((p) => this.mk(p, cfg, "a"));
    for (let i = 0; i < START_HAND; i++) { this.draw("p"); this.draw("a"); }
    this.nextTurn();
  }

  /* ---------- utilitários ---------- */
  private sh<T>(a: T[]): T[] {
    return a.map((x) => [this.rnd(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  }
  private mk(p: PoolCard, cfg: GameConfig, side: Side): GCard {
    const c = cardStats(p, cfg.cards);
    return { id: ++this.uid, p: { id: p.id, name: p.name, hero: p.hero, c1: p.c1, c2: p.c2, role: p.position }, cost: c.cost, base: c.power, ab: c.ab, v: Number(c.v) || 0, desc: c.desc, bonus: 0, side, rev: false, staged: false, st: nst() };
  }
  private token(side: Side, token: Token, power: number): GCard {
    return { id: ++this.uid, p: { name: "", hero: null, c1: "#44403c", c2: "#1c1917", token }, cost: 1, base: power, ab: "none", v: 0, desc: "", bonus: 0, side, rev: false, staged: false, st: nst(), tok: true };
  }
  private N = (c: GCard): Name => (c.p.token ? { token: c.p.token } : c.p.name);
  private say(e: LogEntry) { this.log.unshift(e); this.log.length = Math.min(this.log.length, 3); }
  private handOf = (s: Side) => (s === "p" ? this.hand : this.ahand);

  locOf = (c: GCard) => this.loc.find((l) => l.s[c.side].includes(c));
  live = (l: Loc) => l.rev;
  private ty = (l: Loc | undefined, t: GameLoc["type"]) => !!l && l.rev && l.L.type === t;
  cap = (l: Loc) => (this.ty(l, "slots") ? Math.max(1, Math.min(4, l.L.n)) : 4);
  room = (l: Loc, s: Side) => l.s[s].length < this.cap(l);
  private foes = (c: GCard, l: Loc) => l.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow);
  private tg = (a: GCard[]) => a.filter((x) => !x.st.immune);
  private friends = (c: GCard, l: Loc) => l.s[c.side].filter((x) => x !== c && x.rev && !x.st.burrow);
  private everywhere = (s: Side) => this.loc.flatMap((l) => l.s[s].filter((x) => x.rev && !x.st.burrow).map((x) => [x, l] as const));
  private foeCards = (c: GCard) => this.everywhere(opp(c.side)).map((x) => x[0]);
  abilityOf = (c: GCard): AbilityKey => (c.st.silenced ? "none" : c.ab);
  private best<T>(a: T[], f: (x: T) => number): T | null {
    return a.length ? a.reduce((x, y) => (f(y) > f(x) ? y : x)) : null;
  }
  private strongest = (a: GCard[]) => this.best(this.sh(a), (x) => this.pow(x));
  private weakest = (a: GCard[]) => this.best(this.sh(a), (x) => -this.pow(x));
  private pickLoc = (from: Loc, s: Side) => this.sh(this.loc.filter((L) => L !== from && this.room(L, s)))[0];

  /** Poder atual da carta no local (com bônus, auras, efeitos do local e status). */
  pow(c: GCard, l?: Loc): number {
    l = l ?? this.locOf(c);
    if (!l) return c.base + c.bonus;
    if (c.st.burrow && !this.final) return 0;
    if ((c.st.stun ?? 0) >= this.t) return 0;
    let x = c.base + c.bonus;
    c.st.tmp.forEach((m) => { if (this.t <= m.u) x += m.v; });
    l.s[c.side].forEach((o) => { if (o !== c && o.rev && this.abilityOf(o) === "aura") x += o.v; });
    if (c.p.token === "rat") this.loc.forEach((L) => L.s[c.side].forEach((o) => { if (o.rev && this.abilityOf(o) === "Rat King") x += o.v; }));
    const a = this.abilityOf(c);
    if (a === "Warden") x += c.v * l.s[opp(c.side)].filter((o) => o.rev).length;
    if (a === "Solomon" && l.s[c.side].length >= this.cap(l)) x += c.v;
    if (a === "Mo & Krill" && this.final) x += c.v;
    if (this.ty(l, "costLow") && c.cost <= l.L.n) x += l.L.v;
    if (this.ty(l, "costHigh") && c.cost >= l.L.n) x += l.L.v;
    if (this.active(c.side, "Swift Striker") && c.cost <= 3) x += this.itemV("Swift Striker");
    return Math.max(0, x);
  }
  total = (l: Loc, s: Side) => l.s[s].filter((c) => c.rev).reduce((a, c) => a + this.pow(c, l), 0);

  private hurt(t: GCard | null | undefined, amt: number, src: GCard | null, until?: number): boolean {
    const l = t && this.locOf(t);
    if (!t || !l || amt <= 0) return false;
    if (t.st.immune || this.ty(l, "shrine")) return false;
    if (t.st.riposte && src && src.side !== t.side) {
      t.st.riposte = false;
      this.say({ k: "riposte", c: this.N(t), t: this.N(src) });
      if (this.locOf(src)) this.hurt(src, t.st.ripV ?? 2, null);
      return false;
    }
    if (until) t.st.tmp.push({ v: -amt, u: until });
    else t.bonus -= amt;
    return true;
  }
  private move(c: GCard, from: Loc | undefined, to: Loc | undefined): boolean {
    if (!from || !to || from === to || c.st.chained || !this.room(to, c.side)) return false;
    from.s[c.side].splice(from.s[c.side].indexOf(c), 1);
    to.s[c.side].push(c);
    return true;
  }
  private destroy(c: GCard): boolean {
    const l = this.locOf(c);
    if (!l || c.st.immune) return false;
    l.s[c.side].splice(l.s[c.side].indexOf(c), 1);
    if (this.abilityOf(c) === "Victor" && !c.st.revived) {
      c.st.revived = true;
      c.bonus += c.v;
      l.s[c.side].push(c);
      this.say({ k: "victor", c: this.N(c) });
      l.s[opp(c.side)].filter((x) => x.rev).forEach((x) => this.hurt(x, 1, c));
      return true;
    }
    if (this.abilityOf(c) === "Calico") {
      const h = this.handOf(c.side);
      if (h.length < HAND_MAX) { c.rev = false; c.bonus = 0; c.st = nst(); h.push(c); this.say({ k: "calicoBack", c: this.N(c) }); }
    }
    return true;
  }
  private draw(s: Side) {
    const d = s === "p" ? this.deck : this.adeck, h = this.handOf(s);
    const c = d.pop();
    if (c && h.length < HAND_MAX) h.push(c);
    else if (c) d.push(c);
  }

  /* ---------- habilidades ---------- */
  private IMPL: Partial<Record<AbilityKey, Impl>> = {
    "Abrams": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      const to = this.pickLoc(l, t.side);
      if (to && this.move(t, l, to)) this.say({ k: "push", c: this.N(c), t: this.N(t), loc: to.L.name });
      else if (this.hurt(t, v, c)) this.say({ k: "wall", t: this.N(t), v });
    } },
    "Apollo": { r: (c, _l, v) => { c.st.riposte = true; c.st.ripV = v; } },
    "Baba": { r: (c, l, v) => {
      const t = this.best(this.sh(this.tg(this.foes(c, l))), (x) => x.cost);
      if (!t) return;
      this.say({ k: "pigeon", t: this.N(t) });
      t.p = { ...t.p, name: "", hero: null, c1: "#71717a", c2: "#27272a", token: "pigeon" };
      t.base = v; t.bonus = 0; t.ab = "none"; t.desc = ""; t.st = nst();
    } },
    "Bebop": { r: (c, l) => { this.hook[opp(c.side)] = this.loc.indexOf(l); this.say({ k: "hook", c: this.N(c), loc: l.L.name }); } },
    "Billy": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (t && (this.hurt(t, v, c) || v === 0)) { t.st.chained = true; t.st.silenced = true; t.st.riposte = false; this.say({ k: "chain", c: this.N(c), t: this.N(t) }); }
    } },
    "Calico": { r: (c, l, v) => { const t = this.sh(this.tg(this.foes(c, l)))[0]; if (t && this.hurt(t, v, c)) this.say({ k: "calico", c: this.N(c), t: this.N(t), v }); } },
    "Celeste": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      this.hurt(t, v, c);
      const o = this.sh(this.tg(this.foeCards(c)).filter((x) => x !== t))[0];
      if (o) this.hurt(o, 1, c);
      this.say({ k: "celeste", c: this.N(c) });
    } },
    "Deadman Danny": { r: (c, _l, v) => {
      this.sh(this.tg(this.foeCards(c))).slice(0, 2).forEach((t) => { if (this.hurt(t, 1, c)) t.st.burn = (t.st.burn ?? 0) + v; });
      this.say({ k: "danny", c: this.N(c) });
    } },
    "Drifter": { r: (c, l, v) => {
      const f = this.foes(c, l);
      if (f.length === 1 && !f[0].st.immune && this.hurt(f[0], v, c)) { c.bonus += v; this.say({ k: "drifter", c: this.N(c), t: this.N(f[0]) }); }
    } },
    "Dynamo": { r: (c, l, v) => {
      this.loc.filter((L) => L !== l).forEach((L) => {
        const t = this.weakest(this.tg(L.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow)));
        if (t && this.move(t, L, l)) { this.hurt(t, v, c); this.say({ k: "dynamo", t: this.N(t) }); }
      });
    } },
    "Graves": { f: (c, l, v) => { if (this.room(l, c.side)) { const k = this.token(c.side, "ghoul", v); k.rev = true; l.s[c.side].push(k); } } },
    "Grey Talon": { r: (c, _l, v) => {
      const t = this.strongest(this.tg(this.foeCards(c)));
      if (t && this.hurt(t, v, c)) {
        this.say({ k: "owl", t: this.N(t), v });
        if (this.pow(t) === 0) { c.bonus += 2; this.say({ k: "owlBonus", c: this.N(c) }); }
      }
    } },
    "Haze": { r: (c, l, v) => {
      let n = 0;
      this.foes(c, l).forEach((t) => { if (this.hurt(t, v, c)) n++; });
      c.bonus += n * v;
      if (n) this.say({ k: "haze", c: this.N(c), n });
    } },
    "Holliday": { r: (c, l, v) => {
      const s = c.side;
      this.pend.push({ t: this.t + 1, f: () => { l.s[opp(s)].filter((x) => x.rev).forEach((x) => this.hurt(x, v, null)); this.say({ k: "barrel", loc: l.L.name }); } });
    } },
    "Infernus": { r: (c, l, v) => {
      this.foes(c, l).forEach((t) => { if (!t.st.immune && !this.ty(l, "shrine")) t.st.burn = (t.st.burn ?? 0) + v; });
      this.say({ k: "infernus", c: this.N(c), loc: l.L.name });
    } },
    "Ivy": { r: (c, l, v) => {
      const a = this.strongest(this.loc.filter((L) => L !== l).flatMap((L) => L.s[c.side].filter((x) => x.rev)));
      if (a) { a.bonus += v; c.bonus += v; this.say({ k: "ivy", c: this.N(c), t: this.N(a) }); }
    } },
    "Kelvin": { r: (c, l, v) => { l.lock[opp(c.side)] = this.t + 1; this.friends(c, l).forEach((x) => (x.bonus += v)); this.say({ k: "kelvin", loc: l.L.name }); } },
    "Lady Geist": { r: (c, l) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      const a = this.pow(c, l), b = this.pow(t, l);
      if (b > a && this.hurt(t, b - a, c)) { c.bonus += b - a; this.say({ k: "geist", c: this.N(c), t: this.N(t) }); }
    } },
    "Lash": { r: (c, l, v) => {
      this.sh(this.tg(this.foes(c, l))).slice(0, 2).forEach((t) => {
        const d = this.pickLoc(l, t.side);
        if (d && this.move(t, l, d)) { this.hurt(t, v, c); this.say({ k: "lash", c: this.N(c), t: this.N(t), loc: d.L.name }); }
      });
    } },
    "McGinnis": { r: (c, l, v) => {
      const L = this.pickLoc(l, c.side) ?? (this.room(l, c.side) ? l : null);
      if (L) { const k = this.token(c.side, "turret", v); k.rev = true; L.s[c.side].push(k); this.say({ k: "turret", c: this.N(c), loc: L.L.name }); }
    } },
    "Mina": { f: (c, l, v) => { const t = this.sh(this.tg(this.foes(c, l)))[0]; if (t && this.hurt(t, v, c)) c.bonus += v; } },
    "Mirage": { f: (c, l, v) => {
      if (c.st.moved) return;
      const L = this.best(this.loc.filter((L) => L !== l && this.room(L, c.side)), (L) => -Math.abs(this.total(L, "p") - this.total(L, "a")));
      if (L && this.move(c, l, L)) { c.bonus += v; c.st.moved = true; this.say({ k: "mirage", c: this.N(c), loc: L.L.name }); }
    } },
    "Mo & Krill": { r: (c) => { c.st.burrow = true; this.say({ k: "burrow", c: this.N(c) }); } },
    "Nurse Harrow": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      const a = this.weakest([c, ...this.friends(c, l)])!;
      if (t && this.hurt(t, v, c)) { a.bonus += v; this.say({ k: "harrow", c: this.N(c), t: this.N(t), a: this.N(a) }); }
    } },
    "Paige": { r: (c, _l, v) => { this.everywhere(c.side).forEach(([x]) => { if (x !== c) x.bonus += v; }); this.say({ k: "paige", c: this.N(c) }); } },
    "Paradox": { r: (c, l) => {
      if (c.st.chained || !this.room(l, opp(c.side))) return;
      const opts = this.loc.filter((L) => L !== l && this.room(L, c.side))
        .flatMap((L) => this.tg(L.s[opp(c.side)].filter((x) => x.rev && !x.st.burrow && !x.st.chained)).map((t) => [t, L] as const));
      const p = this.best(this.sh(opts), (x) => this.pow(x[0]));
      if (!p) return;
      const [t, L] = p;
      L.s[t.side].splice(L.s[t.side].indexOf(t), 1); l.s[t.side].push(t);
      l.s[c.side].splice(l.s[c.side].indexOf(c), 1); L.s[c.side].push(c);
      this.say({ k: "paradox", c: this.N(c), t: this.N(t) });
    } },
    "Pocket": { r: (c, _l, v) => { this.everywhere(opp(c.side)).forEach(([t]) => this.hurt(t, v, c)); this.say({ k: "pocket", c: this.N(c) }); } },
    "Rat King": { r: (c) => {
      const h = this.handOf(c.side);
      for (let i = 0; i < 2; i++) if (h.length < HAND_MAX) h.push(this.token(c.side, "rat", 1));
      this.say({ k: "rats", c: this.N(c) });
    } },
    "Rem": { r: (c, l, v) => {
      let n = 0;
      this.foes(c, l).forEach((t) => { if (this.hurt(t, v, c, this.t + 1)) n++; });
      if (n) this.say({ k: "rem", c: this.N(c), n });
    } },
    "Seven": { f: (c, l, v) => { this.foes(c, l).forEach((t) => this.hurt(t, v, c)); } },
    "Shiv": { r: (c, l, v) => { const t = this.weakest(this.tg(this.foes(c, l))); if (t && this.pow(t, l) <= v && this.destroy(t)) this.say({ k: "shiv", c: this.N(c), t: this.N(t) }); } },
    "Silver": { f: (c, _l, v) => { c.st.ch = (c.st.ch ?? 0) + 1; if (c.st.ch === 2) { c.bonus += v; c.st.wolf = true; this.say({ k: "wolf", c: this.N(c) }); } } },
    "Sinclair": { r: (c, l) => {
      const s = this.last[opp(c.side)];
      const impl = s && s.ab !== "Sinclair" ? this.IMPL[s.ab] : undefined;
      if (s && impl?.r) { this.say({ k: "sinclair", c: this.N(c), ab: s.ab }); impl.r(c, l, s.v); }
    } },
    "The Doorman": { r: (c, l, v) => {
      const t = this.strongest(this.tg(this.foes(c, l)).filter((x) => !x.st.chained));
      if (!t) return;
      l.s[t.side].splice(l.s[t.side].indexOf(t), 1);
      this.hotel.push({ c: t, l, t: this.t + 1, v });
      this.say({ k: "hotel", t: this.N(t) });
    } },
    "Venator": { r: (c, l, v) => { l.trap[opp(c.side)] = v; this.say({ k: "trap", c: this.N(c), loc: l.L.name }); } },
    "Vindicta": { r: (c, _l, v) => {
      const t = this.weakest(this.tg(this.foeCards(c)));
      if (t && this.pow(t) <= v && this.destroy(t)) { this.extra[c.side] += 1; this.say({ k: "vindicta", c: this.N(c), t: this.N(t) }); }
    } },
    "Violet": { f: (c, _l, v) => { const n = this.loc.filter((L) => this.total(L, c.side) > this.total(L, opp(c.side))).length; c.bonus += v * n; } },
    "Viscous": { r: (c, l, v) => { const a = this.weakest([c, ...this.friends(c, l)])!; a.st.immune = true; a.bonus += v; this.say({ k: "cube", c: this.N(c), t: this.N(a) }); } },
    "Vyper": { r: (c, l) => {
      const t = this.strongest(this.tg(this.foes(c, l)));
      if (!t) return;
      t.st.poison = true;
      this.pend.push({ t: this.t + 1, f: () => {
        if (!this.locOf(t)) return;
        const p = this.pow(t);
        t.st.poison = false;
        if (this.hurt(t, Math.ceil(p / 2), null)) this.say({ k: "poison", t: this.N(t) });
      } });
    } },
    "Warden": { r: (c) => { c.st.immune = true; } },
    "Wraith": { r: (c, l) => { const t = this.strongest(this.tg(this.foes(c, l))); if (t) { t.st.stun = this.t + 1; this.say({ k: "wraith", c: this.N(c), t: this.N(t) }); } } },
    "Yamato": { r: (c, l, v) => {
      const mine = this.total(l, c.side) - this.pow(c, l), th = this.total(l, opp(c.side));
      if (mine < th) { c.bonus += v; c.st.immune = true; this.say({ k: "yamato", c: this.N(c) }); }
    } },
    self: { r: (c, _l, v) => { c.bonus += v; } },
    hit: { r: (c, l, v) => { const t = this.sh(this.tg(this.foes(c, l)))[0]; if (t) this.hurt(t, v, c); } },
    team: { r: (c, l, v) => { this.friends(c, l).forEach((x) => (x.bonus += v)); } },
    draw: { r: (c, _l, v) => { for (let i = 0; i < v; i++) this.draw(c.side); } },
  };

  /* ---------- itens da loja ---------- */
  itemV = (k: ItemKey) => itemStats(k, this.cfg.items).v;
  /** O item está revelado e em efeito para este lado. */
  active = (s: Side, k: ItemKey) => this.itemsOn && this.picked[s] === k;
  private mine = (s: Side) => this.everywhere(s).map((x) => x[0]);
  private addSouls(s: Side, n: number) { if (s === "p") this.E += n; else this.AE += n; }
  private leading = (s: Side, l: Loc) => this.total(l, s) > this.total(l, opp(s));

  /** Efeito de cada item na revelação (início do turno 6). Itens contínuos agem em pow/reveal/endOfTurn. */
  private ITEM_FX: Partial<Record<ItemKey, (s: Side, v: number) => void>> = {
    "High-Velocity Rounds": (s, v) => this.mine(s).filter(isGun).forEach((c) => (c.bonus += v)),
    "Close Quarters": (s, v) => this.loc.forEach((l) => {
      if (l.s[opp(s)].filter((c) => c.rev).length >= l.s[s].filter((c) => c.rev).length) l.s[s].forEach((c) => { if (c.rev) c.bonus += v; });
    }),
    "Extra Health": (s, v) => this.mine(s).forEach((c) => (c.bonus += v)),
    "Healing Rite": (s, v) => {
      this.mine(s).forEach((c) => {
        const st = c.st;
        if (!st.burn && !st.poison && (st.stun ?? 0) < this.t && !st.tmp.some((m) => m.v < 0 && this.t <= m.u)) return;
        st.burn = 0; st.poison = false; st.stun = 0; st.tmp = st.tmp.filter((m) => m.v >= 0);
        c.bonus += v;
      });
      const w = this.weakest(this.mine(s));
      if (w) w.bonus += v;
    },
    "Extra Spirit": (s, v) => this.mine(s).filter((c) => ABILITIES[this.abilityOf(c)].hero).forEach((c) => (c.bonus += v)),
    "Golden Goose Egg": (s, v) => this.addSouls(s, v + (this.loc.some((l) => this.ty(l, "urn") && this.leading(s, l)) ? 2 : 0)),
    "Long Range": (s, v) => this.loc.forEach((l) => { if (this.leading(opp(s), l)) l.s[s].forEach((c) => { if (c.rev) c.bonus += v; }); }),
    "Battle Vest": (s, v) => this.mine(s).forEach((c) => (c.bonus += isFront(c) ? v + 2 : 2)),
    "Healing Booster": (s, v) => this.mine(s).forEach((c) => (c.bonus += 2 + (SUPPORT.has(this.abilityOf(c)) ? v : 0))),
    "Arcane Surge": (s, v) => {
      const c = this.strongest(this.mine(s).filter((x) => this.IMPL[this.abilityOf(x)]?.r));
      if (!c) return;
      c.bonus += v;
      for (let i = 0, n = this.ty(this.locOf(c), "ritual") ? 2 : 1; i < n; i++) { const at = this.locOf(c); if (at) this.IMPL[this.abilityOf(c)]?.r?.(c, at, c.v); }
    },
    "Slowing Hex": (s, v) => {
      const t = this.strongest(this.tg(this.mine(opp(s))));
      if (!t) return;
      this.hurt(t, v, null);
      t.st.silenced = true; t.st.riposte = false;
    },
    "Toxic Bullets": (s, v) => this.loc.forEach((l) => {
      if (this.ty(l, "shrine")) return;
      const n = l.s[s].some((c) => c.rev && isGun(c)) ? v + 3 : v;
      this.tg(l.s[opp(s)].filter((c) => c.rev)).forEach((c) => (c.st.burn = (c.st.burn ?? 0) + n));
    }),
    "Sharpshooter": (s, v) => { const top = this.strongest(this.mine(s)); this.mine(s).forEach((c) => (c.bonus += c === top ? v : 2)); },
    "Metal Skin": (s, v) => this.mine(s).forEach((c) => { c.st.immune = true; c.bonus += v; }),
    "Rescue Beam": (s, v) => {
      const c = this.weakest(this.mine(s));
      if (!c) return;
      c.bonus += v;
      const from = this.locOf(c);
      const to = this.best(this.loc.filter((l) => l !== from && this.room(l, s) && this.leading(opp(s), l)), (l) => this.total(l, s) - this.total(l, opp(s)));
      this.move(c, from, to ?? undefined);
    },
    "Glass Cannon": (s, v) => this.mine(s).forEach((c) => (c.bonus += isGun(c) ? v : 2)),
    "Ricochet": (s, v) => this.loc.forEach((l) => this.hurt(this.strongest(this.tg(l.s[opp(s)].filter((c) => c.rev && !c.st.burrow))), v, null)),
    "Colossus": (s, v) => {
      const l = this.best(this.sh(this.loc), (L) => L.s[s].filter((c) => c.rev).length);
      l?.s[s].forEach((c) => { if (c.rev) c.bonus += v + (isFront(c) ? v : 0); });
    },
    "Surge of Power": (s, v) => this.mine(s).filter((c) => ABILITIES[this.abilityOf(c)].kind === "r").forEach((c) => (c.bonus += v)),
    "Unstoppable": (s, v) => this.mine(s).forEach((c) => { c.st.chained = false; c.st.silenced = false; c.st.stun = 0; c.bonus += v; }),
    "Echo Shard": (s, v) => {
      const top = this.strongest(this.mine(s));
      const echoes = this.sh(this.mine(s).filter((c) => c !== top)).slice(0, 2);
      [top, ...echoes].forEach((c) => { if (c) c.bonus += v; });
    },
    "Refresher": (s, v) => this.mine(s).forEach((c) => {
      const at = this.locOf(c);
      if (at && c.rev) this.IMPL[this.abilityOf(c)]?.r?.(c, at, c.v);
      if (this.locOf(c)) c.bonus += v;
    }),
  };

  /** Quantas cartas suas (mão e mesa) e qual local em jogo combinam com o item. */
  itemFit(s: Side, k: ItemKey): ItemFit {
    const f = ITEM_FIT[k];
    const cards = f?.card ? [...this.handOf(s), ...this.loc.flatMap((l) => l.s[s])].filter((c) => !c.tok && f.card!(c)).length : 0;
    const loc = f?.loc ? this.loc.find((l) => l.L.type === f.loc)?.L.name ?? null : null;
    return { cards, loc };
  }

  private itemsOfTier = (t: ItemTier) => ITEM_KEYS.filter((k) => ITEMS[k].tier === t && itemStats(k, this.cfg.items).on);

  private openShop() {
    const avail = ITEM_TIERS.filter((t) => this.itemsOfTier(t).length);
    if (!avail.length) return;
    // mesma combinação de tiers para os dois lados; tiers diferentes entre si quando dá
    const tiers = this.sh(avail).slice(0, 3);
    while (tiers.length < 3) tiers.push(this.sh(avail)[0]);
    tiers.sort((a, b) => a - b);
    const draft = () => {
      const out: ItemKey[] = [];
      for (const t of tiers) {
        const opts = this.itemsOfTier(t);
        out.push(this.sh(opts.filter((k) => !out.includes(k)))[0] ?? this.sh(opts)[0]);
      }
      return out;
    };
    this.offer = { p: draft(), a: draft() };
    this.picked.a = this.best(this.sh(this.offer.a), (k) => {
      const fit = this.itemFit("a", k);
      return ITEMS[k].tier + 0.6 * fit.cards + (fit.loc ? 1.5 : 0) + this.rnd() * 1.5;
    });
  }

  /** O jogador ainda precisa escolher o item antes de fechar o turno. */
  get needsPick() { return this.t === ITEM_OFFER_TURN && !!this.offer && !this.picked.p; }

  pick(k: ItemKey) {
    if (this.busy || this.t !== ITEM_OFFER_TURN || !this.offer?.p.includes(k)) return;
    this.picked.p = k;
  }

  /** Custo final do item: tier em almas, menos o desconto da Loja Secreta. */
  itemPrice = (s: Side, k: ItemKey) => Math.max(0, itemCost(ITEMS[k].tier) - this.discount[s]);

  private revealItems() {
    this.itemsOn = true;
    for (const s of (this.t % 2 ? ["p", "a"] : ["a", "p"]) as Side[]) {
      const k = this.picked[s];
      if (!k) continue;
      this.paid[s] = this.itemPrice(s, k);
      if (s === "p") this.E = Math.max(0, this.E - this.paid.p);
      else this.AE = Math.max(0, this.AE - this.paid.a);
      this.say({ k: "item", side: s, item: k });
      this.ITEM_FX[k]?.(s, this.itemV(k));
    }
  }

  /* ---------- turnos ---------- */
  nextTurn() {
    this.t++;
    this.E = this.t + this.extra.p;
    this.AE = this.t + this.extra.a;
    if (this.extra.p) this.say({ k: "extraSouls", n: this.extra.p });
    this.extra = { p: 0, a: 0 };
    this.draw("p");
    this.draw("a");
    if (this.t <= LOC_COUNT) this.loc[this.t - 1].rev = true;
    if (this.t === ITEM_OFFER_TURN) this.openShop();
    if (this.t === ITEM_REVEAL_TURN) this.revealItems();
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
  }

  /** Fecha o turno: a IA joga e devolve a ordem de revelação (alternando lados; quem começa troca a cada turno). */
  endTurn(): [GCard, Loc][] {
    if (this.busy || this.needsPick) return [];
    this.busy = true;
    this.aiPlay();
    const pc: [GCard, Loc][] = [], ac: [GCard, Loc][] = [];
    this.loc.forEach((l) => { l.s.p.forEach((c) => !c.rev && pc.push([c, l])); l.s.a.forEach((c) => !c.rev && ac.push([c, l])); });
    const [f, s] = this.t % 2 ? [pc, ac] : [ac, pc];
    const q: [GCard, Loc][] = [];
    while (f.length || s.length) { const x = f.shift(); if (x) q.push(x); const y = s.shift(); if (y) q.push(y); }
    return q;
  }

  reveal(c: GCard, l: Loc) {
    const s = c.side;
    const cur = this.locOf(c);
    if (!cur) return;
    l = cur;
    const h = this.hook[s];
    if (h !== null) {
      this.hook[s] = null;
      const T = this.loc[h];
      if (T !== l && this.move(c, l, T)) { this.say({ k: "hookPull", c: this.N(c), loc: T.L.name }); l = T; }
    }
    c.rev = true;
    c.staged = false;
    if (l.trap[s]) { const v = l.trap[s]; l.trap[s] = 0; if (this.hurt(c, v, null)) this.say({ k: "trapHit", c: this.N(c), v }); }
    if (this.ty(l, "enter")) c.bonus += l.L.v;
    if (this.ty(l, "chaos")) { c.base = 1 + Math.floor(this.rnd() * Math.max(1, l.L.n)); c.bonus = 0; }
    if (this.ty(l, "loot")) for (let i = 0; i < l.L.v; i++) this.draw(s);
    if (this.active(s, "Metal Skin")) c.st.immune = true;
    const impl = this.IMPL[c.ab];
    if (impl?.r) {
      for (let i = 0, n = this.ty(l, "ritual") ? 2 : 1; i < n; i++) { const at = this.locOf(c); if (at) impl.r(c, at, c.v); }
      this.last[s] = c;
    }
  }

  endOfTurn() {
    this.loc.forEach((l) => [...l.s.p, ...l.s.a].forEach((c) => {
      for (let i = 0, n = this.active(c.side, "Superior Cooldown") ? 2 : 1; i < n; i++) {
        const L = this.locOf(c);
        if (c.rev && L === l) this.IMPL[this.abilityOf(c)]?.f?.(c, L, c.v);
      }
    }));
    (["p", "a"] as const).forEach((s) => { if (this.active(s, "Superior Cooldown")) this.mine(s).forEach((c) => (c.bonus += this.itemV("Superior Cooldown"))); });
    this.pend.filter((p) => p.t === this.t).forEach((p) => p.f());
    this.pend = this.pend.filter((p) => p.t !== this.t);
    this.loc.forEach((l) => [...l.s.p, ...l.s.a].forEach((c) => { if (c.rev && c.st.burn) this.hurt(c, c.st.burn, null); }));
    this.loc.forEach((l) => {
      if (!l.rev) return;
      const p = this.total(l, "p"), a = this.total(l, "a"), lead: Side | null = p > a ? "p" : a > p ? "a" : null;
      if (this.ty(l, "endturn")) [...l.s.p, ...l.s.a].forEach((c) => { if (c.rev) c.bonus += l.L.v; });
      if (this.ty(l, "urn") && lead) { this.extra[lead] += l.L.v; this.say({ k: "urn", side: lead }); }
      if (this.ty(l, "shop") && this.t === ITEM_OFFER_TURN && lead) { this.discount[lead] += l.L.v; this.say({ k: "shop", side: lead, v: l.L.v }); }
      if (this.ty(l, "midboss") && this.t === l.L.n && lead) { this.everywhere(lead).forEach(([x]) => (x.bonus += l.L.v)); this.say({ k: "boss", side: lead }); }
      if (this.ty(l, "zipline")) (["p", "a"] as const).forEach((s) => {
        const w = this.weakest(l.s[s].filter((x) => x.rev && !x.st.chained));
        const d = w && this.pickLoc(l, s);
        if (w && d && this.move(w, l, d)) this.say({ k: "zipline", c: this.N(w), loc: d.L.name });
      });
    });
    this.hotel.filter((h) => h.t === this.t).forEach((h) => {
      const c = h.c;
      c.bonus -= h.v;
      if (this.room(h.l, c.side)) h.l.s[c.side].push(c);
      else { const hd = this.handOf(c.side); c.rev = false; if (hd.length < HAND_MAX) hd.push(c); }
      this.say({ k: "hotelBack", c: this.N(c) });
    });
    this.hotel = this.hotel.filter((h) => h.t !== this.t);
  }

  get over() { return this.t >= TURNS; }

  finish(): Result {
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
    if (this.needsPick) this.pick(this.offer!.p[0]);
    for (const [c, l] of this.endTurn()) this.reveal(c, l);
    this.endOfTurn();
    if (this.over) return this.finish();
    this.nextTurn();
    return null;
  }
}
