import gsap from "gsap";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** 0 = comum, 1 = rara (S ou especial), 2 = Eternus. */
export type CaseLevel = 0 | 1 | 2;
export type CaseSound = "clack" | "creak" | "boom" | "stamp";

export type CaseOptions = {
  name: string;
  reduce: boolean;
  /** Botões invisíveis sobre as travas (teclado e leitor de tela); a cena reposiciona a cada quadro. */
  latchButtons: (HTMLButtonElement | null)[];
  onLatch: (index: number, remaining: number) => void;
  onSound: (s: CaseSound) => void;
};

/** Onde a carta está na tela no momento da troca pela carta real: centro e escala para uma carta de 430 px de altura. */
export type CardSpot = { x: number; y: number; scale: number };

export type PackCase = {
  arrive: () => Promise<void>;
  openLatch: (i: number) => void;
  setRarity: (c: string, hi: string) => void;
  /** Tampa: comum abre direto; rara emperra, pulsa e estoura. Resolve quando a tampa está aberta. */
  crack: (lv: CaseLevel) => Promise<void>;
  /** Walkout: a cena escurece para as pistas. */
  dim: () => void;
  beat: (i: number) => void;
  /** A carta sobe e gira; resolve no ponto em que o verso 3D vira a carta real. */
  rise: (lv: CaseLevel) => Promise<CardSpot>;
  dispose: () => void;
};

export const CAM_FOV = 34;

/** Distância da câmera para a maleta (5,5 × 5 unidades) caber em qualquer proporção de tela. */
export function fitDistance(aspect: number, fov = CAM_FOV): number {
  const vf = THREE.MathUtils.degToRad(fov) / 2;
  const hf = Math.atan(Math.tan(vf) * aspect);
  return Math.max(2.75 / Math.tan(hf), 2.5 / Math.tan(vf));
}

