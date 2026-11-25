import { describe, expect, it } from "vitest";
import { LAYER, firstTear, inPoly, moreDamage, statHole, touches, type Rect } from "../src/lib/packTear";

/** Sorteio com semente, para o teste repetir sempre igual. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// posições medidas na carta de time (camada do pack, em px)
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const OVR = r(33, 39, 56, 120);
const NAME = r(41, 207, 229, 35);
const STATS = [r(49, 254, 97, 28), r(166, 254, 97, 28), r(49, 288, 97, 28), r(166, 288, 97, 28), r(49, 322, 97, 28), r(166, 322, 97, 28)];
const TITLE = r(0, 57, 311, 95);

describe("rasgos da abertura de pack", () => {
  it("o 1º rasgo varia, só mostra luz e não passa pelo nome do pack", () => {
    const shapes = new Set<number>();
    for (let s = 1; s <= 200; s++) {
      const d = firstTear(seeded(s), [TITLE]);
      expect(d.holes.length).toBeGreaterThan(0);
      for (const h of d.holes) {
        expect(h.kind).toBe("light");
        expect(touches(h.pts, [TITLE])).toBe(false);
      }
      shapes.add(d.holes.length * 10 + d.fly.length + (d.holes[0].flap ? 100 : 0));
    }
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it("o buraco do atributo mostra o atributo e nunca encosta no overall, no nome ou nos outros atributos", () => {
    for (let s = 1; s <= 300; s++) {
      const rand = seeded(s);
      const i = s % STATS.length;
      const cell = STATS[i];
      const forbidden = [OVR, NAME, ...STATS.filter((_, j) => j !== i)];
      const h = statHole(rand, cell, forbidden);
      expect(h.kind).toBe("card");
      expect(touches(h.pts, forbidden)).toBe(false);
      expect(inPoly([cell.x + cell.w / 2, cell.y + cell.h / 2], h.pts)).toBe(true);
    }
  });

  it("os arranhões que mostram a carta ficam longe de tudo que entrega a carta", () => {
    const forbidden = [OVR, NAME, ...STATS];
    for (let s = 1; s <= 200; s++) {
      const rand = seeded(s);
      const first = firstTear(rand, [TITLE]).holes[0];
      const d = moreDamage(rand, first, forbidden, [TITLE]);
      for (const h of d.holes.filter((x) => x.kind === "card")) {
        expect(touches(h.pts, forbidden, 9)).toBe(false);
        for (const [x, y] of h.pts) {
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(LAYER.w);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(LAYER.h);
        }
      }
      expect(d.creases.length).toBeGreaterThan(0);
    }
  });
});
