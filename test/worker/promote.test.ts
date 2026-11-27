import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

async function seed() {
  await env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')").run();
  await env.DB.prepare("DELETE FROM players").run();
  const rows: [string, string][] = [
    ["m", "{}"],
    ["v1", '{"variantOf":"m","inactive":true}'],
    ["v2", '{"variantOf":"m","special":true}'],
    ["x", "{}"],
  ];
  for (const [id, extra] of rows) {
    await env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, extra_json) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, "t1", id, "h", "{}", "#000", "#fff", extra).run();
  }
}

async function extra(id: string) {
  const row = await env.DB.prepare("SELECT extra_json FROM players WHERE id = ?").bind(id).first<{ extra_json: string }>();
  return JSON.parse(row!.extra_json);
}

function promote(id: string, cookie?: string, method = "POST") {
  return SELF.fetch(`http://test/api/players/${id}/promote`, { method, headers: { ...(cookie ? { cookie } : {}), origin: "http://test" } });
}

describe("Tornar versão a principal", () => {
  beforeEach(seed);

  it("recusa sem login e método errado", async () => {
    expect((await promote("v1")).status).toBe(403);
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await promote("v1", cookie, "GET")).status).toBe(405);
  });

  it("troca principal e versões numa só operação", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await promote("v1", cookie)).status).toBe(200);
    expect(await extra("v1")).toEqual({});
    expect(await extra("m")).toEqual({ variantOf: "v1" });
    expect(await extra("v2")).toEqual({ variantOf: "v1", special: true });
    expect(await extra("x")).toEqual({});
  });

  it("recusa carta que já é principal e id inexistente", async () => {
    const { cookie } = await login("admvicli", ["twitch"], "190835130");
    expect((await promote("m", cookie)).status).toBe(400);
    expect((await promote("nope", cookie)).status).toBe(404);
  });
});
