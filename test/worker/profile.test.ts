import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import { PROFILE_CARD_PATH, type ProfileCard, type ProfileCardState, type PublicProfile } from "../../src/lib/profile";

const stats = (v: number) => ({ MIR: v, MAC: v, SUP: v, MOV: v, POL: v, CON: v });
const myCard: ProfileCard = { name: "Fan", hero: "Abrams", stats: stats(70) };

function card(method: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return SELF.fetch(`http://test${PROFILE_CARD_PATH}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("Minha carta", () => {
  it("exige login e valida a carta", async () => {
    const { cookie } = await login("fan");
    expect((await card("GET")).status).toBe(401);
    expect((await card("PUT", undefined, myCard)).status).toBe(401);
    expect((await card("PATCH", cookie, { published: true })).status).toBe(405);
    for (const bad of [
      { ...myCard, name: " " },
      { ...myCard, name: "x".repeat(25) },
      { ...myCard, hero: "" },
      { ...myCard, stats: { ...stats(70), MIR: 100 } },
      { ...myCard, stats: { ...stats(70), CON: 0 } },
      { ...myCard, stats: { ...stats(70), POL: 50.5 } },
      { name: "Fan", hero: "Abrams", stats: { MIR: 70 } },
      null,
    ]) expect((await card("PUT", cookie, bad)).status).toBe(400);
    expect(await (await card("GET", cookie)).json()).toEqual({ history: [] });
  });

  it("guarda versões só quando a carta muda e isola por usuário", async () => {
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    const first = await (await card("PUT", cookie, { ...myCard, name: "  Fan  ", extra: 1 })).json<ProfileCardState>();
    expect(first.history).toHaveLength(1);
    expect(first.history[0].card).toEqual(myCard);
    expect(await (await card("PUT", cookie, myCard)).json()).toEqual(first);
    expect(await (await card("GET", other)).json()).toEqual({ history: [] });

    const next = await (await card("PUT", cookie, { ...myCard, stats: stats(99) })).json<ProfileCardState>();
    expect(next.history).toHaveLength(2);
    expect(next.history[0].card.stats.MIR).toBe(99);
    expect(next.history[1]).toEqual(first.history[0]);
  });

  it("mostra o perfil público sem dados privados", async () => {
    const { cookie, userId } = await login("fan");
    const publicFetch = (id: string) => SELF.fetch(`http://test/api/users/${id}`);
    expect((await publicFetch("nope")).status).toBe(404);
    expect((await publicFetch("bad%20id")).status).toBe(404);
    expect(await (await publicFetch(userId)).json()).toEqual({ id: userId, handle: null, name: "fan", image: null, card: null, cards: [], favorites: [], artist: null });

    await seedPlayer("p1");
    await env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'p1')").bind(userId).run();
    await card("PUT", cookie, myCard);
    const profile = await (await publicFetch(userId)).json<PublicProfile>();
    expect(profile).toEqual({ id: userId, handle: null, name: "fan", image: null, card: myCard, cards: ["p1"], favorites: [], artist: null });
    expect(JSON.stringify(profile)).not.toContain("@");
  });
});
