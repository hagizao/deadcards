import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

async function put(cookie: string, id: string, extra: Record<string, unknown> = {}) {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  return SELF.fetch(`http://test/api/players/${id}`, {
    method: "PUT",
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: JSON.stringify({ name: id, teamId: "t1", stats: {}, ...extra }),
  });
}

const del = (cookie: string, id: string) =>
  SELF.fetch(`http://test/api/players/${id}`, { method: "DELETE", headers: { cookie, origin: "http://test" } });

async function stored(id: string) {
  const row = await env.DB.prepare("SELECT extra_json FROM players WHERE id = ?").bind(id).first<{ extra_json: string }>();
  return JSON.parse(row!.extra_json);
}

describe("Versões de carta", () => {
  it("valida variantOf ao salvar", async () => {
    const { cookie } = await login("admvicli");
    expect((await put(cookie, "vmain")).status).toBe(200);
    expect((await put(cookie, "vver", { variantOf: "vmain" })).status).toBe(200);
    expect((await stored("vver")).variantOf).toBe("vmain");
    expect((await put(cookie, "vself", { variantOf: "vself" })).status).toBe(200);
    expect((await stored("vself")).variantOf).toBeUndefined();
    expect((await put(cookie, "vx", { variantOf: "nao-existe" })).status).toBe(400);
    expect((await put(cookie, "vchain", { variantOf: "vver" })).status).toBe(400);
    expect((await put(cookie, "vmain", { variantOf: "vself" })).status).toBe(409);
  });

  it("herói jogado só fica marcado em versão", async () => {
    const { cookie } = await login("admvicli");
    await put(cookie, "hmain");
    expect((await put(cookie, "hmina", { variantOf: "hmain", hero: "Mina", altHero: true })).status).toBe(200);
    expect((await stored("hmina")).altHero).toBe(true);
    expect((await put(cookie, "hsolo", { altHero: true })).status).toBe(200);
    expect((await stored("hsolo")).altHero).toBeUndefined();
    expect((await put(cookie, "hstr", { variantOf: "hmain", altHero: "sim" })).status).toBe(200);
    expect((await stored("hstr")).altHero).toBeUndefined();
  });

  it("bloqueia apagar principal com versões", async () => {
    const { cookie } = await login("admvicli");
    await put(cookie, "dmain");
    await put(cookie, "dver", { variantOf: "dmain" });
    expect((await del(cookie, "dmain")).status).toBe(409);
    expect((await del(cookie, "dver")).status).toBe(200);
    expect((await del(cookie, "dmain")).status).toBe(200);
  });
});
