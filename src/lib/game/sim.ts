// Simulação de partidas do seu baralho contra a IA, com os dois lados jogando do mesmo jeito (a mesma regra da IA).
// Dá um número honesto para a tela de baralhos: "vence 62% contra a IA".
import type { GameConfig, PoolCard } from "./config";
import { Match, type GCard } from "./engine";

/** Gerador de números com semente (mulberry32): a mesma semente dá a mesma partida. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * O seu lado jogando como a IA: compra o item de tier mais alto que cabe, joga da carta mais cara para a mais barata no
 * primeiro local que aceita (em ordem sorteada), faz as escolhas ao acaso e marca a inimiga mais fraca com o Shiv.
 */
function botTurn(m: Match, rnd: () => number) {
  const pickOf = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const shop = m.offer?.p.filter((k) => m.canBuy(k)) ?? [];
  if (shop.length) {
    const k = shop.sort((a, b) => m.itemPrice("p", b) - m.itemPrice("p", a))[0];
    const t = pickOf(m.itemTargets("p", k));
    if (t) m.buy(k, t);
  }
  for (const c of [...m.hand].sort((a, b) => b.cost - a.cost)) {
    const ls = [...m.loc].sort(() => rnd() - 0.5);
    const l = ls.find((x) => !m.canPlay(c, x));
    if (!l || m.play(c, l)) continue;
    const cards = m.choiceCards(c), locs = m.choiceLocs(c);
    if (cards.length || locs.length) m.choose(c, { card: pickOf(cards), loc: pickOf(locs) });
  }
  const weak = (a: GCard[]) => a.reduce<GCard | undefined>((w, c) => (!w || m.pow(c) < m.pow(w) ? c : w), undefined);
  for (const c of m.loc.flatMap((l) => l.s.p)) {
    const t = weak(m.markOptions(c));
    if (t) m.mark(c, t);
  }
}

export type SimResult = { n: number; win: number; loss: number; draw: number };

/** Joga `n` partidas do baralho contra a IA (cada uma com a sua semente, a partir de `seed`). */
export function simulate(cfg: GameConfig, pool: PoolCard[], deck: PoolCard[], n: number, seed = 1, acc: SimResult = { n: 0, win: 0, loss: 0, draw: 0 }): SimResult {
  for (let i = 0; i < n; i++) {
    const rnd = seeded(seed + i);
    const m = new Match(cfg, pool, rnd, { p: deck });
    let r = null;
    while (!r) { botTurn(m, rnd); r = m.runEndTurn(); }
    acc.n++;
    acc[r.outcome]++;
  }
  return acc;
}

/** Chance de vitória em % (empate vale meia vitória). */
export const winRate = (r: SimResult) => (r.n ? Math.round(((r.win + r.draw / 2) / r.n) * 100) : 0);
