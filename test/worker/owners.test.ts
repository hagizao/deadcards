import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";

const owners = (cookie?: string) => SELF.fetch("http://test/api/owners", { headers: cookie ? { cookie } : {} });
const give = (userId: string, playerId: string) => env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(userId, playerId).run();

describe("GET /api/owners", () => {
  beforeEach(async () => {
    await seedPlayer("p1");
    await seedPlayer("p2");
  });

  it("conta quantas contas têm cada carta", async () => {
    const a = await login("a");
    const b = await login("b");
    await give(a.userId, "p1");
    await give(b.userId, "p1");
    await give(b.userId, "p2");
    const admin = await login("admvicli");
    const res = await owners(admin.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owners: { p1: 2, p2: 1 }, accounts: 3 });
  });

  it("exige admin", async () => {
    expect((await owners()).status).toBe(403);
    const { cookie } = await login("fan");
    expect((await owners(cookie)).status).toBe(403);
  });
});
