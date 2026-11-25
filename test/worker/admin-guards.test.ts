import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

const req = (cookie: string, path: string, method: string, body?: unknown) =>
  SELF.fetch(`http://test${path}`, {
    method,
    headers: { cookie, origin: "http://test", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedTeams() {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO teams (id, name, tag) VALUES ('ta', 'A', 'AA'), ('tb', 'B', 'BB')"),
    env.DB.prepare(`INSERT INTO players (id, team_id, name, position, hero, stats_json, c1, c2, history_json, extra_json)
      VALUES ('x', 'ta', 'X', 'Flex', 'Abrams', '{}', '#000', '#000', '[]', '{}'),
             ('x2', 'tb', 'X', 'Flex', 'Abrams', '{}', '#000', '#000', '[]', '{"variantOf":"x"}')`),
  ]);
}

describe("guardas do admin", () => {
  it("não apaga time com versões de jogador em outro time", async () => {
    const { cookie } = await login("admvicli");
    await seedTeams();
    const res = await req(cookie, "/api/teams/ta", "DELETE");
    expect(res.status).toBe(409);
    expect(await env.DB.prepare("SELECT 1 FROM players WHERE id = 'x'").first()).not.toBeNull();
    expect((await req(cookie, "/api/teams/tb", "DELETE")).status).toBe(200);
  });

  it("não apaga time que está em um tipo de pack", async () => {
    const { cookie } = await login("admvicli");
    await env.DB.prepare("INSERT INTO teams (id, name, tag) VALUES ('tp', 'P', 'PP')").run();
    await env.DB.prepare("INSERT INTO pack_types (id, name, odds_json, teams_json) VALUES ('only-tp', 'Só P', '{\"alt\":80,\"signature\":15,\"special\":5}', '[\"tp\"]')").run();
    const res = await req(cookie, "/api/teams/tp", "DELETE");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("in_pack");
  });

  it("recusa faixas de raridade malformadas e aceita as válidas", async () => {
    const { cookie } = await login("admvicli");
    for (const tierConfig of [[null], "x", [{ key: "S" }], [{ key: "S", min: "88" }]]) {
      expect((await req(cookie, "/api/settings/app", "PUT", { tierConfig })).status).toBe(400);
    }
    expect((await req(cookie, "/api/settings/app", "PUT", { tierConfig: [{ key: "S", min: 88, max: 92, bg: "", text: "" }] })).status).toBe(200);
  });

  it("URL com escape malformado dá 400, não 500", async () => {
    const { cookie } = await login("admvicli");
    expect((await SELF.fetch("http://test/img/%E0")).status).toBe(400);
    expect((await req(cookie, "/api/players/%E0", "PUT", {})).status).toBe(400);
    expect((await req(cookie, "/api/players/%E0/promote", "POST")).status).toBe(400);
    expect((await req(cookie, "/api/codes/%E0", "DELETE")).status).toBe(400);
  });
});
