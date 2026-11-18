import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [savePath, ...flags] = process.argv.slice(2);
if (!savePath) {
  console.error("uso: node scripts/import-save.mjs <save.json> [--remote] [--dry]");
  process.exit(1);
}
const target = flags.includes("--remote") ? "--remote" : "--local";
const dry = flags.includes("--dry");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".wrangler", "import");
const WRANGLER = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const BUCKET = "deadcards-assets";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

const save = JSON.parse(readFileSync(savePath, "utf8"));
if (save.app !== "deadlock-cards" || !save.data) throw new Error("arquivo não é um save do deadlock-cards");
const d = save.data;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const uploads = [];
function stash(dataUrl, keyBase) {
  const m = typeof dataUrl === "string" && DATA_URL.exec(dataUrl);
  if (!m) return null;
  const key = `${keyBase}.${EXT[m[1]]}`;
  const file = join(out, key.replace(/\//g, "__"));
  writeFileSync(file, Buffer.from(m[2], "base64"));
  uploads.push({ key, file, mime: m[1] });
  return key;
}

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sql = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const json = (v) => sql(JSON.stringify(v));
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// upsert em vez de DELETE: user_cards e redeem_codes têm ON DELETE CASCADE em players
// só as chaves de settings que o save reescreve: o resto (como "game", a configuração do Cardslock Game com os efeitos
// sonoros enviados) fica intacto
const lines = ["DELETE FROM heroes;", "DELETE FROM settings WHERE key IN ('tierConfig', 'bg', 'bgImageKey', 'homeHeroKey');"];

for (const t of d.teams ?? []) {
  const logoKey = stash(t.logo, `teams/${slug(t.id)}`);
  lines.push(`INSERT INTO teams (id, name, tag, region, logo_key, bg_json) VALUES (${sql(t.id)}, ${sql(t.name)}, ${sql(t.tag)}, ${sql(t.region || "Europa")}, ${sql(logoKey)}, ${t.bg ? json({ ...t.bg, imageUrl: "" }) : "NULL"}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, tag=excluded.tag, region=excluded.region, logo_key=excluded.logo_key, bg_json=excluded.bg_json;`);
}

const EXTRA = ["footer", "footerSize", "footerColor", "special", "specialText", "frame", "variantOf", "inactive"];
for (const p of d.players ?? []) {
  const extra = Object.fromEntries(EXTRA.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
  if (p.art?.url) {
    const key = stash(p.art.url, `players/${slug(p.id)}`);
    if (key) extra.art = { ...p.art, url: `/img/${key}` };
  }
  const ovr = Number.isFinite(Number(p.ovr)) && p.ovr !== null && p.ovr !== "" ? Math.round(Number(p.ovr)) : null;
  lines.push(`INSERT INTO players (id, team_id, name, position, hero, stats_json, ovr, c1, c2, history_json, extra_json) VALUES (${sql(p.id)}, ${sql(p.teamId)}, ${sql(p.name)}, ${sql(p.position || "Flex")}, ${sql(p.hero)}, ${json(p.stats)}, ${sql(ovr)}, ${sql(p.c1)}, ${sql(p.c2)}, ${json(p.history ?? [])}, ${json(extra)}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, position=excluded.position, hero=excluded.hero, stats_json=excluded.stats_json, ovr=excluded.ovr, c1=excluded.c1, c2=excluded.c2, history_json=excluded.history_json, extra_json=excluded.extra_json;`);
}

for (const [name, h] of Object.entries(d.heroSettings ?? {})) {
  const key = stash(h?.url, `heroes/${slug(name)}`);
  if (!key) continue;
  lines.push(`INSERT INTO heroes (name, image_key, zoom, x, y) VALUES (${sql(name)}, ${sql(key)}, ${num(h.zoom, 100)}, ${num(h.x, 50)}, ${num(h.y, 30)});`);
}

const settings = { tierConfig: d.tierConfig, bg: d.bg ? { ...d.bg, imageUrl: "" } : undefined };
if (d.bgImageMode === "custom") settings.bgImageKey = stash(d.bgImage, "bg/main");
if (d.homeHeroId === "custom" || d.homeHeroImage) settings.homeHeroKey = stash(d.homeHeroImage, "home/hero");
for (const [k, v] of Object.entries(settings)) if (v) lines.push(`INSERT INTO settings (key, value_json) VALUES (${sql(k)}, ${json(v)});`);

const keepPlayers = (d.players ?? []).map((p) => sql(p.id)).join(", ") || "NULL";
const keepTeams = (d.teams ?? []).map((t) => sql(t.id)).join(", ") || "NULL";
lines.push(`DELETE FROM players WHERE id NOT IN (${keepPlayers}) AND id NOT IN (SELECT player_id FROM user_cards) AND id NOT IN (SELECT player_id FROM redeem_codes);`);
lines.push(`DELETE FROM teams WHERE id NOT IN (${keepTeams}) AND id NOT IN (SELECT team_id FROM players);`);

const sqlFile = join(out, "import.sql");
writeFileSync(sqlFile, lines.join("\n") + "\n");

const playerIds = new Set((d.players ?? []).map((p) => p.id));
console.assert(lines.filter((l) => l.startsWith("INSERT INTO players")).length === playerIds.size, "todos os jogadores viram INSERT");
console.log(`${d.teams?.length ?? 0} times, ${playerIds.size} jogadores, ${uploads.length} imagens → ${target}`);
if (dry) process.exit(0);

const wrangler = (...args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
for (const [i, u] of uploads.entries()) {
  wrangler("r2", "object", "put", `${BUCKET}/${u.key}`, "--file", u.file, "--content-type", u.mime, target);
  console.log(`[${i + 1}/${uploads.length}] ${u.key}`);
}
wrangler("d1", "execute", "deadcards", "--file", sqlFile, target, "--yes");
console.log("importação concluída");
