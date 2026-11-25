import gsap from "gsap";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { PackSoundId } from "./packSounds";

/** 0 = comum, 1 = rara (S ou especial), 2 = Eternus. */
export type CaseLevel = 0 | 1 | 2;
/** Cor da luz da raridade; `alt` é a segunda cor que alterna com a primeira (carta especial). */
export type CaseLook = { c: string; hi: string; alt?: { c: string; hi: string } };

export type CaseOptions = {
  name: string;
  reduce: boolean;
  /** Botões invisíveis sobre as travas (teclado e leitor de tela); a cena reposiciona a cada quadro. */
  latchButtons: (HTMLButtonElement | null)[];
  onLatch: (index: number, remaining: number) => void;
  /** Sons pelo id do catálogo de `packSounds`. */
  onSound: (id: PackSoundId, o?: { gain?: number; len?: number; delay?: number }) => void;
};

/** Onde a carta está na tela no momento da troca pela carta real: centro e escala para uma carta de 430 px de altura. */
export type CardSpot = { x: number; y: number; scale: number };

export type PackCase = {
  arrive: () => Promise<void>;
  openLatch: (i: number) => void;
  /** Frente da carta (PNG da carta real): o último giro mostra a frente e a troca pela carta do DOM some. */
  setFront: (url: string) => Promise<void>;
  /**
   * Tampa: comum abre direto; rara emperra, pulsa com a luz neutra e, no último pulso, a luz troca para a cor
   * da raridade e a tampa estoura. Resolve quando a tampa está aberta.
   */
  crack: (lv: CaseLevel, look: CaseLook | null) => Promise<void>;
  /** Walkout: a cena escurece para as pistas. */
  dim: () => void;
  beat: (i: number) => void;
  /** Herói de assinatura: uma faixa dourada se desenrola por dentro da tampa aberta. */
  ribbon: (text: string) => Promise<void>;
  /** A carta sobe e gira; resolve no ponto em que a carta 3D vira a carta real. */
  rise: (lv: CaseLevel) => Promise<CardSpot>;
  dispose: () => void;
};

export const CAM_FOV = 34;

/** Distância da câmera para a maleta (6,2 × 5,7 unidades, com folga) caber em qualquer proporção de tela. */
export function fitDistance(aspect: number, fov = CAM_FOV): number {
  const vf = THREE.MathUtils.degToRad(fov) / 2;
  const hf = Math.atan(Math.tan(vf) * aspect);
  return Math.max(3.1 / Math.tan(hf), 2.85 / Math.tan(vf));
}

const W = 4.4, D = 3.0, HB = 0.72, HL = 0.46;
const CARD_H = 2.2, CARD_W = (CARD_H * 295) / 430;
const NEUTRAL = "#ffefd7";

/** Vibra o celular (Android; no resto não faz nada). */
const buzz = (p: number | number[]) => {
  try { navigator.vibrate?.(p); } catch { /* sem vibração */ }
};

