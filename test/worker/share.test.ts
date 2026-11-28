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
    expect(isSharePath("/lab/elenco/p1.p2")).toBe(true);
    // sem cartas, é a tela vazia do elenco: o site normal, sem prévia própria
    expect(isSharePath("/lab/elenco")).toBe(false);
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
    expect((await shareMeta(env, "/t/tm", origin))?.title).toBe("Team (TM) · Cardslock");
    // link antigo, pelo id, continua valendo
    expect((await shareMeta(env, "/t/t1", origin))?.title).toBe("Team (TM) · Cardslock");
    expect(await shareMeta(env, "/t/xx", origin)).toBeNull();
    expect((await shareMeta(env, "/u/nao-existe", origin))).toBeNull();
    expect((await shareMeta(env, "/c/nao-existe", origin))).toBeNull();
  });

  it("elenco dos sonhos: nome do link, OVR médio e as cartas na ordem; carta apagada fica de fora", async () => {
    await seedPlayer("sq1");
    await seedPlayer("sq2");
    await env.DB.prepare("UPDATE players SET name = 'Outro', ovr = 80 WHERE id = 'sq2'").run();
    const m = await shareMeta(env, "/lab/elenco/sq2.nao-existe.sq1", origin, "?n=%20Melhor%20dos%20EUA%20");
    expect(m?.title).toBe("Melhor dos EUA · Cardslock");
    expect(m?.description).toMatch(/^OVR \d+ · Outro \(.+\), Player \(.+\)$/);
    expect(m?.large).toBe(true);
    expect((await shareMeta(env, "/lab/elenco/sq1", origin))?.title).toBe("Elenco dos sonhos · Cardslock");
    expect(await shareMeta(env, "/lab/elenco/nao-existe", origin)).toBeNull();
  });

  it("escapa o texto nas tags", () => {
    const html = metaTags({ title: `"><script>x</script>`, description: "a & b" }, "https://cardslock.com/c/p1");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain(`content="summary"`);
  });
});
