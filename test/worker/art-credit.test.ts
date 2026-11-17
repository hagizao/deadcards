import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

async function savePlayer(cookie: string, credit: unknown) {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  return SELF.fetch("http://test/api/players/p1", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ name: "P", teamId: "t1", stats: {}, art: { url: "/img/players/a.png", credit } }),
  });
}

async function storedCredit() {
  const row = await env.DB.prepare("SELECT extra_json FROM players WHERE id = 'p1'").first<{ extra_json: string }>();
  return JSON.parse(row!.extra_json).art.credit;
}

describe("Crédito da arte", () => {
  it("salva nome e link http(s) do artista", async () => {
    const { cookie } = await login("admvicli");
    expect((await savePlayer(cookie, { name: " artista ", url: "https://x.com/artista" })).status).toBe(200);
    expect(await storedCredit()).toEqual({ name: "artista", url: "https://x.com/artista" });
    expect((await savePlayer(cookie, { name: "só nome", url: "" })).status).toBe(200);
    expect(await storedCredit()).toEqual({ name: "só nome" });
  });

  it("recusa link que não é http(s) e nome vazio ou longo", async () => {
    const { cookie } = await login("admvicli");
    expect((await savePlayer(cookie, { name: "a", url: "javascript:alert(1)" })).status).toBe(400);
    expect((await savePlayer(cookie, { name: "a", url: "não é url" })).status).toBe(400);
    expect((await savePlayer(cookie, { name: "" })).status).toBe(400);
    expect((await savePlayer(cookie, { name: "a".repeat(61) })).status).toBe(400);
  });
});
