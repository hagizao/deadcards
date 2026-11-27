import { describe, expect, it } from "vitest";
import { activeRoster, cardVersions, isAltHero, isRosterCard } from "../src/lib/cards";
import { asPlayedHero } from "../src/lib/cardKinds";
import type { Player } from "../src/lib/types";

const card = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, teamId, name: id, position: "Flex", hero: "Abrams", stats: {}, c1: "#000", c2: "#000", history: [], ...extra }) as Player;

describe("Elenco do time", () => {
  it("tira versão do mesmo time e mantém versão em outro time", () => {
    const players = [
      card("main", "bra"),
      card("special", "bra", { variantOf: "main" }),
      card("club", "lev"),
      card("national", "bra", { variantOf: "club" }),
      card("old", "bra", { inactive: true }),
    ];
    expect(activeRoster(players, "bra").map((p) => p.id)).toEqual(["main", "national"]);
    expect(activeRoster(players, "lev").map((p) => p.id)).toEqual(["club"]);
  });

  it("isRosterCard separa versões do mesmo time, inativas e principais", () => {
    const players = [
      card("main", "bra"),
      card("special", "bra", { variantOf: "main" }),
      card("club", "lev"),
      card("national", "bra", { variantOf: "club" }),
      card("old", "bra", { inactive: true }),
    ];
    const roster = (id: string) => isRosterCard(players, players.find((p) => p.id === id)!);
    expect(roster("main")).toBe(true);
    expect(roster("special")).toBe(false);
    expect(roster("national")).toBe(true);
    expect(roster("old")).toBe(false);
  });

  it("herói jogado nunca entra no elenco, nem se o time mudar", () => {
    const players = [
      card("main", "lev"),
      card("mina", "bra", { variantOf: "main", hero: "Mina", altHero: true }),
      card("loose", "bra", { altHero: true }),
    ];
    expect(isAltHero(players[1])).toBe(true);
    // marca sem ser versão não vale: é uma carta principal
    expect(isAltHero(players[2])).toBe(false);
    expect(activeRoster(players, "bra").map((p) => p.id)).toEqual(["loose"]);
  });
});

describe("cardVersions", () => {
  const players = [
    card("sp", "bra", { variantOf: "main" }),
    card("main", "bra"),
    card("other", "lev"),
    card("otherVersion", "lev", { variantOf: "other" }),
  ];
  const ids = (id: string) => cardVersions(players, players.find((p) => p.id === id)!).map((p) => p.id);

  it("põe a principal primeiro e não mistura outro jogador", () => {
    expect(ids("main")).toEqual(["main", "sp"]);
  });

  it("chamada por uma versão devolve o mesmo grupo", () => {
    expect(ids("sp")).toEqual(["main", "sp"]);
  });
});

describe("Versão com outro herói vira herói jogado", () => {
  const stats = { MIR: 89, MAC: 88, SUP: 84, MOV: 96, POL: 89, CON: 88 };
  const main = card("goober", "yfp", { hero: "Viscous", stats, ovr: 89 });
  const players = [main];

  it("versão comum no mesmo time com outro herói fica 2 abaixo e com a marca", () => {
    const v = asPlayedHero(card("v", "yfp", { variantOf: "goober", hero: "Paradox", stats, ovr: 89 }), players);
    expect(v.altHero).toBe(true);
    expect(v.ovr).toBe(87);
    expect(v.stats).toEqual({ MIR: 87, MAC: 86, SUP: 82, MOV: 94, POL: 87, CON: 86 });
    expect(isAltHero(v)).toBe(true);
  });

  it("especial, outro time ou mesmo herói continuam versão comum", () => {
    const special = asPlayedHero(card("s", "yfp", { variantOf: "goober", hero: "Paradox", special: true, stats, ovr: 89 }), players);
    const national = asPlayedHero(card("n", "eua", { variantOf: "goober", hero: "Paradox", stats, ovr: 86 }), players);
    const same = asPlayedHero(card("m", "yfp", { variantOf: "goober", hero: "Viscous", altHero: true, stats, ovr: 89 }), players);
    expect([special.altHero, national.altHero, same.altHero]).toEqual([undefined, undefined, undefined]);
    expect(national.ovr).toBe(86);
  });

  it("carta principal nunca vira herói jogado", () => {
    expect(asPlayedHero(main, players).altHero).toBeUndefined();
  });
});
