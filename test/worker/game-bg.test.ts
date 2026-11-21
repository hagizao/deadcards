import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

function put(body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch("http://test/api/settings/app", { method: "PUT", headers, body: JSON.stringify(body) });
}

const gameBgOf = async () => ((await (await SELF.fetch("http://test/api/data")).json()) as { settings: { gameBg?: string } }).settings.gameBg;

describe("Foto de fundo do Cardslock Game", () => {
  it("só admin troca", async () => {
    const { cookie } = await login("fan");
    expect((await put({ gameBg: "/img/bg/salao.webp" })).status).toBe(403);
    expect((await put({ gameBg: "/img/bg/salao.webp" }, cookie)).status).toBe(403);
  });

  it("salva a imagem do R2 e devolve em /api/data", async () => {
    const { cookie } = await login("AdmVicli");
    expect((await put({ gameBg: "/img/bg/salao.webp" }, cookie)).status).toBe(200);
    expect(await gameBgOf()).toBe("/img/bg/salao.webp");
  });

  it("endereço de fora do R2 não entra; null remove", async () => {
    const { cookie } = await login("AdmVicli");
    await put({ gameBg: "/img/bg/salao.webp" }, cookie);
    await put({ gameBg: "https://exemplo.com/x.png" }, cookie);
    expect(await gameBgOf()).toBeUndefined();
    await put({ gameBg: "/img/bg/salao.webp" }, cookie);
    await put({ gameBg: null }, cookie);
    expect(await gameBgOf()).toBeUndefined();
  });

  it("salvar outra parte da aparência não apaga a foto", async () => {
    const { cookie } = await login("AdmVicli");
    await put({ gameBg: "/img/bg/salao.webp" }, cookie);
    await put({ homeHero: null }, cookie);
    expect(await gameBgOf()).toBe("/img/bg/salao.webp");
  });
});
