import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { favoritePath, type PublicProfile } from "../../src/lib/profile";

function fav(method: string, id: string, cookie?: string, origin?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  return SELF.fetch(`http://test${favoritePath(id)}`, { method, headers });
}

describe("Favoritos", () => {
  it("exige login, método e origem certos", async () => {
    const { cookie } = await login("fan");
    expect((await fav("PUT", "p1")).status).toBe(401);
    expect((await fav("POST", "p1", cookie)).status).toBe(405);
    expect((await fav("PUT", "p1", cookie, "https://evil.example")).status).toBe(403);
  });

  it("só favorita carta resgatada, isola por usuário e aparece no perfil público", async () => {
    const { cookie, userId } = await login("fan");
    const { cookie: other } = await login("other");
    await seedPlayer("p1");
    await seedPlayer("p2");
    await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'p1')").bind(userId).run();

    expect((await fav("PUT", "p2", cookie)).status).toBe(404);
    expect((await fav("PUT", "p1", other)).status).toBe(404);
    expect(await (await fav("PUT", "p1", cookie)).json()).toEqual({ favorites: ["p1"] });
    expect(await (await fav("PUT", "p1", cookie)).json()).toEqual({ favorites: ["p1"] });

    const profile = await (await SELF.fetch(`http://test/api/users/${userId}`)).json<PublicProfile>();
    expect(profile.favorites).toEqual(["p1"]);

    expect(await (await fav("DELETE", "p1", cookie)).json()).toEqual({ favorites: [] });
    expect(await (await fav("DELETE", "p1", cookie)).json()).toEqual({ favorites: [] });
  });

  it("no máximo 3 favoritas: a quarta é recusada até tirar uma", async () => {
    const { cookie, userId } = await login("fan");
    for (const id of ["f1", "f2", "f3", "f4"]) {
      await seedPlayer(id);
      await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(userId, id).run();
    }
    for (const id of ["f1", "f2", "f3"]) expect((await fav("PUT", id, cookie)).status).toBe(200);
    const full = await fav("PUT", "f4", cookie);
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ code: "limit" });
    // repetir uma que já é favorita continua valendo
    expect((await fav("PUT", "f2", cookie)).status).toBe(200);
    await fav("DELETE", "f1", cookie);
    expect((await fav("PUT", "f4", cookie)).status).toBe(200);
    const profile = await (await SELF.fetch(`http://test/api/users/${userId}`)).json<PublicProfile>();
    expect([...profile.favorites].sort()).toEqual(["f2", "f3", "f4"]);
  });

  it("quem já tinha mais de 3 favoritas mostra só 3 no perfil", async () => {
    const { userId } = await login("fan");
    for (const id of ["g1", "g2", "g3", "g4", "g5"]) {
      await seedPlayer(id);
      await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, ?)").bind(userId, id).run();
      await env.DB.prepare("INSERT INTO user_favorites (user_id, player_id) VALUES (?, ?)").bind(userId, id).run();
    }
    const profile = await (await SELF.fetch(`http://test/api/users/${userId}`)).json<PublicProfile>();
    expect(profile.favorites).toHaveLength(3);
  });
});