const W = 4.4, D = 3.0, HB = 0.72, HL = 0.46;
const CARD_H = 2.2, CARD_W = (CARD_H * 295) / 430;
const NEUTRAL = "#ffefd7";

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

  // a carta, de costas, deitada na espuma; o halo e a luz vão presos a ela
  const card3 = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: backTexture(), transparent: true, color: 0xb8b8b8, side: THREE.DoubleSide }));
  card3.rotation.x = -Math.PI / 2;
  card3.position.set(0, HB + 0.08, 0.1);
  card3.castShadow = true;
  caseG.add(card3);
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

  const v = new THREE.Vector3();
  const project = (obj: THREE.Object3D, local = new THREE.Vector3()) => {
    v.copy(local);
    obj.localToWorld(v);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * host.clientWidth, y: (-v.y * 0.5 + 0.5) * host.clientHeight };
  };

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
    const d = 1 - CAM.push * 0.28;
    camera.position.set(CAM.pos.x + shakeO.x, CAM.pos.y * d + shakeO.y, CAM.pos.z * d);
    camera.lookAt(CAM.look);
    // feixes sempre de frente para a câmera e tremulando um pouco
    for (const s of shaftData) {
      s.mesh.rotation.y = Math.atan2(camera.position.x - s.mesh.position.x, camera.position.z - s.mesh.position.z);
      s.mesh.material.opacity = light.level * s.base * (reduce ? 1 : 0.75 + 0.25 * Math.sin(t * s.speed + s.phase));
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
    sound("clack");
    shakeCam(0.05, 0.18);
    if (!reduce) track(gsap.fromTo(caseG.position, { y: 0.04 }, { y: 0, duration: 0.25, ease: "bounce.out" }));
    const remaining = latches.filter((x) => !x.open).length;
    if (!remaining) armed = false;
    opts.onLatch(i, remaining);
  }

  const peakLight = [0.55, 0.8, 1], peakInner = [6, 10, 14];

  function openLid(lv: CaseLevel) {
    for (const m of [shade, cord, bulb, beamCone]) m.visible = false;
    const t = tl()
      .to(hinge.rotation, { x: -1.9, duration: dur(lv ? 0.55 : 0.8), ease: lv ? "back.out(1.4)" : "power3.out" })
      .to(aura.material, { opacity: [0.6, 0.8, 1][lv], duration: dur(0.3) }, 0)
      .to(inner, { intensity: peakInner[lv], duration: dur(0.3) }, 0)
      .to(light, { level: peakLight[lv], duration: dur(0.7), ease: "power2.out" }, 0.05)
      .to(seamGlow.material, { opacity: 0, duration: dur(0.3) }, 0.1)
      .to(spot, { intensity: 35, duration: dur(0.6) }, 0);
    if (lv) t.add(() => { sound("boom"); shakeCam(0.12 + lv * 0.1, 0.6); sparks(80 + lv * 70, HB + 0.3); }, 0.1);
    else t.add(() => sound("creak"), 0);
    t.to({}, { duration: dur(lv ? 1.1 : 0.7) }, 0);
    return done(t);
  }

  return {
    arrive() {
      caseG.position.x = reduce ? 0 : -11;
      caseG.rotation.y = reduce ? 0 : 0.5;
      const t = tl()
        .to(caseG.position, { x: 0, duration: dur(1.1), ease: "power3.out" }, 0.25)
        .to(caseG.rotation, { y: -0.05, duration: dur(1.1), ease: "power3.out" }, 0.25)
        .add(() => { sound("stamp"); shakeCam(0.06, 0.25); }, reduce ? 0.25 : 1.2)
        .to(caseG.rotation, { y: 0, duration: dur(0.4), ease: "power2.out" })
        .add(() => {
          armed = true;
          latches.forEach((l, i) => to(l.glowMat, { opacity: 0.5, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.35 }));
        });
      return done(t);
    },
    openLatch,
    setRarity(c, hi) {
      for (const { m, hi: isHi } of tinted) m.color.set(isHi ? hi : c);
    },
    async crack(lv) {
      const peak = [0.35, 0.6, 0.9][lv];
      const t = tl()
        .to(hinge.rotation, { x: -0.07, duration: dur(0.35), ease: "power2.out" })
        .to(seamGlow.material, { opacity: peak, duration: dur(0.3) }, 0.1)
        .to(aura.material, { opacity: peak * 0.6, duration: dur(0.3) }, 0.1)
        .to(inner, { intensity: 3 + lv * 2, duration: dur(0.4) }, 0.1)
        .add(() => sound("creak"), 0.05);
      if (lv && !reduce) {
        // rara: a tampa sobe um pouco e emperra; a câmera chega perto; a luz pulsa
        t.to(hinge.rotation, { x: -0.42, duration: 0.5, ease: "power2.out" }, 0.7)
          .to(CAM, { push: 1, duration: 1.6 + lv * 0.4, ease: "power2.inOut" }, 0.7)
          .to(bloom, { strength: 0.45 + lv * 0.12, duration: 1.4 }, 0.7);
        const gap = 0.62 - lv * 0.08;
        for (let i = 0; i < 2 + lv; i++) {
          const at = 1.2 + i * gap;
          t.to(inner, { intensity: (6 + lv * 4) * (1 + i * 0.3), duration: 0.12, ease: "power2.out" }, at)
            .to(aura.material, { opacity: 0.7 + i * 0.1, duration: 0.12 }, at)
            .to(aura.material, { opacity: 0.45, duration: 0.35 }, at + 0.12)
            .to(inner, { intensity: 3 + lv * 2, duration: 0.35, ease: "power2.in" }, at + 0.12)
            .to(hinge.rotation, { x: -0.42 - (i + 1) * 0.03, duration: 0.1, ease: "power2.out" }, at)
            .add(() => { shakeCam(0.05 + lv * 0.04 + i * 0.02, 0.3); sound("stamp"); }, at);
        }
        t.to({}, { duration: 0.1 });
      } else t.to({}, { duration: dur(0.25) });
      await done(t);
      await openLid(lv);
    },
    dim() {
      tl().to(light, { level: 0.25, duration: dur(0.5) }, 0).to(inner, { intensity: 2, duration: dur(0.5) }, 0);
    },
    beat(i) {
      sound("stamp");
      shakeCam(0.03 + i * 0.02, 0.25);
      tl()
        .to(light, { level: 0.35 + i * 0.12, duration: dur(0.2) })
        .to(light, { level: 0.25, duration: dur(0.6) })
        .to(CAM, { push: 0.3 + i * 0.2, duration: dur(1.6), ease: "power1.inOut" }, 0);
    },
    async rise(lv) {
      const turns = reduce ? 0 : [1, 2, 3][lv];
      const top = HB + 1.9;
      const t = tl()
        .to(inner, { intensity: peakInner[lv], duration: dur(0.3) }, 0)
        .to(light, { level: peakLight[lv], duration: dur(0.3) }, 0)
        .to(card3.position, { y: top, z: 0.9, duration: dur(0.7), ease: "power3.out" }, 0)
        .to(card3.rotation, { x: -0.55, duration: dur(0.7), ease: "power3.out" }, 0)
        .to(CAM, { push: 0.35, duration: dur(0.8), ease: "power2.out" }, 0)
        .to(card3.rotation, { y: Math.PI * 2 * turns, duration: dur(0.5 + lv * 0.35), ease: "power2.inOut" }, dur(0.45));
      await done(t);
      const a = project(card3, new THREE.Vector3(0, CARD_H / 2, 0)), b = project(card3, new THREE.Vector3(0, -CARD_H / 2, 0)), mid = project(card3);
      card3.visible = false;
      sparks([30, 120, 220][lv], top);
      if (lv === 2) sound("boom");
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
