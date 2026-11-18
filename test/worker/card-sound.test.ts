import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

const upload = (cookie: string, type: string, bytes: number) =>
  SELF.fetch("http://test/api/upload/sounds", {
    method: "POST",
    headers: { cookie, origin: "http://test", "content-type": type },
    body: new Uint8Array(bytes),
  });

async function savePlayer(cookie: string, sound: unknown) {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  return SELF.fetch("http://test/api/players/p1", {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ name: "P", teamId: "t1", stats: {}, sound }),
  });
}

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

  it("salva o som na carta e aceita só endereço de som enviado", async () => {
    const { cookie } = await login("admvicli");
    expect((await savePlayer(cookie, "/img/sounds/abc-1.ogg")).status).toBe(200);
    const row = await env.DB.prepare("SELECT extra_json FROM players WHERE id = 'p1'").first<{ extra_json: string }>();
    expect(JSON.parse(row!.extra_json).sound).toBe("/img/sounds/abc-1.ogg");
    expect((await savePlayer(cookie, "https://exemplo.com/som.mp3")).status).toBe(400);
    expect((await savePlayer(cookie, "/img/players/a.png")).status).toBe(400);
    expect((await savePlayer(cookie, 5)).status).toBe(400);
    expect((await savePlayer(cookie, undefined)).status).toBe(200);
    const cleared = await env.DB.prepare("SELECT extra_json FROM players WHERE id = 'p1'").first<{ extra_json: string }>();
    expect(JSON.parse(cleared!.extra_json).sound).toBeUndefined();
  });
});
