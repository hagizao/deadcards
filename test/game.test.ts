import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCS, HERO_STAT, ITEMS, ITEM_KEYS, cardStats, costByRank, defaultCard, gameConfig, heroStat, keywords, mastery, sanitizeGameConfig, trimItemIcons,
  type CardStatsBlock, type GameConfig, type GameLoc, type ItemKey, type PoolCard,
} from "../src/lib/game/config";
import { MIN_POOL, Match, TURNS, cardPool, type GCard, type Side } from "../src/lib/game/engine";
import type { Player } from "../src/lib/types";

function player(id: string, ovr: number, extra: Partial<Player> = {}): Player {
  return {
    id, name: id, teamId: "t1", hero: "Abrams", position: "Flex", ovr,
    stats: { MIR: ovr, MAC: ovr, SUP: ovr, MOV: ovr, POL: ovr, CON: ovr },
    c1: "#000000", c2: "#ffffff", history: [], ...extra,
  };
}

// gerador determinístico para as partidas simuladas
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const HEROES = ["Abrams", "Apollo", "Baba", "Bebop", "Billy", "Calico", "Celeste", "Deadman Danny", "Drifter", "Dynamo", "Graves", "Grey Talon", "Haze", "Holliday",
  "Infernus", "Ivy", "Kelvin", "Lady Geist", "Lash", "McGinnis", "Mina", "Mirage", "Mo & Krill", "Nurse Harrow", "Paige", "Paradox", "Pocket", "Rat King", "Rem",
  "Seven", "Shiv", "Silver", "Sinclair", "Solomon", "The Doorman", "Venator", "Victor", "Vindicta", "Violet", "Viscous", "Vyper", "Warden", "Wraith", "Yamato", "Desconhecido"];
const POSITIONS = ["Carry", "OffCarry", "Frontline", "Suporte", "Flex"];
const pool = cardPool(HEROES.map((hero, i) => player(`p${i}`, 70 + (i % 25), { hero, position: POSITIONS[i % 5] })));

describe("cardPool", () => {
  it("ignora inativos e variantes repetidas", () => {
    const list = cardPool([player("a", 80), player("b", 80, { inactive: true }), player("c", 80, { variantOf: "a" }), player("d", 80, { variantOf: "x" })]);
    expect(list.map((p) => p.id)).toEqual(["a", "d"]);
  });

  it("função desconhecida vira Flex", () => {
    expect(cardPool([player("a", 80, { position: "Coach" })])[0].position).toBe("Flex");
  });
});

describe("carta padrão", () => {
  const base: PoolCard = { id: "x", name: "Fulano", position: "Carry", hero: "Haze", c1: "#000", c2: "#fff", ovr: 92 };

  it("usa a habilidade do herói, ou a da função quando o herói não tem", () => {
    expect(defaultCard(base).ab).toBe("Haze");
    expect(defaultCard({ ...base, hero: "Herói Novo" }).ab).toBe("self");
  });

  it("custo fica entre 1 e 6 e cresce com o OVR", () => {
    expect(defaultCard({ ...base, ovr: 40 }).cost).toBe(1);
    expect(defaultCard({ ...base, ovr: 99 }).cost).toBe(6);
  });

  it("no baralho, o custo segue o ranking de OVR e cartas de custo 1 e 2 são as mais comuns", () => {
    // OVRs aglomerados em cima, como nos dados reais
    const list = cardPool(Array.from({ length: 50 }, (_, i) => player(`q${i}`, 80 + (i % 16))));
    const costs = list.map((p) => defaultCard(p).cost);
    const count = (c: number) => costs.filter((x) => x === c).length;
    expect(count(1) + count(2)).toBeGreaterThanOrEqual(list.length * 0.35);
    expect(count(6)).toBeGreaterThan(0);
    const byOvr = [...list].sort((a, b) => a.ovr - b.ovr).map((p) => defaultCard(p).cost);
    expect(byOvr).toEqual([...byOvr].sort((a, b) => a - b));
    expect(costByRank(0)).toBe(1);
    expect(costByRank(0.99)).toBe(6);
  });

  it("ajustes do admin sobrescrevem o padrão", () => {
    const c = cardStats(base, { x: { ab: "Pocket", cost: 2, desc: "  texto  " } });
    expect(c).toMatchObject({ ab: "Pocket", cost: 2, v: 2, desc: "texto" });
  });
});

