import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

async function savePlayer(cookie: string, fg: unknown) {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  return SELF.fetch("http://test/api/players/p1", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ name: "P", teamId: "t1", stats: {}, art: { url: "/img/players/bg.png", fg } }),
  });
}

describe("Camadas da arte", () => {
  it("salva a camada da frente do R2", async () => {
    const { cookie } = await login("admvicli");
    expect((await savePlayer(cookie, { url: "/img/players/fg.png", zoom: 120, x: 40, y: 60 })).status).toBe(200);
    const row = await env.DB.prepare("SELECT extra_json FROM players WHERE id = 'p1'").first<{ extra_json: string }>();
    expect(JSON.parse(row!.extra_json).art.fg).toEqual({ url: "/img/players/fg.png", zoom: 120, x: 40, y: 60 });
  });

  it("recusa camada fora do R2", async () => {
    const { cookie } = await login("admvicli");
    expect((await savePlayer(cookie, { url: "https://evil.example/x.png" })).status).toBe(400);
    expect((await savePlayer(cookie, "x")).status).toBe(400);
  });
});
