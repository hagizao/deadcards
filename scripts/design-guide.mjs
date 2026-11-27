// Gera public/design/app.css (CSS do app já compilado) e public/design/card.html a partir do código.
// Uso: npm run build && npm run design:guide
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createJiti } from "jiti";

const here = new URL("../public/design/", import.meta.url);
const jiti = createJiti(import.meta.url, { jsx: true });
const { RARITY_TIERS, rarityStyleVars, ringSVG, particleSpecs } = await jiti.import("../src/lib/rarity.ts");

const assets = new URL("../dist/client/assets/", import.meta.url);
const cssFile = readdirSync(assets).find((f) => f.endsWith(".css"));
if (!cssFile) throw new Error("dist/client/assets sem CSS: rode npm run build antes");

// Estados forçados por classe (.is-hover, .is-focus, .is-active) para desenhar a matriz de estados sem interação.
const css = readFileSync(new URL(cssFile, assets), "utf8")
  .replace(/url\(\/assets\/(valveoracle|valvepulp)[^)]*\)/g, (_, f) => `url(fonts/${f === "valvepulp" ? "valvepulp-bold" : "valveoracle-semibold"}.ttf)`)
  .replace(/(?<!\(hover):hover/g, ":is(:hover,.is-hover)")
  .replace(/:focus-within/g, ":is(:focus-within,.is-focus)")
  .replace(/:focus-visible/g, ":is(:focus-visible,.is-focus)")
  .replace(/:active/g, ":is(:active,.is-active)");
writeFileSync(new URL("app.css", here), `/* gerado por scripts/design-guide.mjs a partir de dist/client/assets/${cssFile} */\n${css}`);

const OVR = { eternus: 95, ascendant: 90, oracle: 85, archon: 80, arcanist: 74, initiate: 64 };
const STATS = [["MIR", 92], ["MOV", 88], ["MAC", 81], ["POL", 77], ["SUP", 70], ["CON", 85]];
const attr = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");

function card(t, state = "") {
  const vars = { ...rarityStyleVars(t), transform: "perspective(900px)" };
  const parts = particleSpecs(t).map((p) => {
    const cls = p.type === "rise" ? "rk-p" : p.type === "twinkle" ? "rk-tw" : "rk-streak";
    const f = (n) => n.toFixed(2);
    return `<span class="${cls}" style="--x:${f(p.x)}%;--y:${f(p.y)}%;--s:${f(p.s)}px;--d:${f(p.d)}s;--dl:${f(p.dl)}s;--dx:${f(p.dx)}px;--po:${f(p.po)};--pc:${p.color}"></span>`;
  }).join("");
  const top = t.lvl >= 3 ? ' style="padding-top:26px"' : "";
  return `<div class="rk-wrap ${state}" data-rarity="${t.key}" style="${attr(vars)}">
  <div class="deadlock-card-shell card-size-team group select-none ${state}">
    <div class="deadlock-card-inner flex flex-col justify-between p-4 sm:p-5"${top}>
      <div class="absolute inset-0" style="background:radial-gradient(circle at 50% 30%, #3f3f46 0%, #09090b 100%)"></div>
      <div class="pointer-events-none absolute inset-0" style="background:linear-gradient(180deg, rgba(63,63,70,0) 52%, rgba(63,63,70,.5) 80%, rgba(9,9,11,.78) 100%)"></div>
      <svg class="rk-ring${t.lvl >= 3 ? " rk-ring-pulse" : ""}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${ringSVG(t)}</svg>
      ${t.lvl >= 3 ? '<div class="rk-glint"></div>' : ""}
      ${parts ? `<div class="rk-particles" aria-hidden="true">${parts}</div>` : ""}
      <div class="relative z-10 flex items-start justify-between gap-2">
        <div class="flex flex-col items-start">
          <span class="text-5xl leading-none font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">${OVR[t.key]}</span>
          <span class="mt-1.5 rounded-sm border border-white/25 bg-black/65 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-zinc-100 uppercase">Flex</span>
          <span class="mt-1.5 rounded-sm border border-white/35 bg-white/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-white uppercase">FA</span>
        </div>
      </div>
      <div class="relative z-10 mt-auto pb-8">
        <div class="mx-2 mb-2 border-b border-zinc-200/45 pb-1.5 text-center">
          <h3 class="truncate text-xl font-black tracking-[0.12em] text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">${t.name}</h3>
        </div>
        <div class="card-txt-shadow grid grid-cols-2 gap-x-5 gap-y-1.5 px-4 py-1">
          ${STATS.map(([k, v]) => `<div class="flex items-center justify-between leading-none"><span class="text-sm font-extrabold tracking-wider text-zinc-200">${k}</span><span class="text-lg font-black text-white">${v}</span></div>`).join("")}
        </div>
        <div class="mt-3 text-center leading-tight font-black uppercase" style="font-size:12px;letter-spacing:.2em;color:#f4f4f5;text-shadow:0 1px 6px rgba(0,0,0,.95)">Cardslock</div>
      </div>
      <button type="button" class="card-hover-overlay border-0 ${state.includes("is-focus") ? "is-focus" : ""}" aria-label="Visualizar carta de ${t.name}">
        <span class="card-hover-cta w-full max-w-[215px] rounded-xl bg-zinc-100 px-4 py-2.5 text-xs font-extrabold tracking-wider text-zinc-950 uppercase shadow-[0_0_24px_rgba(255,255,255,0.4)]">Visualizar Carta</span>
      </button>
    </div>
  </div>
</div>`;
}

const figure = (label, html) => `<div class="cell"><span class="tag">${label}</span>${html}</div>`;
const asc = RARITY_TIERS.find((t) => t.key === "ascendant");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Carta · Deadlock Cards</title>
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="guide.css">
</head>
<body>
<main>
  <nav><a href="index.html">Índice</a><a href="foundations.html">Fundações</a><a href="card.html" aria-current="page">Carta</a><a href="buttons.html">Botões</a><a href="surfaces.html">Superfícies</a></nav>
  <section>
    <h1>Carta</h1>
    <p class="lede"><code>src/components/Card.tsx</code>, variante <code>team</code>, sem arte (o fundo radial é o fallback do código). Moldura, anel, brilho e partículas vêm de <code>rarityStyleVars</code>, <code>ringSVG</code> e <code>particleSpecs</code>. A arte de verdade é feita por pessoas e não entra no guia.</p>
  </section>
  <section>
    <h2>Raridades</h2>
    <div class="row">${RARITY_TIERS.map((t) => figure(`${t.name} · ${t.tierKey} · OVR ${OVR[t.key]}+`, card(t))).join("")}</div>
  </section>
  <section>
    <h2>Estados</h2>
    <p class="lede">A carta inclina seguindo o ponteiro (mola, até ±11°), o que não aparece numa imagem parada. Não há estado desabilitado: a carta é sempre clicável quando abre o Spotlight.</p>
    <div class="row">
      ${figure("Normal", card(asc))}
      ${figure("Hover", card(asc, "is-hover"))}
      ${figure("Foco do teclado", card(asc, "is-focus"))}
    </div>
  </section>
</main>
</body>
</html>
`;
writeFileSync(new URL("card.html", here), html);
console.log(`app.css (${cssFile}) e card.html gerados`);