describe("sanitizeGameConfig", () => {
  it("recusa formato errado ou menos de 3 locais", () => {
    expect(sanitizeGameConfig(null)).toBeNull();
    expect(sanitizeGameConfig({ locs: DEFAULT_LOCS.slice(0, 2) })).toBeNull();
    expect(sanitizeGameConfig({ locs: DEFAULT_LOCS, cards: [] })).toBeNull();
    expect(sanitizeGameConfig({ locs: DEFAULT_LOCS, cards: { "id inválido": {} } })).toBeNull();
  });

  it("limita valores, corta textos e descarta campos desconhecidos", () => {
    const g = sanitizeGameConfig({
      locs: [{ name: "x".repeat(50), type: "slots", v: 99, n: 9 }, { type: "inexistente" }, { type: "heavy", v: 3, n: 5 }],
      cards: { p1: { cost: 99, power: -5, ab: "Hacker", desc: "", extra: 1 }, p2: {} },
    })!;
    expect(g.locs[0]).toMatchObject({ name: "x".repeat(24), type: "slots", v: 10, n: 4 });
    expect(g.locs[1].type).toBe("none");
    expect(g.locs[2]).toMatchObject({ type: "costHigh", v: -3 });
    expect(g.cards).toEqual({ p1: { cost: 6, power: 0 } });
  });

  it("sem configuração salva, usa os locais padrão", () => {
    expect(gameConfig(undefined).locs).toHaveLength(DEFAULT_LOCS.length);
  });
});

