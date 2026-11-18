// Partidas aleatórias inteiras (jogador sorteando jogadas, escolhas, itens e movimentos) com checagens depois de cada passo:
// integridade da mesa, poder explicado sem sobra, cartas zeradas eliminadas e o que algumas habilidades prometem no texto.
import { describe, expect, it } from "vitest";
import { ABILITIES, REMOVAL_CAP, gameConfig } from "../src/lib/game/config";
import { Match, cardPool, type GCard, type Loc } from "../src/lib/game/engine";
import type { Player } from "../src/lib/types";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const HEROES = Object.keys(ABILITIES).filter((k) => ABILITIES[k as keyof typeof ABILITIES].hero);
const POSITIONS = ["Carry", "OffCarry", "Frontline", "Suporte", "Flex"];
const player = (i: number, hero: string, r: () => number): Player => {
  const s = () => 55 + Math.floor(r() * 45);
  return { id: `p${i}`, name: `P${i}`, teamId: "t", hero, position: POSITIONS[i % 5], ovr: s(), stats: { MIR: s(), MAC: s(), SUP: s(), MOV: s(), POL: s(), CON: s() }, c1: "#000", c2: "#fff", history: [] };
};

type Snap = Map<GCard, { pow: number; loc: Loc }>;
const board = (m: Match) => m.loc.flatMap((l) => [...l.s.p, ...l.s.a]);
const snap = (m: Match): Snap => new Map(board(m).filter((c) => c.rev).map((c) => [c, { pow: m.pow(c), loc: m.locOf(c)! }]));

