import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { artistCardPath, artistPath, type ArtistAdmin } from "../../src/lib/artists";
import type { PublicProfile } from "../../src/lib/profile";
import type { AppData } from "../../src/lib/types";

const ADMIN_TWITCH_ID = "190835130";

function call(method: string, path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch(`http://test${path}`, { method, headers });
}
const profileOf = async (id: string) => (await call("GET", `/api/users/${id}`)).json<PublicProfile>();

describe("Artistas", () => {
  beforeEach(async () => {
    await seedPlayer("arte1");
    await seedPlayer("arte2");
  });

  it("só admin marca artista e vincula carta", async () => {
    const { cookie, userId } = await login("fan");
    expect((await call("PUT", artistPath(userId))).status).toBe(403);
    expect((await call("PUT", artistPath(userId), cookie)).status).toBe(403);
    expect((await call("PUT", artistCardPath(userId, "arte1"), cookie)).status).toBe(403);
  });

  it("marcar mostra a área no perfil; vincular dá a carta, soma curtidas e liga o Arte por", async () => {
    const { cookie: admin } = await login("admin", ["twitch"], ADMIN_TWITCH_ID);
    const { userId: artist } = await login("artista");

    expect((await profileOf(artist)).artist).toBeNull();
    expect(await (await call("PUT", artistPath(artist), admin)).json()).toEqual<ArtistAdmin>({ artist: true, cards: [] });
    expect((await profileOf(artist)).artist).toEqual({ cards: [], likes: 0 });

    expect(await (await call("PUT", artistCardPath(artist, "arte1"), admin)).json()).toEqual<ArtistAdmin>({ artist: true, cards: ["arte1"] });
    expect(await (await call("PUT", artistCardPath(artist, "arte1"), admin)).json()).toEqual<ArtistAdmin>({ artist: true, cards: ["arte1"] });
    const profile = await profileOf(artist);
    expect(profile.cards).toEqual(["arte1"]);

    const { userId: fan } = await login("fan");
    await env.DB.prepare("INSERT INTO card_likes (user_id, player_id) VALUES (?, 'arte1')").bind(fan).run();
    expect((await profileOf(artist)).artist).toEqual({ cards: ["arte1"], likes: 1 });

    const data = await (await call("GET", "/api/data")).json<AppData>();
    expect(data.artists).toEqual({ arte1: artist });

    // desvincular tira da área, mas a carta continua na coleção
    expect(await (await call("DELETE", artistCardPath(artist, "arte1"), admin)).json()).toEqual<ArtistAdmin>({ artist: true, cards: [] });
    expect((await profileOf(artist)).cards).toEqual(["arte1"]);

    // tirar o selo esconde a área e o link, tira as cartas vinculadas e a carta do perfil, mas guarda os vínculos
    await call("PUT", artistCardPath(artist, "arte2"), admin);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_favorites (user_id, player_id) VALUES (?, 'arte2')").bind(artist),
      env.DB.prepare("INSERT INTO profile_cards (user_id, snapshot, updated_at) VALUES (?, '{}', 1)").bind(artist),
      env.DB.prepare("INSERT INTO profile_card_history (user_id, snapshot, updated_at) VALUES (?, '{}', 1)").bind(artist),
    ]);
    expect(await (await call("DELETE", artistPath(artist), admin)).json()).toEqual<ArtistAdmin>({ artist: false, cards: ["arte2"] });
    const after = await profileOf(artist);
    expect(after.artist).toBeNull();
    expect(after.cards).toEqual(["arte1"]);
    expect(after.favorites).toEqual([]);
    expect(after.card).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM profile_card_history WHERE user_id = ?").bind(artist).first("n")).toBe(0);
    expect((await (await call("GET", "/api/data")).json<AppData>()).artists).toEqual({});

    // voltar a ser artista devolve as cartas vinculadas
    await call("PUT", artistPath(artist), admin);
    expect((await profileOf(artist)).cards.sort()).toEqual(["arte1", "arte2"]);
  });

  it("uma carta tem um artista só: vincular a outra conta troca o dono", async () => {
    const { cookie: admin } = await login("admin", ["twitch"], ADMIN_TWITCH_ID);
    const { userId: a } = await login("a");
    const { userId: b } = await login("b");
    await call("PUT", artistCardPath(a, "arte1"), admin);
    await call("PUT", artistCardPath(b, "arte1"), admin);
    expect((await profileOf(a)).artist?.cards).toEqual([]);
    expect((await profileOf(b)).artist?.cards).toEqual(["arte1"]);
  });

  it("recusa conta, carta ou caminho que não existem", async () => {
    const { cookie: admin } = await login("admin", ["twitch"], ADMIN_TWITCH_ID);
    const { userId } = await login("artista");
    expect((await call("PUT", artistPath("ninguem"), admin)).status).toBe(404);
    expect((await call("PUT", artistCardPath(userId, "nao-existe"), admin)).status).toBe(404);
    expect((await call("PUT", `${artistPath(userId)}/outra/coisa`, admin)).status).toBe(404);
    expect((await call("POST", artistPath(userId), admin)).status).toBe(405);
  });
});
