import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

async function saveFeatured(cookie: string, homeFeatured: unknown) {
  return SELF.fetch("http://test/api/settings/app", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ homeFeatured }),
  });
}

const featured = async () => ((await (await SELF.fetch("http://test/api/data")).json()) as { settings: { homeFeatured?: string[] } }).settings.homeFeatured;

describe("Cartas em destaque da Home", () => {
  it("salva a lista na ordem escolhida e aceita lista vazia", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await saveFeatured(cookie, ["p2", "p1"])).status).toBe(200);
    expect(await featured()).toEqual(["p2", "p1"]);
    expect((await saveFeatured(cookie, [])).status).toBe(200);
    expect(await featured()).toEqual([]);
  });

  it("recusa mais de 5, repetidos e itens que não são id", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await saveFeatured(cookie, ["a", "b", "c", "d", "e", "f"])).status).toBe(400);
    expect((await saveFeatured(cookie, ["a", "a"])).status).toBe(400);
    expect((await saveFeatured(cookie, ["a", 3])).status).toBe(400);
    expect((await saveFeatured(cookie, "a")).status).toBe(400);
  });

  it("exige admin", async () => {
    const { cookie } = await login("visitante");
    expect((await saveFeatured(cookie, ["p1"])).status).toBe(403);
  });
});

describe("Carta do guia da Home", () => {
  const save = (cookie: string, homeGuide: unknown) => SELF.fetch("http://test/api/settings/app", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ homeGuide }),
  });
  const guide = async () => ((await (await SELF.fetch("http://test/api/data")).json()) as { settings: { homeGuide?: string } }).settings.homeGuide;

  it("salva a carta escolhida e volta ao padrão com null", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await save(cookie, "p1")).status).toBe(200);
    expect(await guide()).toBe("p1");
    expect((await save(cookie, null)).status).toBe(200);
    expect(await guide()).toBeUndefined();
  });

  it("recusa o que não é id e exige admin", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await save(cookie, 3)).status).toBe(400);
    expect((await save(cookie, "")).status).toBe(400);
    expect((await save(cookie, "x".repeat(65))).status).toBe(400);
    const visitor = await login("visitante");
    expect((await save(visitor.cookie, "p1")).status).toBe(403);
  });
});
