import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { seedPlayer } from "../helpers/fixtures";
import { isSharePath, metaTags, shareMeta } from "../../src/share";

const origin = "https://cardslock.com";

describe("prévia dos links compartilhados", () => {
  it("só /c/, /t/ e /u/ passam pelo Worker", () => {
    expect(isSharePath("/c/p1")).toBe(true);
    expect(isSharePath("/t/t1")).toBe(true);
    expect(isSharePath("/u/@x")).toBe(true);
    expect(isSharePath("/teams")).toBe(false);
    expect(isSharePath("/c/a/b")).toBe(false);
  });

  it("carta: nome, time, OVR e a arte com o crédito", async () => {
    await seedPlayer("share1");
    await env.DB.prepare(`UPDATE players SET extra_json = ? WHERE id = 'share1'`)
      .bind(JSON.stringify({ special: true, specialText: "MVP", art: { url: "/img/players/a.png", zoom: 100, x: 50, y: 50, credit: { name: "@artista" } } })).run();
    const m = await shareMeta(env, "/c/share1", origin);
    expect(m?.title).toBe("Player (TM) · Cardslock");
    expect(m?.description).toContain("MVP");
    expect(m?.description).toContain("Arte por @artista");
    expect(m?.image).toBe("https://cardslock.com/img/players/a.png");
    expect(m?.large).toBe(true);
  });

  it("time e perfil; o que não existe fica sem prévia própria", async () => {
    await seedPlayer("share2");
    expect((await shareMeta(env, "/t/t1", origin))?.title).toBe("Team (TM) · Cardslock");
    expect((await shareMeta(env, "/u/nao-existe", origin))).toBeNull();
    expect((await shareMeta(env, "/c/nao-existe", origin))).toBeNull();
  });

  it("escapa o texto nas tags", () => {
    const html = metaTags({ title: `"><script>x</script>`, description: "a & b" }, "https://cardslock.com/c/p1");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain(`content="summary"`);
  });
});
