import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { CardBack, GameCard, TipBoxes, type Tip } from "../components/GameCard";
import { AbilityFx, FxLayer, type Box, type FxScene } from "../components/AbilityFx";
import { CHOREO, Rig } from "../lib/game/choreo";
import { GameHand } from "../components/GameHand";
import { dropUnder, pointOf } from "../lib/game/drop";
import { TargetArrow } from "../components/TargetArrow";
import { AudioMenu, EndTurnButton, SoulOrb } from "../components/GameHud";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { pill, primaryBtn } from "../lib/ui";
import { ABILITIES, ITEMS, gameConfig, itemCost, locArtUrl, phaseOf, type AbilityKey, type ItemKey, type ItemSlot, type PoolCard } from "../lib/game/config";
import { DeckBuilder } from "../components/DeckBuilder";
import { DeckPile } from "../components/DeckPile";
import { versionPlayer, type DeckLook } from "../lib/game/deck";
import { MIN_POOL, Match, TURNS, cardPool, cardVersions, type Bought, type GCard, type Loc, type LogEntry, type PlayError, type PowPart, type Result, type Side, type Token } from "../lib/game/engine";
import { abilitySfx, slashSfx, startSfx } from "../lib/game/heroSfx";
import { cardSfx, duckMusic, sfx, startMusic, stopMusic, thump } from "../lib/game/sfx";
import { GAME_TEXT } from "../lib/game/text";
import { useItemIcons } from "../lib/game/useItemIcons";
import tableArt from "../assets/game/table.webp";

const REVEAL_MS = 1000;
/** Quanto a caixa de "Começou!" fica na tela antes de sumir (ms). */
const START_MS = 2000;
/** Quanto a carta eliminada fica na mesa com o X antes de sumir (s). */
const SLAIN_S = 1.5;
const END_MS = 750;
const TOAST_MS = 1300;
/** Todas as cartas na mesa, dos dois lados. */
const boardCards = (m: Match) => m.loc.flatMap((l) => [...l.s.p, ...l.s.a]);
const boxOf = (r: DOMRect): Box => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
/** Peso da carta pelo custo: 1 cai perto, 2 cai do alto, 3 vem do céu e treme a mesa. */
const weight = (c: GCard) => (c.cost >= 6 ? 3 : c.cost >= 3 ? 2 : 1);
/** Quanto a queda leva até tocar a mesa, por peso (ms). */
const FALL_MS = { 1: 200, 2: 260, 3: 340 } as const;
const TOKEN_GLYPH: Record<Token, string> = { pigeon: "🐦", ghoul: "💀", turret: "⚙️", rat: "🐀", illusion: "👤" };

// placar da sessão: sobrevive à troca de aba, zera ao recarregar a página
const record = { w: 0, l: 0 };
let toastSeq = 0;

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
// cor de cada categoria de item, como na loja do Deadlock
const SLOT_RING: Record<ItemSlot, string> = { weapon: "ring-item-weapon", vitality: "ring-item-vitality", spirit: "ring-item-spirit" };
const SLOT_TEXT: Record<ItemSlot, string> = { weapon: "text-item-weapon", vitality: "text-item-vitality", spirit: "text-item-spirit" };
/** Caixa da loja na cor da categoria do item: etiqueta, tinta do fundo, moldura e brilho. */
const SLOT_BOX: Record<ItemSlot, { tag: string; tint: string; glow: string }> = {
  weapon: { tag: "bg-item-weapon", tint: "from-item-weapon/35", glow: "drop-shadow-[0_0_0.9rem_var(--color-item-weapon)]" },
  vitality: { tag: "bg-item-vitality", tint: "from-item-vitality/35", glow: "drop-shadow-[0_0_0.9rem_var(--color-item-vitality)]" },
  spirit: { tag: "bg-item-spirit", tint: "from-item-spirit/35", glow: "drop-shadow-[0_0_0.9rem_var(--color-item-spirit)]" },
};
/** Cor do selo de cada fase da partida (early, mid, late). */
const PHASE_TONE = ["bg-emerald-500/20 text-emerald-300", "bg-amber-500/20 text-amber-300", "bg-rose-500/20 text-rose-300"] as const;

export function Game() {
  const { players, settings } = useData();
  const t = useT(GAME_TEXT);
  const cfg = useMemo(() => gameConfig(settings.game), [settings.game]);
  const versions = useMemo(() => cardVersions(players), [players]);
  const pool = useMemo(() => cardPool(players), [players]);
  // deck escolhido na tela de deck; null = mostrar a tela
  const [deck, setDeck] = useState<{ cards: PoolCard[]; look?: DeckLook } | null>(null);
  if (pool.length < MIN_POOL) return <p className="text-sm text-zinc-300">{t.ui.needCards(MIN_POOL)}</p>;
  if (!deck) return <DeckBuilder versions={versions} cfg={cfg} onPlay={(cards, look) => { document.documentElement.requestFullscreen?.().catch(() => {}); setDeck({ cards, look }); }} />;
  return <Board key={JSON.stringify(cfg)} newMatch={() => new Match(cfg, pool, Math.random, { p: deck.cards })} deckLook={deck.look} startFull onDeck={() => setDeck(null)} />;
}

