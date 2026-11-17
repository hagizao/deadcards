import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { HERO_POOL_MAX } from "../../src/lib/game/config";

const body = { teamId: "t1", name: "Fulano", hero: "Haze", stats: { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 } };
const save = (id: string, b: unknown, cookie: string) =>
  SELF.fetch(`http://test/api/players/${id}`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(b) });
const playerOf = async (id: string) =>
  ((await (await SELF.fetch("http://test/api/data")).json()) as { players: { id: string; heroPool?: string[] }[] }).players.find((p) => p.id === id);

describe("heróis de afinidade do jogador", () => {
  it("salva só heróis conhecidos, sem repetir nem o herói principal, até o limite", async () => {
    await seedPlayer("seed");
    const { cookie } = await login("AdmVicli");
    const pool = ["Wraith", "Haze", "Wraith", "Hack", 7, "Vindicta", "Paige", "Ivy", "Rem", "Mina", "Baba"];
    expect((await save("hp1", { ...body, heroPool: pool }, cookie)).status).toBe(200);
    const p = await playerOf("hp1");
    expect(p?.heroPool).toEqual(["Wraith", "Vindicta", "Paige", "Ivy", "Rem", "Mina"].slice(0, HERO_POOL_MAX));
  });

  it("lista vazia ou inválida não é guardada", async () => {
    await seedPlayer("seed2");
    const { cookie } = await login("AdmVicli");
    expect((await save("hp2", { ...body, heroPool: "Wraith" }, cookie)).status).toBe(200);
    expect(await playerOf("hp2")).not.toHaveProperty("heroPool");
  });
});
