import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { login, seedCode, seedPlayer } from "../helpers/fixtures";
import { PROFILE_CARD_PATH } from "../../src/lib/profile";

const redeem = (cookie: string, headers: Record<string, string>) =>
  SELF.fetch("http://test/api/redeem", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, ...headers },
    body: JSON.stringify({ code: "VALID-CODE" }),
  });

describe("origem das escritas", () => {
  it("recusa escrita vinda de outro site e aceita a do próprio site", async () => {
    await seedPlayer();
    await seedCode("VALID-CODE", "p1");
    const { cookie } = await login("fan");
    const evil = await redeem(cookie, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toMatchObject({ code: "origin" });
    expect((await redeem(cookie, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await env.DB.prepare("SELECT uses FROM redeem_codes WHERE code = 'VALID-CODE'").first("uses")).toBe(0);
    expect((await redeem(cookie, { origin: "http://test" })).status).toBe(200);
  });

  it("não barra leitura de outro site", async () => {
    expect((await SELF.fetch("http://test/api/health", { headers: { origin: "https://evil.example" } })).status).toBe(200);
  });
});

describe("chaves de imagem", () => {
  it("não grava chave fora do formato de /img", async () => {
    const { cookie } = await login("admin", ["twitch"], "190835130");
    const res = await SELF.fetch("http://test/api/teams/t9", {
      method: "PUT",
      headers: { cookie, origin: "http://test", "content-type": "application/json" },
      body: JSON.stringify({ name: "Time", tag: "TM", logo: '/img/teams/x"),url(https://evil.example/a.png' }),
    });
    expect(res.status).toBe(200);
    expect(await env.DB.prepare("SELECT logo_key FROM teams WHERE id = 't9'").first("logo_key")).toBeNull();
  });

  it("serve imagem com nosniff", async () => {
    await env.ASSETS_BUCKET.put("teams/a.png", new Uint8Array([1]), { httpMetadata: { contentType: "image/png" } });
    const res = await SELF.fetch("http://test/img/teams/a.png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await res.arrayBuffer();
  });
});

describe("histórico da carta do perfil", () => {
  it("guarda só as últimas 20 versões", async () => {
    const { cookie, userId } = await login("fan");
    for (let i = 0; i < 23; i++) {
      const res = await SELF.fetch(`http://test${PROFILE_CARD_PATH}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: `Fan ${i}`, hero: "Abrams", stats: { MIR: 70, MAC: 70, SUP: 70, MOV: 70, POL: 70, CON: 70 } }),
      });
      expect(res.status).toBe(200);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM profile_card_history WHERE user_id = ?").bind(userId).first("n")).toBe(20);
  });
});

describe("login por idToken", () => {
  it("está desligado", async () => {
    // o Better Auth registra a recusa como erro no console; o espião só tira o erro esperado da saída do teste
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await SELF.fetch("http://test/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: "http://test", "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", idToken: { token: "x", accessToken: "y" } }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("ID_TOKEN_NOT_SUPPORTED");
    logged.mockRestore();
  });
});
