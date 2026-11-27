import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { currentUser } from "../../src/auth";
import { login } from "../helpers/fixtures";

const me = (cookie: string) => currentUser(env, new Request("http://test/api/me", { headers: { cookie } }));

describe("currentUser().admin", () => {
  it("é admin com conta twitch cujo id está em ADMINS", async () => {
    const { cookie } = await login("qualquer", ["google", "twitch"], "190835130");
    expect((await me(cookie))?.admin).toBe(true);
  });

  it("não é admin só por ter o nome de um admin", async () => {
    const { cookie } = await login("190835130", ["twitch"]);
    expect((await me(cookie))?.admin).toBe(false);
  });

  it("não é admin com nome de admin vindo do google e twitch qualquer", async () => {
    const { cookie } = await login("admvicli", ["google", "twitch"]);
    expect((await me(cookie))?.admin).toBe(false);
  });

  it("não é admin quando o id é de outro provedor", async () => {
    const { userId, cookie } = await login("fan", ["google"]);
    await env.DB.prepare("UPDATE account SET accountId = '190835130' WHERE userId = ?").bind(userId).run();
    expect((await me(cookie))?.admin).toBe(false);
  });
});
