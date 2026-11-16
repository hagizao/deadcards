import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "../helpers/fixtures";

const api = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  SELF.fetch(`http://test${path}`, { ...init, headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) } });
const json = (body: unknown) => JSON.stringify(body);
const STATS = { MIR: 80, MAC: 80, SUP: 80, MOV: 80, POL: 80, CON: 80 };

// Trechos mínimos do HTML serializado do edl.gg (mesmo formato das páginas reais).
const MASTERLIST = `{kind:"teams-masterlist",rows:[
  {team:$R[1]={tag:"D6",name:"Dog6",slug:"dog6",region:"APAC",titles:0,logoUrl:"https://media.edl.gg/dog6.webp?v=1",countryCode:"CN"},cells:{}},
  {team:$R[2]={tag:"MYST",name:"Mystics",slug:"mystics",region:"SA",logoUrl:"https://media.edl.gg/myst.webp",countryCode:"BR"},cells:{}},
  {team:$R[3]={tag:null,name:"Light",slug:"light",region:"EU",logoUrl:"https://media.edl.gg/light.webp",countryCode:"REU"},cells:{}}]}`;
const player = (slug: string, alias: string) => `$R[9]={href:"/players/${slug}",role:"player",slug:"${slug}",alias:"${alias}",flagSrc:"x",fullName:null,countryCode:"CN",fallbackPictureSrc:"y"}`;
const TEAM_PAGE = `players:[${[["cakef", "Cakef"], ["zhurou", "Zhurou"], ["molanran", "MoLanran"], ["xinle", "Xinle"], ["ashman", "Ashman"]].map(([s, a]) => player(s, a)).join(",")}]
  href:"/events/ev/series/s1" href:"/events/ev/series/s1?match=match-1" {href:"/players/coach",role:"coach",slug:"coach",alias:"Coach"}`;
const stat = (slug: string, alias: string, team: string, hero: number) =>
  `{playerSlug:"${slug}",playerAlias:"${alias}",playerFullName:null,countryCode:"CN",teamSlug:"${team}",team:$R[5]={slug:"${team}",name:"X",tag:"X",score:0},heroId:${hero},kills:1}`;
const SERIES_PAGE = `teamOne:$R[1]={slug:"dog6",name:"Dog6",tag:"D6",logo:"https://media.edl.gg/dog6.webp",score:2},teamTwo:$R[2]={slug:"foe",name:"Full of Ego",tag:null,logo:"https://media.edl.gg/foe.webp",score:1},
  overall:{playerStats:[{playerSlug:"cakef",playerAlias:"Cakef",teamSlug:"dog6",team:$R[5]={slug:"dog6"},heroId:null}]},
  matches:[{matchNumber:1,status:"completed",deadlockMatchId:900,oracleMatchId:null,winnerSlug:"dog6",durationSeconds:1,draft:[],playerStats:[${stat("cakef", "Cakef", "dog6", 10)},${stat("foe1", "Foe One", "foe", 11)}]},
  {matchNumber:2,status:"completed",deadlockMatchId:901,oracleMatchId:null,winnerSlug:"foe",durationSeconds:1,draft:[],playerStats:[${stat("cakef", "Cakef", "dog6", 10)}]}]`;
// Formato do /v1/matches/metadata em lote: start_time em texto UTC e times como "Team0"/"Team1".
const meta = (id: number) => ({ match_id: id, start_time: "1970-01-01 00:16:40", duration_s: 60, winning_team: "Team0", players: [
  { account_id: 111, team: "Team0", hero_id: 10, kills: 1, deaths: 1, assists: 1, net_worth: 1 }, { account_id: 999, team: "Team1", hero_id: 11, kills: 1, deaths: 1, assists: 1, net_worth: 1 }] });