function Board({ newMatch, deckLook, startFull = false, onDeck }: { newMatch: () => Match; deckLook?: DeckLook; /** Começa em tela cheia (ao clicar em Jogar). */ startFull?: boolean; onDeck: () => void }) {
  const t = useT(GAME_TEXT);
  const { players, settings } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // efeitos sonoros enviados para os heróis (ajuste do Cardslock Game)
  const tuned = useMemo(() => gameConfig(settings.game).heroes, [settings.game]);
  const [m, setM] = useState(newMatch);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const icons = useItemIcons();
  const [sel, setSel] = useState<GCard | null>(null);
  const [look, setLook] = useState<GCard | null>(null);
  const [shopHidden, setShopHidden] = useState(false);
  // partida atual: as faixas remontam a cada partida nova, para o primeiro local revelar com efeito
  const [game, setGame] = useState(0);
  // abertura da mesa: só no começo de uma partida (ao voltar para a aba no meio dela, a mesa já está posta)
  const [intro, setIntro] = useState(() => m.t === 1 && m.loc.every((l) => !l.s.p.length && !l.s.a.length));
  // caixa de "Começou!" logo depois da abertura
  const [start, setStart] = useState(false);
  useEffect(() => {
    if (!intro) return;
    const at = (sec: number, fn: () => void) => setTimeout(fn, sec * 1000);
    const ts = [
      ...m.loc.map((_, i) => at(INTRO.lane(i), () => sfx("place", 0.7))),
      at(INTRO.comanda, () => sfx("paper")),
      at(INTRO.comanda2, () => sfx("paper")),
      at(INTRO.side, () => sfx("shuffle", 0.6)),
      at(INTRO.orb, () => sfx("soul", 0.6)),
      ...m.hand.map((_, i) => at(INTRO.hand + i * INTRO.handStep, () => sfx("hover"))),
      at(INTRO.done, () => { setIntro(false); setStart(true); startSfx(); }),
    ];
    return () => ts.forEach(clearTimeout);
  }, [intro, game, m]);
  useEffect(() => {
    if (!start) return;
    const id = setTimeout(() => setStart(false), START_MS);
    return () => clearTimeout(id);
  }, [start]);
  /** Peça da mesa entrando na abertura: classe da entrada e o atraso dela. */
  const deal = (k: keyof typeof INTRO_CLS, sec: number) => (intro ? { cls: INTRO_CLS[k], style: { "--d": `${sec.toFixed(2)}s` } as CSSProperties } : { cls: "", style: undefined });
  // tela cheia: a partida cobre o site (e pede tela cheia ao navegador quando dá)
  const [full, setFull] = useState(startFull);
  const wide = useWide();
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // saiu da tela cheia do navegador (Esc): sai do modo também
    const off = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", off);
    return () => { document.body.style.overflow = prev; document.removeEventListener("fullscreenchange", off); };
  }, [full]);
  const toggleFull = () => {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  // música: começa no primeiro gesto na partida (o navegador bloqueia som automático) e sai em fade ao deixar a tela
  useEffect(() => {
    const go = () => startMusic();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); stopMusic(); };
  }, []);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(() => ({ id: 0, text: t.ui.toast.turn(1) }));
  const [result, setResult] = useState<Result | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  // a música abaixa por baixo do resultado da partida
  useEffect(() => { duckMusic(showEnd); }, [showEnd]);
  // escolha de alvo ao jogar, movimento ou marca do Shiv em andamento
  const [mode, setMode] = useState<Mode | null>(null);
  /** Item da loja escolhido, esperando a carta alvo (mirado com a seta). */
  const [aim, setAim] = useState<ItemKey | null>(null);
  // carta sendo arrastada da mão e o local sob o cursor
  const [drag, setDrag] = useState<{ c: GCard; over: number | null } | null>(null);
  // carta da mesa ampliada no hover
  const [peek, setPeek] = useState<{ c: GCard; r: DOMRect } | null>(null);
  /** Carta da mesa sendo arrastada para outro local (mover) e o local sob o cursor. */
  const [shift, setShift] = useState<{ c: GCard; over: number | null } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // cartas queimadas (mão cheia) que já terminaram de queimar na tela
  const [ashes, setAshes] = useState<Set<number>>(() => new Set());
  // cartas eliminadas na mesa, no lugar onde estavam, enquanto o X corta e elas somem
  const [slain, setSlain] = useState<{ c: GCard; r: DOMRect }[]>([]);
  // animações das habilidades na tela; `seen` guarda onde cada carta estava (e de que lado), para a que sumiu da mesa
  const [fxs, setFxs] = useState<{ k: number; ab: AbilityKey; scene: FxScene }[]>([]);
  const fxKey = useRef(0);
  const seen = useRef(new Map<number, { r: DOMRect; side: Side }>());
  /** Roda um passo da partida e mostra o X nas cartas que saíram da mesa sem voltar para a mão. */
  const watch = (f: () => void) => {
    const was = boardCards(m).filter((c) => c.rev).map((c) => ({ c, r: document.querySelector(`[data-card="${c.id}"]`)?.getBoundingClientRect() }));
    // todas as cartas da mesa (as viradas também, para o puxão do gancho saber de onde a carta saiu)
    boardCards(m).forEach((c) => {
      const r = document.querySelector(`[data-card="${c.id}"]`)?.getBoundingClientRect();
      if (r) seen.current.set(c.id, { r, side: c.side });
    });
    f();
    const on = new Set([...boardCards(m), ...m.hand, ...m.ahand, ...m.deck, ...m.adeck]);
    const gone = was.filter((x): x is { c: GCard; r: DOMRect } => !!x.r && !on.has(x.c));
    if (!gone.length) return;
    setSlain((s) => [...s, ...gone]);
    slashSfx();
  };
  const burns = m.burned.length;
  const heard = useRef(burns);
  useEffect(() => {
    if (burns > heard.current) sfx("burn", 0.8);
    heard.current = burns;
  }, [burns]);
  // artes dos locais da partida já no cache, para a faixa não piscar ao revelar
  useEffect(() => { m.loc.forEach((l) => { if (l.L.art) new Image().src = locArtUrl(l.L.art); }); }, [m]);
  const [arena, shake] = useAnimate<HTMLDivElement>();
  const still = useReducedMotion();

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((x) => (x?.id === toast.id ? null : x)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const say = (text: string) => setToast({ id: ++toastSeq, text });
  const name = (c: GCard) => (c.p.token ? t.tokens[c.p.token] : c.p.name);
  const logName = (n: LogEntry["c"]) => (n === undefined ? "" : typeof n === "string" ? n : t.tokens[n.token]);
  const shopOpen = !!m.offer && !result && !m.busy;
  const errText: Record<PlayError, string> = { souls: t.ui.toast.souls, frozen: t.ui.toast.frozen, full: t.ui.toast.full, closed: t.ui.toast.closed, minCost: t.ui.toast.minCost };

  /** Carta desenhada a partir da carta da coleção; `text` mostra a habilidade (mão e zoom), `fx` liga partículas e brilho. */
  const face = (c: GCard, text: boolean, fx = false) => {
    const key = m.abilityOf(c);
    const a = t.abilities[key];
    const body = key === "none" && c.ab !== "none" ? t.ui.noAbility : c.tok && c.ab === "none" ? t.ui.tokenDesc : c.desc || a.text(c.v);
    const icons = c.rev ? statusIcons(c, m, t) : [];
    return (
      <GameCard player={c.p.token ? null : versionPlayer(byId, c.p)} name={name(c)} cost={c.cost} power={c.rev ? m.pow(c) : c.base} base={c.base}
        glyph={c.p.token ? TOKEN_GLYPH[c.p.token] : undefined} master={c.lvl === 2 ? t.levels[2] : undefined} fx={fx}
        status={icons.map((x) => x[0]).join("") || undefined}
        text={text ? { name: a.name, kind: t.kinds[ABILITIES[key].kind], body, masterLabel: t.ui.masterLine } : null} />
    );
  };
  /** Caixas ao lado da carta ampliada: selo de momento e status. */
  const tipsOf = (c: GCard) => [
    // a frase de Mestre vai numa caixa ao lado (na carta não cabe junto com a habilidade)
    ...(c.lvl === 2 && m.abilityOf(c) === c.ab && t.abilities[c.ab].master() ? [{ title: `★ ${t.ui.masterLine}`, text: t.abilities[c.ab].master() }] : []),
    ...(c.p.role && t.roles.tips[c.p.role] ? [{ title: t.roles.title(c.p.role), text: t.roles.tips[c.p.role] }] : []),
    ...(ABILITIES[m.abilityOf(c)].kind !== "-" ? [{ title: t.kinds[ABILITIES[m.abilityOf(c)].kind], text: t.kindTips[ABILITIES[m.abilityOf(c)].kind] }] : []),
    ...(c.rev ? statusIcons(c, m, t).map(([icon, nm, k]) => ({ title: `${icon} ${nm}`, text: t.ui.statusTip[k] })) : []),
  ];

  /** Caixa que explica o poder da carta na mesa: base, bônus, efeitos de outras cartas, habilidade e local. */
  const powTip = (c: GCard): Tip => {
    const parts = m.powParts(c);
    const P = t.ui.powParts;
    const name = (x: PowPart) => x.k === "from" ? P.from(logName(x.n)) : x.k === "ab" ? P.ab(t.abilities[x.ab ?? "none"].name) : x.k === "loc" ? P.loc(x.loc ?? "") : x.k === "item" ? P.item(x.item ?? "") : P[x.k];
    const label = (x: PowPart) => (x.tmp && x.k !== "tmp" ? P.brief(name(x)) : name(x));
    const sum = parts.reduce((a, x) => a + x.v, 0);
    return { title: P.title(m.pow(c)), text: sum < 0 ? P.floor : "", rows: parts.map((x) => [label(x), x.v]) };
  };
  /** Uma carta queimada na região do baralho do lado, enquanto queima. */
  const burning = (s: Side) => {
    const b = m.burned.find((x) => x.s === s && !ashes.has(x.c.id));
    return (
      <AnimatePresence>
        {b && <Burning key={b.c.id} card={face(b.c, false)} onDone={() => setAshes((x) => new Set(x).add(b.c.id))} />}
      </AnimatePresence>
    );
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    setAshes(new Set());
    setSlain([]);
    setStart(false);
    timers.current = [];
    setM(newMatch());
    setGame((x) => x + 1);
    setIntro(true);
    sfx("shuffle");
    setSel(null);
    setLook(null);
    setResult(null);
    setShowEnd(false);
    setMode(null);
    setShopHidden(false);
    setAim(null);
    say(t.ui.toast.turn(1));
  };

  const endTurn = () => {
    if (m.busy || result) return;
    setAim(null);
    const queue = m.endTurn();
    sfx("endTurn");
    setSel(null);
    setMode(null);
    setLook(null);
    bump();
    let i = 0;
    const step = () => {
      if (i < queue.length) {
        const a = queue[i++];
        watch(() => m.act(a));
        // já na tela: as coreografias precisam das cartas nos lugares novos
        flushSync(bump);
        if (!a.exec) land(a.c);
        // som da habilidade: logo depois de a carta tocar a mesa (ou na hora, na execução marcada da Shiv); a próxima
        // carta espera a coreografia acabar
        return later(step, Math.max(REVEAL_MS, playHeard(a.exec ? 0 : FALL_MS[weight(a.c)] + 120)));
      }
      watch(() => m.endOfTurn());
      flushSync(bump);
      later(() => {
        if (m.over) {
          const r = m.finish();
          if (r.outcome === "win") record.w++;
          else if (r.outcome === "loss") record.l++;
          setResult(r);
          setShowEnd(true);
          if (r.outcome !== "draw") sfx(r.outcome === "win" ? "win" : "loss");
        } else {
          m.nextTurn();
          // loja nova (rounds 4 e 7): abre sempre à vista, mesmo que a anterior tenha ficado oculta, e o sino do balcão toca
          if (m.offer) { setShopHidden(false); later(() => sfx("bell"), 300); }
          say(t.ui.toast.turn(m.t));
          sfx("draw");
          later(() => sfx("soul", 0.8), 180);
        }
        bump();
      }, Math.max(END_MS, playHeard(0)));
    };
    step();
  };

  /**
   * Toca os sons das habilidades que funcionaram desde a última vez (cada habilidade uma vez, em sequência). A
   * habilidade de um herói com efeito sonoro enviado no editor toca o arquivo no lugar do som sintetizado.
   */
  const playHeard = (wait: number) => {
    const heard = m.heard.splice(0);
    const abs = [...new Set(heard.map((h) => h.ab))].slice(0, 4);
    abs.forEach((ab, i) => {
      const own = tuned[ab]?.sound;
      later(() => (own ? cardSfx(own) : abilitySfx(ab)), wait + i * 260);
    });
    // a animação de cada habilidade, uma depois da outra: nas que têm coreografia as próprias cartas se mexem; nas
    // outras, o efeito vai da carta que agiu até as cartas que ela mexeu (a sua e a do inimigo)
    let t = wait, end = 0;
    const taken = new Set<number>();
    const sideOf = new Map(boardCards(m).map((c) => [c.id, c.side]));
    heard.slice(0, 6).forEach((h) => {
      const recipe = still ? undefined : CHOREO[h.ab];
      if (!recipe) { playFx(h, t); t += 220; return; }
      const rig = new Rig();
      const dst = h.to.map((id) => ({ id, foe: (sideOf.get(id) ?? seen.current.get(id)?.side) !== h.side }));
      // quem trocou de local fica parado onde estava até a cena levar a carta
      dst.forEach((d) => {
        const r = seen.current.get(d.id)?.r;
        if (!taken.has(d.id) && r?.width) rig.hold(d.id, boxOf(r), d.foe);
        taken.add(d.id);
      });
      const self = h.self, pull = h.ev === "pull";
      const ms = recipe.ms(dst.length, self, pull);
      const was = seen.current.get(h.id)?.r;
      later(() => rig.start(h.ab, { id: h.id, box: was?.width ? boxOf(was) : null }, dst, self, pull, quake), t);
      t += ms;
      end = Math.max(end, t + 150);
    });
    return end;
  };
  /** Tremor da mesa nas coreografias, de 1 (leve) a 3 (forte). */
  const quake = (power: 1 | 2 | 3) => {
    if (still || !arena.current) return;
    const k = power * 3;
    shake(arena.current, { x: [0, -k, k * 0.8, -k * 0.5, k * 0.3, 0], y: [0, k * 0.5, -k * 0.4, k * 0.2, 0, 0] }, { duration: 0.25 + power * 0.06 });
  };
  /** O efeito por cima da mesa das habilidades sem coreografia. */
  const playFx = (h: Match["heard"][number], wait: number) => later(() => {
      const on = new Map(boardCards(m).map((c) => [c.id, c.side]));
      const at = (id: number) => {
        const r = document.querySelector(`[data-card="${id}"]`)?.getBoundingClientRect() ?? seen.current.get(id)?.r;
        return r && r.width ? boxOf(r) : null;
      };
      const src = at(h.id);
      if (!src) return;
      const dst = h.to.flatMap((id) => {
        const box = at(id);
        return box ? [{ box, foe: (on.get(id) ?? seen.current.get(id)?.side) !== h.side }] : [];
      });
      const lane = document.querySelector(`[data-drop="${h.at}"]`)?.getBoundingClientRect();
      const k = ++fxKey.current;
      setFxs((s) => [...s, { k, ab: h.ab, scene: { src, dst, loc: lane ? boxOf(lane) : null, me: h.side === "p" } }]);
    }, wait);
  /** Som (e tremor, nas pesadas) quando a carta revelada toca a mesa. */
  const land = (c: GCard) => {
    const w = weight(c);
    later(() => {
      // 9 ou mais de poder: cai com um estrondo grave, a tela treme e a plateia solta um "ooooh" de susto
      if (m.pow(c) >= 9) {
        sfx("slam");
        sfx("impact");
        later(() => sfx("gasp", 1.4), 120);
        if (!still && arena.current) shake(arena.current, { x: [0, -8, 7, -5, 3, 0], y: [0, 4, -3, 2, 0, 0] }, { duration: 0.4 });
        return;
      }
      if (w === 1) return sfx("land", 0.8);
      sfx("slam", w === 3 ? 1 : 0.7);
      thump(w === 3 ? 1 : 0.5);
      if (w === 3 && !still && arena.current) shake(arena.current, { x: [0, -7, 6, -4, 3, 0], y: [0, 3, -2, 1, 0, 0] }, { duration: 0.35 });
    }, FALL_MS[w]);
  };

  const pickHand = (c: GCard) => {
    if (m.busy || result) return;
    setMode(null);
    setSel((s) => (s === c ? null : c));
    setLook(null);
  };
  const pickBoard = (c: GCard) => {
    if (aim) {
      // comprou: a loja volta fechada (o Exibir reabre); errou o alvo: ela reabre
      if (targets.includes(c) && m.buy(aim, c)) sfx("target"); else setShopHidden(false);
      setAim(null);
      bump();
      return;
    }
    if (mode && targets.includes(c)) return hitCard(c);
    if (mode) setMode(null);
    if (c.staged && c.side === "p" && !m.busy) {
      // carta com escolha: clicar de novo reabre a mira; sem escolha, volta para a mão
      const spec = m.choiceOf(c);
      if (spec?.card && m.choiceCards(c).length) return setMode({ k: "card", c });
      if (spec?.loc) return setMode({ k: "loc", c });
      m.unstage(c); bump(); return;
    }
    setLook((x) => (x === c ? null : c));
  };
  /** Item da loja: escolher abre a mira; escolher o já comprado desfaz a compra. */
  const pickItem = (k: ItemKey) => {
    if (m.buying.p?.k === k) { m.unbuy(); bump(); return; }
    if (!m.canBuy(k)) return;
    setMode(null);
    setAim(k);
    setShopHidden(true);
  };
  const playCard = (c: GCard, l: Loc) => {
    if (m.busy || result) return;
    const err = m.play(c, l);
    if (err) { sfx("error"); return say(errText[err]); }
    sfx("place");
    const spec = m.choiceOf(c);
    if (spec?.card && m.choiceCards(c).length) setMode({ k: "card", c });
    else if (spec?.loc) setMode({ k: "loc", c });
    else setMode(null);
    setSel(null);
    setLook(null);
    bump();
  };
  const playAt = (l: Loc) => { if (sel) playCard(sel, l); };

  const targets = aim ? m.itemTargets("p", aim) : !mode ? [] : mode.k === "card" ? m.choiceCards(mode.c) : mode.k === "mark" ? m.markOptions(mode.c) : [];
  const dests = !mode ? [] : mode.k === "loc" ? m.choiceLocs(mode.c) : mode.k === "move" ? m.moveOptions(mode.c) : [];
  const hitCard = (x: GCard) => {
    if (!mode) return;
    sfx("target");
    if (mode.k === "mark") { m.mark(mode.c, x); setMode(null); }
    else {
      m.choose(mode.c, { card: x });
      setMode(m.choiceOf(mode.c)?.loc ? { k: "loc", c: mode.c } : null);
    }
    bump();
  };
  const hitLoc = (l: Loc) => {
    if (!mode) return;
    if (mode.k === "move") { if (!m.moveCard(mode.c, l)) return; setLook(null); sfx("place"); }
    else { m.choose(mode.c, { loc: l }); sfx("target"); }
    setMode(null);
    bump();
  };
  /** Pode arrastar para mover agora: é sua, revelada e tem para onde ir neste turno. */
  const canShift = (c: GCard) => c.side === "p" && !m.busy && !result && !aim && !mode && m.moveOptions(c).length > 0;
  const shiftTo = (c: GCard, i: number | null) => {
    setShift(null);
    const l = i === null ? null : m.loc[i];
    if (!l || !m.moveCard(c, l)) return;
    setLook(null);
    sfx("place");
    bump();
  };
  const undoPlay = () => { if (mode && mode.c.staged) m.unstage(mode.c); setMode(null); bump(); };
  const startMode = (k: "move" | "mark", c: GCard) => setMode({ k, c });
  const modeHint = !mode ? "" : mode.k === "card" ? t.ui.act.pickFoe(name(mode.c)) : mode.k === "loc" ? t.ui.act.pickLoc(name(mode.c))
    : mode.k === "move" ? t.ui.act.moveHint(name(mode.c)) : t.ui.act.markHint(name(mode.c));

  // linhas das escolhas já feitas no turno (alvo do Vindicta, local da Holliday, marca do Shiv...)
  const aimLines = m.loc.flatMap((l) => l.s.p).flatMap((c) => {
    const from = `[data-card="${c.id}"]`;
    const out: { from: string; to: string; laser?: boolean }[] = [];
    if (c.staged && c.ch?.card !== undefined) out.push({ from, to: `[data-card="${c.ch.card}"]`, laser: m.abilityOf(c) === "Vindicta" });
    if (c.staged && c.ch?.loc !== undefined) out.push({ from, to: `[data-drop="${c.ch.loc}"]` });
    if (c.st.exec?.u === m.t && c.st.exec.target !== undefined) out.push({ from, to: `[data-card="${c.st.exec.target}"]` });
    return out;
  }).concat(m.buying.p ? [{ from: '[data-item-from="p"]', to: `[data-card="${m.buying.p.target}"]` }] : []);
  /** Nome do alvo de um item comprado (para a caixa do item). */
  const boughtOn = (b: Bought) => {
    const c = m.loc.flatMap((l) => [...l.s.p, ...l.s.a]).find((x) => x.id === b.target);
    return c ? name(c) : logName(b.name);
  };
  const handReady = !m.busy && !result && !m.hand.some((c) => m.loc.some((l) => !m.canPlay(c, l)));
  /** Mover e marcar: botões sobre a carta da mesa escolhida. */
  const actsOf = (c: GCard) => {
    if (look !== c || c.side !== "p" || m.busy || result) return [];
    return [
      m.moveOptions(c).length > 0 && { label: t.ui.act.move, run: () => startMode("move", c) },
      m.markOptions(c).length > 0 && { label: t.ui.act.mark, run: () => startMode("mark", c) },
    ].filter(Boolean) as { label: string; run: () => void }[];
  };
  /** Estado do local enquanto arrasta: o local sob a carta acende (se der para jogar lá) e os outros escurecem. */
  const dropAt = (l: Loc, i: number): Drop => shift ? (!m.moveOptions(shift.c).includes(l) ? "dim" : shift.over === i ? "over" : "ok") : !drag ? "off" : drag.over !== null && drag.over !== i ? "dim" : m.canPlay(drag.c, l) ? "off" : drag.over === i ? "over" : "ok";
  const canPlayAt = (l: Loc) => !!sel && !m.busy && !result && !m.canPlay(sel, l);
  /** The New York Oracle: só a sua próxima carta aparece. */
  const next = m.peek();

  const height = full ? "h-full" : "h-[calc(100dvh-5.5rem)] min-h-120 sm:h-[calc(100dvh-7.5rem)]";
  const title = (
    <div className={`flex flex-col gap-1 pt-1 ${wide ? "items-center text-center" : "items-start"}`}>
      <h1 className="text-sm font-extrabold tracking-[0.11em] uppercase sm:text-xl">{t.ui.title}</h1>
      <abbr title={t.ui.phaseHint} className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-widest uppercase no-underline sm:text-xs ${PHASE_TONE[phaseOf(Math.min(m.t, TURNS))]}`}>
        {t.ui.phase(phaseOf(Math.min(m.t, TURNS)))}
      </abbr>
    </div>
  );
    const aiDeck = <div className={wide ? "relative flex w-full justify-center" : "relative"}>{burning("a")}<DeckPile n={m.adeck.length} tone="ai" label={t.deck.aiLeft(m.adeck.length)} tipSide="left"
    out={{ x: -80, y: -10 }} className={wide ? "w-full max-w-40" : "w-8 sm:w-11"} /></div>;
  const myDeck = <div className={wide ? "relative flex w-full justify-center" : "relative"}>{burning("p")}<DeckPile n={m.deck.length} look={deckLook} label={next ? `${t.deck.left(m.deck.length)} · ${t.ui.next(name(next))}` : t.deck.left(m.deck.length)}
    cover={next && face(next, false)} tipSide={wide ? "left" : "top"} out={{ x: -120, y: 0 }} className={wide ? "w-full max-w-40" : "w-10 sm:w-14"} /></div>;
  const endBtn = result && !showEnd
    ? <button type="button" className={primaryBtn} onClick={restart}>{t.ui.newMatch}</button>
    : <EndTurnButton label={t.ui.closeTab} turn={m.t} total={TURNS} busy={m.busy} busyLabel={t.ui.revealing} ready={handReady} big={wide}
        disabled={m.busy || !!result} onClick={endTurn} />;
  const prio = <abbr title={t.ui.prioHint} className={`no-underline ${m.prio === "p" ? "text-game-me" : "text-game-ai"}`}>{t.ui.prio(m.prio === "p")}</abbr>;
  const controls = (
    <span className="flex">
      <AudioMenu t={t.ui.audio} />
      <button type="button" onClick={toggleFull} aria-label={t.ui.fullscreen(full)} aria-pressed={full} title={t.ui.fullscreen(full)}
        className={`grid size-11 cursor-pointer place-items-center rounded-full text-base transition-colors hover:bg-white/10 active:bg-white/20 sm:size-8 ${focus}`}>
        <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
          <path d={full ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className={full ? "fixed inset-0 z-50 overflow-hidden px-3 sm:px-6" : "contents"}>
    <BarTable />
    {/* borda a pincel das caixas de item (loja e destaque da comanda): o fundo e a moldura tremem nas bordas como tinta */}
    <svg aria-hidden="true" className="absolute size-0">
      <filter id="shop-rough" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={5} result="wave" />
        <feDisplacementMap in="SourceGraphic" in2="wave" scale={11} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <div className={wide ? `flex gap-4 ${height}` : "contents"}>
    {/* tela larga: à esquerda a comanda da IA (vinda de cima), suas almas no meio e a sua comanda (vinda de baixo) */}
    {wide && (
      <aside aria-label={t.ui.players} className="grid min-w-36 flex-[1_0_9rem] grid-rows-[1fr_auto_1fr] items-center justify-items-center gap-4 text-dl-text">
        <Comanda key={`a${game}`} s="a" m={m} t={t} icons={icons} on={boughtOn} deal={deal("left", INTRO.comanda)} />
        <div key={`o${game}`} className={deal("pop", INTRO.orb).cls} style={deal("pop", INTRO.orb).style}><SoulOrb n={m.E} label={t.ui.souls(m.E)} big /></div>
        <Comanda key={`p${game}`} s="p" m={m} t={t} icons={icons} on={boughtOn} deal={deal("left", INTRO.comanda2)} />
      </aside>
    )}
    <div className={`relative mx-auto flex flex-col gap-1.5 text-dl-text ${wide ? "h-full min-w-0 flex-[0_1_80rem]" : `${height} max-w-7xl`}`}>
      {/* as faixas vão de cima até embaixo da mão, como se a mesa fosse vista de cima */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex gap-0.5 sm:gap-1">
        {m.loc.map((l, i) => <LaneBackdrop key={`${game}-${l.L.id}${i}`} l={l} i={i} drop={dropAt(l, i)} fresh={m.t === 1} dealAt={intro ? INTRO.lane(i) : undefined} />)}
      </div>
      <div className="grid w-full grid-cols-[1fr_auto] items-start gap-x-2 sm:grid-cols-[1fr_auto_1fr]">
        {wide ? <div /> : title}
        <div key={`t${game}`} className={`order-last col-span-2 flex items-start justify-center gap-2 sm:order-0 sm:col-span-1 ${deal("drop", INTRO.side).cls}`} style={deal("drop", INTRO.side).style}>
          {!wide && <ItemSlot s="a" m={m} t={t} icons={icons} on={boughtOn} />}
          <AiHand n={m.ahand.length} t={t} />
        </div>
        {wide ? <div /> : (
          <div className="flex items-start justify-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-x-2 text-xs text-zinc-300">
              {prio}
              <span aria-hidden="true">·</span>
              <span>{t.ui.record(record.w, record.l)}</span>
              {controls}
            </div>
            {aiDeck}
          </div>
        )}
      </div>

      <div ref={arena} className="relative flex min-h-0 w-full flex-1 flex-col">
        <section aria-label={t.ui.arena} className="lane-board flex min-h-0 w-full flex-1 gap-0.5 sm:gap-1">
          {m.loc.map((l, i) => (
            <Location key={`${game}-${l.L.id}${i}`} dealAt={intro ? INTRO.lane(i) + 0.08 : undefined} m={m} l={l} i={i} t={t} canPlay={canPlayAt(l)} onPlay={() => playAt(l)} dest={dests.includes(l)} onDest={() => hitLoc(l)}
              drop={dropAt(l, i)}
              card={(c) => (
                <BoardCard key={`${c.id}-${c.rev}`} c={c} m={m} t={t} name={name(c)} face={face(c, false, true)} looking={look === c} target={targets.includes(c)} mark={mode?.k === "card" && m.abilityOf(mode.c) === "Vindicta" && targets.includes(c)} acts={actsOf(c)}
                  shift={canShift(c) ? { on: (over) => { if (!shift) { sfx("grab", 0.7); setPeek(null); } setShift({ c, over }); }, drop: (i) => shiftTo(c, i) } : undefined}
                  onClick={(r) => { pickBoard(c); setPeek(r && look !== c ? { c, r } : null); }}
                  onPeek={(r) => setPeek(r && !drag && !shift ? { c, r } : null)} />
              )} />
          ))}
        </section>

        {/* loja: um item na região de cada local, numa caixa com a cor e a arte do local */}
        <AnimatePresence>
          {shopOpen && m.offer && !aim && (
            <motion.section key="shop" aria-labelledby="game-shop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-center gap-3">
              {/* oculta: título e caixas somem, mas continuam ocupando o espaço, então o Exibir fica onde estava o Ocultar */}
              <motion.div initial={false} animate={shopFade(shopHidden)} transition={{ duration: still ? 0 : 0.25, ease: "easeOut" }}
                className="flex flex-col items-center gap-1 px-2 text-center drop-shadow-[0_3px_0_rgb(0_0_0/0.6)]">
                <h2 id="game-shop" className="bg-zinc-950 px-3 py-1 text-base font-extrabold tracking-wider uppercase [clip-path:polygon(1%_0,100%_6%,99%_100%,0_94%)] sm:text-xl">{t.shop.title}</h2>
                <p className="max-w-xl bg-zinc-950/90 px-2 py-0.5 text-[11px] text-zinc-300 sm:text-xs">{t.shop.hint}</p>
              </motion.div>
              <motion.div initial={false} animate={shopFade(shopHidden)} transition={{ duration: still ? 0 : 0.25, ease: "easeOut" }} className="flex w-full items-stretch gap-0.5 sm:gap-1">
                {m.loc.map((l, i) => {
                  const k = m.offer?.p[i];
                  return (
                    <div key={l.L.id + i} className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
                      {k && <ShopBox k={k} i={i} l={l} m={m} t={t} icon={icons[k]} picked={m.buying.p?.k === k} disabled={m.busy || (m.buying.p?.k !== k && !m.canBuy(k))} onPick={() => pickItem(k)} />}
                    </div>
                  );
                })}
              </motion.div>
              <div className="flex min-h-14 w-full items-center justify-end px-2 sm:px-4">
                <button type="button" onClick={() => setShopHidden(!shopHidden)} aria-expanded={!shopHidden}
                  className={`pointer-events-auto grid min-h-11 cursor-pointer place-items-center font-extrabold tracking-wider text-zinc-950 uppercase transition hover:brightness-110 active:scale-95 ${focus} ${shopHidden ? "text-lg" : "text-sm"}`}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={shopHidden ? "show" : "hide"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: still ? 0 : 0.12 }}>
                      <TickTag tone="bg-dl-text" className={shopHidden ? "px-7 py-2.5" : "px-4 py-1.5"}>{shopHidden ? t.shop.show : t.shop.hide}</TickTag>
                    </motion.span>
                  </AnimatePresence>
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-6 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs" role="status" aria-live="polite">
        {aim ? (
          <>
            <span className="font-bold text-game-me">{t.shop.aim(aim)}</span>
            <button type="button" className={pill(false)} onClick={() => { setAim(null); setShopHidden(false); }}>{t.ui.act.cancel}</button>
          </>
        ) : mode ? (
          <>
            <span className="font-bold text-game-me">{modeHint}</span>
            <span className="hidden text-zinc-400 sm:inline">{t.ui.aim}</span>
            {(mode.k === "card" || mode.k === "loc") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.auto}</button>}
            {(mode.k === "card" || mode.k === "loc") && mode.c.staged && <button type="button" className={pill(false)} onClick={undoPlay}>{t.ui.act.undo}</button>}
            {(mode.k === "move" || mode.k === "mark") && <button type="button" className={pill(false)} onClick={() => setMode(null)}>{t.ui.act.cancel}</button>}
          </>
        ) : null}
      </div>

      <div className="flex w-full flex-wrap items-end justify-between gap-x-2 sm:flex-nowrap">
        {!wide && (
          <div key={`l${game}`} className={`flex shrink-0 flex-col items-center gap-1 pb-1 ${deal("up", INTRO.orb).cls}`} style={deal("up", INTRO.orb).style}>
            <ItemSlot s="p" m={m} t={t} icons={icons} on={boughtOn} />
            <SoulOrb n={m.E} label={t.ui.souls(m.E)} />
          </div>
        )}
        <section aria-label={t.ui.hand} className="relative z-10 order-last w-full min-w-0 sm:order-0 sm:w-auto sm:flex-1">
          <GameHand deal={intro ? { at: INTRO.hand, step: INTRO.handStep } : undefined} cards={m.hand} selected={sel} disabled={m.busy || !!result}
            playable={(c) => !m.busy && !result && m.loc.some((l) => !m.canPlay(c, l))}
            label={(c) => t.ui.cardLabel(name(c), c.cost, c.base)} tips={tipsOf} render={(c) => face(c, true, true)}
            onSelect={pickHand} onDrop={(c, i) => playCard(c, m.loc[i])} onDrag={(c, over) => { if (c && !drag) sfx("grab", 0.7); setDrag(c ? { c, over } : null); }} />
        </section>
        {!wide && (
          <div key={`r${game}`} className={`flex shrink-0 items-end gap-2 pb-1 ${deal("up", INTRO.side).cls}`} style={deal("up", INTRO.side).style}>
            {myDeck}
            {endBtn}
          </div>
        )}
      </div>

      <AnimatePresence>
        {peek && !drag && !shift && <Peek key={peek.c.id} r={peek.r} card={face(peek.c, true, true)} tips={peek.c.rev ? [powTip(peek.c), ...tipsOf(peek.c)] : tipsOf(peek.c)} />}
      </AnimatePresence>

      <TargetArrow from={aim ? '[data-item-from="p"]' : mode ? `[data-card="${mode.c.id}"]` : null} lines={result ? [] : aimLines}
        laser={!aim && mode?.k === "card" && m.abilityOf(mode.c) === "Vindicta"}
        onCancel={() => { setMode(null); if (aim) { setAim(null); setShopHidden(false); } }} />

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="pointer-events-none fixed top-1/4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/85 px-5 py-2 text-center text-xl font-extrabold tracking-wider text-white">
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {start && (
          <motion.div key="start" role="status" className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
            initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}>
            <TickTag tone="bg-game-brass" className="px-3 py-2 sm:px-8 sm:py-4">
              <span className="block bg-zinc-950 px-5 py-2 text-[clamp(2.25rem,11vw,5.625rem)] font-black tracking-wider text-zinc-50 uppercase [clip-path:polygon(1%_0,100%_6%,99%_100%,0_94%)] sm:px-16 sm:py-4 sm:tracking-widest">
                {t.ui.toast.start}
              </span>
            </TickTag>
          </motion.div>
        )}
      </AnimatePresence>

      {/* no body: fica acima do cabeçalho do site e de qualquer camada do jogo */}
      {createPortal(
        <FxLayer>
          {fxs.map((x) => <AbilityFx key={x.k} ab={x.ab} scene={x.scene} onDone={() => setFxs((s) => s.filter((y) => y.k !== x.k))} />)}
        </FxLayer>,
        document.body,
      )}
      {createPortal(
        <AnimatePresence>
          {slain.map(({ c, r }) => <Slain key={c.id} r={r} card={face(c, false)} still={!!still} onDone={() => setSlain((s) => s.filter((x) => x.c !== c))} />)}
        </AnimatePresence>,
        document.body,
      )}
      {createPortal(
        <AnimatePresence>
          {result && showEnd && (
            <EndScreen key="end" r={result} m={m} t={t} onAgain={restart} onBoard={() => setShowEnd(false)} onDeck={onDeck} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
    {/* tela larga: à direita os dois baralhos (IA em cima, o seu embaixo) e o fim do turno entre eles */}
    {wide && (
      <aside key={`d${game}`} aria-label={t.ui.decks} className={`grid min-w-36 flex-[1_0_9rem] grid-rows-[1fr_auto_1fr] justify-items-center gap-3 pb-3 ${deal("right", INTRO.side).cls}`} style={deal("right", INTRO.side).style}>
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex items-center gap-1 self-end text-xs text-zinc-400 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100">
            <span>{t.ui.record(record.w, record.l)}</span>
            {controls}
          </div>
          <div className="flex w-full flex-1 flex-col items-center justify-end gap-3">
            {aiDeck}
            {title}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 text-sm font-bold">
          {endBtn}
          {prio}
        </div>
        <div className="flex w-full flex-col items-center justify-center gap-1">
          {myDeck}
        </div>
      </aside>
    )}
    </div>
    </div>
    </MotionConfig>
  );
}

/** Tela larga o bastante para usar as laterais da mesa (baralhos de um lado, almas e itens do outro). */
const WIDE = "(min-width: 80rem)";
function useWide() {
  return useSyncExternalStore((on) => {
    const q = matchMedia(WIDE);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, () => matchMedia(WIDE).matches, () => false);
}

type T = (typeof GAME_TEXT)["pt"];
type Mode = { k: "card" | "loc" | "move" | "mark"; c: GCard };

/** Cores das três faixas (amarela, azul e verde, como as lanes do mapa), em classes inteiras. */
/** Abertura da mesa (segundos): os locais pousam um a um, entram as comandas e os baralhos, a orbe acende e a mão é dada carta a carta. */
const INTRO = { lane: (i: number) => 0.2 + i * 0.27, comanda: 1.05, comanda2: 1.27, side: 1.5, orb: 1.75, hand: 2.0, handStep: 0.2, reveal: 3.1, done: 4.3 };
const INTRO_CLS = { drop: "intro-drop", up: "intro-up", left: "intro-left", right: "intro-right", pop: "intro-pop" } as const;

/** Local durante o arrasto: fora, dá para soltar, sob a carta, ou escurecido (a carta está sobre outro). */
type Drop = "off" | "ok" | "over" | "dim";

const LANE = [
  { stroke: "stroke-lane-yellow", tint: "from-lane-yellow/30", glow: "from-lane-yellow/30", tag: "bg-lane-yellow", ink: "text-lane-yellow" },
  { stroke: "stroke-lane-blue", tint: "from-lane-blue/30", glow: "from-lane-blue/30", tag: "bg-lane-blue", ink: "text-lane-blue" },
  { stroke: "stroke-lane-green", tint: "from-lane-green/30", glow: "from-lane-green/30", tag: "bg-lane-green", ink: "text-lane-green" },
] as const;

/** Gerador determinístico, para cada faixa ter sempre a mesma borda. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
/** Borda de um lado da faixa, em unidades 0 a 1: ondas largas com um pouco de tremido, de cima a baixo. */
function brushEdge(seed: number, x0: number, amp: number): [number, number][] {
  const r = rng(seed);
  return Array.from({ length: 31 }, (_, k) => [x0 + Math.sin(k * 0.45 + seed * 1.7) * amp * 0.35 + (r() - 0.5) * amp, k / 30]);
}
const P = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
/** Curva suave pelos pontos (quadráticas entre os pontos médios). */
const smooth = (p: [number, number][]) => {
  const mid = (i: number): [number, number] => [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
  return `${P(p[0])} L ${P(mid(0))} ${p.slice(1, -1).map((q, i) => `Q ${P(q)} ${P(mid(i + 1))}`).join(" ")} L ${P(p[p.length - 1])}`;
};
/** Falhas do pincel: traço e buraco alternados, em frações da altura (o pincel some por um trecho e volta). */
function gaps(seed: number) {
  const r = rng(seed + 50), out: number[] = [];
  for (let y = 0; y < 1.2;) { const on = 0.05 + r() * 0.2, off = 0.015 + r() * 0.06; out.push(on, off); y += on + off; }
  return out;
}
/** Bordas de cada faixa: pontos (0 a 1) dos dois lados e o padrão de falhas. */
const BRUSH = [0, 1, 2].map((i) => ({
  left: brushEdge(i * 2 + 1, 0.035, 0.035), right: brushEdge(i * 2 + 2, 0.965, 0.035), dash: gaps(i * 2 + 1), dash2: gaps(i * 2 + 2),
}));
const clipOf = (b: (typeof BRUSH)[number]) => `M ${smooth(b.left.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]))} L ${smooth([...b.right].reverse())} Z`;
const CLIPS = BRUSH.map(clipOf);

/** Tamanho do elemento em px (as bordas são desenhadas em px para o pincel ter espessura e textura certas). */
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Linha torta ao longo de um segmento (em px): ondas largas e tremido, como as bordas das faixas. */
function brushLine(seed: number, a: [number, number], b: [number, number], amp: number): [number, number][] {
  const r = rng(seed);
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return Array.from({ length: 13 }, (_, k) => {
    const o = Math.sin(k * 0.8 + seed) * amp * 0.4 + (r() - 0.5) * amp;
    return [a[0] + (dx * k) / 12 - (dy / len) * o, a[1] + (dy * k) / 12 + (dx / len) * o];
  });
}
/** As duas diagonais do X, em frações da caixa, com a semente de cada traço. */
const X_LINES = [{ seed: 31, a: [0.1, 0.06], b: [0.9, 0.94] }, { seed: 32, a: [0.9, 0.06], b: [0.1, 0.94] }] as const;

/**
 * X vermelho no traço das faixas da mesa: duas pinceladas grossas, tortas, de borda rasgada e com falhas.
 * Com `draw`, a primeira corta e a segunda vem logo depois (no tempo das duas facadas do som).
 */
function BrushX({ id, w, h, draw }: { id: string; w: number; h: number; draw: boolean }) {
  if (w <= 0 || h <= 0) return null;
  const sw = Math.max(7, Math.min(20, w * 0.11));
  const lines = X_LINES.map(({ seed, a, b }) => {
    const pts = brushLine(seed, [a[0] * w, a[1] * h], [b[0] * w, b[1] * h], sw * 0.6);
    const len = Math.hypot((b[0] - a[0]) * w, (b[1] - a[1]) * h);
    const scale = (g: number[], k = 1) => g.map((x, i) => (x * len * (i % 2 ? k : 1)).toFixed(1)).join(" ");
    return { seed, d: `M ${smooth(pts)}`, d2: `M ${smooth(pts.map(([x, y]) => [x + sw * 0.5, y - sw * 0.3]))}`, dash: scale(gaps(seed), 0.7), dash2: scale(gaps(seed + 9), 3) };
  });
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible fill-none stroke-red-600 drop-shadow-[0_0_6px_var(--color-red-800)]">
      <defs>
        <filter id={id} filterUnits="userSpaceOnUse" x={-40} y={-40} width={w + 80} height={h + 80}>
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={4} result="wave" />
          <feDisplacementMap in="SourceGraphic" in2="wave" scale={sw * 0.9} xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feTurbulence type="fractalNoise" baseFrequency="0.2 0.05" numOctaves={3} seed={6} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 7 -2.4" result="dry" />
          <feComposite in="torn" in2="dry" operator="in" />
        </filter>
        {lines.map((l, k) => (
          <mask key={l.seed} id={`${id}-m${k}`} maskUnits="userSpaceOnUse" x={-40} y={-40} width={w + 80} height={h + 80}>
            <motion.path d={l.d} stroke="white" strokeWidth={sw * 3} strokeLinecap="round"
              initial={{ pathLength: draw ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: 0.13, delay: k * 0.22, ease: "easeIn" }} />
          </mask>
        ))}
      </defs>
      {lines.map((l, k) => (
        <g key={l.seed} mask={`url(#${id}-m${k})`}>
          <g filter={`url(#${id})`}>
            <path d={l.d} strokeWidth={sw} strokeDasharray={l.dash} strokeLinecap="butt" />
            <path d={l.d2} strokeWidth={sw * 0.4} strokeDasharray={l.dash2} strokeLinecap="butt" />
          </g>
        </g>
      ))}
    </svg>
  );
}

