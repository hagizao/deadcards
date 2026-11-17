// Converte as artes dos locais (PNG) para webp e sobe no R2 como locs/<id>.webp.
// uso: node scripts/import-locs.mjs <pasta> [--remote] [--dry]
// O nome do arquivo vira o id do local (sem acento, minúsculo, com hífen): "BUFF ESPÍRITO.png" → buff-espirito.
// sharp vem com o miniflare (dependência do @cloudflare/vite-plugin); não é dependência direta do projeto.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("uso: node scripts/import-locs.mjs <pasta> [--remote] [--dry]");
  process.exit(1);
}
const target = flags.includes("--remote") ? "--remote" : "--local";
const dry = flags.includes("--dry");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".wrangler", "locs");
const WRANGLER = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const BUCKET = "deadcards-assets";
/** Altura da arte: a faixa ocupa a tela toda na altura e corta os lados da imagem. */
const HEIGHT = 1080;

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Nomes de arquivo que não batem com o id do local. */
const ALIAS = { "universidade-de-umbrella": "universidade-de-umbria" };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const ids = new Set();
for (const f of files) {
  const base = slug(f.replace(/\.[^.]+$/, ""));
  const id = ALIAS[base] ?? base;
  if (ids.has(id)) throw new Error(`id repetido: ${id} (${f})`);
  ids.add(id);
  const file = join(out, `${id}.webp`);
  await sharp(join(dir, f)).resize({ height: HEIGHT, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toFile(file);
  console.log(`${id.padEnd(26)} ${(statSync(file).size / 1024).toFixed(0)} KB`);
  if (!dry) {
    execFileSync(process.execPath, [WRANGLER, "r2", "object", "put", `${BUCKET}/locs/${id}.webp`, "--file", file, "--content-type", "image/webp", target], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  }
}
console.log(`${ids.size} locais ${dry ? "convertidos (sem enviar)" : `enviados (${target})`}`);
