import { describe, expect, it } from "vitest";
import { DEFAULT_PACK_ODDS, drawCard, kindChances, packKind, packPool, parseOdds } from "../src/lib/packs";
import type { Player } from "../src/lib/types";

const card = (id: string, extra: Partial<Player> = {}): Player =>
  ({ id, teamId: "t1", name: id, position: "Carry", hero: "Abrams", stats: { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 }, c1: "#000", c2: "#000", history: [], ...extra });

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

  it("tipo sem carta divide a chance entre os outros", () => {
    const c = kindChances([main, alt], DEFAULT_PACK_ODDS);
    expect(c.special.chance).toBe(0);
    expect(c.alt.chance).toBeCloseTo(80 / 95);
    expect(c.signature.chance).toBeCloseTo(15 / 95);
  });

  it("sorteia pelo tipo e devolve null com pool vazio", () => {
    const pool = [main, alt, special];
    expect(drawCard(pool, DEFAULT_PACK_ODDS, () => 0)?.id).toBe("alt");
    expect(drawCard(pool, DEFAULT_PACK_ODDS, () => 0.85)?.id).toBe("main");
    expect(drawCard(pool, DEFAULT_PACK_ODDS, () => 0.99)?.id).toBe("special");
    expect(drawCard([], DEFAULT_PACK_ODDS)).toBeNull();
    // só sobrou tipo com chance 0: nada sai
    expect(drawCard([special], { alt: 90, signature: 10, special: 0 })).toBeNull();
  });

  it("chances ficam perto do configurado", () => {
    const pool = [main, alt, special];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 20000;
    const hits: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const id = drawCard(pool, DEFAULT_PACK_ODDS, rand)!.id; hits[id] = (hits[id] ?? 0) + 1; }
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
});
