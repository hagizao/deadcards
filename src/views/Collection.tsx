import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useState } from "react";
import { useData } from "../lib/data";
import { getPlayerOvr, isMainCard, teamOf, useLabel } from "../lib/cards";
import { Card } from "../components/Card";
import { strings, useT } from "../lib/i18n";
import { easeOut, field, pageTitle, pill, primaryBtn } from "../lib/ui";
import { RedeemForm } from "./Redeem";
import { SignInOptions } from "./Login";

type Mode = "mine" | "all";
type SortKey = "ovr" | "name" | "MIR" | "MAC" | "SUP" | "MOV" | "POL" | "CON";
const PAGE = 24;

const S = strings({
  pt: {
    title: "Coleção",
    count: (n: number) => `${n} ${n === 1 ? "carta" : "cartas"}`,
    progress: (n: number, total: number) => `${n} de ${total} cartas na sua coleção`,
    mine: "Minha coleção",
    all: "Ver todas as cartas",
    view: "O que mostrar",
    signIn: "Entre para ver sua coleção e resgatar cartas com um código. Ou só veja todas as cartas.",
    empty: "Você ainda não tem cartas. Resgate um código acima ou veja todas as cartas.",
    noMatch: "Nenhuma carta com esses filtros.",
    loading: "Carregando sua coleção…",
    searchPlaceholder: "Buscar jogador, herói, time…",
    search: "Buscar",
    team: "Time",
    allTeams: "Todos os times",
    hero: "Herói",
    allHeroes: "Todos os heróis",
    role: "Role",
    allRoles: "Todas as roles",
    sort: "Ordenar",
    sortBy: (k: string) => `Ordenar: ${k}`,
    name: "Nome",
    allVersions: "Todas as versões",
    onlySpecial: "Só especiais",
    more: (n: number) => `Mostrar mais (${n})`,
  },
  en: {
    title: "Collection",
    count: (n: number) => `${n} ${n === 1 ? "card" : "cards"}`,
    progress: (n: number, total: number) => `${n} of ${total} cards in your collection`,
    mine: "My collection",
    all: "See all cards",
    view: "What to show",
    signIn: "Sign in to see your collection and redeem cards with a code. Or just browse all cards.",
    empty: "You don't have any cards yet. Redeem a code above or browse all cards.",
    noMatch: "No cards match these filters.",
    loading: "Loading your collection…",
    searchPlaceholder: "Search player, hero, team…",
    search: "Search",
    team: "Team",
    allTeams: "All teams",
    hero: "Hero",
    allHeroes: "All heroes",
    role: "Role",
    allRoles: "All roles",
    sort: "Sort",
    sortBy: (k: string) => `Sort: ${k}`,
    name: "Name",
    allVersions: "All versions",
    onlySpecial: "Specials only",
    more: (n: number) => `Show more (${n})`,
  },
  es: {
    title: "Colección",
    count: (n: number) => `${n} ${n === 1 ? "carta" : "cartas"}`,
    progress: (n: number, total: number) => `${n} de ${total} cartas en tu colección`,
    mine: "Mi colección",
    all: "Ver todas las cartas",
    view: "Qué mostrar",
    signIn: "Inicia sesión para ver tu colección y canjear cartas con un código. O solo mira todas las cartas.",
    empty: "Todavía no tienes cartas. Canjea un código arriba o mira todas las cartas.",
    noMatch: "Ninguna carta con esos filtros.",
    loading: "Cargando tu colección…",
    searchPlaceholder: "Buscar jugador, héroe, equipo…",
    search: "Buscar",
    team: "Equipo",
    allTeams: "Todos los equipos",
    hero: "Héroe",
    allHeroes: "Todos los héroes",
    role: "Rol",
    allRoles: "Todos los roles",
    sort: "Ordenar",
    sortBy: (k: string) => `Ordenar: ${k}`,
    name: "Nombre",
    allVersions: "Todas las versiones",
    onlySpecial: "Solo especiales",
    more: (n: number) => `Mostrar más (${n})`,
  },
});

export function Collection({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { teams, players, me } = useData();
  const [mode, setMode] = useState<Mode>("mine");
  // ids das cartas que a pessoa tem; null enquanto carrega
  const [owned, setOwned] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("ALL");
  const [hero, setHero] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("ovr");
  const [allVersions, setAllVersions] = useState(false);
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const query = useDeferredValue(q.trim().toLowerCase());

  useEffect(() => {
    if (!me) return;
    let live = true;
    fetch("/api/collection")
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .catch(() => [] as string[])
      .then((ids) => { if (live) setOwned(new Set(ids)); });
    return () => { live = false; };
  }, [me]);

  const mine = mode === "mine";
  const has = (id: string) => !!owned?.has(id);

  const heroes = [...new Set(players.map((p) => p.hero))].sort();
  const roles = [...new Set(players.map((p) => p.position))].sort();
  const list = players
    // na sua coleção entram todas as versões que você tem; em "todas", só a principal (ou todas, se marcar)
    .filter((p) => (mine ? has(p.id) && (!onlySpecial || p.special) : onlySpecial ? p.special : allVersions || isMainCard(p)) && (team === "ALL" || p.teamId === team) && (hero === "ALL" || p.hero === hero) && (role === "ALL" || p.position === role))
    .filter((p) => !query || `${p.name} ${p.hero} ${p.position} ${teamOf(teams, p).name}`.toLowerCase().includes(query))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "ovr" ? getPlayerOvr(b) - getPlayerOvr(a) : b.stats[sort] - a.stats[sort]));

  return (
    <section className="space-y-5">
      <div className="noir-glass space-y-4 rounded-2xl p-5 sm:p-7">
        <div>
          <h1 className={pageTitle}>{t.title}</h1>
          <p className="mt-1.5 text-xs text-zinc-400">{me && owned ? t.progress(owned.size, players.length) : (me || !mine) && t.count(list.length)}</p>
        </div>
        <div role="group" aria-label={t.view} className="flex flex-wrap gap-2">
          {(["mine", "all"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setLimit(PAGE); }} className={pill(mode === m)}>
              {t[m]}
            </button>
          ))}
        </div>
        {me ? <RedeemForm onRedeemed={(id) => setOwned((o) => new Set(o).add(id))} /> : mine && (
          <div className="flex max-w-sm flex-col gap-3">
            <p className="text-sm text-zinc-300">{t.signIn}</p>
            <SignInOptions />
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
          {!mine && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300 sm:min-h-9">
              <input type="checkbox" className="size-4 accent-zinc-100" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} />
              {t.allVersions}
            </label>
          )}
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
          {list.slice(0, limit).map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.2, ease: easeOut }}>
              {/* em "todas", a carta que você não tem fica em preto e branco; no destaque ela aparece normal */}
              <div className={me && !mine && !has(p.id) ? "opacity-80 grayscale transition hover:opacity-100" : undefined}>
                <Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
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
