import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";
import type { ArtSubmission } from "../../src/lib/artSubmissions";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const admin = () => login("admvicli", ["twitch"], "190835130");
const base = "http://test/api/art-submissions";

const meta = { own: true, consent: true, credit: { name: "@artista", url: "https://x.com/artista" }, layout: { zoom: 140, x: 30, y: 70, frame: "deco", playerId: "p1" } };

function send(cookie: string, opts: { meta?: unknown; image?: BlobPart; fg?: BlobPart } = {}) {
  const form = new FormData();
  form.set("meta", JSON.stringify(opts.meta ?? meta));
  form.set("image", new File([opts.image ?? PNG], "arte.png"));
  if (opts.fg) form.set("fg", new File([opts.fg], "frente.png"));
  return SELF.fetch(base, { method: "POST", headers: { cookie, origin: "http://test" }, body: form });
}
const list = async (cookie: string, all = false) => (await (await SELF.fetch(base + (all ? "?all=1" : ""), { headers: { cookie } })).json()) as ArtSubmission[];
const json = (cookie: string, path: string, method: string, body?: unknown) =>
  SELF.fetch(`${base}/${path}`, { method, headers: { cookie, origin: "http://test", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("Banco de artes", () => {
  it("exige login", async () => {
    expect((await SELF.fetch(base, { method: "POST", headers: { origin: "http://test" }, body: new FormData() })).status).toBe(401);
  });

  it("envia arte com camada da frente e guarda o ajuste dentro dos limites", async () => {
    const { cookie } = await login("artista");
    const res = await send(cookie, { fg: PNG, meta: { ...meta, layout: { zoom: 999, x: -5, y: 70, fg: { zoom: 120, x: 40, y: 60 }, frame: "deco", playerId: "p1" } } });
    expect(res.status).toBe(200);
    const [s] = await list(cookie);
    expect(s.status).toBe("pending");
    expect(s.credit).toEqual({ name: "@artista", url: "https://x.com/artista" });
    expect(s.layout).toEqual({ zoom: 300, x: 0, y: 70, fg: { zoom: 120, x: 40, y: 60 }, frame: "deco", playerId: "p1" });
    expect(s.fg).toBeDefined();
    expect((await SELF.fetch(`http://test${s.image}`, { headers: { cookie } })).status).toBe(200);
  });

  it("recusa sem as confirmações, sem crédito ou com arquivo que não é imagem", async () => {
    const { cookie } = await login("artista2");
    expect((await send(cookie, { meta: { ...meta, consent: false } })).status).toBe(400);
    expect((await send(cookie, { meta: { ...meta, own: undefined } })).status).toBe(400);
    expect((await send(cookie, { meta: { ...meta, credit: { name: "" } } })).status).toBe(400);
    expect((await send(cookie, { meta: { ...meta, credit: { name: "@artista" } } })).status).toBe(400);
    expect((await send(cookie, { meta: { ...meta, credit: { name: "a", url: "javascript:alert(1)" } } })).status).toBe(400);
    expect((await send(cookie, { image: "<svg onload=alert(1)>" })).status).toBe(400);
    expect(await list(cookie)).toEqual([]);
  });

  it(`limita as artes em análise por pessoa`, async () => {
    const { cookie } = await login("artista3");
    for (let i = 0; i < 10; i++) expect((await send(cookie)).status).toBe(200);
    expect((await send(cookie)).status).toBe(409);
  });

  it("a imagem é privada: outra conta e o /img público não abrem", async () => {
    const { cookie } = await login("dona");
    await send(cookie);
    const [s] = await list(cookie);
    const other = await login("curioso");
    expect((await SELF.fetch(`http://test${s.image}`, { headers: { cookie: other.cookie } })).status).toBe(404);
    expect((await SELF.fetch(`http://test${s.image}`)).status).toBe(401);
    const row = await env.DB.prepare("SELECT image_key FROM art_submissions WHERE id = ?").bind(s.id).first<{ image_key: string }>();
    expect((await SELF.fetch(`http://test/img/${row!.image_key}`)).status).toBe(404);
    expect((await json(other.cookie, s.id, "DELETE")).status).toBe(404);
  });

  it("só admin vê todas, recusa e usa; arte só vai em carta especial", async () => {
    const { cookie } = await login("artista4");
    await send(cookie, { fg: PNG });
    const [s] = await list(cookie);
    expect((await SELF.fetch(`${base}?all=1`, { headers: { cookie } })).status).toBe(403);
    expect((await json(cookie, `${s.id}/use`, "POST", { playerId: "p1" })).status).toBe(403);
    expect((await json(cookie, s.id, "PATCH", { status: "rejected" })).status).toBe(403);

    const adm = await admin();
    expect((await list(adm.cookie, true)).find((x) => x.id === s.id)?.user).toBe("artista4");
    await seedPlayer("p1");
    expect((await json(adm.cookie, `${s.id}/use`, "POST", { playerId: "p1" })).status).toBe(400);
    await env.DB.prepare(`UPDATE players SET extra_json = '{"special":true}' WHERE id = 'p1'`).run();
    expect((await json(adm.cookie, `${s.id}/use`, "POST", { playerId: "p1" })).status).toBe(200);

    const p = await env.DB.prepare("SELECT extra_json FROM players WHERE id = 'p1'").first<{ extra_json: string }>();
    const art = JSON.parse(p!.extra_json).art;
    expect(art.url).toMatch(/^\/img\/players\/[\w-]+\.png$/);
    expect(art.fg.url).toMatch(/^\/img\/players\/[\w-]+\.png$/);
    expect(art).toMatchObject({ zoom: 140, x: 30, y: 70, credit: { name: "@artista", url: "https://x.com/artista" } });
    expect((await SELF.fetch(`http://test${art.url}`)).status).toBe(200);
    const [used] = await list(cookie);
    expect([used.status, used.usedPlayerId]).toEqual(["used", "p1"]);
    expect((await json(adm.cookie, s.id, "PATCH", { status: "pending" })).status).toBe(409);
    // usada, quem enviou não apaga mais; o admin pode
    expect((await json(cookie, s.id, "DELETE")).status).toBe(409);
    expect((await json(adm.cookie, s.id, "DELETE")).status).toBe(200);
    expect(await list(cookie)).toEqual([]);
  });

  it("recusa envio maior que o limite antes de ler o corpo", async () => {
    const { cookie } = await login("grandao");
    const res = await SELF.fetch(base, { method: "POST", headers: { cookie, origin: "http://test", "content-length": String(11 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" }, body: "x" });
    expect(res.status).toBe(413);
  });

  it("envios em paralelo não passam do limite", async () => {
    const { cookie } = await login("rajada");
    const res = await Promise.all(Array.from({ length: 15 }, () => send(cookie)));
    expect(res.filter((r) => r.status === 200)).toHaveLength(10);
    expect(await list(cookie)).toHaveLength(10);
    // cada envio aceito tem a imagem no R2; os recusados pelo limite não deixam nada
    const keys = new Set((await env.ASSETS_BUCKET.list({ prefix: "submissions/" })).objects.map((o) => o.key));
    const rows = await env.DB.prepare("SELECT image_key FROM art_submissions").all<{ image_key: string }>();
    expect(rows.results.every((r) => keys.has(r.image_key))).toBe(true);
    expect([...keys].filter((k) => k.endsWith("-bg.png"))).toHaveLength(rows.results.length);
  });

  it("recusada conta no limite até quem enviou apagar; arte recusada não vai para carta", async () => {
    const { cookie } = await login("recusado");
    for (let i = 0; i < 10; i++) await send(cookie);
    const adm = await admin();
    const [s] = await list(cookie);
    expect((await json(adm.cookie, s.id, "PATCH", { status: "rejected" })).status).toBe(200);
    expect((await send(cookie)).status).toBe(409);
    await seedPlayer("p2");
    await env.DB.prepare(`UPDATE players SET extra_json = '{"special":true}' WHERE id = 'p2'`).run();
    expect((await json(adm.cookie, `${s.id}/use`, "POST", { playerId: "p2" })).status).toBe(409);
    expect((await json(cookie, s.id, "DELETE")).status).toBe(200);
    expect((await send(cookie)).status).toBe(200);
  });

  it("dois usos ao mesmo tempo aplicam a arte numa carta só", async () => {
    const { cookie } = await login("disputada");
    await send(cookie);
    const [s] = await list(cookie);
    const adm = await admin();
    for (const id of ["p3", "p4"]) {
      await seedPlayer(id);
      await env.DB.prepare(`UPDATE players SET extra_json = '{"special":true}' WHERE id = ?`).bind(id).run();
    }
    const res = await Promise.all(["p3", "p4"].map((id) => json(adm.cookie, `${s.id}/use`, "POST", { playerId: id })));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("quem enviou apaga a própria arte em análise", async () => {
    const { cookie } = await login("artista5");
    await send(cookie);
    const [s] = await list(cookie);
    expect((await json(cookie, s.id, "DELETE")).status).toBe(200);
    expect(await list(cookie)).toEqual([]);
  });

  it("admin marca como usada à mão (sem carta) e pode voltar atrás; a lista traz a extensão", async () => {
    const { cookie } = await login("artista6");
    await send(cookie, { fg: PNG });
    const [s] = await list(cookie);
    expect([s.ext, s.fgExt]).toEqual(["png", "png"]);
    expect((await json(cookie, s.id, "PATCH", { status: "used" })).status).toBe(403);
    const adm = await admin();
    expect((await json(adm.cookie, s.id, "PATCH", { status: "used" })).status).toBe(200);
    const [used] = await list(cookie);
    expect([used.status, used.usedPlayerId]).toEqual(["used", undefined]);
    expect((await json(adm.cookie, s.id, "PATCH", { status: "pending" })).status).toBe(200);
    expect((await list(cookie))[0].status).toBe("pending");
    expect((await json(adm.cookie, s.id, "PATCH", { status: "aprovada" })).status).toBe(400);
  });

  it("guarda as cores e a espessura da moldura só válidas e só com moldura", async () => {
    const { cookie } = await login("artista7");
    await send(cookie, { meta: { ...meta, layout: { zoom: 100, x: 50, y: 50, frame: "deco", frameTune: { c1: "#FF0000", c2: "red;}", pad: 99, x: 1 } } } });
    await send(cookie, { meta: { ...meta, layout: { zoom: 100, x: 50, y: 50, frameTune: { c1: "#00ff00" } } } });
    const [semMoldura, comMoldura] = await list(cookie);
    expect(comMoldura.layout.frameTune).toEqual({ c1: "#ff0000", pad: 10 });
    expect(semMoldura.layout.frameTune).toBeUndefined();
  });
});
