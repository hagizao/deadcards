import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { artistLikesPath } from "../../src/lib/artists";
import { PROFILE_ART_PATH, PROFILE_CARD_PATH, type PublicProfile } from "../../src/lib/profile";

function call(method: string, path: string, cookie?: string, body?: BodyInit) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (typeof body === "string") headers.set("content-type", "application/json");
  return SELF.fetch(`http://test${path}`, { method, headers, body });
}
const makeArtist = (userId: string) => env.DB.prepare("INSERT INTO artists (user_id) VALUES (?)").bind(userId).run();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const upload = (cookie: string, bytes: Uint8Array<ArrayBuffer> = PNG) => {
  const form = new FormData();
  form.set("image", new File([bytes], "arte.png"));
  return call("POST", PROFILE_ART_PATH, cookie, form);
};
const card = (art?: unknown) => JSON.stringify({ name: "Eu", hero: "Abrams", stats: { MIR: 50, MAC: 50, SUP: 50, MOV: 50, POL: 50, CON: 50 }, ...(art ? { art } : {}) });

describe("Curtir o artista", () => {
  it("soma curtidas das cartas e do perfil; uma por conta; ninguém curte o próprio perfil", async () => {
    const { userId: artist, cookie: own } = await login("artista");
    const { cookie: fan, userId: fanId } = await login("fan");
    expect((await call("GET", artistLikesPath(artist))).status).toBe(404);

    await makeArtist(artist);
    await seedPlayer("arte1");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO card_artists (player_id, user_id) VALUES ('arte1', ?)").bind(artist),
      env.DB.prepare("INSERT INTO card_likes (user_id, player_id) VALUES (?, 'arte1')").bind(fanId),
    ]);
    expect(await (await call("GET", artistLikesPath(artist))).json()).toEqual({ count: 1, liked: false });
    expect((await call("PUT", artistLikesPath(artist))).status).toBe(401);
    expect((await call("PUT", artistLikesPath(artist), own)).status).toBe(400);

    expect(await (await call("PUT", artistLikesPath(artist), fan)).json()).toEqual({ count: 2, liked: true });
    expect(await (await call("PUT", artistLikesPath(artist), fan)).json()).toEqual({ count: 2, liked: true });
    expect((await (await call("GET", `/api/users/${artist}`)).json<PublicProfile>()).artist?.likes).toBe(2);
    expect(await (await call("DELETE", artistLikesPath(artist), fan)).json()).toEqual({ count: 1, liked: false });
  });
});

describe("Arte na carta de perfil", () => {
  let cookie = "", userId = "";
  beforeEach(async () => ({ cookie, userId } = await login("artista")));

  it("só artista envia arte, e só imagem de verdade", async () => {
    expect((await upload(cookie)).status).toBe(403);
    await makeArtist(userId);
    expect((await upload(cookie, new Uint8Array([1, 2, 3, 4]))).status).toBe(400);
    const { url } = await (await upload(cookie)).json<{ url: string }>();
    expect(url).toMatch(new RegExp(`^/img/profile-art/${userId}/[\\w-]+\\.png$`));
    expect((await SELF.fetch(`http://test${url}`)).status).toBe(200);
  });

  it("salva a arte na carta; arte de outra conta ou de quem não é artista é recusada", async () => {
    await makeArtist(userId);
    const { url } = await (await upload(cookie)).json<{ url: string }>();
    const saved = await call("PUT", PROFILE_CARD_PATH, cookie, card({ url, zoom: 120, x: 40, y: 60 }));
    expect(saved.status).toBe(200);
    expect((await (await call("GET", `/api/users/${userId}`)).json<PublicProfile>()).card?.art).toEqual({ url, zoom: 120, x: 40, y: 60 });

    expect((await call("PUT", PROFILE_CARD_PATH, cookie, card({ url: "/img/profile-art/outra-conta/x.png" }))).status).toBe(400);
    expect((await call("PUT", PROFILE_CARD_PATH, cookie, card({ url: "/img/players/x.png" }))).status).toBe(400);
    expect((await call("PUT", PROFILE_CARD_PATH, cookie, card({ url, zoom: 999 }))).status).toBe(400);

    // deixou de ser artista: mantém a arte que já tinha, mas não troca por outra
    await env.DB.prepare("DELETE FROM artists WHERE user_id = ?").bind(userId).run();
    expect((await call("PUT", PROFILE_CARD_PATH, cookie, card({ url, zoom: 130, x: 40, y: 60 }))).status).toBe(200);
    expect((await call("PUT", PROFILE_CARD_PATH, cookie, card({ url: `/img/profile-art/${userId}/outra.png` }))).status).toBe(403);
  });
});
