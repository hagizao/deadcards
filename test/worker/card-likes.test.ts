import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { likesPath } from "../../src/lib/likes";

function likes(method: string, id: string, cookie?: string, origin?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  return SELF.fetch(`http://test${likesPath(id)}`, { method, headers });
}

describe("Curtidas das cartas especiais", () => {
  beforeEach(async () => {
    await seedPlayer("esp");
    await seedPlayer("comum");
    await env.DB.prepare(`UPDATE players SET extra_json = '{"special":true}' WHERE id = 'esp'`).run();
  });

  it("total é público, curtir exige login, método e origem certos", async () => {
    expect(await (await likes("GET", "esp")).json()).toEqual({ count: 0, liked: false });
    expect((await likes("PUT", "esp")).status).toBe(401);
    const { cookie } = await login("fan");
    expect((await likes("POST", "esp", cookie)).status).toBe(405);
    expect((await likes("PUT", "esp", cookie, "https://evil.example")).status).toBe(403);
    expect((await likes("GET", "a b")).status).toBe(400);
  });

  it("uma curtida por conta, repetir não soma e descurtir tira", async () => {
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    expect(await (await likes("PUT", "esp", cookie)).json()).toEqual({ count: 1, liked: true });
    expect(await (await likes("PUT", "esp", cookie)).json()).toEqual({ count: 1, liked: true });
    expect(await (await likes("PUT", "esp", other)).json()).toEqual({ count: 2, liked: true });
    expect(await (await likes("GET", "esp")).json()).toEqual({ count: 2, liked: false });
    expect(await (await likes("GET", "esp", cookie)).json()).toEqual({ count: 2, liked: true });
    expect(await (await likes("DELETE", "esp", cookie)).json()).toEqual({ count: 1, liked: false });
    expect(await (await likes("DELETE", "esp", cookie)).json()).toEqual({ count: 1, liked: false });
  });

  it("só carta especial pode ser curtida", async () => {
    const { cookie } = await login("fan");
    expect((await likes("PUT", "comum", cookie)).status).toBe(404);
    expect((await likes("PUT", "nao-existe", cookie)).status).toBe(404);
    expect(await (await likes("GET", "comum")).json()).toEqual({ count: 0, liked: false });
  });
});