function runMatch(seed: number, issues: string[]) {
  const r = seeded(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const pool = cardPool(HEROES.flatMap((h, i) => [player(i * 2, h, r), player(i * 2 + 1, h, r)]));
  const m = new Match(gameConfig(undefined), pool, r);
  const ctx = () => `[seed ${seed} t${m.t} ${m.loc.map((l) => l.L.type).join("/")}]`;
  const bad = (s: string) => issues.push(`${ctx()} ${s}`);
  const nm = (c: GCard) => `${c.p.name || c.p.token}(${c.ab}${c.lvl === 2 ? "★" : ""})`;

  const check = (where: string) => {
    const seen = new Set<number>();
    const all = [...board(m), ...m.hand, ...m.ahand, ...m.deck, ...m.adeck];
    all.forEach((c) => { if (seen.has(c.id)) bad(`${where}: carta ${nm(c)} em dois lugares`); seen.add(c.id); });
    m.loc.forEach((l) => (["p", "a"] as const).forEach((s) => {
      if (l.s[s].length > m.cap(l)) bad(`${where}: ${l.L.name} passou da lotação`);
      l.s[s].forEach((c) => { if (c.side !== s) bad(`${where}: ${nm(c)} do lado errado`); });
    }));
    board(m).filter((c) => c.rev).forEach((c) => {
      const parts = m.powParts(c);
      const sum = parts.reduce((a, x) => a + x.v, 0);
      if (!Number.isFinite(sum)) bad(`${where}: poder inválido em ${nm(c)}`);
      if (Math.max(0, sum) !== m.pow(c)) bad(`${where}: partes de ${nm(c)} não somam o poder`);
      if (parts.some((x) => x.k === "bonus")) bad(`${where}: ${nm(c)} tem bônus sem origem (${c.bonus} vs ${JSON.stringify(c.st.fx)})`);
      const lifted = (c.st.stun ?? 0) >= m.t;
      if ((where.startsWith("act") || where === "fim do turno") && c.base > 0 && !c.st.burrow && !lifted && m.pow(c) <= 0 && !m.immune(c) && !c.st.unstop && m.locOf(c)?.L.type !== "grave")
        bad(`${where}: ${nm(c)} ficou com 0 e não saiu`);
    });
  };

  /** O que o texto de algumas habilidades promete, comparando a mesa antes e depois da revelação. */
  const promise = (c: GCard, before: Snap, master: boolean) => {
    const l = m.locOf(c);
    const twice = l?.L.type === "ritual";
    // alguém saiu da mesa nesta revelação: as auras mudam de alvo, então as contas por carta não valem
    const someoneLeft = [...before.keys()].some((x) => !m.locOf(x));
    const a = c.ab;
    const lost = [...before].filter(([x, b]) => x.side !== c.side && (!m.locOf(x) || m.pow(x) < b.pow));
    if (a === "Vindicta") {
      const t = lost[0]?.[0];
      const fell = m.log.some((e) => e.k === "fall");
      if (t && !m.locOf(t) && fell && !twice) bad(`Vindicta caiu mesmo zerando ${nm(t)}`);
      if (t && m.locOf(t) && m.pow(t) > 0 && !fell && !master) bad(`Vindicta não caiu sem zerar ${nm(t)}`);
    }
    // poder agora, sem contar a erguida
    const now = (x: GCard) => Math.max(0, m.powParts(x).filter((q) => q.k !== "stun").reduce((s, q) => s + q.v, 0));
    if (a === "Wraith" && l && m.abilityOf(c) === "Wraith") {
      const cands = [...before].filter(([x, b]) => x.side !== c.side && b.loc === l && !x.st.burrow && !m.immune(x) && !x.st.unstop && now(x) <= REMOVAL_CAP.Wraith);
      const best = Math.max(-1, ...cands.map(([x]) => now(x)));
      const got = cands.filter(([x]) => (x.st.stun ?? 0) >= m.t);
      if (cands.length && !got.length) bad(`Wraith não ergueu ninguém com alvos válidos (${cands.map(([x, b]) => `${nm(x)}=${b.pow}`).join(", ")})`);
      // a mais forte é medida na hora: a própria Wraith pousando pode fazer o Warden crescer
      if (got.length && !twice && got.every(([x]) => now(x) !== best)) bad(`Wraith ergueu ${got.map(([x]) => `${nm(x)}=${now(x)}`).join(", ")} e não a mais forte até ${REMOVAL_CAP.Wraith} (${best})`);
    }
    const ok = l && m.abilityOf(c) === a;
    const safe = (x: GCard, b: { loc: Loc }) => !m.immune(x) && !x.st.unstop && !x.st.burrow && b.loc.L.type !== "shrine" && !(b.loc.shield[x.side] >= m.t) && !m.log.some((e) => e.k === "riposte");
    if (ok && a === "Pocket" && !someoneLeft) [...before].forEach(([x, b]) => {
      if (x.side !== c.side && b.loc === l && safe(x, b) && m.locOf(x) && m.pow(x) > Math.max(Math.min(1, b.pow), b.pow - c.v)) bad(`Pocket não tirou ${c.v} de ${nm(x)} (${b.pow} → ${m.pow(x)})`);
      if (x.side !== c.side && b.pow >= 1 && m.locOf(x) === b.loc && m.pow(x) < 1) bad(`Pocket zerou ${nm(x)}`);
    });
    if (ok && a === "Shiv") {
      const fs = [...before].filter(([x, b]) => x.side !== c.side && b.loc === l && !m.immune(x) && !x.st.unstop);
      const w = Math.min(...fs.map(([, b]) => b.pow));
      if (fs.length && w <= c.v && !m.log.some((e) => e.k === "shiv")) bad(`Shiv não destruiu a mais fraca (${w} ≤ ${c.v})`);
    }
    if (ok && a === "Grey Talon") {
      const t = [...before].find(([x, b]) => x.side !== c.side && (!m.locOf(x) || m.pow(x) < b.pow));
      if (t && !m.locOf(t[0]) && !m.log.some((e) => e.k === "owlBonus")) bad(`Grey Talon zerou ${nm(t[0])} e não ganhou o bônus`);
    }
    if (ok && a === "Kelvin") l.s[c.side].filter((x) => x.rev).forEach((x) => {
      if (x.bonus < 0 || x.st.tmp.some((t) => t.v < 0 && t.u >= m.t) || x.st.burn || x.st.ail) bad(`Kelvin não curou ${nm(x)}`);
    });
    // ninguém do outro lado ganha poder com uma habilidade inimiga; aliados só perdem com quem diz isso
    [...before].forEach(([x, b]) => {
      // carta que mudou de local ganha ou perde pelo local novo (Abrams, Lash, Dynamo, Holliday)
      if (!m.locOf(x) || x === c || m.locOf(x) !== b.loc || a === "Baba") return;
      const d = m.pow(x) - b.pow;
      if ((x.st.fx ?? []).some((f) => f.k === "duel")) return;
      const aura = m.loc.some((L) => [...L.s.p, ...L.s.a].some((o) => o !== c && o.rev && ["Victor", "Nurse Harrow", "Paige", "aura", "Warden", "Solomon"].includes(m.abilityOf(o))));
      if (x.side !== c.side && d > 0 && !aura && !(a === "Kelvin")) bad(`${nm(c)} deu +${d} à inimiga ${nm(x)}`);
      if (x.side === c.side && d < 0 && !aura && !["Victor", "Graves", "Lash"].includes(a)) bad(`${nm(c)} tirou ${d} da aliada ${nm(x)}`);
    });
  };

  for (let guard = 0; guard < 40 && !m.result; guard++) {
    // loja: às vezes compra um item sorteado num alvo sorteado
    if (m.offer && r() < 0.7) {
      const k = pick(m.offer.p);
      if (m.canBuy(k)) m.buy(k, pick(m.itemTargets("p", k)));
    }
    // joga cartas sorteadas onde der
    for (const c of [...m.hand].sort(() => r() - 0.5)) {
      const ls = m.loc.filter((l) => !m.canPlay(c, l));
      if (!ls.length || r() < 0.15) continue;
      const l = pick(ls);
      if (m.play(c, l)) continue;
      const spec = m.choiceOf(c);
      if (spec?.card && r() < 0.8) { const t = m.choiceCards(c); if (t.length) m.choose(c, { card: pick(t) }); }
      if (spec?.loc && r() < 0.8) { const t = m.choiceLocs(c); if (t.length) m.choose(c, { loc: pick(t) }); }
    }
    // movimentos e marcas do Shiv
    board(m).filter((c) => c.side === "p").forEach((c) => {
      const mo = m.moveOptions(c);
      if (mo.length && r() < 0.5) m.moveCard(c, pick(mo));
      const mk = m.markOptions(c);
      if (mk.length && r() < 0.7) m.mark(c, pick(mk));
    });
    check("jogadas");
    for (const a of m.endTurn()) {
      const before = snap(m);
      const master = m.master(a.c) || (a.c.lvl === 2 && a.c.ab === m.abilityOf(a.c));
      m.log.length = 0;
      m.act(a);
      if (!a.exec && m.locOf(a.c)?.L.type !== "museum") promise(a.c, before, master);
      check(`act ${nm(a.c)}`);
    }
    m.endOfTurn();
    check("fim do turno");
    if (m.over) { m.finish(); break; }
    m.nextTurn();
  }
  if (!m.result) bad("partida não terminou");
  return m;
}

describe("partidas aleatórias", () => {
  it("50 partidas sem quebrar as regras", () => {
    const issues: string[] = [];
    for (let s = 1; s <= 50; s++) runMatch(s, issues);
    // cada mensagem traz a semente, o round e os locais, para reproduzir
    expect(issues).toEqual([]);
  });
});

describe("sons das habilidades", () => {
  it("toda habilidade de herói tem som, e a partida registra as que funcionam", async () => {
    const { HAS_SOUND } = await import("../src/lib/game/heroSfx");
    expect(HEROES.filter((h) => !HAS_SOUND.has(h))).toEqual([]);
    const issues: string[] = [];
    const m = runMatch(7, issues);
    expect(m.heard.length).toBeGreaterThan(0);
    expect(m.heard.every((h) => ABILITIES[h.ab].kind !== "-")).toBe(true);
  });
});
