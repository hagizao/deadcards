import { describe, expect, it } from "vitest";
import { achievementsFor } from "../src/lib/achievements";
import type { Player, Team } from "../src/lib/types";

const card = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, teamId, name: id, position: "Flex", hero: "Abrams", stats: {}, ovr: 80, c1: "#000", c2: "#000", history: [], ...extra }) as Player;
const team = (id: string, region: string): Team => ({ id, name: id.toUpperCase(), tag: id.toUpperCase(), region });

const teams = [team("lev", "Europa"), team("c9", "América do Norte"), team("fa", "Sem Time"), team("be", "Europa")];
const players = [
  card("a", "lev", { position: "Carry", ovr: 95 }),
  card("b", "lev", { position: "Suporte" }),
  card("c", "lev", { position: "Frontline" }),
  card("a-mina", "lev", { variantOf: "a", hero: "Mina", altHero: true }),
  card("a-haze", "lev", { variantOf: "a", hero: "Haze", altHero: true }),
  card("x", "c9"), card("y", "c9"),
  card("z1", "be"), card("z2", "be"),
  card("free1", "fa"), card("free2", "fa"), card("free3", "fa"),
  card("a-gold", "c9", { variantOf: "a", special: true }),
];
const get = (owned: string[], extra = { profileCard: false, favorites: 0 }) => {
  const list = achievementsFor(players, teams, owned, extra);
  return (key: string) => list.find((a) => a.key === key)!;
};

describe("Conquistas do perfil", () => {
  it("coleção vazia não desbloqueia nada e mostra o progresso zerado", () => {
    const list = achievementsFor(players, teams, [], { profileCard: false, favorites: 0 });
    expect(list.some((a) => a.done)).toBe(false);
    expect(list.every((a) => a.value === 0)).toBe(true);
  });

  it("primeira carta, carta de perfil e favorita", () => {
    const a = get(["b"], { profileCard: true, favorites: 1 });
    expect(a("first-card").done).toBe(true);
    expect(a("profile-card").done).toBe(true);
    expect(a("first-favorite").done).toBe(true);
    expect(a("five-cards")).toMatchObject({ value: 1, goal: 5, done: false });
  });

  it("elenco completo só para times de verdade com elenco de 3 ou mais", () => {
    const a = get(["a", "b", "c"]);
    expect(a("team:lev").done).toBe(true);
    expect(a("first-roster").done).toBe(true);
    expect(a("team:fa")).toBeUndefined(); // Sem Time não tem conquista de elenco
    expect(a("team:be")).toBeUndefined(); // elenco de 2 cartas
    expect(a("team:c9")).toMatchObject({ value: 0, goal: 3 }); // versão em outro time entra no elenco
  });

  it("volta ao mundo conta só regiões com time", () => {
    expect(get(["a", "free1"])("world")).toMatchObject({ value: 1, goal: 2, done: false });
    expect(get(["a", "x"])("world").done).toBe(true);
  });

  it("jogador completo exige todas as versões e especial conta", () => {
    expect(get(["a", "a-mina", "a-haze"])("full-player")).toMatchObject({ value: 3, goal: 4, done: false });
    const a = get(["a", "a-mina", "a-haze", "a-gold"]);
    expect(a("full-player").done).toBe(true);
    expect(a("special-1").done).toBe(true);
    expect(a("ovr-90").done).toBe(true);
  });
});