function mockFetch(extra: Record<string, () => Response> = {}) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    for (const [part, make] of Object.entries(extra)) if (url.includes(part)) return make();
    if (url === "https://edl.gg/teams") return new Response(MASTERLIST);
    if (url === "https://edl.gg/teams/dog6") return new Response(TEAM_PAGE);
    if (url === "https://edl.gg/events/ev/series/s1") return new Response(SERIES_PAGE);
    const m = url.match(/\/v1\/matches\/metadata\?match_ids=([\d,]+)&match_mode=PrivateLobby&/);
    if (m) return Response.json(m[1].split(",").map((id) => meta(Number(id))));
    if (url.endsWith("/v1/assets/heroes")) return Response.json([{ id: 10, name: "Mirage" }, { id: 20, name: "Haze" }]);
    return new Response("", { status: 404 });
  });
  return calls;
}

const addTeam = (id: string, name: string, edlSlug: string | null = null, logo: string | null = null) =>
  env.DB.prepare("INSERT INTO teams (id, name, tag, region, logo_key, edl_slug) VALUES (?, ?, 'TG', 'Europa', ?, ?)").bind(id, name, logo, edlSlug).run();
const addCard = (id: string, teamId: string, name: string, accountId: number | null = null, extra: object = {}) =>
  env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2, account_id, extra_json) VALUES (?, ?, ?, 'Abrams', ?, '#000', '#000', ?, ?)")
    .bind(id, teamId, name, json(STATS), accountId, json(extra)).run();
const accountOf = (id: string) => env.DB.prepare("SELECT account_id FROM players WHERE id = ?").bind(id).first<number | null>("account_id");

// Partida já lida: cada jogador do EDL (slug, herói) -> account no info_json.
async function seedResolved(accounts: Record<string, number> = { cakef: 111, zhurou: 222, molanran: 333, xinle: 444 }) {
  const heroes: Record<string, number> = { cakef: 10, zhurou: 20, molanran: 30, xinle: 40 };
  const slugs = Object.keys(accounts);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, done, team1_slug, team2_slug, winner_slug, info_json) VALUES (1, 'ev', 's1', 1, 'dog6', 'foe', 'dog6', ?)")
      .bind(json({ start: 1, dur: 1, win: 0, players: slugs.map((s) => ({ a: accounts[s], t: 0, h: heroes[s], k: 1, d: 1, as: 1, nw: 1 })) })),
    ...slugs.map((s) => env.DB.prepare("INSERT INTO edl_match_players (match_id, player_slug, alias, team_slug, hero_id) VALUES (1, ?, ?, 'dog6', ?)").bind(s, s, heroes[s])),
    env.DB.prepare("INSERT OR IGNORE INTO edl_scanned (key) VALUES ('ev/s1')"),
  ]);
}

