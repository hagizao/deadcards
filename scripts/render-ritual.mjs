// Grava o fundo ritual (src/lib/ritualBackdrop.ts) como vídeo em loop: public/ritual/ritual.webm, ritual.mp4 e o pôster.
// O site toca o vídeo em vez de desenhar o canvas a cada quadro, que ocupava a thread principal e travava a rolagem.
// Uso: com `npm run dev` rodando, PW_DIR=<pasta com playwright> node scripts/render-ritual.mjs [url do dev]
// Precisa de ffmpeg no PATH. O tom é um cinza médio (o brilho das cores das abas): a cor entra por cima em CSS.
/* global document, window -- o page.evaluate roda no navegador */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:5173";
const W = 1280, H = 720, FPS = 30, LOOP = 10, FADE = 1.5;
const { chromium } = createRequire(join(process.env.PW_DIR ?? process.cwd(), "noop.js"))("playwright");
const out = join(import.meta.dirname, "..", "public", "ritual");
const frames = mkdtempSync(join(tmpdir(), "ritual-"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  const { RitualBackdrop } = await import("/src/lib/ritualBackdrop.ts");
  document.body.innerHTML = "";
  const cv = document.createElement("canvas");
  document.body.append(cv);
  const e = new RitualBackdrop(cv, "#8c8c8c");
  e.running = true;
  Object.assign(window, { ritual: { cv, e } });
});
const total = Math.round((LOOP + FADE) * FPS);
for (let i = 0; i < total; i++) {
  const png = await page.evaluate((i) => { const { cv, e } = window.ritual; e.draw(i / 30, 1 / 30); return cv.toDataURL("image/png").split(",")[1]; }, i);
  writeFileSync(join(frames, `f${String(i).padStart(4, "0")}.png`), Buffer.from(png, "base64"));
}
await browser.close();

// loop sem emenda: os primeiros FADE segundos misturam o fim gravado (LOOP..LOOP+FADE) com o começo (0..FADE)
const seq = join(frames, "f%04d.png");
const loop = [
  "-framerate", String(FPS), "-i", seq,
  "-filter_complex",
  `[0]split[a][b];[a]trim=start=${LOOP}:end=${LOOP + FADE},setpts=PTS-STARTPTS[tail];` +
  `[b]split[c][d];[c]trim=end=${FADE},setpts=PTS-STARTPTS[head];[d]trim=start=${FADE}:end=${LOOP},setpts=PTS-STARTPTS[body];` +
  `[tail][head]blend=all_expr='A*(1-T/${FADE})+B*(T/${FADE})'[mixed];[mixed][body]concat=n=2:v=1,format=yuv420p[v]`,
  "-map", "[v]",
];
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
ff(...loop, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-row-mt", "1", "-an", join(out, "ritual.webm"));
ff(...loop, "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(out, "ritual.mp4"));
// o primeiro quadro do loop é o quadro LOOP gravado (o começo da mistura)
ff("-i", join(frames, `f${String(LOOP * FPS).padStart(4, "0")}.png`), "-q:v", "80", join(out, "ritual-poster.webp"));
rmSync(frames, { recursive: true, force: true });
console.log("public/ritual/: ritual.webm, ritual.mp4, ritual-poster.webp");
