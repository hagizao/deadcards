/**
 * Fundo animado do site: o ritual visto de longe. Um redemoinho achatado pela perspectiva sobre uma cidade
 * art déco, com um olho de luz no centro, um feixe até a torre mais alta, almas subindo das janelas e
 * relâmpagos raros. Canvas 2D puro, sem React: o componente só cria, troca a cor e destrói.
 */

type RGB = [number, number, number];
type Particle = { a: number; r: number; w: number; l: number; z: number };
type Win = { x: number; y: number; ph: number; sp: number };
type Soul = { x0: number; y0: number; t0: number; d: number; a0: number; turns: number; size: number };
type Bolt = { t0: number; pts: [number, number][]; x: number; y: number };

const WHITE: RGB = [255, 255, 255];
export const hexRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ruído de valor + fbm: a base das nuvens em espiral
const P = new Uint8Array(512);
for (let i = 0; i < 256; i++) P[i] = i;
for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [P[i], P[j]] = [P[j], P[i]]; }
for (let i = 0; i < 256; i++) P[i + 256] = P[i];
const hsh = (i: number, j: number) => P[(i & 255) + P[j & 255]] / 255;
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) { let s = 0, a = 0.5; for (let o = 0; o < 4; o++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;

// brilho redondo pré-desenhado: drawImage é bem mais barato que shadowBlur
function glowSprite(c: RGB) {
  const s = canvas(64, 64), g = ctx2d(s), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.12, rgba(c, 0.95)); gr.addColorStop(0.4, rgba(c, 0.25)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return s;
}

/** Ladrilho de ruído para a granulação por cima do fundo (vira background-image em CSS). */
export function grainTile() {
  const g = canvas(160, 160), gx = ctx2d(g), img = gx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  gx.putImageData(img, 0, 0);
  return g.toDataURL();
}

export class RitualBackdrop {
  private ctx: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private tint: RGB; private tintTarget: RGB;
  private cx = 0; private cy = 0; private R = 0; private flat = 0.3;
  private low = canvas(1, 1); private lctx = ctx2d(this.low); private lowImg!: ImageData;
  private trail = canvas(1, 1); private tc = ctx2d(this.trail);
  private ps: Particle[] = [];
  private city!: { c: HTMLCanvasElement; windows: Win[]; lit: HTMLCanvasElement; lc: CanvasRenderingContext2D };
  private spireTop = 0; private litY = 0;
  private sprite = glowSprite(WHITE); private soulSprite = glowSprite([160, 255, 235]);
  private souls: Soul[] = []; private nextSoul = 0; private nextBolt = rand(4, 8); private bolt: Bolt | null = null;
  private raf = 0; private last = 0; private acc = 0; private t0 = performance.now();
  private running = false;

  constructor(private cv: HTMLCanvasElement, color: string) {
    this.ctx = ctx2d(cv);
    this.tint = this.tintTarget = hexRgb(color);
    this.resize();
  }

  /** Muda a cor do ritual; ela chega aos poucos (uns 0,8 s) em vez de saltar. Parado, troca na hora. */
  setColor(color: string) {
    this.tintTarget = hexRgb(color);
    if (!this.running) { this.tint = this.tintTarget; this.frame(performance.now(), true); }
  }

  resize() {
    const DPR = Math.min(devicePixelRatio || 1, 1.5);
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = this.W * DPR; this.cv.height = this.H * DPR;
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.init();
    this.frame(performance.now(), true);
  }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = (now: number) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  private init() {
    const { W, H } = this, narrow = W < 700;
    // no celular o olho fica mais alto e mais para o lado, fora do caminho do conteúdo
    this.cx = W * (narrow ? 0.72 : 0.7); this.cy = H * (narrow ? 0.2 : 0.3);
    this.R = Math.max(W, H) * 0.75;
    this.low = canvas(Math.ceil(W / 6), Math.ceil(H / 6)); this.lctx = ctx2d(this.low); this.lowImg = this.lctx.createImageData(this.low.width, this.low.height);
    this.trail = canvas(W, H); this.tc = ctx2d(this.trail);
    this.ps = Array.from({ length: narrow ? 700 : 1500 }, () => this.particle(true));
    this.city = this.skyline();
    this.souls = [];
    // um segundo e meio de redemoinho já desenhado: o fundo não começa vazio, nem parado
    for (let i = 0; i < 45; i++) this.stepTrail(1 / 30);
  }

  // rastro do redemoinho num canvas à parte, para não apagar a cidade
  private stepTrail(dt: number) {
    const { tc, cx, cy, R, flat, tint, W, H } = this;
    tc.globalCompositeOperation = "destination-out"; tc.fillStyle = "rgba(0,0,0,0.07)"; tc.fillRect(0, 0, W, H);
    tc.globalCompositeOperation = "lighter"; tc.lineCap = "round";
    for (const p of this.ps) {
      const x0 = cx + Math.cos(p.a) * p.r, y0 = cy + Math.sin(p.a) * p.r * flat + p.z * p.r * 0.03;
      // longe, tudo parece mais lento
      p.a += dt * (9 / Math.sqrt(p.r + 30)) * p.w * 0.3; p.r -= dt * (3 + 500 / (p.r + 40)) * p.w;
      if (p.r < 8) Object.assign(p, this.particle(false));
      const x1 = cx + Math.cos(p.a) * p.r, y1 = cy + Math.sin(p.a) * p.r * flat + p.z * p.r * 0.03;
      const near = 1 - p.r / R, front = Math.sin(p.a) > 0;
      // a borda de trás fica mais apagada, a da frente mais nítida
      tc.strokeStyle = rgba(mix([150, 160, 170], tint, 0.65 + near * 0.35), (0.12 + near * 0.55) * p.l * (front ? 1 : 0.6));
      tc.lineWidth = 0.5 + near;
      tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();
    }
  }

  private particle(anywhere: boolean): Particle {
    return { a: Math.random() * 6.28, r: anywhere ? rand(10, this.R) : this.R * rand(0.8, 1), w: rand(0.5, 1.3), l: rand(0.25, 1), z: rand(-1, 1) };
  }

  // alma: sai de uma janela e sobe em espiral até sumir no olho
  private soul(t: number): Soul {
    const w = this.city.windows[(Math.random() * this.city.windows.length) | 0];
    return { x0: w.x, y0: w.y, t0: t, d: rand(7, 11), a0: Math.random() * 6.28, turns: rand(1.2, 2.2), size: rand(5, 9) };
  }

  // relâmpago: um zigue-zague curto dentro das nuvens, em volta do olho
  private makeBolt(t: number): Bolt {
    const a = Math.random() * 6.28, r0 = this.R * rand(0.12, 0.4), pts: [number, number][] = [];
    let x = this.cx + Math.cos(a) * r0, y = this.cy + Math.sin(a) * r0 * this.flat;
    const dir = a + rand(-1, 1) + Math.PI / 2;
    for (let i = 0; i < 9; i++) { pts.push([x, y]); x += Math.cos(dir) * rand(10, 26) + rand(-10, 10); y += Math.sin(dir) * rand(4, 10) * this.flat * 2 + rand(-6, 6); }
    return { t0: t, pts, x: pts[4][0], y: pts[4][1] };
  }

  // cidade pequena no horizonte; a torre do centro fica embaixo do olho
  private skyline() {
    const { W, H } = this, c = canvas(W, H), g = ctx2d(c);
    const base = H, small = W < 700 ? 0.75 : 1, windows: Win[] = [];
    const tower = (x: number, w: number, h: number, col: string) => {
      g.fillStyle = col; const top = base - h; g.fillRect(x, top, w, h);
      let tw = w, ty = top;
      for (let s = 0, n = 1 + ((Math.random() * 3) | 0); s < n; s++) { const nw = tw * rand(0.55, 0.8), nh = rand(0.015, 0.04) * H; g.fillRect(x + (w - nw) / 2, ty - nh, nw, nh); tw = nw; ty -= nh; }
      if (Math.random() < 0.5) { const sx = x + w / 2; g.beginPath(); g.moveTo(sx - tw * 0.2, ty); g.lineTo(sx, ty - rand(0.03, 0.07) * H); g.lineTo(sx + tw * 0.2, ty); g.fill(); }
      for (let wy = top + 6; wy < H - 3; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5)
        if (Math.random() < 0.06) windows.push({ x: wx, y: wy, ph: Math.random() * 6.28, sp: rand(0.05, 0.3) });
    };
    // fileira de trás, mais clara pela névoa, e a da frente, escura
    for (let x = -10; x < W;) { const w = rand(22, 60) * small; tower(x, w, rand(0.08, 0.2) * H, "#1b1c25"); x += w + rand(-4, 6); }
    for (let x = -10; x < W;) { const w = rand(28, 80) * small; tower(x, w, rand(0.05, 0.16) * H, "#0d0d12"); x += w + rand(-4, 10); }
    // a torre do ritual: alta, com coroa escalonada e antena (mais baixa no celular, o feixe fica mais curto)
    const tw = 34 * small, tx = this.cx - tw / 2, th = H * (W < 700 ? 0.22 : 0.3);
    g.fillStyle = "#11131a"; g.fillRect(tx, base - th, tw, th);
    let w = tw, y = base - th;
    for (let i = 0; i < 4; i++) { const nw = w * 0.72, nh = H * 0.022; g.fillRect(this.cx - nw / 2, y - nh, nw, nh); w = nw; y -= nh; }
    g.fillRect(this.cx - 1, y - H * 0.07, 2, H * 0.07);
    this.spireTop = y - H * 0.07;
    this.litY = base - th * 0.6;
    const lit = canvas(W, H);
    return { c, windows, lit, lc: ctx2d(lit) };
  }

  private frame(now: number, force = false) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    // 30 quadros por segundo bastam para um fundo lento e economizam bateria
    this.acc += dt; if (!force && this.acc < 1 / 30) return;
    const step = force ? 0 : this.acc; this.acc = 0;
    this.tint = mix(this.tint, this.tintTarget, Math.min(1, step * 4));
    this.draw((now - this.t0) / 1000, step);
  }

  private draw(t: number, dt: number) {
    const { ctx, W, H, tint, cx, cy, R, flat } = this;
    // relâmpago raro (a cada 15 a 25 s): dois lampejos em meio segundo; parado, nada pisca
    if (this.running && t > this.nextBolt) { this.bolt = this.makeBolt(t); this.nextBolt = t + rand(15, 25); }
    const bt = this.bolt ? t - this.bolt.t0 : 9;
    const flash = bt < 0.6 ? Math.max(0, Math.sin((bt / 0.6) * Math.PI)) * (bt < 0.12 || bt > 0.22 ? 1 : 0.35) : 0;
    const bolt = this.bolt;
    const pulse = 0.8 + 0.2 * Math.sin(t * 0.8);

    // céu: ardósia em cima, névoa quente perto do horizonte
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0b0d11"); sky.addColorStop(0.55, rgba(mix([21, 24, 32], tint, 0.06), 1)); sky.addColorStop(0.85, rgba(mix([44, 36, 42], tint, 0.2), 1)); sky.addColorStop(1, rgba(mix([26, 23, 28], tint, 0.1), 1));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // nuvens em espiral: o ruído é girado mais perto do centro, e gira devagar com o tempo
    const d = this.lowImg.data, lw = this.low.width, lh = this.low.height, k = W / lw, cloud: RGB = [34, 38, 47];
    const flashTint = mix(tint, WHITE, flash * 0.3);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const dx = (x * k - cx) / R, dy = (y * k - cy) / (R * flat * 1.6);
      const rr = Math.sqrt(dx * dx + dy * dy) + 1e-4, phi = 2.2 * Math.log(rr) - t * 0.03;
      const c = Math.cos(phi), sn = Math.sin(phi), qx = (dx * c - dy * sn) * 3, qy = (dx * sn + dy * c) * 3;
      const dens = smooth(0.38, 0.7, fbm(qx + 5, qy + 5)) * smooth(1.25, 0.5, rr) * smooth(0.04, 0.2, rr);
      let lit = Math.max(0, 1 - rr * 2.2) ** 2;
      if (flash > 0 && bolt) { const bx = (x * k - bolt.x) / (R * 0.45), by = (y * k - bolt.y) / (R * 0.45 * flat * 1.6); lit += flash * Math.max(0, 1 - Math.hypot(bx, by)) * 2.4; }
      const col = mix(cloud, flashTint, Math.min(1, lit * 0.8)), i = (y * lw + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = dens * (0.75 + lit * 0.25) * 255;
    }
    this.lctx.putImageData(this.lowImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.low, 0, 0, W, H);

    if (dt) this.stepTrail(dt);
    ctx.drawImage(this.trail, 0, 0, W, H);

    // clarão dentro da nuvem e o raio em si, fino, só enquanto pisca
    if (flash > 0 && bolt) {
      const fl = ctx.createRadialGradient(bolt.x, bolt.y, 0, bolt.x, bolt.y, R * 0.3);
      fl.addColorStop(0, rgba(mix(tint, WHITE, 0.5), 0.22 * flash)); fl.addColorStop(1, rgba(tint, 0));
      ctx.save(); ctx.translate(bolt.x, bolt.y); ctx.scale(1, 0.45); ctx.translate(-bolt.x, -bolt.y);
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = fl; ctx.fillRect(bolt.x - R * 0.3, bolt.y - R * 0.3, R * 0.6, R * 0.6);
      ctx.restore(); ctx.globalCompositeOperation = "source-over";
      if (flash > 0.2) {
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(mix(tint, WHITE, 0.6), flash * 0.8); ctx.lineWidth = 1.2;
        ctx.beginPath(); bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // halo largo na cor da aba em volta do redemoinho: cor de ambiente, fraca e espalhada
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
    halo.addColorStop(0, rgba(tint, 0.16)); halo.addColorStop(0.45, rgba(tint, 0.07)); halo.addColorStop(1, rgba(tint, 0));
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.6); ctx.translate(-cx, -cy);
    ctx.fillStyle = halo; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.restore();

    // olho do ritual: luz pulsando devagar no centro
    const eye = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
    eye.addColorStop(0, rgba(mix(tint, WHITE, 0.5), 0.55 * pulse)); eye.addColorStop(0.25, rgba(tint, 0.22 * pulse)); eye.addColorStop(1, rgba(tint, 0));
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.45); ctx.translate(-cx, -cy);
    ctx.fillStyle = eye; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.restore();

    // feixe descendo do olho até a antena; no celular ele passa atrás do texto, então fica mais fino e fraco
    const narrow = W < 700, bk = narrow ? 0.35 : 0.6;
    const bw = (narrow ? 5 : 10) + 4 * pulse, beam = ctx.createLinearGradient(0, cy, 0, this.spireTop);
    beam.addColorStop(0, rgba(tint, 0.5 * pulse * bk)); beam.addColorStop(1, rgba(tint, 0.15 * bk));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = beam; ctx.beginPath();
    ctx.moveTo(cx - bw * 0.4, cy); ctx.lineTo(cx + bw * 0.4, cy); ctx.lineTo(cx + bw * 1.6, this.spireTop); ctx.lineTo(cx - bw * 1.6, this.spireTop); ctx.fill();
    ctx.fillStyle = rgba(mix(tint, WHITE, 0.7), 0.7 * pulse * bk); ctx.fillRect(cx - 0.75, cy, 1.5, this.spireTop - cy);
    ctx.globalAlpha = 0.9 * pulse; ctx.drawImage(this.sprite, cx - 14, this.spireTop - 14, 28, 28); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // sigilo no olho: anéis finos e marcas art déco girando bem devagar, de frente para quem olha
    const sr = Math.min(W, H) * 0.035;
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(mix(tint, WHITE, 0.55), 0.55 * pulse); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, sr, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, sr * 0.55, 0, 6.283); ctx.stroke();
    ctx.rotate(t * 0.12);
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r1 = i % 2 ? sr * 1.12 : sr * 1.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * sr, Math.sin(a) * sr); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
    ctx.rotate(-t * 0.3);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = i * 2.094 - Math.PI / 2, px = Math.cos(a) * sr * 0.55, py = Math.sin(a) * sr * 0.55; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.stroke();
    ctx.restore(); ctx.globalCompositeOperation = "source-over";

    // névoa no horizonte, depois a cidade e as janelas
    const haze = ctx.createLinearGradient(0, H * 0.62, 0, H);
    haze.addColorStop(0, "rgba(60,52,60,0)"); haze.addColorStop(1, "rgba(60,52,60,0.35)");
    ctx.fillStyle = haze; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.drawImage(this.city.c, 0, 0, W, H);
    // luz do feixe (e do relâmpago) nos prédios, recortada pela silhueta da cidade
    const L = this.city.lc;
    L.globalCompositeOperation = "source-over"; L.clearRect(0, 0, W, H); L.drawImage(this.city.c, 0, 0);
    L.globalCompositeOperation = "source-in";
    const lg = L.createRadialGradient(cx, this.litY, 0, cx, this.litY, W * 0.35);
    lg.addColorStop(0, rgba(tint, 0.45 * pulse)); lg.addColorStop(0.4, rgba(tint, 0.12)); lg.addColorStop(1, rgba(tint, 0));
    L.fillStyle = lg; L.fillRect(0, 0, W, H);
    if (flash > 0) { L.globalCompositeOperation = "source-atop"; L.fillStyle = rgba(mix(tint, WHITE, 0.5), flash * 0.12); L.fillRect(0, 0, W, H); }
    ctx.drawImage(this.city.lit, 0, 0, W, H);
    ctx.fillStyle = "#ffcf87";
    for (const w of this.city.windows) { ctx.globalAlpha = 0.55 * (0.5 + 0.5 * Math.sin(t * w.sp + w.ph)); ctx.fillRect(w.x, w.y, 1.5, 2.5); }
    ctx.globalAlpha = 1;

    // almas: poucas por vez (no máximo 5), uma nova a cada 2 a 4 s; parado, nenhuma
    if (!this.running) return;
    if (t > this.nextSoul && this.souls.length < 5 && this.city.windows.length) { this.souls.push(this.soul(t)); this.nextSoul = t + rand(2, 4); }
    ctx.globalCompositeOperation = "lighter";
    this.souls = this.souls.filter((s) => {
      const p = (t - s.t0) / s.d; if (p >= 1 || p < 0) return false;
      const e = p * p * (3 - 2 * p), ang = s.a0 + e * s.turns * 6.283, rad = (1 - e) * W * 0.05;
      const x = s.x0 + (cx - s.x0) * e + Math.cos(ang) * rad, y = s.y0 + (cy - s.y0) * e + Math.sin(ang) * rad * 0.5;
      const a = smooth(0, 0.12, p) * smooth(1, 0.8, p), z = s.size * (1 - e * 0.6);
      ctx.globalAlpha = a; ctx.drawImage(this.soulSprite, x - z, y - z, z * 2, z * 2);
      return true;
    });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
}
