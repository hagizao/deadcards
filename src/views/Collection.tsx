import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useState } from "react";
import { useData } from "../lib/data";
import { getPlayerOvr, isAltHero, isMainCard, isRetired, teamOf, useLabel } from "../lib/cards";
import { Card } from "../components/Card";
import { strings, useT } from "../lib/i18n";
import { easeOut, field, pageTitle, pill, primaryBtn } from "../lib/ui";
import { useMyCards } from "../lib/myCards";
import { SignInOptions } from "./Login";
import { Icon } from "../components/Icon";
import { cascade, useSettled } from "../lib/motion";

type Mode = "mine" | "all";
type HeroMode = "signature" | "every";
type SortKey = "ovr" | "name" | "MIR" | "MAC" | "SUP" | "MOV" | "POL" | "CON";
const PAGE = 30;

const S = strings({
  pt: {
    count: (n: number) => `${n} ${n === 1 ? "carta" : "cartas"}`,
    progress: (n: number, total: number) => `Assinatura: ${n} de ${total}`,
    progressAlt: (n: number, total: number) => `Outras versões: ${n} de ${total}`,
    heroMode: "Quais heróis",
    signature: "Só herói de assinatura",
    every: "Todos os heróis",
    mine: "Minha coleção",
    all: "Ver todas as cartas", allTitle: "Todas as cartas",
    signIn: "Entre para guardar as cartas que você resgata nas lives e montar a sua coleção.",
    empty: "Você ainda não tem cartas. Resgate um código na aba Resgatar ou veja todas as cartas.",
    noMatch: "Nenhuma carta com esses filtros.",
    loading: "Carregando sua coleção…",
    searchPlaceholder: "Buscar jogador, herói, time…",
    search: "Buscar",
    team: "Time",
    allTeams: "Todos os times",
    hero: "Herói",
    allHeroes: "Qualquer herói",
    role: "Role",
    allRoles: "Todas as roles",
    sort: "Ordenar",
    sortBy: (k: string) => `Ordenar: ${k}`,
    name: "Nome",
    onlySpecial: "Só especiais",
    more: (n: number) => `Mostrar mais (${n})`,
  },
  en: {
    count: (n: number) => `${n} ${n === 1 ? "card" : "cards"}`,
    progress: (n: number, total: number) => `Signature: ${n} of ${total}`,
    progressAlt: (n: number, total: number) => `Other versions: ${n} of ${total}`,
    heroMode: "Which heroes",
    signature: "Signature hero only",
    every: "All heroes",
    mine: "My collection",
    all: "See all cards", allTitle: "All cards",
    signIn: "Sign in to keep the cards you redeem on stream and build your collection.",
    empty: "You don't have any cards yet. Redeem a code in the Redeem tab or browse all cards.",
    noMatch: "No cards match these filters.",
    loading: "Loading your collection…",
    searchPlaceholder: "Search player, hero, team…",
    search: "Search",
    team: "Team",
    allTeams: "All teams",
    hero: "Hero",
    allHeroes: "Any hero",
    role: "Role",
    allRoles: "All roles",
    sort: "Sort",
    sortBy: (k: string) => `Sort: ${k}`,
    name: "Name",
    onlySpecial: "Specials only",
    more: (n: number) => `Show more (${n})`,
  },
  es: {
    count: (n: number) => `${n} ${n === 1 ? "carta" : "cartas"}`,
    progress: (n: number, total: number) => `Firma: ${n} de ${total}`,
    progressAlt: (n: number, total: number) => `Otras versiones: ${n} de ${total}`,
    heroMode: "Qué héroes",
    signature: "Solo héroe de firma",
    every: "Todos los héroes",
    mine: "Mi colección",
    all: "Ver todas las cartas", allTitle: "Todas las cartas",
    signIn: "Inicia sesión para guardar las cartas que canjeas en los directos y armar tu colección.",
    empty: "Todavía no tienes cartas. Canjea un código en la pestaña Canjear o mira todas las cartas.",
    noMatch: "Ninguna carta con esos filtros.",
    loading: "Cargando tu colección…",
    searchPlaceholder: "Buscar jugador, héroe, equipo…",
    search: "Buscar",
    team: "Equipo",
    allTeams: "Todos los equipos",
    hero: "Héroe",
    allHeroes: "Cualquier héroe",
    role: "Rol",
    allRoles: "Todos los roles",
    sort: "Ordenar",
    sortBy: (k: string) => `Ordenar: ${k}`,
    name: "Nombre",
    onlySpecial: "Solo especiales",
    more: (n: number) => `Mostrar más (${n})`,
  },
});