const glowTex = (w: number, h: number, f: (u: number, v: number) => number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set([255, 255, 255, Math.round(255 * f(x / (w - 1), y / (h - 1)))], (y * w + x) * 4);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

function labelTexture(name: string) {
  const c = document.createElement("canvas");
  c.width = 1400;
  c.height = 420;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffefd7";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(0,0,0,.16)";
  for (let x = 0; x < c.width; x += 26) { g.fillRect(x, 0, 10, 22); g.fillRect(x, c.height - 22, 10, 22); }
  g.fillStyle = "#10130d";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '800 40px "VALVE Pulp", sans-serif';
  g.globalAlpha = 0.7;
  g.fillText("CARDSLOCK", c.width / 2, 72);
  g.globalAlpha = 1;
  const upper = name.toUpperCase();
  const fits = (s: number, ls: string[]) => { g.font = `800 ${s}px "VALVE Pulp", sans-serif`; return ls.every((l) => g.measureText(l).width < c.width - 120); };
  let size = 170;
  let lines = [upper];
  while (size > 90 && !fits(size, lines)) size -= 6;
  if (!fits(size, lines)) {
    const words = upper.split(" "), mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    size = 130;
    while (size > 60 && !fits(size, lines)) size -= 6;
  }
  g.font = `800 ${size}px "VALVE Pulp", sans-serif`;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, 235 + (i - (lines.length - 1) / 2) * size * 0.95));
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) { g.globalAlpha = Math.random() * 0.35; g.fillRect(Math.random() * c.width, Math.random() * c.height, Math.random() * 6, Math.random() * 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Faixa de assinatura: cetim dourado velho, costurado nas bordas, com o texto gravado (baixo-relevo),
 * arranhões e pontas cortadas em V. O mesmo canvas serve de relevo (bumpMap): o texto escuro afunda.
 */
function ribbonTexture(text: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const g = c.getContext("2d")!;
  const top = 14, h = c.height - 28;
  const grad = g.createLinearGradient(0, top, 0, top + h);
  [["#5e4314", 0], ["#b8913f", 0.18], ["#e2c678", 0.42], ["#d4b25e", 0.6], ["#a07a2c", 0.84], ["#4f3810", 1]]
    .forEach(([col, at]) => grad.addColorStop(at as number, col as string));
  g.fillStyle = grad;
  g.fillRect(0, top, c.width, h);
  // trama do tecido e manchas de uso
  for (let y = top; y < top + h; y += 3) { g.fillStyle = `rgba(40,25,5,${0.05 + Math.random() * 0.05})`; g.fillRect(0, y, c.width, 1); }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * c.width, y = top + Math.random() * h, r = 20 + Math.random() * 60;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${Math.random() < 0.5 ? "60,40,10" : "255,235,180"},.12)`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // costura: pontos escuros com brilho embaixo
  for (const y of [top + 12, top + h - 12]) {
    for (let x = 30; x < c.width - 30; x += 22) {
      g.fillStyle = "rgba(50,32,8,.85)";
      g.fillRect(x, y - 1.5, 12, 3);
      g.fillStyle = "rgba(255,236,180,.35)";
      g.fillRect(x, y + 1.5, 12, 1);
    }
  }
  // texto gravado: sombra escura em cima, luz embaixo
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '900 70px "VALVE Pulp", sans-serif';
  g.letterSpacing = "16px";
  const label = text.toUpperCase(), cx = c.width / 2 + 8, cy = c.height / 2 + 3;
  g.fillStyle = "rgba(255,240,200,.45)";
  g.fillText(label, cx, cy + 2.5);
  g.fillStyle = "#3a2507";
  g.fillText(label, cx, cy);
  // arranhões
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * c.width, y = top + Math.random() * h, l = 6 + Math.random() * 30, a = (Math.random() - 0.5) * 0.6;
    g.strokeStyle = `rgba(${Math.random() < 0.6 ? "255,240,200" : "40,25,5"},${0.12 + Math.random() * 0.2})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // pontas em V
  g.globalCompositeOperation = "destination-out";
  for (const [x0, dir] of [[0, 1], [c.width, -1]] as const) {
    g.beginPath();
    g.moveTo(x0, top - 2);
    g.lineTo(x0 + dir * 46, c.height / 2);
    g.lineTo(x0, top + h + 2);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Nuvem de poeira: bolhas macias somadas, com borda irregular. */
function dustTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 30;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s = 18 + Math.random() * 26;
    const rg = g.createRadialGradient(x, y, 0, x, y, s);
    rg.addColorStop(0, "rgba(255,255,255,.22)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function backTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 746;
  const g = c.getContext("2d")!;
  const bev = g.createLinearGradient(0, 0, 512, 746);
  bev.addColorStop(0, "#6c7d88");
  bev.addColorStop(0.5, "#373d45");
  bev.addColorStop(1, "#4c5561");
  const shape = (i: number) => {
    g.beginPath();
    g.moveTo(i, 40 + i); g.lineTo(40 + i, i); g.lineTo(512 - 40 - i, i); g.lineTo(512 - i, 40 + i);
    g.lineTo(512 - i, 640 - i * 0.5); g.lineTo(256, 746 - i); g.lineTo(i, 640 - i * 0.5);
    g.closePath();
  };
  shape(0); g.fillStyle = bev; g.fill();
  shape(10);
  const rg = g.createRadialGradient(256, 300, 20, 256, 300, 420);
  rg.addColorStop(0, "#22282c");
  rg.addColorStop(1, "#10130d");
  g.fillStyle = rg; g.fill();
  g.save(); shape(10); g.clip();
  g.strokeStyle = "rgba(255,239,215,.1)";
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; g.beginPath(); g.moveTo(256, 300); g.lineTo(256 + Math.cos(a) * 600, 300 + Math.sin(a) * 600); g.stroke(); }
  g.strokeStyle = "rgba(255,239,215,.7)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(150, 300); g.quadraticCurveTo(256, 200, 362, 300); g.quadraticCurveTo(256, 400, 150, 300); g.stroke();
  g.beginPath(); g.arc(256, 300, 30, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "rgba(255,239,215,.85)"; g.beginPath(); g.arc(256, 300, 10, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(255,239,215,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(256, 300, 140, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#ffefd7"; g.font = '800 34px "VALVE Pulp", sans-serif'; g.textAlign = "center"; g.fillText("CARDSLOCK", 256, 560);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Monta a maleta 3D no canvas. Sem WebGL2 devolve null e a tela abre a carta direto. */
export async function createPackCase(canvas: HTMLCanvasElement, opts: CaseOptions): Promise<PackCase | null> {
  if (!document.createElement("canvas").getContext("webgl2")) return null;
  await document.fonts.load('800 120px "VALVE Pulp"').catch(() => undefined);

  const { reduce } = opts;
  const nav = navigator as Navigator & { deviceMemory?: number };
  // celular ou máquina fraca: menos pixels, sombra menor, sem MSAA
  const LOW = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || matchMedia("(pointer: coarse)").matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050506, 12, 26);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
  const CAM = { pos: new THREE.Vector3(0, 6.3, 7.0), look: new THREE.Vector3(0, 0.5, 0.2), push: 0 };
  const CAM_DIR = CAM.pos.clone().sub(CAM.look).normalize();
  const shakeO = { x: 0, y: 0 };

  // o composer não herda o antialias do renderer: o MSAA vai no render target dele
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.6, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight(0x8899aa, 0x0a0806, 0.35));
  const rim = new THREE.DirectionalLight(0x9fb4c8, 0.9);
  rim.position.set(-6, 5, -6);
  scene.add(rim);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.88 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // lâmpada pendurada, balançando; some quando a tampa abre e a luz passa a ser da carta
  const lamp = new THREE.Group();
  lamp.position.set(0, 9.5, 0.4);
  scene.add(lamp);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  cord.position.y = 1.5;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2620, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
  bulb.position.y = -0.18;
  const spot = new THREE.SpotLight(0xffd9a6, 70, 22, 0.42, 0.6, 1.6);
  spot.position.set(0, -0.2, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.setScalar(LOW ? 512 : 1024);
  spot.shadow.bias = -0.0004;
  spot.target.position.set(0, -10, 0);
  const coneTex = glowTex(4, 128, (_u, v) => 0.025 * (1 - v));
  const beamCone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 3.4, 9, 48, 1, true), new THREE.MeshBasicMaterial({ map: coneTex, color: 0xffdcaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beamCone.position.y = -4.6;
  lamp.add(cord, shade, bulb, spot, spot.target, beamCone);

  // ---------- maleta ----------
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.72, metalness: 0.15 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.5, metalness: 0.3 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.32, metalness: 0.95 });
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 });
  const caseG = new THREE.Group();
  scene.add(caseG);
  const shadowed = <T extends THREE.Mesh>(m: T) => { m.castShadow = true; m.receiveShadow = true; return m; };

  const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(W, HB, D, 5, 0.14), shellMat));
  base.position.y = HB / 2;
  caseG.add(base);
  for (const x of [-W / 2 + 0.55, W / 2 - 0.55]) {
    const r = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.22, HB * 0.8, D + 0.06, 3, 0.05), shellMat));
    r.position.set(x, HB * 0.45, 0);
    caseG.add(r);
  }
  const seam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.035, D + 0.02), trimMat);
  seam.position.y = HB;
  caseG.add(seam);

  // espuma quase preta em caixa de ovo: a luz da carta só acende as pontas dos gomos
  const foamMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1 });
  const foam = (f: number, amp: number) => {
    const seg = LOW ? 56 : 90;
    const g = new THREE.PlaneGeometry(W - 0.32, D - 0.32, seg, Math.round((seg * (D - 0.32)) / (W - 0.32)));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, amp * (0.5 + 0.5 * Math.sin(p.getX(i) * f) * Math.sin(p.getY(i) * f)));
    g.computeVertexNormals();
    return new THREE.Mesh(g, foamMat);
  };
  const baseFoam = foam(9, 0.05);
  baseFoam.rotation.x = -Math.PI / 2;
  baseFoam.position.y = HB + 0.004;
  baseFoam.receiveShadow = true;
  caseG.add(baseFoam);

  const hinge = new THREE.Group();
  hinge.position.set(0, HB, -D / 2);
  caseG.add(hinge);
  const lid = shadowed(new THREE.Mesh(new RoundedBoxGeometry(W, HL, D, 5, 0.14), shellMat));
  lid.position.set(0, HL / 2 + 0.018, D / 2);
  hinge.add(lid);
  for (const z of [0.45, D - 0.45]) {
    const r = shadowed(new THREE.Mesh(new RoundedBoxGeometry(W - 0.5, 0.07, 0.2, 3, 0.03), shellMat));
    r.position.set(0, HL + 0.05, z);
    hinge.add(r);
  }
  const lidFoam = foam(5.5, 0.16);
  lidFoam.rotation.x = Math.PI / 2;
  lidFoam.position.set(0, 0.01, D / 2);
  hinge.add(lidFoam);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.99), new THREE.MeshStandardMaterial({ map: labelTexture(opts.name), roughness: 0.85, transparent: true, color: 0xcfc6b8 }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, HL + 0.022, D / 2 + 0.02);
  label.receiveShadow = true;
  hinge.add(label);

  const handle = new THREE.Group();
  handle.position.set(0, HB * 0.62, D / 2 + 0.05);
  caseG.add(handle);
  const grip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 14, 32, Math.PI), trimMat));
  grip.rotation.x = Math.PI / 2;
  grip.scale.set(1, 0.55, 1);
  handle.add(grip);
  for (const x of [-0.5, 0.5]) {
    const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.22, 0.12, 2, 0.03), trimMat));
    m.position.set(x, 0, -0.02);
    handle.add(m);
  }

  const auraTex = glowTex(128, 128, (u, v) => Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2) ** 2.4);

  // travas: giram para fora a partir de baixo
  const latches = [-1.45, 1.45].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, HB - 0.32, D / 2 + 0.035);
    caseG.add(pivot);
    const plate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.62, 0.1, 3, 0.04), trimMat));
    plate.position.set(0, 0.31, 0.02);
    const hook = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.08, 0.14, 2, 0.02), steelMat));
    hook.position.set(0, 0.58, 0.04);
    pivot.add(plate, hook);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.02), grooveMat);
      g.position.set(0, 0.16 + i * 0.09, 0.075);
      pivot.add(g);
    }
    const glowMat = new THREE.MeshBasicMaterial({ map: auraTex, color: 0xffefd7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), glowMat);
    ring.position.set(0, 0.31, 0.08);
    // área de toque maior que a trava, para o dedo (o raycaster acerta malha invisível)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5));
    hit.visible = false;
    hit.position.set(0, 0.31, 0.1);
    pivot.add(ring, hit);
    return { pivot, plate, glowMat, open: false };
  });

  // ---------- luz da raridade: sai da carta, não da maleta ----------
  const additive = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, ...o });
  const tinted: { m: { color: THREE.Color }; hi: boolean }[] = [];
  const tint = <M extends { color: THREE.Color }>(m: M, hi: boolean) => { m.color.set(NEUTRAL); tinted.push({ m, hi }); return m; };
  // tudo começa neutro; `mix` leva para a cor da raridade e, com `b`, a cor alterna entre as duas da especial
  const pal = { mix: 0, a: [new THREE.Color(NEUTRAL), new THREE.Color(NEUTRAL)], b: null as THREE.Color[] | null };
  const neutralC = new THREE.Color(NEUTRAL), tmpC = new THREE.Color();
  const paint = (t: number) => {
    const k = pal.b && !reduce ? 0.5 + 0.5 * Math.sin(t * 2.6) : 0;
    for (const { m, hi } of tinted) {
      const i = hi ? 1 : 0;
      tmpC.copy(pal.a[i]);
      if (pal.b) tmpC.lerp(pal.b[i], k);
      m.color.copy(neutralC).lerp(tmpC, pal.mix);
    }
  };

  const seamGlow = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.06), tint(additive({}), true));
  seamGlow.position.set(0, HB + 0.02, D / 2 + 0.03);
  caseG.add(seamGlow);
  const shaftTex = glowTex(64, 256, (u, v) => Math.exp(-(((u - 0.5) / 0.17) ** 2)) * Math.pow(v, 2.2) * Math.min(1, (1 - v) * 12));
  const light = { level: 0 };
  const shafts = new THREE.Group();
  shafts.position.y = HB;
  caseG.add(shafts);
  const shaftData: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; base: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const w = 0.35 + Math.random() * 0.7, h = 3.6 + Math.random() * 2.2;
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(g, tint(additive({ map: shaftTex, side: THREE.DoubleSide }), i % 3 === 0));
    mesh.position.set(gsap.utils.random(-1.3, 1.3), 0, gsap.utils.random(-0.7, 0.8));
    shafts.add(mesh);
    shaftData.push({ mesh, base: 0.1 + Math.random() * 0.14, speed: 0.6 + Math.random() * 1.4, phase: Math.random() * 6 });
  }
  const MOTES = LOW ? 60 : 140;
  const moteGeo = new THREE.BufferGeometry();
  const mp = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) mp.set([gsap.utils.random(-1.7, 1.7), gsap.utils.random(0, 4), gsap.utils.random(-1, 1)], i * 3);
  moteGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const moteMat = tint(new THREE.PointsMaterial({ map: auraTex, size: 0.05, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), true);
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.position.y = HB;
  caseG.add(motes);

  // a carta deitada na espuma, verso para cima; a frente (PNG da carta real) fica do outro lado
  const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  // alphaTest: o canto transparente da textura não tapa o brilho atrás nem faz sombra retangular
  const backMat = new THREE.MeshBasicMaterial({ map: backTexture(), transparent: true, alphaTest: 0.5, color: 0xb8b8b8, side: THREE.DoubleSide });
  const card3 = new THREE.Mesh(cardGeo, backMat);
  card3.rotation.x = -Math.PI / 2;
  card3.position.set(0, HB + 0.08, 0.1);
  card3.castShadow = true;
  caseG.add(card3);
  const frontMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, color: 0xf2f2f2, toneMapped: false });
  const front = new THREE.Mesh(cardGeo, frontMat);
  front.rotation.y = Math.PI;
  front.visible = false;
  card3.add(front);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 2.1, CARD_H * 1.7), tint(additive({ map: auraTex, side: THREE.DoubleSide }), false));
  aura.position.z = -0.03;
  card3.add(aura);
  const inner = tint(new THREE.PointLight(NEUTRAL, 0, 5, 2), false);
  inner.position.set(0, 0, 0.45);
  card3.add(inner);

  const SPARKS = 220;
  const sparkGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SPARKS * 3).fill(-50), sv = new Float32Array(SPARKS * 3);
  let sparkLife = 0;
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const sparkTex = glowTex(32, 32, (u, v) => Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2));
  const sparkMat = tint(new THREE.PointsMaterial({ map: sparkTex, size: 0.14, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), true);
  scene.add(new THREE.Points(sparkGeo, sparkMat));
  const sparks = (n: number, y: number) => {
    if (reduce) return;
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      sp.set(i < n ? [0, y, 0.2] : [0, -50, 0], i * 3);
      sv.set([Math.cos(a) * s * 0.7, 3 + Math.random() * 7, Math.sin(a) * s * 0.5], i * 3);
    }
    sparkLife = 1;
    sparkMat.opacity = 1;
  };

  // ---------- partículas com vida própria: poeira, fumaça e a coluna da Eternus ----------
  // aditivas, cada uma some escurecendo a própria cor (vertex color), sem precisar de shader
  const puffTex = glowTex(64, 64, (u, v) => Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2) ** 1.6);
  const systems: { update: (dt: number) => void }[] = [];
  const particles = (max: number, mat: THREE.PointsMaterial, drag: number, lift: number) => {
    const pos = new Float32Array(max * 3).fill(-50), col = new Float32Array(max * 3), vel = new Float32Array(max * 3);
    const age = new Float32Array(max), life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    mat.vertexColors = true;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let next = 0, alive = 0;
    const sys = {
      emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, l: number) {
        if (reduce) return;
        const i = next;
        next = (next + 1) % max;
        pos.set([x, y, z], i * 3);
        vel.set([vx, vy, vz], i * 3);
        age[i] = 0;
        life[i] = l;
        alive = max;
      },
      update(dt: number) {
        if (!alive) return;
        let live = 0;
        const keep = Math.max(0, 1 - drag * dt);
        for (let i = 0; i < max; i++) {
          if (life[i] <= 0) continue;
          age[i] += dt;
          if (age[i] >= life[i]) { life[i] = 0; pos[i * 3 + 1] = -50; col.fill(0, i * 3, i * 3 + 3); continue; }
          live++;
          vel[i * 3] *= keep; vel[i * 3 + 1] = vel[i * 3 + 1] * keep + lift * dt; vel[i * 3 + 2] *= keep;
          for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
          const f = age[i] / life[i], a = Math.min(1, f * 6) * (1 - f) ** 1.5;
          col.fill(a, i * 3, i * 3 + 3);
        }
        alive = live;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
    };
    systems.push(sys);
    return sys;
  };
  const pointsMat = (size: number, opacity: number, map = puffTex) =>
    new THREE.PointsMaterial({ map, size, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const smoke = particles(LOW ? 70 : 130, tint(pointsMat(1.1, 0.2), false), 1.1, 0.18);
  const column = particles(LOW ? 90 : 180, tint(pointsMat(0.09, 0.95, sparkTex), true), 0, 0.5);
  let smokeOn = 0, columnOn = 0, emitAcc = 0;

  // sombra de contato: cresce e escurece conforme a maleta desce
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, D * 1.7), new THREE.MeshBasicMaterial({
    map: glowTex(64, 64, (u, v) => Math.max(0, 1 - Math.hypot((u - 0.5) * 2, (v - 0.5) * 2)) ** 1.5),
    color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
  }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  scene.add(blob);

  // Eternus: raios girando devagar atrás da carta e onda de choque na mesa
  const raysMat = tint(new THREE.SpriteMaterial({
    map: glowTex(256, 256, (u, v) => {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.atan2(v - 0.5, u - 0.5);
      return Math.max(0, 1 - r) ** 1.4 * (0.5 + 0.5 * Math.cos(a * 12)) ** 5 * Math.min(1, r * 4);
    }),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }), true);
  const rays = new THREE.Sprite(raysMat);
  rays.position.set(0, HB + 1.55, 0.5);
  rays.scale.setScalar(7.5);
  scene.add(rays);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tint(additive({
    map: glowTex(128, 128, (u, v) => Math.exp(-(((Math.hypot(u - 0.5, v - 0.5) * 2 - 0.86) / 0.07) ** 2))),
  }), true));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, 0.2);
  scene.add(ring);

  // ---------- animações: tudo registrado para morrer no dispose ----------
  const anims: gsap.core.Animation[] = [];
  const track = <A extends gsap.core.Animation>(a: A) => { anims.push(a); return a; };
  const tl = () => track(gsap.timeline());
  const to = (target: gsap.TweenTarget, vars: gsap.TweenVars) => track(gsap.to(target, vars));
  const done = (a: gsap.core.Animation) => new Promise<void>((r) => { a.eventCallback("onComplete", () => r()); });
  const dur = (s: number) => (reduce ? 0 : s);
  const sound = opts.onSound;

  const shakeCam = (amt: number, d: number) => {
    if (reduce || !amt) return;
    const t = tl();
    for (let i = 0; i < 10; i++) { const k = 1 - i / 10; t.to(shakeO, { x: gsap.utils.random(-amt, amt) * k, y: gsap.utils.random(-amt, amt) * k, duration: d / 10, ease: "none" }); }
    t.to(shakeO, { x: 0, y: 0, duration: 0.06 });
  };

  const shock = (size: number, d: number) => {
    if (reduce) return;
    ring.scale.setScalar(0.4);
    tl().to(ring.scale, { x: size, y: size, duration: d, ease: "power2.out" }, 0)
      .fromTo(ring.material, { opacity: 1 }, { opacity: 0, duration: d, ease: "power1.in" }, 0);
  };

  // poeira: nuvens que rolam rente à mesa, crescem, freiam e somem (cada uma com tamanho, giro e vida próprios)
  const dustMap = dustTexture();
  const puffs = Array.from({ length: LOW ? 22 : 40 }, () => {
    const m = new THREE.SpriteMaterial({ map: dustMap, color: 0x9c8c78, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    return { s, m, vx: 0, vy: 0, vz: 0, age: 0, life: 0, s0: 1, s1: 2, spin: 0, alpha: 0 };
  });
  let nextPuff = 0;
  /** Solta nuvens ao longo de um lado da maleta (nx, nz = direção para fora). */
  const puffEdge = (nx: number, nz: number, n: number, power: number) => {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const p = puffs[nextPuff];
      nextPuff = (nextPuff + 1) % puffs.length;
      const along = gsap.utils.random(-0.5, 0.5);
      const x = caseG.position.x + (nx ? nx * (W / 2) : along * W), z = caseG.position.z + (nz ? nz * (D / 2) : along * D);
      const sp2 = gsap.utils.random(1.2, 2.6) * power;
      p.s.position.set(x, 0.18, z);
      p.vx = (nx + gsap.utils.random(-0.4, 0.4)) * sp2;
      p.vz = (nz + gsap.utils.random(-0.4, 0.4)) * sp2;
      p.vy = gsap.utils.random(0.15, 0.5) * power;
      p.age = 0;
      p.life = gsap.utils.random(1.1, 1.9);
      p.s0 = gsap.utils.random(0.5, 0.9);
      p.s1 = p.s0 * gsap.utils.random(2.6, 3.6) * Math.max(0.7, power);
      p.spin = gsap.utils.random(-0.6, 0.6);
      p.m.rotation = Math.random() * Math.PI * 2;
      p.alpha = gsap.utils.random(0.35, 0.6) * Math.min(1, power);
      p.s.visible = true;
    }
  };
  const updatePuffs = (dt: number) => {
    for (const p of puffs) {
      if (!p.s.visible) continue;
      p.age += dt;
      const f = p.age / p.life;
      if (f >= 1) { p.s.visible = false; continue; }
      // atrito forte: sai rápido e para logo, como poeira de verdade
      const k = Math.exp(-3.2 * p.age);
      p.s.position.x += p.vx * k * dt;
      p.s.position.y += p.vy * k * dt;
      p.s.position.z += p.vz * k * dt;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * (1 - (1 - f) ** 3));
      p.m.rotation += p.spin * dt;
      p.m.opacity = p.alpha * Math.min(1, f * 10) * (1 - f) ** 1.6;
    }
  };
  const dustAll = (n: number, power: number) => { puffEdge(1, 0, n, power); puffEdge(-1, 0, n, power); puffEdge(0, 1, n, power); puffEdge(0, -1, n, power); };

  // faixa de assinatura: presa por dentro da tampa, desenrola da esquerda para a direita
  // tecido de verdade: recebe a luz da carta, ondula um pouco e tem relevo; um rebite de latão em cada ponta
  const RIB_W = W - 0.4, RIB_TILT = 0.1;
  const ribGeo = new THREE.PlaneGeometry(RIB_W, 0.5, 64, 1);
  ribGeo.translate(RIB_W / 2, 0, 0);
  const rp = ribGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setZ(i, 0.022 * Math.sin(rp.getX(i) * 6.5) + 0.01 * Math.sin(rp.getX(i) * 17 + rp.getY(i) * 4));
  ribGeo.computeVertexNormals();
  const ribMat = new THREE.MeshStandardMaterial({
    transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.45, roughness: 0.5,
    bumpScale: 2.5, emissive: 0xffffff, emissiveIntensity: 0.32,
  });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3c, metalness: 1, roughness: 0.32 });
  const along = (x: number) => [-RIB_W / 2 + x * Math.cos(RIB_TILT), (-RIB_W / 2) * Math.sin(RIB_TILT) + x * Math.sin(RIB_TILT)] as const;
  const rivets = [0.2, RIB_W - 0.2].map((x) => {
    const r = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), brass));
    r.scale.z = 0.45;
    const [px, py] = along(x);
    r.position.set(px, py, 0.03);
    r.visible = false;
    return r;
  });
  const ribG = new THREE.Group();
  ribG.rotation.x = Math.PI / 2;
  ribG.position.set(0, -0.2, 0.8);
  hinge.add(ribG);
  const rib = new THREE.Mesh(ribGeo, ribMat);
  rib.rotation.z = RIB_TILT;
  rib.position.set(...along(0), 0);
  rib.scale.x = 0.001;
  rib.visible = false;
  ribG.add(rib, ...rivets);

  // ---------- câmera, tamanho e laço ----------
  const host = canvas.parentElement ?? canvas;
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dist = fitDistance(camera.aspect);
    CAM.pos.copy(CAM_DIR).multiplyScalar(dist).add(CAM.look);
    const fog = scene.fog as THREE.Fog;
    fog.near = dist + 2;
    fog.far = dist + 18;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const v = new THREE.Vector3(), cardDir = new THREE.Vector3(), cardPos = new THREE.Vector3();
  const project = (obj: THREE.Object3D, local = new THREE.Vector3()) => {
    v.copy(local);
    obj.localToWorld(v);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * host.clientWidth, y: (-v.y * 0.5 + 0.5) * host.clientHeight };
  };

  // câmera viva enquanto espera as travas: segue o mouse ou a inclinação do celular
  const sway = { x: 0, y: 0, tx: 0, ty: 0, on: false };
  // aim: quanto a câmera olha para cima (a carta subindo); drop: altura da queda, sem contar o canto inclinado
  const aim = { y: 0 };
  const drop = { y: 0, on: false };
  const onPointer = (e: PointerEvent) => {
    if (drag) return;
    sway.tx = (e.clientX / innerWidth) * 2 - 1;
    sway.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    sway.tx = gsap.utils.clamp(-1, 1, e.gamma / 25);
    sway.ty = gsap.utils.clamp(-1, 1, (e.beta - 45) / 25);
  };
  window.addEventListener("pointermove", onPointer);
  window.addEventListener("deviceorientation", onTilt);

  const timer = new THREE.Timer();
  timer.connect(document);
  let n = 0, sum = 0;
  const frame = (time?: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    // se os primeiros 90 quadros passarem de ~25 ms, cai para 1x pixel e desliga o bloom
    if (n < 90 && ++n > 10) {
      sum += dt;
      if (n === 90 && sum / 80 > 0.025) { renderer.setPixelRatio(1); composer.setPixelRatio(1); bloom.enabled = false; }
    }
    if (!reduce) lamp.rotation.z = Math.sin(t * 1.1) * 0.06 + Math.sin(t * 0.37) * 0.025;
    const follow = Math.min(1, dt * 2.5), live = sway.on && !reduce;
    sway.x += ((live ? sway.tx : 0) - sway.x) * follow;
    sway.y += ((live ? sway.ty : 0) - sway.y) * follow;
    const d = 1 - CAM.push * 0.22;
    camera.position.set(CAM.pos.x + shakeO.x + sway.x * 0.45, CAM.pos.y * d + shakeO.y - sway.y * 0.25, CAM.pos.z * d);
    camera.lookAt(CAM.look.x, CAM.look.y + aim.y, CAM.look.z);
    if (drop.on) caseG.position.y = drop.y + (W / 2) * Math.abs(Math.sin(caseG.rotation.z)) + (D / 2) * Math.abs(Math.sin(caseG.rotation.x));
    updatePuffs(dt);
    paint(t);
    // sombra de contato acompanha a maleta
    const hgt = gsap.utils.clamp(0, 1, caseG.position.y / 3.2), s = 0.55 + 0.45 * (1 - hgt);
    blob.position.set(caseG.position.x, 0.01, caseG.position.z);
    blob.rotation.z = caseG.rotation.y;
    blob.scale.set(s, s, 1);
    blob.material.opacity = 0.75 * (1 - hgt) ** 2;
    // feixes sempre de frente para a câmera e tremulando um pouco
    for (const sh of shaftData) {
      sh.mesh.rotation.y = Math.atan2(camera.position.x - sh.mesh.position.x, camera.position.z - sh.mesh.position.z);
      sh.mesh.material.opacity = light.level * sh.base * (reduce ? 1 : 0.75 + 0.25 * Math.sin(t * sh.speed + sh.phase));
    }
    moteMat.opacity = light.level * 0.7;
    if (light.level > 0 && !reduce) {
      for (let i = 0; i < MOTES; i++) { const y = mp[i * 3 + 1] + dt * 0.25; mp[i * 3 + 1] = y > 4 ? 0 : y; mp[i * 3] += Math.sin(t + i) * dt * 0.05; }
      moteGeo.attributes.position.needsUpdate = true;
    }
    if (sparkLife > 0) {
      sparkLife -= dt * 0.7;
      sparkMat.opacity = Math.max(0, sparkLife);
      for (let i = 0; i < SPARKS; i++) { sv[i * 3 + 1] -= 9.8 * dt; for (let k = 0; k < 3; k++) sp[i * 3 + k] += sv[i * 3 + k] * dt; }
      sparkGeo.attributes.position.needsUpdate = true;
    }
    // fumaça escapando pela fresta da frente; coluna de partículas da Eternus
    emitAcc += dt;
    if (emitAcc > 1 / 30) {
      if (smokeOn) for (let i = 0; i < 2; i++) smoke.emit(gsap.utils.random(-W / 2 + 0.3, W / 2 - 0.3), HB + 0.06, D / 2 + 0.06, gsap.utils.random(-0.12, 0.12), gsap.utils.random(0.15, 0.4), gsap.utils.random(0.15, 0.35), gsap.utils.random(1.6, 2.4));
      if (columnOn) for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.55;
        column.emit(Math.cos(a) * r, HB + 0.1, 0.5 + Math.sin(a) * r * 0.6, 0, gsap.utils.random(2.2, 4.2), 0, gsap.utils.random(1.1, 1.8));
      }
      emitAcc = 0;
    }
    for (const sys of systems) sys.update(dt);
    if (!reduce) raysMat.rotation += dt * 0.12;
    // o halo e a luz ficam sempre atrás do lado que a câmera vê (verso ou frente)
    if (card3.visible) {
      card3.getWorldDirection(cardDir);
      card3.getWorldPosition(cardPos);
      const back = cardDir.dot(cardPos.sub(camera.position)) < 0;
      aura.position.z = back ? -0.03 : 0.03;
      inner.position.z = back ? 0.45 : -0.45;
    }
    latches.forEach((l, i) => {
      const b = opts.latchButtons[i];
      if (!b) return;
      const p = project(l.plate);
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
    });
    composer.render(dt);
  };
  renderer.setAnimationLoop(frame);
  // aba escondida: para de desenhar
  const onVisible = () => renderer.setAnimationLoop(document.hidden ? null : frame);
  document.addEventListener("visibilitychange", onVisible);

  // ---------- travas: arrastar para baixo, ou tocar no botão ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let armed = false;
  let drag: { l: (typeof latches)[number]; y0: number; t0: number; k: number } | null = null;
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return latches.find((l) => !l.open && ray.intersectObject(l.pivot, true).length);
  };
  const onMove = (e: PointerEvent) => {
    if (!armed) return;
    if (drag) {
      drag.k = gsap.utils.clamp(0, 1, (e.clientY - drag.y0) / gsap.utils.clamp(60, 120, host.clientHeight * 0.14));
      drag.l.pivot.rotation.x = drag.k * 1.95;
    } else canvas.style.cursor = pick(e) ? "grab" : "";
  };
  const onDown = (e: PointerEvent) => {
    if (!armed) return;
    const l = pick(e);
    if (!l) return;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    drag = { l, y0: e.clientY, t0: performance.now(), k: 0 };
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const { l, k, t0, y0 } = drag;
    drag = null;
    canvas.style.cursor = "";
    const fast = (e.clientY - y0) / (performance.now() - t0) > 0.5;
    if (k > 0.5 || fast || reduce) openLatch(latches.indexOf(l));
    else to(l.pivot.rotation, { x: 0, duration: 0.45, ease: "back.out(2.5)" });
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function openLatch(i: number) {
    const l = latches[i];
    if (!armed || !l || l.open) return;
    l.open = true;
    gsap.killTweensOf(l.glowMat);
    to(l.glowMat, { opacity: 0, duration: 0.15 });
    to(l.pivot.rotation, { x: 1.95, duration: reduce ? 0.01 : 0.22, ease: "power3.out" });
    sound("latch");
    buzz(15);
    shakeCam(0.05, 0.18);
    if (!reduce) track(gsap.fromTo(caseG.position, { y: 0.04 }, { y: 0, duration: 0.25, ease: "bounce.out" }));
    const remaining = latches.filter((x) => !x.open).length;
    if (!remaining) { armed = false; sway.on = false; }
    opts.onLatch(i, remaining);
  }

  const peakLight = [0.55, 0.8, 1], peakInner = [6, 10, 14];
  let hasFront = false;

  function openLid(lv: CaseLevel) {
    for (const m of [shade, cord, bulb, beamCone]) m.visible = false;
    smokeOn = 0;
    const t = tl()
      .to(hinge.rotation, { x: -1.9, duration: dur(lv ? 0.55 : 0.8), ease: lv ? "back.out(1.4)" : "power3.out" })
      .to(aura.material, { opacity: [0.6, 0.8, 1][lv], duration: dur(0.3) }, 0)
      .to(inner, { intensity: peakInner[lv], duration: dur(0.3) }, 0)
      .to(light, { level: peakLight[lv], duration: dur(0.7), ease: "power2.out" }, 0.05)
      .to(seamGlow.material, { opacity: 0, duration: dur(0.3) }, 0.1)
      .to(spot, { intensity: 35, duration: dur(0.6) }, 0);
    if (lv) {
      t.add(() => {
        sound("lid-boom");
        buzz(60);
        shakeCam(0.12 + lv * 0.1, 0.6);
        sparks(80 + lv * 70, HB + 0.3);
        shock(4 + lv * 2, 0.9);
        // a fumaça presa na fresta se espalha para todos os lados
        for (let i = 0; i < 50; i++) {
          const a = Math.random() * Math.PI * 2, s2 = gsap.utils.random(1, 2.4);
          smoke.emit(Math.cos(a) * 1.6, HB + 0.15, Math.sin(a) * 1.1, Math.cos(a) * s2, gsap.utils.random(0.3, 0.9), Math.sin(a) * s2, gsap.utils.random(1.8, 2.8));
        }
        if (lv === 2) columnOn = 1;
      }, 0.1);
    } else t.add(() => sound("lid-open"), 0);
    t.to({}, { duration: dur(lv ? 1.1 : 0.7) }, 0);
    return done(t);
  }

  return {
    arrive() {
      const arm = () => {
        armed = true;
        sway.on = true;
        latches.forEach((l, i) => to(l.glowMat, { opacity: 0.5, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.35 }));
      };
      if (reduce) {
        caseG.position.set(0, 0, 0);
        return done(tl().add(() => sound("arrive", { gain: 0.6 }), 0.1).add(arm, 0.2));
      }
      // jogada sem cuidado: entra rápido, girando; bate o canto esquerdo, o resto despenca na mesa,
      // a tampa chacoalha, ela escorrega um pouco com atrito e para. Pesada: quase não quica.
      caseG.position.set(-7.5, 0, -2.4);
      caseG.rotation.set(0.32, 1.1, 0.55);
      drop.y = 5;
      drop.on = true;
      const fall = 0.5, hit = 0.15 + fall, slam = hit + 0.11;
      const t = tl()
        .to(caseG.position, { x: -0.8, z: 0.15, duration: fall, ease: "none" }, 0.15)
        .to(drop, { y: 0, duration: fall, ease: "power2.in" }, 0.15)
        .to(caseG.rotation, { x: 0, y: 0.24, z: 0.14, duration: fall, ease: "power1.in" }, 0.15)
        .add(() => { sound("arrive", { gain: 0.55 }); shakeCam(0.08, 0.15); puffEdge(-1, 0, LOW ? 4 : 7, 0.8); }, hit)
        .to(caseG.rotation, { z: 0, duration: slam - hit, ease: "power2.in" }, hit)
        .add(() => { sound("arrive"); buzz([40, 30, 20]); shakeCam(0.24, 0.4); dustAll(LOW ? 4 : 7, 1); }, slam)
        .to(hinge.rotation, { x: -0.07, duration: 0.05, ease: "power2.out" }, slam)
        .to(hinge.rotation, { x: 0, duration: 0.3, ease: "bounce.out" }, slam + 0.05)
        .to(drop, { y: 0.04, duration: 0.06, ease: "power2.out" }, slam)
        .to(drop, { y: 0, duration: 0.08, ease: "power2.in" }, slam + 0.06)
        .to(caseG.position, { x: 0, z: 0, duration: 0.5, ease: "power3.out" }, slam)
        .to(caseG.rotation, { y: -0.04, duration: 0.5, ease: "power3.out" }, slam)
        .add(() => puffEdge(-1, 0, LOW ? 3 : 5, 0.45), slam + 0.18)
        .to(caseG.rotation, { y: 0, duration: 0.35, ease: "power2.inOut" }, slam + 0.5)
        .add(() => { drop.on = false; caseG.position.y = 0; })
        .add(arm);
      return done(t);
    },
    openLatch,
    async setFront(url) {
      const tex = await new THREE.TextureLoader().loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      frontMat.map = tex;
      frontMat.needsUpdate = true;
      front.visible = true;
      backMat.side = THREE.FrontSide;
      backMat.needsUpdate = true;
      hasFront = true;
    },
    async crack(lv, look) {
      if (look) {
        pal.a = [new THREE.Color(look.c), new THREE.Color(look.hi)];
        pal.b = look.alt ? [new THREE.Color(look.alt.c), new THREE.Color(look.alt.hi)] : null;
      }
      pal.mix = 0;
      const peak = [0.35, 0.6, 0.9][lv];
      const t = tl()
        .to(hinge.rotation, { x: -0.07, duration: dur(0.35), ease: "power2.out" })
        .to(seamGlow.material, { opacity: peak, duration: dur(0.3) }, 0.1)
        .to(aura.material, { opacity: peak * 0.6, duration: dur(0.3) }, 0.1)
        .to(inner, { intensity: 3 + lv * 2, duration: dur(0.4) }, 0.1)
        .add(() => sound("creak"), 0.05);
      if (lv && !reduce) {
        // rara: a tampa sobe um pouco e emperra; a fumaça escapa; a luz neutra pulsa cada vez mais forte
        // com o zumbido subindo; no último pulso a luz troca para a cor da raridade
        const gap = 0.62 - lv * 0.08, pulses = 3 + lv, first = 1.2, last = first + (pulses - 1) * gap;
        t.to(hinge.rotation, { x: -0.42, duration: 0.5, ease: "power2.out" }, 0.7)
          .to(CAM, { push: 1, duration: last - 0.5, ease: "power2.inOut" }, 0.7)
          .to(bloom, { strength: 0.45 + lv * 0.12, duration: last - 0.7 }, 0.7)
          .add(() => { smokeOn = 1; sound("smoke", { gain: 0.5 }); sound("tension", { len: last - 0.7 }); }, 0.7);
        for (let i = 0; i < pulses; i++) {
          const at = first + i * gap, f = i / (pulses - 1), end = i === pulses - 1;
          t.to(inner, { intensity: (6 + lv * 4) * (1 + f * 0.8), duration: 0.12, ease: "power2.out" }, at)
            .to(aura.material, { opacity: 0.6 + f * 0.35, duration: 0.12 }, at)
            .to(aura.material, { opacity: 0.45, duration: 0.35 }, at + 0.12)
            .to(inner, { intensity: 3 + lv * 2, duration: 0.35, ease: "power2.in" }, at + 0.12)
            .to(hinge.rotation, { x: -0.42 - (i + 1) * 0.025, duration: 0.1, ease: "power2.out" }, at)
            .add(() => {
              shakeCam(0.05 + lv * 0.04 + f * 0.06, 0.3);
              sound("pulse", { gain: 0.45 + f * 0.55 });
              buzz(18 + Math.round(f * 30));
              if (end && look) { sound("rays"); if (lv === 2) sound("bell", { gain: 0.6 }); }
            }, at);
          if (end && look) t.to(pal, { mix: 1, duration: 0.1, ease: "power2.out" }, at).to(seamGlow.material, { opacity: 1, duration: 0.1 }, at);
        }
        t.to({}, { duration: 0.25 });
      } else {
        if (look) t.add(() => { pal.mix = 1; if (lv) sound("rays"); }, 0);
        t.to({}, { duration: dur(0.25) });
      }
      await done(t);
      await openLid(lv);
    },
    dim() {
      tl().to(light, { level: 0.25, duration: dur(0.5) }, 0).to(inner, { intensity: 2, duration: dur(0.5) }, 0);
    },
    beat(i) {
      sound("beat", { gain: 0.7 + i * 0.1 });
      buzz(20 + i * 10);
      shakeCam(0.03 + i * 0.02, 0.25);
      tl()
        .to(light, { level: 0.35 + i * 0.12, duration: dur(0.2) })
        .to(light, { level: 0.25, duration: dur(0.6) })
        .to(CAM, { push: 0.3 + i * 0.2, duration: dur(1.6), ease: "power1.inOut" }, 0);
    },
    async ribbon(text) {
      const tex = ribbonTexture(text);
      ribMat.map = ribMat.bumpMap = ribMat.emissiveMap = tex;
      ribMat.needsUpdate = true;
      rib.visible = true;
      rivets[0].visible = true;
      // presa no rebite da esquerda, a faixa é puxada até o outro lado e pregada com um clique
      const t = tl()
        .add(() => sound("signature"), 0)
        .to(CAM, { push: 0.25, duration: dur(0.8), ease: "power2.out" }, 0)
        .to(rib.scale, { x: 1, duration: dur(0.65), ease: "power3.out" }, 0.1)
        .fromTo(rib.rotation, { z: RIB_TILT + 0.07 }, { z: RIB_TILT, duration: dur(0.9), ease: "elastic.out(1, 0.5)" }, 0.1)
        .add(() => { rivets[1].visible = true; sound("latch", { gain: 0.5 }); buzz(15); }, dur(0.6))
        .fromTo(rivets[1].scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: dur(0.15), ease: "back.out(3)" }, dur(0.6))
        .to({}, { duration: dur(1.1) });
      await done(t);
    },
    async rise(lv) {
      const turns = reduce ? 0 : [1, 2, 3][lv];
      // com a frente carregada, o giro termina meia volta antes: a câmera vê a frente
      const spin = Math.PI * (2 * turns - (hasFront ? 1 : 0));
      const top = HB + 1.55, spinD = dur(0.5 + lv * 0.35);
      const t = tl()
        .to(inner, { intensity: peakInner[lv], duration: dur(0.3) }, 0)
        .to(light, { level: peakLight[lv], duration: dur(0.3) }, 0)
        .to(card3.position, { y: top, z: 0.9, duration: dur(0.7), ease: "power3.out" }, 0)
        .to(card3.rotation, { x: -0.55, duration: dur(0.7), ease: "power3.out" }, 0)
        .to(CAM, { push: 0.2, duration: dur(0.8), ease: "power2.out" }, 0)
        .to(aim, { y: 1.1, duration: dur(0.8), ease: "power2.out" }, 0)
        .to(card3.rotation, { y: spin, duration: spinD, ease: "power2.inOut" }, dur(0.45))
        .add(() => sound("spin", { len: spinD + 0.2, gain: 0.6 + lv * 0.2 }), dur(0.45));
      if (lv === 2) t.to(raysMat, { opacity: 0.55, duration: dur(1.2) }, 0.2);
      await done(t);
      const a = project(card3, new THREE.Vector3(0, CARD_H / 2, 0)), b = project(card3, new THREE.Vector3(0, -CARD_H / 2, 0)), mid = project(card3);
      card3.visible = false;
      sparks([30, 120, 220][lv], top);
      buzz([[30], [50, 40, 90], [80, 50, 160]][lv]);
      if (lv === 2) { sound("shockwave"); shock(16, 1.4); }
      shakeCam([0, 0.12, 0.25][lv], 0.5);
      to(CAM, { push: 0, duration: dur(1), ease: "power2.out" });
      to(bloom, { strength: 0.35, duration: dur(1.2) });
      to(light, { level: 0.35, duration: dur(1.2) });
      return { x: mid.x, y: mid.y, scale: Math.abs(b.y - a.y) / 430 };
    },
    dispose() {
      anims.forEach((a) => a.kill());
      latches.forEach((l) => gsap.killTweensOf(l.glowMat));
      renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      ro.disconnect();
      timer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          mat.dispose();
        }
      });
      composer.dispose();
      renderer.dispose();
    },
  };
}