/** X da mira (Vindicta): aparece sobre a carta enquanto o cursor ou o foco está nela. */
function AimX({ id }: { id: string }) {
  const [ref, { w, h }] = useSize();
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-has-focus-visible:opacity-100">
      <BrushX id={id} w={w} h={h} draw={false} />
    </div>
  );
}

/** Traço de pincel seco: grosso, com a borda rasgada (deslocamento por ruído), fiapos (erosão por ruído) e falhas (tracejado irregular). */
function BrushStroke({ id, pts, w, h, sw, dash, dash2, inward, caps = false }: {
  id: string; pts: [number, number][]; w: number; h: number; sw: number; dash: number[]; dash2: number[]; inward: number;
  /** Pontas sempre cheias (a falha nunca cai na borda da tela). */ caps?: boolean;
}) {
  const px = pts.map(([x, y]): [number, number] => [x * w, y * h]);
  const d = `M ${smooth(px)}`;
  // pincelada de apoio, mais fina e por dentro, que aparece só em trechos
  const d2 = `M ${smooth(px.map(([x, y]) => [x + inward * sw * 0.9, y]))}`;
  return (
    <g filter={`url(#${id})`}>
      <path d={d} strokeWidth={sw} strokeDasharray={dash.map((x) => (x * h).toFixed(1)).join(" ")} strokeLinecap="butt" />
      <path d={d2} strokeWidth={sw * 0.45} strokeDasharray={dash2.map((x, k) => (x * h * (k % 2 ? 3 : 0.6)).toFixed(1)).join(" ")} strokeDashoffset={h * 0.1} strokeLinecap="butt" />
      {caps && <path d={d} strokeWidth={sw} pathLength={100} strokeDasharray="14 72 14" strokeLinecap="butt" />}
    </g>
  );
}