describe("times ligados ao EDL", () => {
  beforeEach(async () => {
    await env.DB.batch(["player_matches", "edl_matches", "edl_scanned", "edl_match_players", "edl_teams"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    await env.DB.prepare("DELETE FROM players WHERE team_id IN ('t0', 't1', 't9', 't2x', 'fa1', 'fa0')").run();
    await env.DB.prepare("DELETE FROM teams WHERE id IN ('fa1', 'fa0')").run();
    await env.DB.prepare("DELETE FROM api_cache WHERE cache_key = 'edl-teams' OR cache_key LIKE '/v1/assets%'").run();
  });
  afterEach(() => vi.restoreAllMocks());

  it("rotas novas exigem admin (edl-series é pública)", async () => {
    mockFetch();
    const { cookie } = await login("fan");
    for (const [path, method] of [["/api/edl/teams", "GET"], ["/api/teams/t1/edl-import", "GET"], ["/api/teams/t1/edl-import", "POST"], ["/api/players/p1/backfill", "GET"], ["/api/players/p1/backfill", "POST"]]) {
      expect((await api(path, { method })).status).toBe(403);
      expect((await api(path, { method, cookie })).status).toBe(403);
    }
    expect((await api("/api/teams/t1/edl-series")).status).toBe(200);
  });

  it("edlSlug ausente mantém, null desliga, inválido dá 400 e repetido dá 409", async () => {
    const { cookie } = await login("admvicli");
    const put = (id: string, body: object) => api(`/api/teams/${id}`, { method: "PUT", cookie, body: json({ name: "T", tag: "T", ...body }) });
    const slugOf = (id: string) => env.DB.prepare("SELECT edl_slug FROM teams WHERE id = ?").bind(id).first<string | null>("edl_slug");
    expect((await put("a", { edlSlug: "dog6" })).status).toBe(200);
    expect((await put("a", {})).status).toBe(200);
    expect(await slugOf("a")).toBe("dog6");
    expect((await (await api("/api/data")).json() as { teams: { id: string; edlSlug?: string }[] }).teams.find((t) => t.id === "a")?.edlSlug).toBe("dog6");
    for (const edlSlug of ["Dog 6", "", "x".repeat(65), 5, "a/b"]) expect((await put("a", { edlSlug })).status).toBe(400);
    expect((await put("b", { edlSlug: "dog6" })).status).toBe(409);
    expect((await put("a", { edlSlug: null })).status).toBe(200);
    expect(await slugOf("a")).toBeNull();
    expect((await (await api("/api/data")).json() as { teams: { edlSlug?: string }[] }).teams[0]).not.toHaveProperty("edlSlug");
  });

  it("lista os times do EDL com cache, filtro e região mapeada", async () => {
    const calls = mockFetch();
    const { cookie } = await login("admvicli");
    const all = await (await api("/api/edl/teams", { cookie })).json() as { slug: string; region: string }[];
    expect(all.map((t) => [t.slug, t.region])).toEqual([["dog6", "Ásia"], ["mystics", "Brasil"], ["light", "Europa"]]);
    expect(await (await api("/api/edl/teams?q=MYS", { cookie })).json()).toEqual([
      { slug: "mystics", name: "Mystics", tag: "MYST", region: "Brasil", countryCode: "BR", logoUrl: "https://media.edl.gg/myst.webp" },
    ]);
    expect(calls.filter((u) => u.endsWith("/teams"))).toHaveLength(1);
  });

  it("preview: 409 sem edlSlug; só diferenças, ações e conflitos; não altera nada", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6 BR");
    expect((await api("/api/teams/t1/edl-import", { cookie })).status).toBe(409);
    await env.DB.prepare("UPDATE teams SET edl_slug = 'dog6' WHERE id = 't1'").run();
    await seedResolved();
    await addCard("c-cakef", "t1", " CAKEF ");           // nome casa, sem conta -> link
    await addCard("c-zhurou", "t1", "Zhurou", 555);      // outra conta, conta nova livre -> relink
    await addCard("c-xinle", "t1", "Xinle", 666);        // outra conta, mas a nova é de outro jogador -> conflict
    await addCard("c-rival", "t0", "Rival", 444);
    await addCard("c-molan", "t2x", "Outro", 333);        // conta em carta de outro time, outro nome -> linked
    await addCard("c-saiu", "t1", "Saiu");                // não bate com ninguém -> leaver
    await addCard("c-velho", "t1", "Velho", null, { inactive: true });
    await addCard("c-skin", "t1", "Cakef Skin", null, { variantOf: "c-cakef" });
    await addCard("c-outro-time", "t0", "Alguem Longe");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO teams (id, name, tag, region) VALUES ('fa1', 'Agentes Livres', 'FA', 'Sem Time'), ('fa0', 'Zeta Livres', 'ZL', 'Sem Time')"),
      ...[1, 2, 3].map((n) => env.DB.prepare("INSERT INTO player_matches (account_id, match_id, source, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won) VALUES (555, ?, 'pub', 1, 1, 1, 1, 1, 1, 1, 1)").bind(n)),
    ]);
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM players").first<number>("n");
    const res = await (await api("/api/teams/t1/edl-import", { cookie })).json() as { fields: unknown[]; roster: { slug: string; action: string; accountId?: number; heroIds: number[]; card?: { by: string; playerId: string; accountId?: number }; reason?: string; oldMatches?: number }[]; leavers: unknown[]; freeAgentTeams: unknown[] };
    expect(res.fields).toEqual([
      { key: "name", current: "Dog6 BR", edl: "Dog6" }, { key: "tag", current: "TG", edl: "D6" },
      { key: "region", current: "Europa", edl: "Ásia" }, { key: "logo", edl: "https://media.edl.gg/dog6.webp?v=1" },
    ]);
    const by = Object.fromEntries(res.roster.map((r) => [r.slug, r]));
    expect(Object.keys(by)).toEqual(["cakef", "zhurou", "molanran", "xinle", "ashman"]); // coach fora
    expect([by.cakef.action, by.cakef.accountId, by.cakef.card?.by]).toEqual(["link", 111, "name"]);
    expect(by.cakef.heroIds).toEqual([10]);
    expect(by.zhurou).toMatchObject({ action: "relink", accountId: 222, oldMatches: 3, card: { playerId: "c-zhurou", accountId: 555, by: "name" } });
    expect(by.xinle.action).toBe("conflict");
    expect(by.xinle.reason).toContain("outra conta");
    expect(by.xinle).not.toHaveProperty("oldMatches");
    expect([by.molanran.action, by.molanran.card?.by]).toEqual(["linked", "account"]);
    expect(by.ashman.action).toBe("unresolved");
    // só carta base ativa do time que não bate por conta nem por nome; "Sem Time" exceto o próprio
    expect(res.leavers).toEqual([{ playerId: "c-saiu", name: "Saiu" }]);
    expect(res.freeAgentTeams).toEqual([{ id: "fa1", name: "Agentes Livres", tag: "FA" }, { id: "fa0", name: "Zeta Livres", tag: "ZL" }]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM players").first("n")).toBe(before);
  });

  it("preview descobre séries e partidas do time dentro do orçamento", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6", "dog6");
    const res = await (await api("/api/teams/t1/edl-import", { cookie })).json() as { roster: { slug: string; accountId?: number; action: string }[] };
    expect(res.roster.find((r) => r.slug === "cakef")).toMatchObject({ accountId: 111, action: "create" });
    expect(res.roster.find((r) => r.slug === "ashman")?.action).toBe("unresolved");
    const m = await env.DB.prepare("SELECT team1_slug a, team2_slug b, winner_slug w, done FROM edl_matches ORDER BY match_id").all();
    expect(m.results).toEqual([{ a: "dog6", b: "foe", w: "dog6", done: 1 }, { a: "dog6", b: "foe", w: "foe", done: 1 }]);
    expect(await env.DB.prepare("SELECT hero_id FROM edl_match_players WHERE match_id = 900 AND player_slug = 'cakef'").first("hero_id")).toBe(10);
    expect(await env.DB.prepare("SELECT 1 FROM edl_scanned WHERE key = 'ev/s1'").first()).toBeTruthy();
  });

  it("apply: aceita os válidos, recusa o resto e não mexe em mais nada", async () => {
    mockFetch({ "media.edl.gg": () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }) });
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6 BR", "dog6");
    await seedResolved();
    await addCard("c-cakef", "t1", "Cakef");
    await addCard("c-zhurou", "t1", "Zhurou", 555);
    await addCard("c-outra", "t1", "Outra");
    await addCard("c-xinle", "t1", "Xinle");               // já existe pelo nome -> create recusado
    await addCard("c-mola", "t9", "Alguem", 333);          // account 333 já em carta (nome diferente)
    const apply = async (body: object) => (await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json(body) })).json() as Promise<{ applied: { fields: string[]; linked: string[]; created: string[] }; skipped: { item: string; reason: string }[] }>;
    const r = await apply({
      fields: ["region", "logo"],
      link: [
        { playerId: "c-cakef", accountId: 111 },     // ok
        { playerId: "c-zhurou", accountId: 222 },      // carta com outra conta
        { playerId: "c-outra", accountId: 333 },       // conta usada em outra carta de outro nome
        { playerId: "c-outra", accountId: 777 },       // conta fora do elenco
        { playerId: "nope", accountId: 444 },          // carta inexistente
      ],
      create: [{ slug: "molanran" }, { slug: "xinle" }, { slug: "fantasma" }, { slug: "ashman" }, { slug: "zhurou" }],
    });
    expect(r.applied.fields).toEqual(["region", "logo"]);
    expect(r.applied.linked).toEqual(["c-cakef"]);
    expect(r.applied.created).toHaveLength(0);
    expect(Object.fromEntries(r.skipped.map((s) => [s.item, s.reason]))).toMatchObject({
      "c-zhurou": expect.stringContaining("outra conta"), "c-outra": expect.any(String), nope: "carta não existe",
      molanran: expect.stringContaining("já existe"), xinle: expect.stringContaining("já existe a carta"), fantasma: "jogador fora do elenco do EDL", ashman: expect.any(String), zhurou: expect.any(String),
    });
    expect(await accountOf("c-cakef")).toBe(111);
    expect(await accountOf("c-outra")).toBeNull();
    const t = await env.DB.prepare("SELECT name, tag, region, logo_key FROM teams WHERE id = 't1'").first<{ name: string; tag: string; region: string; logo_key: string }>();
    expect([t?.name, t?.tag, t?.region]).toEqual(["Dog6 BR", "TG", "Ásia"]);
    expect(t?.logo_key).toMatch(/^teams\/.+\.webp$/);
    expect(await env.ASSETS_BUCKET.get(t!.logo_key)).not.toBeNull();

    // create válido: valores padrão do blankPlayer, account preenchido, herói pelo mais jogado
    const ok = await apply({ fields: [], link: [], create: [{ slug: "zhurou" }, { slug: "zhurou" }] });
    expect(ok.applied.created).toHaveLength(0);
    await env.DB.prepare("DELETE FROM players WHERE id = 'c-zhurou'").run();
    const ok2 = await apply({ fields: [], link: [], create: [{ slug: "zhurou" }, { slug: "zhurou" }] });
    expect(ok2.applied.created).toHaveLength(1);
    const card = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(ok2.applied.created[0]).first<Record<string, unknown>>();
    expect(card).toMatchObject({ team_id: "t1", name: "Zhurou", position: "Flex", hero: "Haze", ovr: 86, c1: "#0e7490", c2: "#082f49", account_id: 222, stats_json: json({ MIR: 88, MAC: 86, SUP: 82, MOV: 87, POL: 85, CON: 86 }), extra_json: json({ footer: "Deadlock Cards" }) });
    expect(String(card?.id)).toMatch(/^p-/);
  });

  it("apply valida o corpo e exige admin/edlSlug", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "T");
    const post = (body: unknown, id = "t1") => api(`/api/teams/${id}/edl-import`, { method: "POST", cookie, body: json(body) });
    expect((await post({ fields: [], link: [], create: [] })).status).toBe(409);
    await env.DB.prepare("UPDATE teams SET edl_slug = 'dog6' WHERE id = 't1'").run();
    for (const body of [null, {}, { fields: ["id"], link: [], create: [] }, { fields: [], link: [{ playerId: "p", accountId: 0 }], create: [] },
      { fields: [], link: [{ playerId: "a b", accountId: 1 }], create: [] }, { fields: [], link: [], create: [{ slug: "A B" }] }, { fields: [], link: [], create: Array(51).fill({ slug: "x" }) }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect((await post({ fields: [], link: [], create: [] }, "zzz")).status).toBe(404);
  });

  it("o mesmo account em cartas de mesmo nome (versões) não é conflito; create segue proibido", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6", "dog6");
    await seedResolved({ cakef: 111, zhurou: 222, molanran: 333, xinle: 444 });
    await addCard("c-v1", "t0", "Cakef", 111, { inactive: true }); // versão guardada em outro time
    await addCard("c-v2", "t1", "cakef");                             // carta do time sem conta -> link
    await addCard("c-z", "t1", "Zhurou");                             // sem conta; conta 222 está em carta de outro nome
    await addCard("c-z2", "t0", "Outro Nome", 222);
    await addCard("c-m", "t0", "MoLanran", 333, { inactive: true });  // só existe a versão fora do time
    const res = await (await api("/api/teams/t1/edl-import", { cookie })).json() as { roster: { slug: string; action: string; card?: { playerId: string } }[] };
    const by = Object.fromEntries(res.roster.map((r) => [r.slug, r]));
    expect([by.cakef.action, by.cakef.card?.playerId]).toEqual(["link", "c-v2"]);
    expect(by.zhurou.action).toBe("conflict");
    expect([by.molanran.action, by.molanran.card?.playerId]).toEqual(["linked", "c-m"]);

    const apply = async (body: object) => (await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json(body) })).json() as Promise<{ applied: { linked: string[]; created: string[] }; skipped: { item: string; reason: string }[] }>;
    const r = await apply({ fields: [], link: [{ playerId: "c-v2", accountId: 111 }, { playerId: "c-z", accountId: 222 }], create: [{ slug: "molanran" }] });
    expect(r.applied).toMatchObject({ linked: ["c-v2"], created: [] });
    expect(r.skipped.map((s) => s.item).sort()).toEqual(["c-z", "molanran"]);
    expect(await accountOf("c-v2")).toBe(111);
    expect(await accountOf("c-v1")).toBe(111);
    expect(await accountOf("c-z")).toBeNull();
  });

  it("apply relink: troca só o account_id e recusa carta de outro time, outro nome, inativa e conta de outro jogador", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6", "dog6");
    await seedResolved();
    await addCard("c-ok", "t1", "  ZHUROU ", 555);
    await addCard("c-longe", "t9", "Molanran", 556);        // outro time
    await addCard("c-nome", "t1", "Nome Errado", 557);       // nome não bate com o jogador da conta
    await addCard("c-inativa", "t1", "Xinle", 558, { inactive: true });
    await addCard("c-usada", "t1", "Cakef", 559);
    await addCard("c-dono", "t0", "Outro Jogador", 111);     // conta 111 é de outro jogador
    await addCard("c-sem", "t1", "Ashman");                  // sem conta: é caso de vincular
    await env.DB.prepare("INSERT INTO player_matches (account_id, match_id, source, hero_id, start_time, duration_s, kills, deaths, assists, net_worth, won) VALUES (555, 1, 'pub', 1, 1, 1, 1, 1, 1, 1, 1)").run();
    const rows = () => env.DB.prepare("SELECT * FROM players ORDER BY id").all();
    const before = (await rows()).results;
    const apply = async (body: object) => (await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json(body) })).json() as Promise<{ applied: { relinked: string[]; linked: string[]; released: string[] }; skipped: { item: string; reason: string }[] }>;
    const r = await apply({
      fields: [], link: [], create: [],
      relink: [
        { playerId: "c-ok", accountId: 222 }, { playerId: "c-ok", accountId: 222 }, { playerId: "c-longe", accountId: 333 }, { playerId: "c-nome", accountId: 444 },
        { playerId: "c-inativa", accountId: 444 }, { playerId: "c-usada", accountId: 111 }, { playerId: "c-sem", accountId: 333 }, { playerId: "c-ok", accountId: 777 }, { playerId: "nope", accountId: 222 },
      ],
    });
    expect(r.applied).toMatchObject({ relinked: ["c-ok"], linked: [], released: [] });
    const why = r.skipped.map((s) => `${s.item}: ${s.reason}`);
    expect(why).toEqual(expect.arrayContaining([
      expect.stringContaining("c-ok: conta já usada"), expect.stringContaining("c-longe: carta de outro time"), expect.stringContaining("c-nome: o nome"),
      expect.stringContaining("c-inativa: só cartas base ativas"), expect.stringContaining("c-usada: conta já usada"), expect.stringContaining("c-sem: o nome"),
      expect.stringContaining("c-ok: conta fora do elenco"), "nope: carta não existe",
    ]));
    const after = (await rows()).results;
    expect(after.filter((x, i) => JSON.stringify(x) !== JSON.stringify(before[i])).map((x) => [x.id, x.account_id])).toEqual([["c-ok", 222]]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM player_matches WHERE account_id = 555").first("n")).toBe(1);
  });

  it("apply release: move só o team_id de quem saiu para um time Sem Time e recusa o resto", async () => {
    mockFetch();
    const { cookie } = await login("admvicli");
    await addTeam("t1", "Dog6", "dog6");
    await addTeam("t0", "Europeu");
    await env.DB.prepare("INSERT INTO teams (id, name, tag, region) VALUES ('fa1', 'Agentes Livres', 'FA', 'Sem Time')").run();
    await seedResolved();
    await addCard("c-saiu", "t1", "Saiu", 700);
    await addCard("c-saiu2", "t1", "Saiu Também");
    await addCard("c-nick", "t1", "Apelido", 111);           // bate por conta -> não saiu
    await addCard("c-nome", "t1", "cakef");                  // bate por nome -> não saiu
    await addCard("c-longe", "t0", "Longe");                 // de outro time
    await addCard("c-velho", "t1", "Velho", null, { inactive: true });
    const rows = () => env.DB.prepare("SELECT * FROM players ORDER BY id").all();
    const before = (await rows()).results;
    const apply = async (body: object) => (await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json(body) })).json() as Promise<{ applied: { released: string[]; relinked: string[] }; skipped: { item: string; reason: string }[] }>;
    const r = await apply({
      fields: [], link: [], create: [],
      release: [
        { playerId: "c-saiu", teamId: "fa1" }, { playerId: "c-saiu", teamId: "fa1" }, { playerId: "c-saiu2", teamId: "t0" }, { playerId: "c-saiu2", teamId: "t1" }, { playerId: "c-saiu2", teamId: "naoexiste" },
        { playerId: "c-nick", teamId: "fa1" }, { playerId: "c-nome", teamId: "fa1" }, { playerId: "c-longe", teamId: "fa1" }, { playerId: "c-velho", teamId: "fa1" },
      ],
    });
    expect(r.applied.released).toEqual(["c-saiu"]);
    expect(r.skipped.filter((s) => s.item !== "c-saiu").map((s) => s.item)).toEqual(["c-saiu2", "c-saiu2", "c-saiu2", "c-nick", "c-nome", "c-longe", "c-velho"]);
    expect(r.skipped.find((s) => s.item === "c-saiu2")?.reason).toContain("Sem Time");
    expect(r.skipped.find((s) => s.item === "c-nick")?.reason).toContain("não saiu");
    const after = (await rows()).results;
    expect(after.filter((x, i) => JSON.stringify(x) !== JSON.stringify(before[i])).map((x) => [x.id, x.team_id])).toEqual([["c-saiu", "fa1"]]);
    expect((await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json({ fields: [], link: [], create: [], release: [{ playerId: "a b", teamId: "fa1" }] }) })).status).toBe(400);
    expect((await api("/api/teams/t1/edl-import", { method: "POST", cookie, body: json({ fields: [], link: [], create: [], relink: [{ playerId: "p", accountId: 0 }] }) })).status).toBe(400);
  });

  it("edl-series: séries do time com placar, adversário e jogos, mais recentes primeiro", async () => {
    await addTeam("t1", "Dog6", "dog6");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO edl_teams (slug, name, tag, logo_url) VALUES ('foe', 'Full of Ego', 'FOE', 'https://media.edl.gg/foe.webp')"),
      ...[[1, "ev", "s1", 1, "dog6", 100], [2, "ev", "s1", 2, "foe", 200], [3, "ev", "s1", 3, "foe", 300], [4, "ev2", "s2", 1, "dog6", 900]].map(([id, ev, s, g, w, start]) =>
        env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, game, team1_slug, team2_slug, winner_slug, done, info_json) VALUES (?,?,?,?, 'foe', 'dog6', ?, 1, ?)")
          .bind(id, ev, s, g, w, json({ start, dur: 1, win: 0, players: [] }))),
      env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, game, team1_slug, team2_slug, winner_slug) VALUES (5, 'ev3', 's3', 1, 'a', 'b', 'a')"),
    ]);
    const res = await (await api("/api/teams/t1/edl-series")).json();
    expect(res).toEqual([
      { event: "ev2", series: "s2", opponent: { name: "Full of Ego", tag: "FOE", logoUrl: "https://media.edl.gg/foe.webp" }, score: [1, 0], won: true, startTime: 900, games: [{ matchId: 4, game: 1, won: true }] },
      { event: "ev", series: "s1", opponent: { name: "Full of Ego", tag: "FOE", logoUrl: "https://media.edl.gg/foe.webp" }, score: [1, 2], won: false, startTime: 100,
        games: [{ matchId: 1, game: 1, won: true }, { matchId: 2, game: 2, won: false }, { matchId: 3, game: 3, won: false }] },
    ]);
    expect(await (await api("/api/teams/semslug/edl-series")).json()).toEqual([]);
  });
});

