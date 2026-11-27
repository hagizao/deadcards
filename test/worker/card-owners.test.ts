import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";

const ownersOf = (id: string) => SELF.fetch(`http://test/api/cards/${encodeURIComponent(id)}/owners`);

describe("GET /api/cards/:id/owners", () => {
  beforeEach(() => seedPlayer("p1"));

  it("é público e conta as contas que têm a carta", async () => {
    expect(await (await ownersOf("p1")).json()).toEqual({ count: 0 });
    for (const name of ["a", "b"]) {
      const { userId } = await login(name);
      await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'p1')").bind(userId).run();
    }
    const res = await ownersOf("p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2 });
  });

  it("recusa id inválido", async () => {
    expect((await ownersOf("a b")).status).toBe(400);
  });
});