/** Mesa do bar Jezebel's: madeira quase no escuro; a luz vem das faixas e de um lampião fraco que balança. */
function BarTable() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-dl-black">
      <img src={tableArt} alt="" draggable={false} className="absolute inset-0 size-full object-cover brightness-40 saturate-75" />
      <div className="absolute -inset-1/4 table-lamp" />
      <div className="absolute inset-0 bg-radial from-transparent from-35% to-black/80" />
    </div>
  );
}

/** Fundo da faixa: arte do local (ou névoa enquanto oculto), escurecida nas pontas e tingida com a cor da lane; bordas a pincel. A cor da lane vaza na mesa. */
function LaneBackdrop({ l, i, drop, fresh, dealAt }: {
  l: Loc; i: number; drop: Drop; /** Começo da partida: o local já revelado também revela com efeito e som. */ fresh: boolean;
  /** Abertura da mesa: a faixa pousa neste segundo, e o primeiro local só revela depois da mesa posta. */ dealAt?: number;
}) {
  const b = BRUSH[i % 3], lane = LANE[i % 3];
  const [ref, { w, h }] = useSize();
  const id = `lane-${i}`;
  const art = l.rev && l.L.art;
  // som quando o local vira (não na montagem: um local já revelado ao abrir a partida fica quieto)
  const was = useRef(fresh ? false : l.rev);
  const wait = dealAt !== undefined ? INTRO.reveal : 0;
  useEffect(() => {
    const now = l.rev && !was.current;
    was.current = l.rev;
    if (!now) return;
    if (!wait) return sfx("reveal");
    const id = setTimeout(() => sfx("reveal"), wait * 1000);
    return () => clearTimeout(id);
  }, [l.rev, wait]);
  // espessura proporcional à faixa, como no mapa: fina no celular, grossa no desktop
  const sw = Math.max(4, Math.min(13, w * 0.03));
  return (
    <div ref={ref} className={`relative min-w-0 flex-1 ${dealAt !== undefined ? "intro-drop" : ""}`} style={dealAt !== undefined ? ({ "--d": `${dealAt.toFixed(2)}s` } as CSSProperties) : undefined}>
      <div className={`absolute -inset-x-1/2 inset-y-0 bg-radial to-transparent to-70% mix-blend-screen ${lane.glow}`} />
      <div className="absolute inset-0 bg-zinc-950" style={{ clipPath: `url(#${id}-clip)` }}>
        {/* anima ao revelar; ao voltar para a tela no meio da partida, a arte já está lá */}
        <AnimatePresence initial={fresh}>
          {art && (
          <motion.img key={art} src={locArtUrl(art)} alt="" draggable={false}
            initial={{ opacity: 0, scale: 1.12, filter: "blur(14px) brightness(0.3)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px) brightness(1)" }}
            transition={{ duration: 1.4, ease: "easeOut", delay: wait }}
            className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${l.L.fx ?? 50}% 50%` }} />
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {!l.rev && <motion.div key="fog" className="absolute inset-0 lane-fog" exit={{ opacity: 0 }} transition={{ duration: 1.4, ease: "easeIn" }} />}
        </AnimatePresence>
        <div className="absolute inset-0 bg-linear-to-b from-black/80 via-black/10 to-black/85" />
        <div className={`absolute inset-0 bg-linear-to-t to-transparent to-60% ${lane.tint}`} />
        <div className={`absolute inset-0 transition-colors duration-150 ${drop === "over" ? "bg-game-me/20" : drop === "ok" ? "bg-game-me/8" : drop === "dim" ? "bg-black/65" : ""}`} />
      </div>
      <svg className={`absolute inset-0 size-full overflow-visible fill-none ${lane.stroke}`}>
        <defs>
          <clipPath id={`${id}-clip`} clipPathUnits="objectBoundingBox"><path d={CLIPS[i % 3]} /></clipPath>
          <filter id={id} filterUnits="userSpaceOnUse" x={-40} y={-40} width={w + 80} height={h + 80}>
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.008" numOctaves={2} seed={i * 7 + 1} result="wave" />
            <feDisplacementMap in="SourceGraphic" in2="wave" scale={sw * 1.4} xChannelSelector="R" yChannelSelector="G" result="torn" />
            <feTurbulence type="fractalNoise" baseFrequency="0.22 0.03" numOctaves={3} seed={i * 7 + 3} result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 7 -2.6" result="dry" />
            <feComposite in="torn" in2="dry" operator="in" />
          </filter>
        </defs>
        {w > 0 && (
          <>
            <BrushStroke id={id} pts={b.left} w={w} h={h} sw={sw} dash={b.dash} dash2={b.dash2} inward={1} />
            <BrushStroke id={id} pts={b.right} w={w} h={h} sw={sw} dash={b.dash2} dash2={b.dash} inward={-1} />
          </>
        )}
      </svg>
    </div>
  );
}

function Location({ m, l, i, t, canPlay, onPlay, dest, onDest, drop, card, dealAt }: {
  m: Match; l: Loc; i: number; t: T; canPlay: boolean; onPlay: () => void; dest: boolean; onDest: () => void; drop: Drop; card: (c: GCard) => React.ReactNode;
  /** Abertura da mesa: a placa e os lados entram junto com a faixa. */ dealAt?: number;
}) {
  const a = m.total(l, "a"), p = m.total(l, "p");
  const nm = l.rev ? l.L.name : t.ui.hiddenLoc;
  const chips = ([
    [l.lock.p >= m.t, "❄️", t.ui.chips.frozenMe],
    [l.lock.a >= m.t, "❄️", t.ui.chips.frozenAi],
    [m.hook.p?.i === i, "🪝", t.ui.chips.hookMe],
    [m.hook.a?.i === i, "🪝", t.ui.chips.hookAi],
    [l.trap.p > 0, "🪤", t.ui.chips.trapMe],
    [l.trap.a > 0, "🪤", t.ui.chips.trapAi],
    [l.shield.p >= m.t, "🧊", t.ui.chips.shieldMe],
    [l.shield.a >= m.t, "🧊", t.ui.chips.shieldAi],
    [!!l.petri.p, "🗿", t.ui.chips.petriMe],
    [!!l.petri.a, "🗿", t.ui.chips.petriAi],
    [m.portals.some((x) => x.t >= m.t && (x.a === i || x.b === i)), "🚪", t.ui.chips.portal],
  ] as [boolean, string, string][]).filter((x) => x[0]);
  const desc = l.rev ? l.L.desc || t.locs[l.L.type].text(l.L) : t.ui.revealsOn(i + 1);
  // cada lado numa área translúcida da faixa: grade 2x2 (no máximo 4 cartas por lado), nunca sobrepostas
  const side = "grid h-[calc(var(--spacing-gc)*2.92+0.5rem)] w-full grid-cols-[repeat(2,var(--spacing-gc))] grid-rows-[repeat(2,calc(var(--spacing-gc)*1.46))] justify-center gap-1 p-0.5";
  return (
    <div data-drop={i} aria-label={drop === "over" ? t.ui.dropHere(nm) : undefined}
      style={dealAt !== undefined ? ({ "--d": `${dealAt.toFixed(2)}s` } as CSSProperties) : undefined}
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-between gap-1 px-2 py-1.5 transition-[filter] duration-150 sm:gap-2 sm:px-4 sm:py-3 ${drop === "dim" ? "brightness-50" : ""} ${dealAt !== undefined ? "intro-drop" : ""}`}>
      <div className={`relative content-end ${side}`} aria-label={t.ui.aiSide(nm)} role="group">{l.s.a.map(card)}</div>
      <div className="relative w-full"><LocTile i={i} nm={nm} desc={desc} chips={chips} a={a} p={p} /></div>
      <div className={`relative content-start ${side}`} aria-label={t.ui.yourSide(nm)} role="group">
        {l.s.p.map(card)}
        {canPlay && (
          <button type="button" onClick={onPlay} aria-label={t.ui.playHere(nm)}
            className={`absolute inset-0 cursor-pointer rounded-md outline-2 outline-offset-2 outline-game-me outline-dashed hover:bg-game-me/10 active:bg-game-me/20 ${focus}`} />
        )}
      </div>
      {dest && (
        <button type="button" onClick={onDest} aria-label={t.ui.act.dest(nm)} data-target=""
          className={`absolute inset-0 z-10 cursor-pointer rounded-xl outline-2 -outline-offset-2 outline-game-me outline-dashed hover:bg-game-me/15 active:bg-game-me/25 ${focus}`} />
      )}
    </div>
  );
}

type StatusKey = keyof T["ui"]["status"];

function statusIcons(c: GCard, m: Match, t: T): [string, string, StatusKey][] {
  const s = c.st, now = (u?: number) => (u ?? 0) >= m.t;
  const list: [boolean, string, StatusKey][] = [
    [!!s.burn || !!s.ail || !!s.tburn?.some((x) => x.u >= m.t), "🔥", "burn"], [now(s.stun), "💫", "stun"], [m.immune(c), "🛡️", "immune"],
    [!!s.chained, "⛓️", "chained"], [!!s.burrow && !m.final, "⛏️", "burrow"], [now(s.sleep), "💤", "sleep"],
    [(s.rip ?? 0) > 0, "⚔️", "riposte"], [!!s.wolf, "🐺", "wolf"], [now(s.vuln), "🎯", "vuln"],
    [!!s.petri, "🗿", "petri"], [!!s.unstop, "⚡", "unstop"], [now(s.chan?.u), "🌩️", "chan"],
    [now(s.root), "📌", "root"], [s.exec?.u === m.t, "🗡️", "exec"], [!!s.debt, "💸", "debt"],
  ];
  return list.filter((x) => x[0]).map((x) => [x[1], x[2] === "debt" ? `${t.ui.status.debt} (${s.debt?.v})` : t.ui.status[x[2]], x[2]]);
}

/** Vaga da carta na fileira do local: encolhe quando não cabe (a carta transborda e fica por baixo da seguinte). */
const slot = "w-gc hover:z-10 focus-within:z-10";

function BoardCard({ c, m, t, name, face, looking, target, mark = false, acts, shift, onClick, onPeek }: {
  c: GCard; m: Match; t: T; name: string; face: React.ReactNode; looking: boolean; target: boolean; acts: { label: string; run: () => void }[];
  /** Alvo de uma mira que mata (Vindicta): o X vermelho aparece no hover. */ mark?: boolean;
  /** Pode ser arrastada para outro local neste turno: treme na mesa e avisa o local sob o cursor e onde foi solta. */
  shift?: { on: (over: number | null) => void; drop: (i: number | null) => void };
  /** Clique; no toque vem o retângulo da carta para ampliar (no mouse, o hover já amplia). */
  onClick: (r: DOMRect | null) => void; onPeek: (r: DOMRect | null) => void;
}) {
  const touch = useRef(false);
  const moved = useRef(false);
  const [held, setHeld] = useState(false);
  if (c.side === "a" && !c.rev) return <div role="img" aria-label={t.ui.facedown} className={slot} data-card={c.id}><CardBack className={`w-gc ${REST}`} /></div>;
  const pw = c.rev ? m.pow(c) : c.base;
  const icons = statusIcons(c, m, t);
  const w = weight(c);
  return (
    <motion.div className={`group relative perspective-[40rem] ${slot} ${shift ? "touch-none" : ""} ${held ? "z-50" : ""}`} data-card={c.id} data-target={target ? "" : undefined}
      drag={!!shift} dragSnapToOrigin dragMomentum={false} dragElastic={1} whileDrag={{ scale: 0.9 }}
      onDragStart={() => { moved.current = true; setHeld(true); onPeek(null); }}
      onDrag={(e) => { const pt = pointOf(e); shift?.on(dropUnder(pt.x, pt.y)); }}
      onDragEnd={(e) => { const pt = pointOf(e); setHeld(false); shift?.drop(dropUnder(pt.x, pt.y)); }}>
    {/* pode ser movida: balança e brilha como a conta do "Fechar a conta" (parada enquanto arrasta); o atraso varia para as cartas não balançarem juntas */}
    {shift && !held && <span aria-hidden="true" className="pointer-events-none absolute -inset-2 card-call-glow rounded-2xl bg-radial from-game-me/60 via-game-me/20 to-transparent to-70% blur-md" />}
    <div className={shift && !held ? "card-jiggle" : ""} style={shift ? { animationDelay: `${-(c.id % 7) * 0.31}s` } : undefined}>
    <motion.button type="button" onClick={(e) => { if (moved.current) { moved.current = false; return; } onClick(touch.current ? e.currentTarget.getBoundingClientRect() : null); }} aria-pressed={looking}
      onPointerDown={(e) => { touch.current = e.pointerType !== "mouse"; }}
      aria-label={`${target ? `${t.ui.act.target(name)}: ` : ""}${t.ui.cardLabel(name, c.cost, pw)}${icons.length ? ` (${icons.map((x) => x[1]).join(", ")})` : ""}`}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onPeek(e.currentTarget.getBoundingClientRect()); }} onPointerLeave={() => onPeek(null)} onBlur={() => onPeek(null)}
      initial={c.rev ? { ...FALL[w], opacity: 0, rotateY: c.side === "a" ? 100 : 0, filter: LIFTED } : { y: -16, scale: 1.12, opacity: 0, filter: LIFTED }}
      animate={{ scale: 1, y: 0, rotate: 0, rotateY: 0, opacity: 1, filter: RESTING }}
      transition={c.rev ? { duration: FALL_MS[w] / 1000, ease: "easeIn", opacity: { duration: 0.1 } } : { type: "spring", stiffness: 520, damping: 17, opacity: { duration: 0.08 } }}
      className={`relative block w-gc rounded-lg ${shift ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${c.staged || c.st.wait ? "opacity-60" : ""} ${looking ? "outline-2 outline-offset-2 outline-dl-text" : ""} ${target ? "outline-2 outline-offset-2 outline-game-me" : ""} ${focus}`}>
      {m.faceDown(c) ? <CardBack tone="me" className={`w-gc ${REST}`} /> : (
        // na mira da Vindicta, a carta fica em preto e branco e o X vermelho é o destaque
        <div className={mark ? "transition-[filter] duration-100 group-hover:brightness-75 group-hover:grayscale group-has-focus-visible:brightness-75 group-has-focus-visible:grayscale" : ""}>{face}</div>
      )}
    </motion.button>
    {mark && <AimX id={`aim-${c.id}`} />}
    </div>
    {c.rev ? <Impact w={w} /> : c.side === "p" && <Impact w={1} />}
    {acts.length > 0 && (
      <div className="absolute inset-x-0 bottom-1 z-20 flex flex-col items-center gap-1">
        {acts.map((x) => (
          <button key={x.label} type="button" onClick={x.run}
            className={`min-h-7 cursor-pointer rounded-full bg-game-me px-2 text-[10px] font-extrabold tracking-wider text-dl-black uppercase shadow-lg transition hover:brightness-110 active:scale-95 ${focus}`}>
            {x.label}
          </button>
        ))}
      </div>
    )}
    </motion.div>
  );
}

