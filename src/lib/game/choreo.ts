// Coreografia das habilidades: as próprias cartas se mexem (avançam, colidem, voam de um local para outro).
// Enquanto a cena roda, cada carta envolvida vira um dublê (cópia da face) numa camada fixa por cima da tela; a
// carta de verdade fica invisível no lugar final e reaparece quando a cena acaba. As cenas de cada herói estão em
// choreoHeroes.ts e as peças em choreoKit.ts.
import type { AbilityKey } from "./config";
import type { HeardEv } from "./engine";
import { CHOREO } from "./choreoHeroes";
import { later, type Actor, type Box, type Stage } from "./choreoKit";

export { CHOREO };
export type { Box };

const boxOf = (r: DOMRect): Box => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
/** A face da carta na tela (sem o botão em volta, que carrega a animação de queda). */
export const faceOf = (el: Element | null | undefined) => el?.querySelector("button")?.firstElementChild ?? el?.firstElementChild ?? null;

/**
 * Prepara os dublês de uma cena. `hold` cria o dublê de uma carta já (para a que trocou de local ficar no lugar
 * velho até a cena), `start` cria os que faltam e roda; no fim tudo some e as cartas de verdade voltam a aparecer.
 * `faces` são cópias das faces de antes da jogada: a cena mostra a carta como era (a que a Shiv corta, a que vira pombo).
 */
export class Rig {
  readonly layer: HTMLDivElement;
  private actors = new Map<number, Actor>();
  private hidden: Animation[] = [];
  constructor(private faces: Map<number, Element> = new Map()) {
    this.layer = document.createElement("div");
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.className = "pointer-events-none fixed inset-0 z-90 overflow-hidden";
    document.body.appendChild(this.layer);
  }
  /** Dublê da carta `id` parado em `from` (ou onde ela está), terminando onde ela está (ou em `to`). */
  hold(id: number, from: Box | null, foe: boolean, to?: Box): Actor | null {
    const had = this.actors.get(id);
    if (had) return had;
    const el = document.querySelector<HTMLElement>(`[data-card="${id}"]`);
    const r = el?.getBoundingClientRect();
    const here = r && r.width ? boxOf(r) : null;
    const at = from ?? here;
    if (!at) return null;
    const next = faceOf(el);
    const face = this.faces.get(id) ?? next;
    let g: HTMLElement | null = null;
    if (face) {
      g = document.createElement("div");
      g.className = "absolute will-change-transform drop-shadow-[0_6px_6px_rgb(0_0_0/0.8)]";
      Object.assign(g.style, { left: `${at.x - at.w / 2}px`, top: `${at.y - at.h / 2}px`, width: `${at.w}px`, height: `${at.h}px` });
      const copy = face.cloneNode(true) as HTMLElement;
      copy.style.width = "100%";
      g.appendChild(copy);
      this.layer.appendChild(g);
    }
    if (el) this.hidden.push(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: "forwards" }));
    const a: Actor = { id, g, from: at, to: to ?? here ?? at, foe, gone: !el, next };
    this.actors.set(id, a);
    return a;
  }
  /** Roda a coreografia e limpa no fim. */
  start(ab: AbilityKey, src: { id: number; box: Box | null }, dst: { id: number; foe: boolean; from?: Box | null; to?: Box }[], o: { self: boolean; ev?: HeardEv; lane: Box | null; alt: Box | null; shake: Stage["shake"] }) {
    const recipe = CHOREO[ab];
    // a carta que agiu pode ter saído da mesa (a Vindicta zerada na queda): a cena roda do lugar onde ela estava
    const s = this.hold(src.id, src.box, false);
    if (!recipe || !s) return this.done();
    const stage: Stage = { src: s, dst: dst.flatMap((d) => this.hold(d.id, d.from ?? null, d.foe, d.to) ?? []).filter((d) => d !== s || o.ev === "trap" || o.ev === "petri"), self: o.self, ev: o.ev, lane: o.lane, alt: o.alt, layer: this.layer, shake: o.shake };
    const ms = recipe.ms(stage.dst.length, o.self, o.ev);
    recipe.run(stage);
    // as que morreram somem no golpe (o X da mesa aparece no lugar delas), a não ser que a cena mostre a morte
    if (!recipe.kills) later(() => stage.dst.forEach((d) => { if (d.gone && d.g) d.g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: "forwards" }); }), recipe.hit?.(stage.dst.length, o.self, o.ev) ?? ms / 2);
    later(() => this.done(), ms + 60);
  }
  done() {
    this.hidden.forEach((a) => a.cancel());
    this.layer.remove();
  }
}
