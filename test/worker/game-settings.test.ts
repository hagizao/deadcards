import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";
import { DEFAULT_LOCS } from "../../src/lib/game/config";

function put(body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch("http://test/api/settings/game", { method: "PUT", headers, body: JSON.stringify(body) });
}

const gameOf = async () => ((await (await SELF.fetch("http://test/api/data")).json()) as { settings: { game?: unknown } }).settings.game;

describe("Configuração do Cardslock Game", () => {
  it("só admin salva", async () => {
    const { cookie } = await login("fan");
    expect((await put({ game: { locs: DEFAULT_LOCS } })).status).toBe(403);
    expect((await put({ game: { locs: DEFAULT_LOCS } }, cookie)).status).toBe(403);
  });

  it("recusa configuração inválida", async () => {
    const { cookie } = await login("AdmVicli");
    expect((await put({ game: { locs: DEFAULT_LOCS.slice(0, 2) } }, cookie)).status).toBe(400);
    expect((await put({ game: "x" }, cookie)).status).toBe(400);
  });

  it("salva limpo e devolve em /api/data", async () => {
    const { cookie } = await login("AdmVicli");
    const locs = DEFAULT_LOCS.slice(0, 3).map((l, i) => (i === 0 ? { ...l, v: 50, hack: true } : l));
    expect((await put({ game: { locs, cards: { p1: { cost: 3, ab: "Haze", evil: "<script>" } } } }, cookie)).status).toBe(200);
    const game = (await gameOf()) as { locs: Record<string, unknown>[]; cards: Record<string, unknown> };
    expect(game.locs).toHaveLength(3);
    expect(game.locs[0]).not.toHaveProperty("hack");
    expect(game.locs[0].v).toBe(10);
    expect(game.cards).toEqual({ p1: { cost: 3, ab: "Haze" } });
  });
});