/** Sombra da carta no ar (longe e difusa) e apoiada na mesa (curta e escura): a troca entre as duas dá o peso da queda. */
const LIFTED = "drop-shadow(0px 28px 14px rgb(0 0 0 / 0.3))";
const RESTING = "drop-shadow(0px 5px 4px rgb(0 0 0 / 0.8))";
/** A mesma sombra de apoio, para o verso da carta da IA. */
const REST = "drop-shadow-[0_5px_4px_rgb(0_0_0/0.8)]";

/** De onde a carta cai, por peso. */
const FALL = {
  1: { y: -26, scale: 1.15, rotate: 0 },
  2: { y: -90, scale: 1.4, rotate: 3 },
  3: { y: -220, scale: 1.8, rotate: -6 },
} as const;

/** Poeira (e sombra que cresce antes do impacto) quando a carta toca a mesa; anel de choque nas pesadas. */
function Impact({ w }: { w: 1 | 2 | 3 }) {
  const fall = FALL_MS[w] / 1000;
  const dust = w === 1 ? 4 : w === 2 ? 6 : 10;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {w > 1 && (
        <motion.span className="absolute inset-x-[5%] -bottom-1 h-3 rounded-full bg-black/70 blur-sm"
          initial={{ scaleX: 0.3, opacity: 0 }} animate={{ scaleX: [0.3, 1, 1.1], opacity: [0, 0.8, 0] }} transition={{ duration: fall + 0.3, times: [0, 0.55, 1] }} />
      )}
      {Array.from({ length: dust }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const k = (i >> 1) / Math.max(1, dust / 2 - 1);
        return (
          <motion.span key={i} className="absolute bottom-0 left-1/2 size-2.5 rounded-full bg-stone-300/60 blur-[2px]"
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{ x: side * (14 + k * 26 * w), y: -(4 + k * 10 + w * 3), scale: 1.2 + w * 0.5, opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.5 + w * 0.08, delay: fall, ease: "easeOut" }} />
        );
      })}
      {w === 3 && (
        <motion.span className="absolute inset-0 rounded-xl ring-4 ring-game-brass/80"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1, 1.6] }} transition={{ duration: 0.45, delay: fall, ease: "easeOut" }} />
      )}
      {w < 3 && (
        <motion.span className="absolute inset-0 rounded-xl ring-2 ring-dl-text/70"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1, 1.3] }} transition={{ duration: 0.4, delay: fall, ease: "easeOut" }} />
      )}
    </span>
  );
}