describe("partida", () => {
  it("começa com 3 cartas + 1 comprada, 1 alma e o primeiro local revelado", () => {
    const m = new Match(gameConfig(undefined), pool, seeded(1));
    expect(m.t).toBe(1);
    expect(m.E).toBe(1);
    expect(m.hand).toHaveLength(4);
    expect(m.loc.map((l) => l.rev)).toEqual([true, false, false]);
  });

  it("jogar sem almas é recusado; jogar e desfazer devolve as almas", () => {
    const m = new Match(gameConfig(undefined), pool, seeded(2));
    m.E = 0;
    expect(m.play(m.hand[0], m.loc[0])).toBe("souls");
    m.E = 10;
    const c = m.hand[0];
    expect(m.play(c, m.loc[0])).toBeNull();
    expect(m.E).toBe(10 - c.cost);
    m.unstage(c);
    expect(m.E).toBe(10);
    expect(m.hand).toContain(c);
  });

  it(`partidas inteiras com todas as habilidades terminam em ${TURNS} turnos sem erro`, () => {
    expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL);
    for (let seed = 1; seed <= 200; seed++) {
      const m = new Match(gameConfig(undefined), pool, seeded(seed));
      let result = null;
      while (!result) {
        for (const c of [...m.hand].sort((a, b) => a.cost - b.cost)) {
          const l = m.loc.find((x) => !m.canPlay(c, x));
          if (l) m.play(c, l);
        }
        result = m.runEndTurn();
      }
      expect(m.t).toBe(TURNS);
      expect(["win", "loss", "draw"]).toContain(result.outcome);
      for (const l of m.loc) for (const s of ["p", "a"] as const) {
        expect(l.s[s].length).toBeLessThanOrEqual(m.cap(l));
        for (const c of l.s[s]) expect(m.pow(c, l)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("prioridade", () => {
  it("o Rei Oculto começa; depois fica com quem estiver ganhando a partida, e empate mantém", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = new Match(gameConfig(undefined), pool, seeded(seed));
      expect(m.prio).toBe("p");
      while (!m.result) {
        for (const c of [...m.hand]) { const l = m.loc.find((x) => !m.canPlay(c, x)); if (l) m.play(c, l); }
        const before = m.prio;
        const q = m.endTurn();
        if (q.some((a) => a.c.side === before)) expect(q[0].c.side).toBe(before);
        for (const a of q) m.act(a);
        m.endOfTurn();
        const sc = m.score();
        expect(m.prio).toBe(sc.p > sc.a ? "p" : sc.a > sc.p ? "a" : before);
        if (m.over) m.finish(); else m.nextTurn();
      }
    }
  });
});

/* ---------- itens da loja ---------- */

const plainLocs: GameLoc[] = [0, 1, 2].map((i) => ({ id: `n${i}`, name: `Local ${i}`, type: "none", v: 0, n: 1, desc: "" }));
const only = (keep: ItemKey[]): GameConfig["items"] => Object.fromEntries(ITEM_KEYS.filter((k) => !keep.includes(k)).map((k) => [k, { off: true }]));
const cfgWith = (keep: ItemKey[], locs = plainLocs): GameConfig => ({ locs, cards: {}, items: only(keep), heroes: {} });
function playUntil(m: Match, turn: number) {
  while (m.t < turn && !m.result) m.runEndTurn();
}

describe("itens: configuração", () => {
  it("guarda só itens conhecidos, liga/desliga e valor limitado", () => {
    const g = sanitizeGameConfig({ locs: DEFAULT_LOCS, items: { "Sharpshooter": { v: 99, off: true }, "Hack": { off: true }, "Ricochet": { off: "sim" } } })!;
    expect(g.items).toEqual({ "Sharpshooter": { v: 10, off: true } });
    expect(sanitizeGameConfig({ locs: DEFAULT_LOCS, items: [] })).toBeNull();
  });

  it("tem 6 itens por tier, 2 de cada categoria", () => {
    for (const tier of [1, 2, 3, 4]) {
      const ks = ITEM_KEYS.filter((k) => ITEMS[k].tier === tier);
      expect(ks).toHaveLength(6);
      for (const slot of ["weapon", "vitality", "spirit"]) expect(ks.filter((k) => ITEMS[k].slot === slot)).toHaveLength(2);
    }
  });

  it("ícones: só itens da loja de tier 1 a 4", () => {
    const raw = [
      { type: "upgrade", shopable: true, item_tier: 2, name: "Long Range", item_slot_type: "weapon", shop_image_webp: "a.webp" },
      { type: "upgrade", shopable: true, item_tier: 5, name: "Shrink Ray", item_slot_type: "spirit", shop_image_webp: "b.webp" },
      { type: "upgrade", shopable: false, item_tier: 1, name: "Escondido", image_webp: "c.webp" },
      { type: "ability", shopable: true, item_tier: 1, name: "Habilidade", image_webp: "d.webp" },
    ];
    expect(trimItemIcons(raw)).toEqual([{ name: "Long Range", tier: 2, slot: "weapon", image: "a.webp" }]);
    expect(trimItemIcons({})).toEqual([]);
  });
});

describe("itens: draft e revelação", () => {
  const four: ItemKey[] = ["Extra Health", "Swift Striker", "Sharpshooter", "Ricochet"];

  it("no turno 5 os dois lados recebem 3 itens com os mesmos tiers, e a IA já escolhe", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = new Match(cfgWith(four), pool, seeded(seed));
      playUntil(m, 5);
      const tiers = (s: "p" | "a") => m.offer![s].map((k) => ITEMS[k].tier);
      expect(m.offer!.p).toHaveLength(3);
      expect(tiers("p")).toEqual(tiers("a"));
      expect(new Set(tiers("p")).size).toBe(3);
      expect(m.offer!.a).toContain(m.picked.a);
    }
  });

  it("não fecha o turno 5 sem escolher; o item é pago no turno 5 e fica escondido até o turno 6", () => {
    const m = new Match(cfgWith(four), pool, seeded(7));
    playUntil(m, 5);
    expect(m.needsPick).toBe(true);
    expect(m.endTurn()).toEqual([]);
    expect(m.busy).toBe(false);
    const e = m.E;
    const [cheap, , k] = m.offer!.p;
    m.pick(cheap);
    expect(m.E).toBe(e - ITEMS[cheap].tier);
    m.pick(k);
    expect(m.picked.p).toBe(k);
    expect(m.E).toBe(e - ITEMS[k].tier);
    expect(m.paid.p).toBe(ITEMS[k].tier);
    expect(m.itemsOn).toBe(false);
    m.runEndTurn();
    expect(m.t).toBe(6);
    expect(m.itemsOn).toBe(true);
    expect(m.E).toBe(6);
  });

  it("sem almas para o item, a escolha é recusada; sem almas para nenhum, o turno fecha sem item", () => {
    const m = new Match(cfgWith(four), pool, seeded(8));
    playUntil(m, 5);
    const [cheap, , dear] = m.offer!.p;
    m.E = ITEMS[cheap].tier;
    expect(m.canBuy(dear)).toBe(false);
    m.pick(dear);
    expect(m.picked.p).toBeNull();
    expect(m.needsPick).toBe(true);
    m.E = 0;
    expect(m.needsPick).toBe(false);
    m.runEndTurn();
    expect(m.t).toBe(6);
    expect(m.picked.p).toBeNull();
  });

  it("desconto da loja reduz o preço, sem ficar negativo", () => {
    const m = new Match(cfgWith(four), pool, seeded(3));
    m.discount.p = 1;
    expect(m.itemPrice("p", "Ricochet")).toBe(3);
    m.discount.p = 9;
    expect(m.itemPrice("p", "Ricochet")).toBe(0);
  });

  it("sem itens ligados não há loja", () => {
    const m = new Match(cfgWith([]), pool, seeded(4));
    playUntil(m, 5);
    expect(m.offer).toBeNull();
    expect(m.needsPick).toBe(false);
  });

  it("Swift Striker dá poder contínuo às cartas de custo 3 ou menos", () => {
    const m = new Match(cfgWith(["Swift Striker"]), pool, seeded(5));
    playUntil(m, 6);
    const c = m.loc.flatMap((l) => l.s.p).find((x) => x.rev && x.cost <= 3);
    if (!c) return;
    const before = m.pow(c);
    m.itemsOn = false;
    expect(before - m.pow(c)).toBe(2);
  });

  it.each(ITEM_KEYS)("%s: partidas com o item terminam sem erro", (k) => {
    for (let seed = 1; seed <= 25; seed++) {
      const m = new Match(cfgWith([k], DEFAULT_LOCS), pool, seeded(seed));
      let result = null;
      while (!result) {
        if (m.needsPick) m.pick(k);
        for (const c of [...m.hand].sort((a, b) => a.cost - b.cost)) {
          const l = m.loc.find((x) => !m.canPlay(c, x));
          if (l) m.play(c, l);
        }
        result = m.runEndTurn();
      }
      expect(m.picked.p).toBe(k);
      expect(m.picked.a).toBe(k);
      for (const l of m.loc) for (const s of ["p", "a"] as const) for (const c of l.s[s]) expect(m.pow(c, l)).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ---------- atributos, Maestria e heróis ---------- */

const flat = (v: number, extra: Partial<CardStatsBlock> = {}): CardStatsBlock => ({ MIR: v, MAC: v, SUP: v, MOV: v, POL: v, CON: v, ...extra });
const heroCfg = (heroes: GameConfig["heroes"] = {}): GameConfig => ({ locs: plainLocs, cards: {}, items: only([]), heroes });
const pc = (id: string, hero: string, stats: CardStatsBlock): PoolCard => ({ id, name: id, position: "Flex", hero, c1: "#000", c2: "#fff", ovr: 80, stats });
type Priv = { mk(p: PoolCard, cfg: GameConfig, side: Side): GCard };

/** Partida de teste com os 3 locais revelados e o tabuleiro vazio. */
function arena(cfg = heroCfg()) {
  const m = new Match(cfg, pool, seeded(11));
  m.loc.forEach((l) => { l.rev = true; l.s.p = []; l.s.a = []; });
  const mk = (p: PoolCard, side: Side) => (m as unknown as Priv).mk(p, cfg, side);
  /** Coloca a carta no local e revela (como no fim do turno). */
  const put = (p: PoolCard, side: Side, li: number) => { const c = mk(p, side); m.loc[li].s[side].push(c); m.reveal(c, m.loc[li]); return c; };
  /** Coloca a carta virada, como se tivesse sido jogada neste turno. */
  const stage = (p: PoolCard, li: number) => { const c = mk(p, "p"); c.staged = true; m.loc[li].s.p.push(c); return c; };
  return { m, mk, put, stage };
}

describe("atributos e Maestria", () => {
  it("níveis: Aprendiz abaixo de 82, Profissional até 89, Mestre a partir de 90", () => {
    expect([mastery(81), mastery(82), mastery(89), mastery(90)]).toEqual([0, 1, 1, 2]);
  });

  it("atributo principal: padrão do herói, ajuste do admin ou o maior atributo para herói sem cadastro", () => {
    expect(heroStat("Haze", {})).toBe(HERO_STAT.Haze);
    expect(heroStat("Haze", { Haze: { stat: "POL" } })).toBe("POL");
    expect(heroStat("Herói Novo", {}, flat(70, { SUP: 88 }))).toBe("SUP");
  });

  it("palavras-chave: até 2 atributos a partir de 90, do maior para o menor", () => {
    expect(keywords(flat(80))).toEqual([]);
    expect(keywords(flat(80, { MAC: 91, CON: 95, MOV: 90 }))).toEqual(["CON", "MAC"]);
  });

  it("configuração dos heróis: só heróis e atributos conhecidos", () => {
    const g = sanitizeGameConfig({ locs: DEFAULT_LOCS, heroes: { Haze: { stat: "SUP" }, Bob: { stat: "MIR" }, Ivy: { stat: "XYZ" } } })!;
    expect(g.heroes).toEqual({ Haze: { stat: "SUP" } });
    expect(sanitizeGameConfig({ locs: DEFAULT_LOCS, heroes: [] })).toBeNull();
  });

  it("Profissional ganha +1 no valor da habilidade; quem não usa valor ganha +1 de poder", () => {
    const { mk } = arena();
    const pocket = (v: number) => mk(pc("x", "Pocket", flat(70, { MOV: v })), "p");
    expect(pocket(85).v - pocket(70).v).toBe(1);
    expect(pocket(95).lvl).toBe(2);
    const haze = (v: number) => mk(pc("y", "Haze", flat(70, { MIR: v })), "p");
    expect(haze(85).base - haze(70).base).toBe(1);
  });

  it("o admin troca o atributo principal e a Maestria acompanha", () => {
    const stats = flat(70, { POL: 95 });
    expect(arena().mk(pc("x", "Haze", stats), "p").lvl).toBe(0);
    expect(arena(heroCfg({ Haze: { stat: "POL" } })).mk(pc("x", "Haze", stats), "p").lvl).toBe(2);
  });

  it("duelo de espelho: quem tem mais Maestria ganha +2 por nível e anula o rival no turno", () => {
    const { m, put } = arena();
    const ai = put(pc("a", "Pocket", flat(70)), "a", 0);
    const me = put(pc("b", "Pocket", flat(70, { MOV: 95 })), "p", 0);
    expect(me.bonus).toBe(4);
    expect(m.abilityOf(ai)).toBe("none");
    m.t++;
    expect(m.abilityOf(ai)).toBe("Pocket");
  });

  it("duelo: Pool de heróis alto protege a habilidade de quem perde", () => {
    const { m, put } = arena();
    const ai = put(pc("a", "Pocket", flat(70, { POL: 92 })), "a", 0);
    put(pc("b", "Pocket", flat(70, { MOV: 95 })), "p", 0);
    expect(m.abilityOf(ai)).toBe("Pocket");
  });

  it("mentoria: um jogador melhor do mesmo herói em jogo ensina a carta nova", () => {
    const { put } = arena();
    put(pc("a", "Haze", flat(70, { MIR: 95 })), "p", 1);
    const pupil = put(pc("b", "Haze", flat(70)), "p", 0);
    expect(pupil.lvl).toBe(1);
    expect(pupil.bonus).toBe(1);
  });

  it("Certeiro (Mira 90+): efeito de alvo aleatório acerta a inimiga mais forte", () => {
    const { m, put, mk } = arena();
    const weak = put(pc("w", "Herói Novo", flat(50)), "a", 0);
    const strong = put(pc("s", "Herói Novo", flat(50)), "a", 0);
    weak.base = 2; strong.base = 9; weak.bonus = 0; strong.bonus = 0;
    const hitter = mk(pc("h", "Herói Novo", flat(70, { MIR: 95 })), "p");
    hitter.ab = "hit"; hitter.v = 3;
    m.loc[0].s.p.push(hitter);
    m.reveal(hitter, m.loc[0]);
    expect(m.pow(strong)).toBe(6);
    expect(m.pow(weak)).toBe(2);
  });

  it("Ágil (Movimento 90+): a carta pode se mover uma vez por partida", () => {
    const { m, put } = arena();
    const c = put(pc("a", "Herói Novo", flat(70, { MOV: 92 })), "p", 0);
    expect(m.moveOptions(c)).toHaveLength(2);
    expect(m.moveCard(c, m.loc[2])).toBe(true);
    expect(m.locOf(c)).toBe(m.loc[2]);
    expect(m.moveOptions(c)).toEqual([]);
    m.t++;
    expect(m.moveOptions(c)).toEqual([]);
  });

  it("Constante (Consistência 90+): imune a queimadura", () => {
    const { m, put } = arena();
    const a = put(pc("a", "Herói Novo", flat(70, { CON: 92 })), "p", 0);
    const b = put(pc("b", "Herói Novo", flat(70)), "p", 0);
    a.st.burn = 2; b.st.burn = 2;
    const [pa, pb] = [m.pow(a), m.pow(b)];
    m.endOfTurn();
    expect(m.pow(a)).toBe(pa);
    expect(m.pow(b)).toBe(pb - 2);
  });
});

describe("escolhas, movimento e execução", () => {
  it("Grey Talon acerta a inimiga escolhida ao jogar", () => {
    const { m, put, stage } = arena();
    const a = put(pc("a", "Herói Novo", flat(70)), "a", 1);
    const b = put(pc("b", "Herói Novo", flat(70)), "a", 2);
    a.base = 3; b.base = 9; a.bonus = 0; b.bonus = 0;
    const gt = stage(pc("g", "Grey Talon", flat(70)), 0);
    expect(m.choiceOf(gt)).toEqual({ card: "any" });
    expect(m.choiceCards(gt)).toEqual(expect.arrayContaining([a, b]));
    m.choose(gt, { card: a });
    m.reveal(gt, m.loc[0]);
    expect(m.pow(a)).toBeLessThan(3);
    expect(m.pow(b)).toBe(9);
  });

  it("sem escolha, a habilidade escolhe sozinha (como a IA)", () => {
    const { m, put, stage } = arena();
    const a = put(pc("a", "Herói Novo", flat(70)), "a", 1);
    const b = put(pc("b", "Herói Novo", flat(70)), "a", 2);
    a.base = 3; b.base = 9; a.bonus = 0; b.bonus = 0;
    const gt = stage(pc("g", "Grey Talon", flat(70)), 0);
    m.reveal(gt, m.loc[0]);
    expect(m.pow(b)).toBeLessThan(9);
  });

  it("Holliday leva a inimiga escolhida para o local escolhido", () => {
    const { m, put, stage } = arena();
    const a = put(pc("a", "Herói Novo", flat(70)), "a", 0);
    const h = stage(pc("h", "Holliday", flat(70)), 0);
    m.choose(h, { card: a, loc: m.loc[2] });
    m.reveal(h, m.loc[0]);
    expect(m.locOf(a)).toBe(m.loc[2]);
    expect(m.locOf(h)).toBe(m.loc[2]);
  });

  it("Mirage viaja uma vez com bônus; Sinclair deixa uma ilusão", () => {
    const { m, put } = arena();
    const mi = put(pc("m", "Mirage", flat(70)), "p", 0);
    const before = m.pow(mi);
    expect(m.moveCard(mi, m.loc[1])).toBe(true);
    expect(m.pow(mi)).toBe(before + mi.v);
    const si = put(pc("s", "Sinclair", flat(70)), "p", 0);
    expect(m.moveCard(si, m.loc[2])).toBe(true);
    expect(m.loc[0].s.p.some((x) => x.p.token === "illusion")).toBe(true);
  });

  it("carta acorrentada não se move", () => {
    const { m, put } = arena();
    const mi = put(pc("m", "Mirage", flat(70)), "p", 0);
    mi.st.chained = true;
    expect(m.moveOptions(mi)).toEqual([]);
  });

  it("Shiv sem alvo abre a janela; a inimiga marcada é executada no próximo turno se estiver fraca", () => {
    const { m, put } = arena();
    const big = put(pc("a", "Herói Novo", flat(70)), "a", 0);
    big.base = 9; big.bonus = 0;
    const shiv = put(pc("s", "Shiv", flat(70)), "p", 0);
    expect(m.locOf(big)).toBe(m.loc[0]);
    m.t++;
    expect(m.markOptions(shiv)).toContain(big);
    m.mark(shiv, big);
    big.bonus = shiv.v - 9;
    m.act({ c: shiv, l: m.loc[0], exec: true });
    expect(m.locOf(big)).toBeUndefined();
  });

  it("partidas com o jogador escolhendo alvos, movendo e marcando terminam sem erro (Mestres e Aprendizes)", () => {
    for (const lvl of [70, 95]) {
      const heroPool = cardPool(HEROES.map((hero, i) => player(`h${i}`, lvl, { hero, position: POSITIONS[i % 5] })));
      for (let seed = 1; seed <= 60; seed++) {
        const rnd = seeded(seed * 7);
        const m = new Match(gameConfig(undefined), heroPool, seeded(seed));
        let result = null;
        while (!result) {
          for (const c of [...m.hand].sort((a, b) => a.cost - b.cost)) {
            const l = m.loc.find((x) => !m.canPlay(c, x));
            if (!l || m.play(c, l)) continue;
            const cards = m.choiceCards(c), locs = m.choiceLocs(c);
            m.choose(c, { card: cards[Math.floor(rnd() * cards.length)], loc: locs[Math.floor(rnd() * locs.length)] });
          }
          for (const c of m.loc.flatMap((l) => l.s.p)) {
            const opts = m.moveOptions(c);
            if (opts.length && rnd() < 0.5) m.moveCard(c, opts[0]);
            const marks = m.markOptions(c);
            if (marks.length) m.mark(c, marks[0]);
          }
          result = m.runEndTurn();
        }
        for (const l of m.loc) for (const s of ["p", "a"] as const) {
          expect(l.s[s].length).toBeLessThanOrEqual(m.cap(l));
          for (const c of l.s[s]) expect(m.pow(c, l)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
