import { describe, expect, it } from "vitest";
import { DEFAULT_LOCS, cardStats, defaultCard, gameConfig, sanitizeGameConfig, type PoolCard } from "../src/lib/game/config";
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