const PEEK_W = 260;
const TIP_W = 192;

/** Carta da mesa ampliada ao lado dela, com as caixas do selo de momento e de status. */
function Peek({ r, card, tips }: { r: DOMRect; card: React.ReactNode; tips: Tip[] }) {
  const extra = tips.length ? TIP_W + 8 : 0;
  // no celular a carta encolhe para caber com as caixas ao lado
  const w = Math.min(PEEK_W, Math.max(140, window.innerWidth - 24 - extra));
  const h = (w * 430) / 295;
  const right = r.right + 12 + w + extra <= window.innerWidth;
  const left = Math.max(8, right ? r.right + 12 : r.left - 12 - w - extra);
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2));
  return (
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
      className={`pointer-events-none fixed z-60 flex items-start gap-2 ${right ? "" : "flex-row-reverse"}`} style={{ left, top }} aria-hidden="true">
      <div style={{ width: w }}>{card}</div>
      <TipBoxes tips={tips} />
    </motion.div>
  );
}

/** Mão da IA: versos em leque afundados na borda de cima (menores que a sua mão, mas à vista). */
function AiHand({ n, t }: { n: number; t: T }) {
  const mid = (n - 1) / 2;
  return (
    <div role="img" aria-label={t.ui.aiHand(n)} className="relative h-18 w-47 [clip-path:inset(0_-100vw_-100vh_-100vw)] sm:h-26 sm:w-88">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="absolute top-0 left-1/2 w-13 origin-bottom sm:w-21"
          style={{ transform: `translate(-50%, -38%) translateX(${(i - mid) * 62}%) rotate(${(mid - i) * 6}deg) translateY(${-Math.abs(i - mid) * 4}%)` }}>
          <CardBack />
        </div>
      ))}
    </div>
  );
}

function ItemIconBox({ k, icon, size }: { k: ItemKey; icon?: string; size: string }) {
  const slot = ITEMS[k].slot;
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-950/80 ring-2 ${SLOT_RING[slot]}`}>
      {icon ? <img src={icon} alt="" className="size-full object-contain p-0.5" /> : <span className={`text-xs font-extrabold ${SLOT_TEXT[slot]}`} aria-hidden="true">T{ITEMS[k].tier}</span>}
    </span>
  );
}

/** Foco que aparece dentro de caixas recortadas (o recorte cortaria o contorno de fora). */
const focusIn = "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-dl-text";

/**
 * Item da loja na região de um local: caixa escura na cor da categoria do item (arma laranja, vitalidade verde, espírito
 * roxo), com a arte do local ao fundo, moldura a pincel e o nome numa etiqueta que dá o tique. Na tela larga é 50% maior.
 */
/** Layout da caixa de item (loja e destaque da comanda); na tela larga é 50% maior. */
const ITEM_BOX = "relative isolate flex flex-col items-center gap-1.5 p-2.5 text-center sm:gap-2 sm:p-3.5 2xl:gap-3 2xl:p-6";

/** Corpo da caixa de item: fundo na cor da categoria com a arte do local, moldura a pincel, nome na etiqueta, ícone, tier e texto. */
function ItemBody({ k, l, m, t, icon }: { k: ItemKey; l?: Loc | null; m: Match; t: T; icon?: string }) {
  const it = ITEMS[k];
  const box = SLOT_BOX[it.slot];
  const art = l?.rev && l.L.art;
  return (
    <>
      <span aria-hidden="true" className={`absolute inset-0 -z-10 overflow-hidden bg-zinc-950 ring-4 filter-[url(#shop-rough)] ring-inset ${SLOT_RING[it.slot]}`}>
        {art && <img src={locArtUrl(art)} alt="" draggable={false} className="absolute inset-0 size-full object-cover opacity-25" style={{ objectPosition: `${l.L.fx ?? 50}% 50%` }} />}
        <span className={`absolute inset-0 bg-linear-to-b to-zinc-950/75 to-70% ${box.tint}`} />
      </span>
      <TickTag tone={box.tag} className="max-w-full px-2 py-0.5 text-sm font-extrabold tracking-wide text-zinc-950 [font-variant-caps:small-caps] sm:px-3 sm:text-lg 2xl:px-5 2xl:py-1 2xl:text-3xl">{k}</TickTag>
      <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 2xl:gap-x-3">
        <ItemIconBox k={k} icon={icon} size="size-9 sm:size-12 2xl:size-18" />
        <span className={`text-[10px] font-bold tracking-wider uppercase sm:text-xs 2xl:text-lg ${SLOT_TEXT[it.slot]}`}>{t.slots[it.slot]} · {t.shop.tier(it.tier)}</span>
      </span>
      <span className="text-xs text-zinc-100 sm:text-sm 2xl:text-xl">{t.items[k](m.itemV(k))}</span>
    </>
  );
}

function ShopBox({ k, i, l, m, t, icon, picked, disabled, onPick }: { k: ItemKey; i: number; l: Loc; m: Match; t: T; icon?: string; picked: boolean; disabled: boolean; onPick: () => void }) {
  const it = ITEMS[k];
  const fit = m.itemFit("p", k);
  const box = SLOT_BOX[it.slot];
  // já comprou outro: este fica apagado como a carta da mão sem jogada (mas ainda dá para trocar a compra por ele)
  const dim = !picked && !!m.buying.p;
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.22, delay: i * 0.06 }}
      className={`pointer-events-auto flex w-full max-w-72 2xl:max-w-108 ${disabled || dim ? "" : box.glow}`}>
      <button type="button" onClick={onPick} disabled={disabled} aria-pressed={picked} aria-label={`${t.shop.label(k, it.tier)}: ${t.items[k](m.itemV(k))}`}
        className={`${ITEM_BOX} w-full cursor-pointer transition enabled:hover:-translate-y-0.5 enabled:hover:brightness-125 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:brightness-50 disabled:saturate-50 ${picked ? "outline-2 -outline-offset-8 outline-game-brass" : ""} ${dim ? "brightness-50 saturate-50" : ""} ${focusIn}`}>
        <ItemBody k={k} l={l} m={m} t={t} icon={icon} />
        <span className="text-[11px] font-bold text-game-brass sm:text-xs 2xl:text-lg">{t.shop.price(m.itemPrice("p", k))}{!picked && !m.canBuy(k) && ` · ${m.itemTargets("p", k).length ? t.shop.noSouls : t.shop.noTarget}`}</span>
        {(fit.cards > 0 || fit.loc) && (
          <span className="flex flex-wrap justify-center gap-1">
            {fit.cards > 0 && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me 2xl:px-2.5 2xl:text-sm">{t.shop.fitCards(fit.cards)}</span>}
            {fit.loc && <span className="rounded-full bg-game-me/15 px-1.5 text-[10px] text-game-me 2xl:px-2.5 2xl:text-sm">{t.shop.fitLoc(fit.loc)}</span>}
          </span>
        )}
        {picked && <span className="text-[11px] font-bold tracking-wider text-game-brass uppercase 2xl:text-base">{t.shop.picked} · {t.shop.undo}</span>}
      </button>
    </motion.div>
  );
}

