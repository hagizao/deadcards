// Copia o banco de produção (D1 remoto) para o D1 local, só lendo de produção.
// Produção é a fonte da verdade dos dados; o local é uma cópia descartável para testar código.
// O D1 local atual não é apagado: vai para .wrangler/backup/d1-<data> antes de ser substituído.
// As imagens do R2 não são copiadas.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const state = join(root, ".wrangler", "state", "v3", "d1");
const dump = join(root, ".wrangler", "pull", "prod.sql");
const run = (...args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: root, stdio: "inherit" });

mkdirSync(dirname(dump), { recursive: true });
console.log("1/3 exportando o D1 de produção (só leitura)...");
try {
  run("d1", "export", "deadcards", "--remote", "--output", dump);
} catch {
  console.error("\nFalhou ao ler produção. Rode `npx wrangler login` e tente de novo.");
  process.exit(1);
}

if (existsSync(state)) {
  const backup = join(root, ".wrangler", "backup", `d1-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dirname(backup), { recursive: true });
  try {
    renameSync(state, backup);
  } catch {
    console.error("\nNão deu para mover o D1 local. Pare o `npm run dev` e rode de novo.");
    process.exit(1);
  }
  console.log(`2/3 D1 local antigo guardado em ${backup}`);
}

console.log("3/3 carregando a cópia no D1 local e aplicando as migrations da branch...");
run("d1", "execute", "deadcards", "--local", "--file", dump);
run("d1", "migrations", "apply", "deadcards", "--local");
console.log("\nPronto: o D1 local agora é uma cópia de produção.");
