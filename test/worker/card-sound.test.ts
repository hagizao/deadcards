import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";
import { DEFAULT_LOCS, gameConfig } from "../../src/lib/game/config";

const upload = (cookie: string, type: string, bytes: number) =>
  SELF.fetch("http://test/api/upload/sounds", {
    method: "POST",
    headers: { cookie, origin: "http://test", "content-type": type },
    body: new Uint8Array(bytes),
  });

const saveGame = (cookie: string, cards: unknown) =>
  SELF.fetch("http://test/api/settings/game", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ game: { locs: DEFAULT_LOCS, cards } }),
  });
const cardsOf = async () => ((await (await SELF.fetch("http://test/api/data")).json()) as { settings: { game: { cards: Record<string, unknown> } } }).settings.game.cards;

describe("Efeito sonoro da carta", () => {
  it("o admin envia um áudio curto e ele vai para o R2 em sounds/", async () => {
    const { cookie } = await login("admvicli");
    const res = await upload(cookie, "audio/mpeg", 2048);
    expect(res.status).toBe(200);
    const { url } = await res.json<{ url: string }>();
    expect(url).toMatch(/^\/img\/sounds\/[\w-]+\.mp3$/);
    const obj = await env.ASSETS_BUCKET.get(url.slice(5));
    expect(obj?.httpMetadata?.contentType).toBe("audio/mpeg");
  });

  it("recusa imagem, arquivo vazio, maior que 1 MB e quem não é admin", async () => {
    const { cookie } = await login("admvicli");
    expect((await upload(cookie, "image/png", 2048)).status).toBe(400);
    expect((await upload(cookie, "audio/ogg", 0)).status).toBe(400);
    expect((await upload(cookie, "audio/wav", 1024 * 1024 + 1)).status).toBe(400);
    const user = await login("qualquer");
    expect((await upload(user.cookie, "audio/mpeg", 2048)).status).toBe(403);
  });

  it("o som fica no ajuste da carta do Cardslock Game e só aceita endereço de som enviado", async () => {
    const { cookie } = await login("admvicli");
    expect((await saveGame(cookie, { p1: { sound: "/img/sounds/abc-1.ogg" }, p2: { cost: 2, sound: "https://exemplo.com/som.mp3" }, p3: { sound: "/img/players/a.png" } })).status).toBe(200);
    // o endereço de fora e a imagem caem; o resto do ajuste fica
    expect(await cardsOf()).toEqual({ p1: { sound: "/img/sounds/abc-1.ogg" }, p2: { cost: 2 } });
    // o editor carrega a configuração salva por gameConfig e salva de volta: o som não pode se perder no caminho
    expect(gameConfig({ locs: DEFAULT_LOCS, cards: await cardsOf() }).cards.p1).toEqual({ sound: "/img/sounds/abc-1.ogg" });
  });
});