/** Itens comprados (seus ou da IA): ícones pequenos, com o texto e o alvo numa caixa no hover/foco/toque. A compra da IA só aparece no fim do turno. */
function ItemSlot({ s, m, t, icons, on }: { s: Side; m: Match; t: T; icons: Record<string, string>; on: (b: Bought) => string }) {
  const [open, setOpen] = useState(false);
  const list = [...m.owned[s], ...(s === "p" && m.buying.p ? [m.buying.p] : [])];
  const who = s === "p" ? t.shop.mine : t.shop.ai;
  if (!list.length) {
    return (
      <span data-item-slot={s} data-item-from={s === "p" ? "p" : undefined} title={`${who}: ${t.shop.hidden}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-950/70 text-sm text-zinc-500">?</span>
    );
  }
  const size = list.length > 1 ? "size-7" : "size-9";
  return (
    <span className="relative shrink-0" data-item-slot={s} data-item-from={s === "p" ? "p" : undefined}>
      <button type="button" onClick={() => setOpen((x) => !x)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }} onBlur={() => setOpen(false)}
        aria-expanded={open} aria-label={`${who}: ${list.map((b) => b.k).join(", ")}`}
        className={`flex cursor-pointer gap-0.5 rounded-md transition hover:brightness-125 active:scale-95 ${focus}`}>
        {list.map((b, i) => (
          <span key={`${b.k}-${b.t}-${i}`} className={b === m.buying.p ? "animate-pulse" : ""}><ItemIconBox k={b.k} icon={icons[b.k]} size={size} /></span>
        ))}
      </button>
      {open && (
        <TipBoxes className={`absolute z-70 ${s === "a" ? "top-full left-0 pt-1" : "bottom-full left-0 pb-1"}`}
          tips={list.map((b) => ({ title: `${b.k} · ${t.slots[ITEMS[b.k].slot]} ${t.shop.tier(ITEMS[b.k].tier)}`, text: `${t.items[b.k](m.itemV(b.k))} (${t.shop.on(on(b))})` }))} />
      )}
    </span>
  );
}

/** Linhas da comanda: mais do que cabem, para o papel seguir pautado até a borda da tela. */
const COMANDA_ROWS = 12;

/**
 * Tela larga: comanda do bar com os itens comprados de um jogador. O bloco sai da borda da tela e só a metade dele fica
 * na mesa (o resto é cortado de propósito pela borda). A do adversário é espelhada: o cabeçalho fica perto das almas e as
 * linhas seguem para o topo. A compra da IA só aparece no fim do turno.
 */
/**
 * Item da comanda em destaque, como a carta ampliada: caixa grande na cor da categoria, com nome, ícone, tier, o que faz e
 * em quem foi usado. Vai num portal porque a comanda é girada (o fixed ficaria preso a ela).
 */
function ItemPeek({ b, r, m, t, icon, on }: { b: Bought; r: DOMRect; m: Match; t: T; icon?: string; on: (b: Bought) => string }) {
  const it = ITEMS[b.k];
  // mesma largura da caixa da loja (50% maior na tela larga)
  const w = Math.min(window.innerWidth >= 1536 ? 432 : 288, window.innerWidth - 24);
  const right = r.right + 12 + w <= window.innerWidth;
  const left = Math.max(8, right ? r.right + 12 : r.left - 12 - w);
  const top = Math.max(8, Math.min(window.innerHeight - 420, r.top + r.height / 2 - 160));
  // arte do local onde está a carta que recebeu o item
  const l = m.loc.find((x) => [...x.s.p, ...x.s.a].some((c) => c.id === b.target));
  return createPortal(
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
      className={`pointer-events-none fixed z-90 ${SLOT_BOX[it.slot].glow}`} style={{ left, top, width: w }} aria-hidden="true">
      <div className={ITEM_BOX}>
        <ItemBody k={b.k} l={l} m={m} t={t} icon={icon} />
        <span className="text-[11px] font-bold text-game-brass sm:text-xs 2xl:text-lg">{t.shop.on(on(b))} · {t.shop.price(itemCost(it.tier))}</span>
      </div>
    </motion.div>,
    document.body,
  );
}

function Comanda({ s, m, t, icons, on, deal }: {
  s: Side; m: Match; t: T; icons: Record<string, string>; on: (b: Bought) => string;
  /** Abertura da mesa: classe e atraso da entrada. */ deal?: { cls: string; style?: CSSProperties };
}) {
  const list = [...m.owned[s], ...(s === "p" && m.buying.p ? [m.buying.p] : [])];
  const who = s === "p" ? t.shop.mine : t.shop.ai;
  const ai = s === "a";
  const rows = Array.from({ length: Math.max(COMANDA_ROWS, list.length) }, (_, i) => list[i]);
  const flip = ai ? "flex-col-reverse" : "flex-col";
  // item em destaque ao lado da linha (hover, foco ou toque)
  const [peek, setPeek] = useState<{ b: Bought; r: DOMRect } | null>(null);
  return (
    // a borda da tela corta o bloco: é o papel saindo para fora da mesa
    <div className={`@container relative size-full min-h-0 overflow-hidden ${deal?.cls ?? ""}`} style={deal?.style}>
      <section data-item-slot={s} aria-label={who}
        className={`absolute inset-x-3 flex h-[200%] ${flip} bg-comanda-paper text-comanda-ink shadow-[inset_0_0_2.5rem_rgb(90_60_20/0.25),0_0.5rem_1.25rem_rgb(0_0_0/0.6)] ${ai ? "bottom-2 rotate-1" : "top-2 -rotate-1"}`}>
        {/* capa de papelão do bloco, do lado das almas */}
        <div className="h-3 shrink-0 bg-comanda-kraft shadow-[0_1px_0_rgb(0_0_0/0.25)]" />
        <div className={`flex min-h-0 flex-1 ${flip} gap-2 p-3`}>
          <header className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-extrabold tracking-wide uppercase @[15rem]:text-2xl">{t.ui.comanda.title}</h2>
              <span className="hidden text-xs font-bold uppercase @[15rem]:inline">{t.ui.comanda.table(ai ? 6 : 7)}</span>
            </div>
            <p className={`border-b border-comanda-ink/60 pb-0.5 text-xs font-extrabold tracking-wider uppercase ${ai ? "text-game-ai" : "text-teal-800"}`}>{who}</p>
          </header>
          <div className={`flex min-h-0 flex-1 ${flip} border-2 border-comanda-ink`}>
            <div className="grid shrink-0 grid-cols-[1fr_3rem] bg-comanda-ink text-[10px] font-extrabold tracking-widest text-comanda-paper uppercase">
              <span className="px-2 py-1">{t.ui.comanda.item}</span>
              <span className="border-l border-comanda-paper/40 py-1 text-center">{t.ui.comanda.value}</span>
            </div>
            <ul className={`flex ${flip}`}>
              {rows.map((b, i) => (
                <li key={b ? `${b.k}-${b.t}-${i}` : i} data-item-from={!ai && (m.buying.p ? b === m.buying.p : i === list.length) ? "p" : undefined}
                  onPointerEnter={(e) => { if (b && e.pointerType === "mouse") setPeek({ b, r: e.currentTarget.getBoundingClientRect() }); }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setPeek(null); }}
                  className={`grid min-h-14 grid-cols-[1fr_3rem] border-comanda-ink/35 ${ai ? "border-t" : "border-b"} ${b && b === m.buying.p ? "animate-pulse" : ""} ${b && peek?.b === b ? "bg-comanda-ink/10" : ""}`}>
                  <span className="flex min-w-0 items-center gap-2 px-2 py-1.5">
                    {b ? (
                      <button type="button" aria-label={`${b.k}: ${t.items[b.k](m.itemV(b.k))} (${t.shop.on(on(b))})`}
                        onClick={(e) => { const r = e.currentTarget.closest("li")!.getBoundingClientRect(); setPeek((p) => (p?.b === b ? null : { b, r })); }}
                        onFocus={(e) => setPeek({ b, r: e.currentTarget.closest("li")!.getBoundingClientRect() })} onBlur={() => setPeek(null)}
                        className={`flex min-w-0 flex-1 cursor-help items-center gap-2 rounded-sm text-left transition hover:brightness-110 active:scale-[0.98] ${focusIn}`}>
                        <ItemIconBox k={b.k} icon={icons[b.k]} size="size-10" />
                        <span className="flex min-w-0 flex-col">
                          <b className="text-base/tight">{b.k}</b>
                          <span className="truncate text-xs text-comanda-ink/70">{t.shop.on(on(b))}</span>
                        </span>
                      </button>
                    ) : i === 0 && <span className="text-sm text-comanda-ink/50 italic">{t.shop.hidden}</span>}
                  </span>
                  <span className="grid place-items-center border-l border-comanda-ink/35 text-lg">{b ? itemCost(ITEMS[b.k].tier) : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      {peek && list.includes(peek.b) && <ItemPeek b={peek.b} r={peek.r} m={m} t={t} icon={icons[peek.b.k]} on={on} />}
    </div>
  );
}

/**
 * Etiqueta na cor da faixa, como as do jogo: só o fundo dá o tique seco a cada segundo (tag-tick); o texto fica parado.
 * `tone` é a classe de fundo (bg-lane-yellow...).
 */
function TickTag({ tone, className = "", still = false, children }: { tone: string; className?: string; /** Sem o tique (fica torta, parada). */ still?: boolean; children: ReactNode }) {
  return (
    <span className={`relative isolate inline-block drop-shadow-[0_3px_0_rgb(0_0_0/0.6)] ${className}`}>
      <span aria-hidden="true" className={`absolute inset-0 -z-10 [clip-path:polygon(2%_6%,99%_0,100%_92%,0_100%)] ${still ? "-rotate-2" : "tag-tick"} ${tone}`} />
      {children}
    </span>
  );
}

/**
 * Placa do local entre os dois lados: o nome numa etiqueta grande na cor da faixa (a única que dá o tique), o efeito numa
 * caixa escura com a letra na cor da faixa (toque para ler inteiro) e o poder de cada lado nas pontas (o seu à esquerda).
 */
function LocTile({ i, nm, desc, chips, a, p }: { i: number; nm: string; desc: string; chips: [boolean, string, string][]; a: number; p: number }) {
  const [full, setFull] = useState(false);
  const lane = LANE[i % 3];
  return (
    <div className="@container flex w-full flex-col items-center gap-2 text-center leading-tight">
      <div className="flex w-full flex-wrap items-center justify-between gap-1 @sm:flex-nowrap">
        <ScoreTag v={p} lead={p > a} side="p" />
        <motion.h3 key={nm} initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.9 }}
          className="order-first flex w-full min-w-0 justify-center text-lg font-extrabold tracking-wide wrap-break-word hyphens-auto text-zinc-950 [font-variant-caps:small-caps] @3xs:text-2xl @sm:order-0 @sm:w-auto @sm:flex-1 @sm:text-2xl @[26rem]:text-3xl">
          <TickTag tone={lane.tag} className="line-clamp-2 max-w-full min-w-0 px-2 py-1 sm:px-4">{nm}</TickTag>
        </motion.h3>
        <ScoreTag v={a} lead={a > p} side="a" />
      </div>
      <div className="flex w-full justify-center drop-shadow-[0_3px_0_rgb(0_0_0/0.6)]">
        <button type="button" onClick={() => setFull((x) => !x)} aria-expanded={full} title={desc}
          className={`max-w-full cursor-pointer bg-zinc-950 px-2.5 py-1 text-xs font-bold transition-[filter] [clip-path:polygon(0_0,100%_5%,99%_100%,1%_94%)] hover:brightness-125 active:brightness-90 sm:px-3 sm:py-1.5 @3xs:text-sm @sm:text-base ${lane.ink} ${full ? "" : "line-clamp-3"} ${focusIn}`}>
          {desc}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 text-xs">
          {chips.map(([, icon, label]) => <span key={label} role="img" title={label} aria-label={label}>{icon}</span>)}
        </div>
      )}
    </div>
  );
}

/** Poder de um lado numa caixa escura parada (sem recorte, para o halo e o +N/−N não serem cortados). */
function ScoreTag({ v, lead, side }: { v: number; lead: boolean; side: Side }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-xs bg-zinc-950 px-0.5 py-1 shadow-[0_3px_0_rgb(0_0_0/0.6)] sm:px-1.5">
      <Score v={v} lead={lead} side={side} />
    </span>
  );
}

/**
 * Poder de um lado no local: número grande que brilha na cor do lado. Quem lidera cresce e ganha um halo que respira;
 * quando o número muda, ele salta e solta o +N ou −N subindo.
 */
function Score({ v, lead, side }: { v: number; lead: boolean; side: Side }) {
  const [prev, setPrev] = useState(v);
  const [delta, setDelta] = useState<{ id: number; d: number } | null>(null);
  if (v !== prev) {
    setPrev(v);
    setDelta((x) => ({ id: (x?.id ?? 0) + 1, d: v - prev }));
  }
  const tone = side === "p" ? "text-game-me" : "text-game-ai";
  return (
    <span className="relative grid min-w-8 shrink-0 place-items-center sm:min-w-14">
      <AnimatePresence>
        {lead && (
          <motion.span key="halo" aria-hidden="true" className={`absolute inset-0 rounded-full blur-md ${side === "p" ? "bg-game-me" : "bg-game-ai"}`}
            initial={{ opacity: 0 }} animate={{ opacity: [0.2, 0.55, 0.2] }} exit={{ opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
        )}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.em key={v} initial={{ scale: 1.9, opacity: 0, y: -8 }} animate={{ scale: lead ? 1.15 : 1, opacity: 1, y: 0 }} exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 18 }}
          className={`relative text-2xl leading-none font-extrabold not-italic tabular-nums [text-shadow:0_0_12px_currentColor,0_2px_0_rgb(0_0_0/0.85)] sm:text-4xl ${tone}`}>
          {v}
        </motion.em>
      </AnimatePresence>
      <AnimatePresence>
        {delta && delta.d !== 0 && (
          <motion.span key={delta.id} aria-hidden="true" className={`pointer-events-none absolute -top-3 text-sm font-extrabold sm:text-base ${tone}`}
            initial={{ y: 0, opacity: 0 }} animate={{ y: -24, opacity: [0, 1, 0] }} transition={{ duration: 0.9, ease: "easeOut" }}
            onAnimationComplete={() => setDelta((x) => (x?.id === delta.id ? null : x))}>
            {delta.d > 0 ? `+${delta.d}` : `−${-delta.d}`}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Carta comprada com a mão cheia: aparece sobre o baralho em preto e branco, pega fogo de baixo para cima e some.
 * A carta está perdida (saiu da partida).
 */
/** Carta eliminada: dois traços vermelhos a pincel cortam a carta em X e ela some em 1,5 s. */
function Slain({ r, card, still, onDone }: { r: DOMRect; card: ReactNode; still: boolean; onDone: () => void }) {
  return (
    <motion.div aria-hidden="true" className="pointer-events-none fixed z-60" style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
      initial={{ opacity: 1, scale: 1 }} animate={{ opacity: [1, 1, 0], scale: still ? 1 : [1, 1.06, 0.92] }} exit={{ opacity: 0 }}
      transition={{ duration: SLAIN_S, times: [0, 0.55, 1], ease: "easeIn" }} onAnimationComplete={onDone}>
      <motion.div className="size-full" initial={{ filter: "grayscale(0) brightness(1)" }} animate={{ filter: "grayscale(1) brightness(0.7)" }} transition={{ duration: 0.12 }}>
        {card}
      </motion.div>
      <BrushX id={`slain-${Math.round(r.left)}-${Math.round(r.top)}`} w={r.width} h={r.height} draw={!still} />
    </motion.div>
  );
}

function Burning({ card, onDone }: { card: ReactNode; onDone: () => void }) {
  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 z-30 w-full max-w-40 min-w-24 -translate-x-1/2"
      initial={{ opacity: 0, y: 0, scale: 0.9 }} animate={{ opacity: [0, 1, 1, 0], y: -24, scale: 1.05 }} exit={{ opacity: 0 }}
      transition={{ duration: 3.4, times: [0, 0.06, 0.85, 1], ease: "easeOut" }} onAnimationComplete={onDone}>
      <div className="relative card-burn grayscale">
        {card}
        <span className="absolute inset-x-0 burn-front h-1/3 bg-linear-to-t from-transparent via-orange-500 to-amber-200/0 mix-blend-screen blur-sm" />
      </div>
      {Array.from({ length: 8 }, (_, k) => (
        <motion.span key={k} className="absolute bottom-1/4 size-1.5 rounded-full bg-amber-400 blur-[1px]" style={{ left: `${10 + k * 11}%` }}
          initial={{ y: 0, opacity: 0 }} animate={{ y: -60 - (k % 3) * 25, x: (k % 2 ? 1 : -1) * (6 + k * 2), opacity: [0, 1, 0] }}
          transition={{ duration: 1.8, delay: 0.3 + (k % 4) * 0.5, ease: "easeOut" }} />
      ))}
    </motion.div>
  );
}

/** Título e caixas da loja: somem num fade e só então saem do foco e do clique (o espaço continua ocupado). */
const shopFade = (hidden: boolean) => (hidden ? { opacity: 0, transitionEnd: { visibility: "hidden" as const } } : { opacity: 1, visibility: "visible" as const });

/** Cor da tela de fim: verde na vitória, vermelho na derrota, âmbar no empate. */
const END_TONE = {
  win: { stops: ["var(--color-emerald-500)", "var(--color-emerald-700)", "var(--color-emerald-950)"], stroke: "stroke-emerald-400", ink: "text-emerald-900" },
  loss: { stops: ["var(--color-red-500)", "var(--color-red-700)", "var(--color-red-950)"], stroke: "stroke-red-500", ink: "text-red-900" },
  draw: { stops: ["var(--color-amber-500)", "var(--color-amber-700)", "var(--color-zinc-950)"], stroke: "stroke-amber-400", ink: "text-amber-900" },
} as const;
/** Faixa larga da tela de fim, com as mesmas bordas a pincel das faixas do tabuleiro. */
const END_BRUSH = { left: brushEdge(21, 0.06, 0.03), right: brushEdge(22, 0.94, 0.03), dash: gaps(21), dash2: gaps(22) };
/** Borda do preenchimento: os mesmos pontos do pincel, esticados para além do topo e do fundo da tela. */
const stretch = (p: [number, number][]): [number, number][] => [[p[0][0], -0.08], ...p, [p[p.length - 1][0], 1.08]];

/**
 * Fundo da tela de fim no estilo do tabuleiro: a cor a 50% numa faixa (a mesa aparece por trás) com bordas tortas a pincel e falhas.
 * O preenchimento passa pelo mesmo deslocamento de ruído do pincel, então a borda dele acompanha o traço de cima a baixo.
 */
function EndBackdrop({ tone }: { tone: (typeof END_TONE)[keyof typeof END_TONE] }) {
  const [ref, { w, h }] = useSize();
  const sw = Math.max(6, Math.min(20, w * 0.014));
  const px = (p: [number, number][]) => p.map(([x, y]): [number, number] => [x * w, y * h]);
  const fill = `M ${smooth(px(stretch(END_BRUSH.left)))} L ${smooth(px(stretch(END_BRUSH.right)).reverse())} Z`;
  const wave = (id: string, dry: boolean) => (
    <filter id={id} filterUnits="userSpaceOnUse" x={-40} y={-40} width={w + 80} height={h + 80}>
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.008" numOctaves={2} seed={21} result="wave" />
      <feDisplacementMap in="SourceGraphic" in2="wave" scale={sw * 1.4} xChannelSelector="R" yChannelSelector="G" result="torn" />
      {dry && (
        <>
          <feTurbulence type="fractalNoise" baseFrequency="0.22 0.03" numOctaves={3} seed={23} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 7 -2.6" result="dry" />
          <feComposite in="torn" in2="dry" operator="in" />
        </>
      )}
    </filter>
  );
  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-black/40" />
      {/* fora da faixa: a mesma cor, no tom mais escuro, até a borda da tela (nenhuma zona sem cor) */}
      <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(ellipse at center, ${tone.stops[1]}, ${tone.stops[2]} 70%)` }} />
      {w > 0 && (
        <svg className={`absolute inset-0 size-full overflow-visible fill-none ${tone.stroke}`}>
          <defs>
            {wave("end-fill", false)}
            {wave("end-brush", true)}
            <radialGradient id="end-tone">
              <stop offset="0" style={{ stopColor: tone.stops[0] }} />
              <stop offset="0.5" style={{ stopColor: tone.stops[1] }} />
              <stop offset="1" style={{ stopColor: tone.stops[2] }} />
            </radialGradient>
            <linearGradient id="end-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="black" stopOpacity="0.6" />
              <stop offset="0.5" stopColor="black" stopOpacity="0" />
              <stop offset="1" stopColor="black" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <g filter="url(#end-fill)" opacity={0.5} stroke="none">
            <path d={fill} fill="url(#end-tone)" />
            <path d={fill} fill="url(#end-shade)" />
          </g>
          <BrushStroke id="end-brush" caps pts={stretch(END_BRUSH.left)} w={w} h={h} sw={sw} dash={END_BRUSH.dash} dash2={END_BRUSH.dash2} inward={1} />
          <BrushStroke id="end-brush" caps pts={stretch(END_BRUSH.right)} w={w} h={h} sw={sw} dash={END_BRUSH.dash2} dash2={END_BRUSH.dash} inward={-1} />
        </svg>
      )}
    </div>
  );
}
/** Cartas que caem pela tela de fim: coluna, atraso e giro de cada uma. */
const FALLING = Array.from({ length: 12 }, (_, i) => ({ left: (i * 37 + 5) % 100, delay: i * 0.45, spin: (i % 2 ? 1 : -1) * (160 + i * 25), dur: 4.5 + (i % 4) }));