describe("backfill do perfil nas outras cartas", () => {
  const backfill = (cookie: string, id: string, body?: object) =>
    api(`/api/players/${id}/backfill`, { cookie, ...(body ? { method: "POST", body: json(body) } : {}) });

  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM player_matches"), env.DB.prepare("DELETE FROM edl_matches")]);
    await addTeam("t1", "Time 1");
    await addTeam("t2", "Time 2");
    await addCard("main", "t1", "Kaze", 100);
    await addCard("v-inativa", "t1", "Kaze", null, { inactive: true });
    await addCard("v-outro-time", "t2", "  kaze  ", null);
    await addCard("v-variant", "t1", "Kaze Skin", null, { variantOf: "main" });
    await addCard("v-conflito", "t2", "KAZE", 200);
    await addCard("v-igual", "t2", "Kaze", 100);
    await addCard("alheia", "t2", "Lumi", null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("409 sem account e 404 sem carta", async () => {
    const { cookie } = await login("admvicli");
    await addCard("sem", "t1", "Sem Conta");
    expect((await backfill(cookie, "sem")).status).toBe(409);
    expect((await backfill(cookie, "zzz")).status).toBe(404);
  });

  it("lista variantes e cartas de mesmo nome, sem a própria e sem as que já têm a conta", async () => {
    const { cookie } = await login("admvicli");
    const list = (await (await backfill(cookie, "main")).json()) as { playerId: string; by: string; accountId?: number; inactive?: boolean; teamId: string }[];
    expect(Object.fromEntries(list.map((c) => [c.playerId, c.by]))).toEqual({ "v-inativa": "name", "v-outro-time": "name", "v-variant": "variant", "v-conflito": "name" });
    expect(list.find((c) => c.playerId === "v-conflito")?.accountId).toBe(200);
    expect(list.find((c) => c.playerId === "v-inativa")).toMatchObject({ inactive: true, teamId: "t1" });
    expect(list.find((c) => c.playerId === "v-outro-time")).not.toHaveProperty("accountId");
  });

  it("POST valida, pula quem tem outra conta ou não é candidata e atualiza só o account_id", async () => {
    const { cookie } = await login("admvicli");
    for (const body of [{}, { playerIds: "x" }, { playerIds: ["a b"] }, { playerIds: Array(101).fill("x") }]) expect((await backfill(cookie, "main", body)).status).toBe(400);
    const before = await env.DB.prepare("SELECT * FROM players WHERE id = 'v-inativa'").first<Record<string, unknown>>();
    const res = await (await backfill(cookie, "main", { playerIds: ["v-inativa", "v-variant", "v-conflito", "alheia", "main", "v-igual", "nada"] })).json() as { updated: string[]; skipped: { item: string; reason: string }[] };
    expect(res.updated).toEqual(["v-inativa", "v-variant"]);
    expect(res.skipped.map((s) => s.item).sort()).toEqual(["alheia", "main", "nada", "v-conflito", "v-igual"].sort());
    expect(res.skipped.find((s) => s.item === "v-conflito")?.reason).toContain("outra conta");
    expect(await accountOf("v-inativa")).toBe(100);
    expect(await accountOf("v-variant")).toBe(100);
    expect(await accountOf("v-conflito")).toBe(200);
    expect(await accountOf("alheia")).toBeNull();
    expect(await accountOf("v-outro-time")).toBeNull();
    expect(await env.DB.prepare("SELECT * FROM players WHERE id = 'v-inativa'").first()).toEqual({ ...before, account_id: 100 });
  });

  it("roda o linkEdl depois de vincular", async () => {
    const { cookie } = await login("admvicli");
    await env.DB.prepare("INSERT INTO edl_matches (match_id, event, series, done, info_json) VALUES (7, 'ev', 's', 1, ?)")
      .bind(json({ start: 5, dur: 1, win: 0, players: [{ a: 100, t: 0, h: 1, k: 1, d: 1, as: 1, nw: 1 }] })).run();
    await backfill(cookie, "main", { playerIds: ["v-inativa"] });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM player_matches WHERE account_id = 100").first("n")).toBe(1);
  });
});
