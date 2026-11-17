import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { GameCard } from "./GameCard";
import { useData } from "../lib/data";
import { useT } from "../lib/i18n";
import { field, pill, primaryBtn } from "../lib/ui";
import { ALT_MALUS, ALT_POL, cardStats, type GameConfig, type PoolCard } from "../lib/game/config";
import { DECK_SIZE } from "../lib/game/engine";
import { fillDeck, loadDeck, saveDeck, versionPlayer } from "../lib/game/deck";
import { GAME_TEXT } from "../lib/game/text";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dl-text";
const COSTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Tela antes da partida: 12 jogadores, uma versão de cada. O deck fica salvo no navegador. */
export function DeckBuilder({ versions, cfg, onPlay }: { versions: Map<string, PoolCard[]>; cfg: GameConfig; onPlay: (deck: PoolCard[]) => void }) {
  const t = useT(GAME_TEXT);
  const { players, heroIcon } = useData();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [deck, setDeck] = useState(() => loadDeck(versions));
  // versão mostrada de quem ainda não está no deck
  const [shown, setShown] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  useEffect(() => saveDeck(deck), [deck]);

  const stats = (c: PoolCard) => cardStats(c, cfg.cards, cfg.heroes);
  const inDeck = new Map(deck.map((c) => [c.key, c]));
  const full = deck.length >= DECK_SIZE;
  const avg = deck.length ? Math.round(deck.reduce((a, c) => a + c.ovr, 0) / deck.length) : 0;
  const curve = COSTS.map((n) => deck.filter((c) => Math.min(8, Math.max(1, stats(c).cost)) === n).length);
  const peak = Math.max(1, ...curve);
  const list = [...versions.values()]
    .filter((l) => l[0].name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b[0].ovr - a[0].ovr || a[0].name.localeCompare(b[0].name));

  const current = (l: PoolCard[]) => inDeck.get(l[0].key) ?? l.find((c) => c.id === shown[l[0].key]) ?? l[0];
  const toggle = (c: PoolCard) => setDeck((d) => (d.some((x) => x.key === c.key) ? d.filter((x) => x.key !== c.key) : d.length < DECK_SIZE ? [...d, c] : d));
  const choose = (c: PoolCard) => {
    setShown((s) => ({ ...s, [c.key]: c.id }));
    setDeck((d) => d.map((x) => (x.key === c.key ? c : x)));
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-dl-text">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-extrabold tracking-[0.11em] uppercase sm:text-2xl">{t.deck.title}</h1>
        <p className="text-sm text-zinc-300">{t.deck.hint} {t.deck.aiNote}</p>
      </header>

      <div className="noir-glass sticky top-2 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl p-3">
        <div className="flex flex-col">
          <span className="font-display text-lg font-extrabold" aria-live="polite">{t.deck.count(deck.length, DECK_SIZE)}</span>
          <span className="text-xs text-zinc-400">{deck.length ? t.deck.avg(avg) : " "}</span>
        </div>
        <figure className="flex flex-col gap-1" aria-label={`${t.deck.curve}: ${COSTS.map((n, i) => `${n}: ${curve[i]}`).join(", ")}`}>
          <div className="flex h-8 items-end gap-1" aria-hidden="true">
            {curve.map((n, i) => (
              <span key={COSTS[i]} className="w-3 rounded-sm bg-game-me/70 transition-[height] duration-200" style={{ height: `${Math.max(8, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />
            ))}
          </div>
          <figcaption className="flex gap-1 text-[10px] text-zinc-500" aria-hidden="true">
            {COSTS.map((n) => <span key={n} className="w-3 text-center">{n === 8 ? "8+" : n}</span>)}
          </figcaption>
        </figure>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-zinc-400">
          <span className="sr-only">{t.deck.search}</span>
          <input type="search" className={field} placeholder={t.deck.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={full} onClick={() => setDeck((d) => fillDeck(d, versions))}>{t.deck.random}</button>
          <button type="button" className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!deck.length} onClick={() => setDeck([])}>{t.deck.clear}</button>
          <button type="button" className={primaryBtn} disabled={!full} onClick={() => onPlay(deck)}>{t.deck.play}</button>
        </div>
      </div>

      {list.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
          {list.map((l) => {
            const c = current(l);
            const on = inDeck.has(c.key);
            const s = stats(c);
            return (
              <li key={c.key} className="flex flex-col gap-1.5">
                <motion.button type="button" onClick={() => toggle(c)} aria-pressed={on} aria-label={t.deck.add(t.deck.version(c.name, c.hero))}
                  disabled={!on && full} title={!on && full ? t.deck.full(DECK_SIZE) : undefined} whileTap={{ scale: 0.96 }}
                  className={`relative cursor-pointer rounded-xl transition-[filter,opacity] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${on ? "" : "opacity-80"}`}>
                  <GameCard player={versionPlayer(byId, c)} name={c.name} cost={s.cost} power={s.power} base={s.power} text={null}
                    className={`rounded-xl ${on ? "ring-3 ring-game-me" : ""}`} />
                  {on && <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-game-me text-sm font-black text-dl-black" aria-hidden="true">✓</span>}
                </motion.button>
                {c.alt && <span className="text-center text-[10px] leading-tight text-zinc-400">{(c.stats?.POL ?? 0) >= ALT_POL ? t.deck.altPro : t.deck.alt(ALT_MALUS)}</span>}
                {l.length > 1 && (
                  <div role="group" aria-label={`${t.deck.versions}: ${c.name}`} className="flex flex-wrap justify-center gap-1">
                    {l.map((v) => {
                      const icon = heroIcon(v.hero);
                      return (
                        <button key={v.id} type="button" onClick={() => choose(v)} aria-pressed={v.id === c.id} title={t.deck.version(v.name, v.hero)} aria-label={t.deck.version(v.name, v.hero)}
                          className={`size-11 cursor-pointer overflow-hidden rounded-md bg-zinc-900 transition hover:brightness-125 active:scale-95 sm:size-8 ${focus} ${v.id === c.id ? "ring-2 ring-dl-text" : "opacity-60"}`}>
                          {icon ? <img src={icon} alt="" className="size-full object-cover" loading="lazy" /> : <span className="text-[9px]">{v.hero.slice(0, 3)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-zinc-400">{t.deck.empty}</p>}
    </div>
  );
}