/**
 * Fim da partida na tela inteira: verde na vitória e vermelho na derrota, com raios girando, versos de carta caindo,
 * o resultado numa etiqueta que bate na mesa, o placar final de cada local e as ações em etiquetas.
 */
function EndScreen({ r, m, t, onAgain, onBoard, onDeck }: { r: Result; m: Match; t: T; onAgain: () => void; onBoard: () => void; onDeck: () => void }) {
  const tone = END_TONE[r.outcome];
  const title = r.outcome === "win" ? t.ui.win : r.outcome === "loss" ? t.ui.loss : t.ui.draw;
  return (
    <motion.div role="dialog" aria-modal="true" aria-labelledby="game-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
      className="fixed inset-0 z-80 flex items-center justify-center overflow-hidden p-4">
      <EndBackdrop tone={tone} />
      {/* versos de carta caindo e girando */}
      {FALLING.map((f, i) => (
        <motion.div key={i} aria-hidden="true" className="absolute top-0 w-14 opacity-80 sm:w-20" style={{ left: `${f.left}%` }}
          initial={{ y: "-30vh", rotate: 0, opacity: 0 }} animate={{ y: "125vh", rotate: f.spin, opacity: [0, 0.85, 0.85, 0] }}
          transition={{ duration: f.dur, delay: f.delay, repeat: Infinity, ease: "linear" }}>
          <CardBack />
        </motion.div>
      ))}
      <div className="relative flex max-w-3xl flex-col items-center gap-5 text-center sm:gap-6">
        <motion.h2 id="game-end" initial={{ scale: 2.6, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: "spring", stiffness: 240, damping: 13 }}
          className={`text-5xl font-extrabold tracking-wider uppercase [font-variant-caps:small-caps] sm:text-8xl ${tone.ink}`}>
          <TickTag tone="bg-dl-text" className="px-6 py-2 sm:px-12 sm:py-3">{title}</TickTag>
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-zinc-950/85 px-3 py-1.5 text-sm font-bold text-zinc-100 [clip-path:polygon(1%_0,100%_6%,99%_100%,0_94%)] sm:text-lg">
          {t.ui.summary(r.won, r.lost, r.myPower, r.aiPower)}{r.patron ? ` · ${t.ui.patron}` : ""}
        </motion.p>
        <ul className="flex flex-wrap justify-center gap-3">
          {m.loc.map((l, i) => {
            const a = m.total(l, "a"), p = m.total(l, "p");
            return (
              <motion.li key={l.L.id + i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + i * 0.12 }}
                className="flex min-w-28 flex-col items-center gap-1 bg-zinc-950/85 px-3 py-2 [clip-path:polygon(2%_4%,98%_0,100%_96%,0_100%)] sm:min-w-36">
                <span className={`text-xs font-extrabold tracking-wider uppercase sm:text-sm ${LANE[i % 3].ink}`}>{l.L.name}</span>
                <span className="flex items-baseline gap-2 text-2xl font-extrabold tabular-nums sm:text-3xl">
                  <span className={p > a ? "text-game-me" : "text-zinc-400"}>{p}</span>
                  <span className="text-base text-zinc-500">×</span>
                  <span className={a > p ? "text-game-ai" : "text-zinc-400"}>{a}</span>
                </span>
              </motion.li>
            );
          })}
        </ul>
        {/* ações paradas: sem tique e sem entrada animada */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- foco vai para a ação principal da tela que acabou de abrir */}
          <button type="button" autoFocus onClick={onAgain}
            className={`grid min-h-14 cursor-pointer place-items-center text-lg font-extrabold tracking-wider text-zinc-950 uppercase transition hover:brightness-110 active:scale-95 sm:text-xl ${focus}`}>
            <TickTag still tone="bg-dl-text" className="px-7 py-2.5">{t.ui.again}</TickTag>
          </button>
          <button type="button" onClick={onBoard}
            className={`grid min-h-11 cursor-pointer place-items-center text-sm font-extrabold tracking-wider text-zinc-100 uppercase transition hover:brightness-125 active:scale-95 ${focus}`}>
            <TickTag still tone="bg-zinc-950" className="px-4 py-2">{t.ui.viewBoard}</TickTag>
          </button>
          <button type="button" onClick={onDeck}
            className={`grid min-h-11 cursor-pointer place-items-center text-sm font-extrabold tracking-wider text-zinc-100 uppercase transition hover:brightness-125 active:scale-95 ${focus}`}>
            <TickTag still tone="bg-zinc-950" className="px-4 py-2">{t.deck.change}</TickTag>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
