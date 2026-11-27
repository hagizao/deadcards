import { describe, expect, it } from "vitest";
import { DEFAULT_PACK_ODDS, DEFAULT_RARITY_ODDS, cardChances, chanceSummary, drawCard, kindChances, packKind, packPool, parseOdds, parseRarityOdds } from "../src/lib/packs";
import { getPlayerOvr } from "../src/lib/cardKinds";
import { rarityKeyOf } from "../src/lib/rarityBands";
import type { Player } from "../src/lib/types";

const card = (id: string, extra: Partial<Player> = {}): Player =>
  ({ id, teamId: "t1", name: id, position: "Carry", hero: "Abrams", stats: { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 }, c1: "#000", c2: "#000", history: [], ...extra });

const rarityOf = (p: Player) => rarityKeyOf(getPlayerOvr(p));
const main = card("main");
const alt = card("alt", { variantOf: "main", altHero: true, hero: "Mina" });
const special = card("special", { variantOf: "main", special: true });
const other = card("other", { variantOf: "main", teamId: "t2" });

describe("packs", () => {
  it("classifica assinatura, herói jogado e especial", () => {
    expect(packKind(main)).toBe("signature");
    expect(packKind(alt)).toBe("alt");
    expect(packKind(special)).toBe("special");
    expect(packKind(other)).toBe("special");
  });

  it("pool tira inativas, as que você tem e times fora do pack", () => {
    const retired = card("retired", { variantOf: "main", altHero: true, inactive: true });
    const all = [main, alt, special, other, retired];
    expect(packPool(all, { teams: [] }, new Set()).map((p) => p.id)).toEqual(["main", "alt", "special", "other"]);
    expect(packPool(all, { teams: [] }, new Set(["alt"])).map((p) => p.id)).toEqual(["main", "special", "other"]);
    expect(packPool(all, { teams: ["t2"] }, new Set()).map((p) => p.id)).toEqual(["other"]);
  });

  it("cartas escolhidas: só elas, até exclusiva e inativa, sem aposentada nem repetida", () => {
    const vip = card("vip", { exclusive: true, teamId: "t9" });
    const benched = card("benched", { inactive: true });
    const retired = card("retired", { variantOf: "main", altHero: true, inactive: true });
    const all = [main, alt, vip, benched, retired];
    const type = { teams: ["t1"], players: ["vip", "benched", "retired", "alt", "gone"] };
    expect(packPool(all, type, new Set(["alt"])).map((p) => p.id)).toEqual(["vip", "benched"]);
    expect(packPool(all, { teams: [], players: [] }, new Set())).toEqual([]);
  });

  it("carta exclusiva nunca entra no pool", () => {
    const pool = packPool([main, card("vip", { exclusive: true })], { teams: [] }, new Set());
    expect(pool.map((p) => p.id)).toEqual(["main"]);
  });

  it("tipo sem carta divide a chance entre os outros", () => {
    const c = kindChances([main, alt], DEFAULT_PACK_ODDS);
    expect(c.special.chance).toBe(0);
    expect(c.alt.chance).toBeCloseTo(80 / 95);
    expect(c.signature.chance).toBeCloseTo(15 / 95);
  });

  it("sorteia pelo tipo e devolve null com pool vazio", () => {
    const pool = [main, alt, special];
    expect(drawCard(pool, { odds: DEFAULT_PACK_ODDS }, rarityOf, () => 0)?.id).toBe("alt");
    expect(drawCard(pool, { odds: DEFAULT_PACK_ODDS }, rarityOf, () => 0.85)?.id).toBe("main");
    expect(drawCard(pool, { odds: DEFAULT_PACK_ODDS }, rarityOf, () => 0.99)?.id).toBe("special");
    expect(drawCard([], { odds: DEFAULT_PACK_ODDS }, rarityOf)).toBeNull();
    // só sobrou tipo com chance 0: nada sai
    expect(drawCard([special], { odds: { alt: 90, signature: 10, special: 0 } }, rarityOf)).toBeNull();
  });

  it("chances ficam perto do configurado", () => {
    const pool = [main, alt, special];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 20000;
    const hits: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const id = drawCard(pool, { odds: DEFAULT_PACK_ODDS }, rarityOf, rand)!.id; hits[id] = (hits[id] ?? 0) + 1; }
    expect(hits.alt / n).toBeCloseTo(0.8, 1);
    expect(hits.main / n).toBeCloseTo(0.15, 1);
    expect(hits.special / n).toBeCloseTo(0.05, 1);
  });

  it("valida chances do Editor", () => {
    expect(parseOdds({ alt: 80, signature: 15, special: 5 })).toEqual(DEFAULT_PACK_ODDS);
    expect(parseOdds({ alt: 80, signature: 15, special: 4 })).toBeNull();
    expect(parseOdds({ alt: 80.5, signature: 14.5, special: 5 })).toBeNull();
    expect(parseOdds({ alt: 100, signature: 0 })).toBeNull();
    expect(parseOdds(null)).toBeNull();
  });

  describe("chances por raridade", () => {
    const at = (id: string, ovr: number, extra: Partial<Player> = {}) => card(id, { variantOf: "main", altHero: true, hero: id, ovr, ...extra });
    const odds = { alt: 100, signature: 0, special: 0 };
    const rarity = { eternus: 10, ascendant: 0, oracle: 0, archon: 0, arcanist: 0, initiate: 90 };

    it("dentro do tipo, a raridade segue as chances e as cartas da raridade dividem igual", () => {
      const pool = [at("e1", 95), at("i1", 50), at("i2", 55), at("i3", 60)];
      const c = cardChances(pool, { odds, rarity }, rarityOf);
      expect(c.get("e1")).toBeCloseTo(0.1);
      for (const id of ["i1", "i2", "i3"]) expect(c.get(id)).toBeCloseTo(0.3);
      const sum = chanceSummary(pool, c, rarityOf);
      expect(sum.rarity.eternus.chance).toBeCloseTo(0.1);
      expect(sum.rarity.initiate).toEqual({ chance: expect.closeTo(0.9) as number, cards: 3 });
      expect(sum.kind.alt.chance).toBeCloseTo(1);
    });

    it("raridade sem carta sai da conta; raridade com 0% nunca sai", () => {
      // sem Eternus no pool: tudo vai para Initiate
      expect(cardChances([at("i1", 50)], { odds, rarity }, rarityOf).get("i1")).toBeCloseTo(1);
      // só Ascendant, que está com 0%: nada sai
      expect(drawCard([at("a1", 90)], { odds, rarity }, rarityOf)).toBeNull();
    });

    it("tipo cuja raridade toda está em 0% passa a chance para os outros tipos", () => {
      const sig = card("sig", { ovr: 90 }); // assinatura Ascendant, 0%
      const pool = [sig, at("i1", 50)];
      const c = cardChances(pool, { odds: DEFAULT_PACK_ODDS, rarity }, rarityOf);
      expect(c.get("sig")).toBeUndefined();
      expect(c.get("i1")).toBeCloseTo(1);
    });

    it("sem chances por raridade, toda carta do tipo tem a mesma chance", () => {
      const pool = [at("e1", 95), at("i1", 50)];
      const c = cardChances(pool, { odds }, rarityOf);
      expect(c.get("e1")).toBeCloseTo(0.5);
      expect(c.get("i1")).toBeCloseTo(0.5);
    });

    it("valida chances por raridade do Editor", () => {
      expect(parseRarityOdds(DEFAULT_RARITY_ODDS)).toEqual(DEFAULT_RARITY_ODDS);
      expect(parseRarityOdds({ ...DEFAULT_RARITY_ODDS, eternus: 3 })).toBeNull();
      expect(parseRarityOdds({ ...DEFAULT_RARITY_ODDS, eternus: 1.5, ascendant: 6.5 })).toBeNull();
      expect(parseRarityOdds(null)).toBeNull();
    });
  });
});