export function Collection({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { teams, players, me } = useData();
  const [mode, setMode] = useState<Mode>("mine");
  const settled = useSettled();
  const [heroMode, setHeroMode] = useState<HeroMode>("every");
  // ids das cartas que a pessoa tem; null enquanto carrega
  const { owned } = useMyCards();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("ALL");
  const [hero, setHero] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("ovr");
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const query = useDeferredValue(q.trim().toLowerCase());

  const mine = mode === "mine";
  const has = (id: string) => !!owned?.has(id);

  // herói jogado aposentado só aparece para quem tem a carta
  const cards = players.filter((p) => !isRetired(p) || has(p.id));
  const heroes = [...new Set(cards.map((p) => p.hero))].sort();
  const roles = [...new Set(cards.map((p) => p.position))].sort();
  const every = heroMode === "every";
  // jogadores com cartas de heróis jogados: a principal ganha a tag de assinatura quando elas aparecem junto
  const withAlts = new Set(cards.filter(isAltHero).map((p) => p.variantOf!));
  const signatures = cards.filter(isMainCard);
  const alts = cards.filter((p) => !isMainCard(p));
  const list = cards
    // "só assinatura": a carta principal de cada jogador; "todos os heróis": também heróis jogados, especiais e outras versões
    .filter((p) => (!mine || has(p.id)) && (onlySpecial ? p.special : every || isMainCard(p)) && (team === "ALL" || p.teamId === team) && (hero === "ALL" || p.hero === hero) && (role === "ALL" || p.position === role))
    .filter((p) => !query || `${p.name} ${p.hero} ${p.position} ${teamOf(teams, p).name}`.toLowerCase().includes(query))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "ovr" ? getPlayerOvr(b) - getPlayerOvr(a) : b.stats[sort] - a.stats[sort]));

  return (
    <section className="space-y-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={pageTitle}>{mine ? t.mine : t.allTitle}</h1>
            <p className="mt-1.5 text-xs text-zinc-400">
              {me && owned
                ? <>{t.progress(signatures.filter((p) => owned.has(p.id)).length, signatures.length)}{alts.length > 0 && <> · {t.progressAlt(alts.filter((p) => owned.has(p.id)).length, alts.length)}</>}</>
                : (me || !mine) && t.count(list.length)}
            </p>
          </div>
          {/* ver todas as cartas: à direita, marcado quando ligado; desligado volta para a sua coleção */}
          <button type="button" aria-pressed={!mine} onClick={() => { setMode(mine ? "all" : "mine"); setLimit(PAGE); }}
            className={pill(!mine)}>
            <Icon name="cards" className="size-4" />
            {t.all}
          </button>
        </div>
        {alts.length > 0 && (me || !mine) && (
          <div role="group" aria-label={t.heroMode} className="flex flex-wrap gap-2">
            {/* "todos os heróis" primeiro, à esquerda */}
            {(["every", "signature"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={heroMode === m} onClick={() => { setHeroMode(m); setLimit(PAGE); }} className={pill(heroMode === m)}>
                {t[m]}
              </button>
            ))}
          </div>
        )}
        {!me && mine && (
          <div className="flex max-w-sm flex-col gap-3">
            <p className="text-sm text-zinc-300">{t.signIn}</p>
            <SignInOptions />
            {/* sem login, ver todas as cartas fica junto das opções de entrar */}
            <button type="button" onClick={() => { setMode("all"); setLimit(PAGE); }} className={`${pill(false)} self-start`}>
              <Icon name="cards" className="size-4" />
              {t.all}
            </button>
          </div>
        )}
        {(me || !mine) && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t.searchPlaceholder} aria-label={t.search} className={`${field} w-60`} />
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t.team} className={field}>
            <option value="ALL">{t.allTeams}</option>
            {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
          <select value={hero} onChange={(e) => setHero(e.target.value)} aria-label={t.hero} className={field}>
            <option value="ALL">{t.allHeroes}</option>
            {heroes.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t.role} className={field}>
            <option value="ALL">{t.allRoles}</option>
            {roles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t.sort} className={field}>
            <option value="ovr">{t.sortBy("OVR")}</option>
            <option value="name">{t.sortBy(t.name)}</option>
            {(["MIR", "MAC", "SUP", "MOV", "POL", "CON"] as const).map((k) => <option key={k} value={k}>{t.sortBy(k)}</option>)}
          </select>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300 sm:min-h-9">
            <input type="checkbox" className="size-4 accent-amber-300" checked={onlySpecial} onChange={(e) => { setOnlySpecial(e.target.checked); setLimit(PAGE); }} />
            {t.onlySpecial}
          </label>
        </div>
        )}
      </div>

      {mine && me && !owned && <p role="status" className="text-center text-sm text-zinc-400">{t.loading}</p>}
      {mine && me && owned && !list.length && (
        <p className="text-center text-sm text-zinc-400">{owned.size ? t.noMatch : t.empty}</p>
      )}
      {!mine && !list.length && <p className="text-center text-sm text-zinc-400">{t.noMatch}</p>}

      {(me || !mine) && (
      <motion.div layout className="flex flex-wrap justify-center gap-6 sm:justify-start">
        <AnimatePresence mode="popLayout">
          {list.slice(0, limit).map((p, i) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.92, y: settled ? 0 : 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: settled ? 0.2 : 0.35, ease: easeOut, delay: settled ? 0 : cascade(i) }}>
              {/* em "todas", a carta que você não tem fica em preto e branco; no destaque ela aparece normal */}
              <div className={me && !mine && !has(p.id) ? "opacity-80 grayscale transition hover:opacity-100" : undefined}>
                <Card player={p} variant="medium" signature={every && isMainCard(p) && withAlts.has(p.id)} onOpen={() => onOpenCard(p.id)} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      )}
      {list.length > limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={primaryBtn}>
            {t.more(list.length - limit)}
          </button>
        </div>
      )}
    </section>
  );
}
