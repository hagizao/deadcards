import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { login } from "../helpers/fixtures";
import { handleOf, syncHandle } from "../../src/handles";
import type { PublicProfile } from "../../src/lib/profile";

function mockProviders(twitch: unknown, youtube: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.twitch.tv/")) return Response.json({ data: [{ login: twitch }] });
    if (url.startsWith("https://www.googleapis.com/youtube/")) return Response.json({ items: youtube ? [{ snippet: { customUrl: youtube } }] : [] });
    throw new Error(`unexpected ${url}`);
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("handle do perfil", () => {
  it("usa o nick da Twitch e o @ do YouTube no mesmo espaço, e a Twitch fica com o @ disputado", async () => {
    const { userId: streamer } = await login("Hagizao");
    const { userId: youtuber } = await login("Victor Barroso", ["google"]);
    const { userId: other } = await login("Outro", ["google"]);
    mockProviders("hagizao", "@Hagizao");
    await syncHandle(env, { userId: youtuber, providerId: "google", accessToken: "t" });
    expect(await handleOf(env, youtuber)).toBe("hagizao");
    await syncHandle(env, { userId: streamer, providerId: "twitch", accessToken: "t" });
    await syncHandle(env, { userId: youtuber, providerId: "google", accessToken: "t" });
    mockProviders("x", "@outro.canal");
    await syncHandle(env, { userId: other, providerId: "google", accessToken: "t" });
    expect(await handleOf(env, streamer)).toBe("hagizao");
    expect(await handleOf(env, youtuber)).toBeNull();
    expect(await handleOf(env, other)).toBe("outro.canal");

    vi.unstubAllGlobals();
    for (const key of ["hagizao", "%40HAGIZAO", streamer]) {
      expect(await SELF.fetch(`http://test/api/users/${key}`).then((r) => r.json())).toMatchObject({ id: streamer, handle: "hagizao", name: "Hagizao" });
    }
    expect(await SELF.fetch("http://test/api/users/@outro.canal").then((r) => r.json<PublicProfile>())).toMatchObject({ id: other });
    expect((await SELF.fetch("http://test/api/users/%E0%A4%A")).status).toBe(404);
  });

  it("ignora conta sem canal, nick inválido e falha do provedor", async () => {
    const { userId } = await login("fan", ["google"]);
    mockProviders("x", null);
    await syncHandle(env, { userId, providerId: "google", accessToken: "t" });
    mockProviders("Bad Name!", null);
    await syncHandle(env, { userId, providerId: "twitch", accessToken: "t" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    // a falha do provedor é registrada no console e não quebra o login; o espião só tira o erro esperado da saída do teste
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await syncHandle(env, { userId, providerId: "twitch", accessToken: "t" });
    expect(logged).toHaveBeenCalledWith("handle sync failed", expect.any(Error));
    logged.mockRestore();
    await syncHandle(env, { userId, providerId: "twitch", accessToken: null });
    expect(await handleOf(env, userId)).toBeNull();
  });

  it("mantém o provedor do primeiro handle e passa um nick reciclado para o novo dono", async () => {
    const { userId: first } = await login("first");
    const { userId: second } = await login("second");
    mockProviders("oldnick", "@first-channel");
    await syncHandle(env, { userId: first, providerId: "twitch", accessToken: "t" });
    await syncHandle(env, { userId: first, providerId: "google", accessToken: "t" });
    expect(await handleOf(env, first)).toBe("oldnick");

    mockProviders("newnick", null);
    await syncHandle(env, { userId: first, providerId: "twitch", accessToken: "t" });
    expect(await handleOf(env, first)).toBe("newnick");

    mockProviders("newnick", null);
    await syncHandle(env, { userId: second, providerId: "twitch", accessToken: "t" });
    expect(await handleOf(env, second)).toBe("newnick");
    expect(await handleOf(env, first)).toBeNull();
  });
});
