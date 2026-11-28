// Artes simuladas no banco de artes, só no D1 e no R2 LOCAIS, para testar o Editor › Artes enviadas no `npm run dev`.
// Uso: npm run db:seed-art   (rode de novo para recriar; só mexe nas linhas e imagens com id "seed-")
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const BUCKET = "deadcards-assets";
const dir = mkdtempSync(join(tmpdir(), "seed-art-"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const wrangler = (...args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });

// PNG RGBA mínimo, sem dependência
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set(pixel(x / w, y / h), y * (w * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// fundo: degradê com um "sol" e faixas, nas cores dadas
const art = (c1, c2, c3) => (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.38);
  const base = mix(c1, c2, v);
  const glow = Math.max(0, 1 - d * 3);
  const band = Math.sin((u + v) * 40) > 0.85 ? 0.25 : 0;
  return [...mix(base, c3, Math.min(1, glow + band)), 255];
};
// frente: silhueta transparente embaixo
const front = (c) => (u, v) => (v > 0.62 + Math.sin(u * 9) * 0.05 && Math.abs(u - 0.5) < 0.42 ? [...c, 255] : [0, 0, 0, 0]);

const now = Date.now();
const H = 3600e3;
const users = [["seed-user-1", "ArtistaTeste"], ["seed-user-2", "PintoraDemo"], ["seed-user-3", "Rabisco"]];
const items = [
  { id: "seed-1", user: 0, credit: ["@artistateste", "https://instagram.com/artistateste"], size: [900, 1260], colors: [[40, 10, 80], [200, 60, 120], [255, 210, 120]], layout: { zoom: 110, x: 50, y: 40, frame: "deco", frameTune: { c1: "#b04cff", c2: "#ffd6f5", pad: 7 } }, at: now - 0.5 * H },
  { id: "seed-2", user: 0, credit: ["@artistateste", "https://instagram.com/artistateste"], size: [900, 1260], colors: [[5, 40, 60], [20, 160, 140], [200, 255, 230]], layout: { zoom: 100, x: 50, y: 50, frame: "circuito", fg: { zoom: 100, x: 50, y: 50 } }, fg: [10, 20, 30], at: now - 5 * H },
  { id: "seed-3", user: 1, credit: ["Pintora", "https://x.com/pintora"], size: [420, 600], colors: [[60, 20, 10], [220, 90, 30], [255, 240, 180]], layout: { zoom: 130, x: 45, y: 35, frame: "chamas" }, at: now - 26 * H },
  { id: "seed-4", user: 2, credit: ["Rabisco", null], size: [1000, 1400], colors: [[10, 10, 30], [60, 70, 160], [180, 200, 255]], layout: { zoom: 100, x: 50, y: 50, frame: "gelo" }, at: now - 50 * H },
  { id: "seed-5", user: 2, credit: ["Rabisco", "https://artstation.com/rabisco"], size: [900, 1260], colors: [[20, 30, 10], [90, 140, 40], [230, 255, 170]], layout: { zoom: 120, x: 50, y: 45 }, status: "rejected", reason: "Não combina com o estilo das cartas.", at: now - 80 * H },
];

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = [
  "DELETE FROM art_submissions WHERE id LIKE 'seed-%';",
  ...users.map(([id, name]) => `INSERT OR REPLACE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (${q(id)}, ${q(name)}, ${q(`${id}@seed.local`)}, 0, ${q(new Date().toISOString())}, ${q(new Date().toISOString())});`),
];

console.log("1/2 gravando as imagens no R2 local...");
for (const it of items) {
  const bgKey = `submissions/${it.id}-bg.png`;
  const fgKey = it.fg ? `submissions/${it.id}-fg.png` : null;
  const bgFile = join(dir, `${it.id}-bg.png`);
  writeFileSync(bgFile, png(...it.size, art(...it.colors)));
  wrangler("r2", "object", "put", `${BUCKET}/${bgKey}`, "--local", "--file", bgFile, "--content-type", "image/png");
  if (fgKey) {
    const fgFile = join(dir, `${it.id}-fg.png`);
    writeFileSync(fgFile, png(...it.size, front(it.fg)));
    wrangler("r2", "object", "put", `${BUCKET}/${fgKey}`, "--local", "--file", fgFile, "--content-type", "image/png");
  }
  sql.push(
    "INSERT INTO art_submissions (id, user_id, image_key, fg_key, layout_json, credit_name, credit_url, status, reject_reason, created_at) VALUES " +
    `(${[it.id, users[it.user][0], bgKey, fgKey, JSON.stringify(it.layout), it.credit[0], it.credit[1], it.status ?? "pending", it.reason, Math.round(it.at)].map(q).join(", ")});`,
  );
}

console.log("2/2 gravando as artes no D1 local...");
const sqlFile = join(dir, "seed.sql");
writeFileSync(sqlFile, sql.join("\n"));
wrangler("d1", "execute", "deadcards", "--local", "--file", sqlFile);
rmSync(dir, { recursive: true, force: true });
console.log(`Pronto: ${items.length} artes simuladas. Abra Editor › Artes enviadas no npm run dev.`);
