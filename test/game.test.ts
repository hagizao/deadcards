import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCS, ITEMS, ITEM_KEYS, cardStats, costByRank, defaultCard, gameConfig, sanitizeGameConfig, trimItemIcons,
  type GameConfig, type GameLoc, type ItemKey, type PoolCard,
} from "../src/lib/game/config";
import { MIN_POOL, Match, TURNS, cardPool } from "../src/lib/game/engine";
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
    expect(c).toMatchObject({ ab: "Pocket", cost: 2, v: 1, desc: "texto" });
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

/* ---------- itens da loja ---------- */

const plainLocs: GameLoc[] = [0, 1, 2].map((i) => ({ id: `n${i}`, name: `Local ${i}`, type: "none", v: 0, n: 1, desc: "" }));
const only = (keep: ItemKey[]): GameConfig["items"] => Object.fromEntries(ITEM_KEYS.filter((k) => !keep.includes(k)).map((k) => [k, { off: true }]));
const cfgWith = (keep: ItemKey[], locs = plainLocs): GameConfig => ({ locs, cards: {}, items: only(keep) });
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

  it("não fecha o turno 5 sem escolher; o item fica escondido até o turno 6 e é pago em almas", () => {
    const m = new Match(cfgWith(four), pool, seeded(7));
    playUntil(m, 5);
    expect(m.needsPick).toBe(true);
    expect(m.endTurn()).toEqual([]);
    expect(m.busy).toBe(false);
    const k = m.offer!.p.at(-1)!;
    m.pick(k);
    expect(m.picked.p).toBe(k);
    expect(m.itemsOn).toBe(false);
    m.runEndTurn();
    expect(m.t).toBe(6);
    expect(m.itemsOn).toBe(true);
    expect(m.paid.p).toBe(ITEMS[k].tier);
    expect(m.E).toBe(6 - ITEMS[k].tier);
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
