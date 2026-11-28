import { profileUrl } from "./profile";

/**
 * Endereços do site: cada aba tem o seu, e carta, time e perfil têm link próprio para compartilhar.
 * O Worker usa os mesmos padrões para montar a prévia (título e imagem) desses links.
 */
export const TAB_PATHS = {
  home: "/", teams: "/teams", tierlist: "/tierlist", collection: "/collection", redeem: "/redeem", compare: "/lab",
  profile: "/profile", art: "/art", settings: "/settings", editor: "/editor", feedback: "/feedback", privacy: "/privacy", terms: "/terms",
} as const;
export type RouteTab = keyof typeof TAB_PATHS;

/** lab: a aba aberta dentro do Lab (sem ela, o Elenco dos sonhos); squad: as cartas do elenco de um link compartilhado. */
export type Route = { tab: RouteTab; profile?: string; card?: string; team?: string; lab?: "compare"; squad?: string };

const ID = "[\\w-]{1,64}";
export const CARD_RE = new RegExp(`^/c/(${ID})/?$`);
export const TEAM_RE = new RegExp(`^/t/(${ID})/?$`);
export const PROFILE_RE = /^\/u\/((?:@|%40)?[A-Za-z0-9._-]{1,64})\/?$/;
/** Elenco dos sonhos: /lab (ou /lab/elenco), e /lab/elenco/<id>.<id>... (até 6 cartas, ids separados por ponto) no link compartilhado. */
export const SQUAD_MAX = 6;
export const SQUAD_RE = new RegExp(`^/lab/elenco(?:/(${ID}(?:\\.${ID}){0,${SQUAD_MAX - 1}}))?/?$`);
/** O nome do elenco vai na query (?n=), curto. */
export const SQUAD_NAME_MAX = 40;
export const squadName = (raw: string | null | undefined) => (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SQUAD_NAME_MAX);

export const cardPath = (id: string) => `/c/${id}`;
export const teamPath = (key: string) => `/t/${key}`;
/** Link do elenco: as cartas na ordem das vagas (vagas vazias ficam de fora) e o nome na query. */
export function squadPath(ids: string[], name = ""): string {
  const list = ids.filter(Boolean).slice(0, SQUAD_MAX);
  const n = squadName(name);
  return `${list.length ? `/lab/elenco/${list.join(".")}` : "/lab"}${n ? `?n=${encodeURIComponent(n)}` : ""}`;
}

type TeamRef = { id: string; tag: string };
/** A sigla do time como aparece no link: minúscula, só letras e números (LEV → lev). */
export const teamSlug = (tag: string) => tag.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
const slugOwner = (teams: TeamRef[], slug: string) => {
  const same = slug ? teams.filter((t) => teamSlug(t.tag) === slug) : [];
  return same.length === 1 ? same[0] : undefined;
};
/** A chave do time no link: a sigla quando só ele tem essa sigla (vale para times novos também); senão, o id. */
export function teamKey(teams: TeamRef[], id: string): string {
  const team = teams.find((t) => t.id === id);
  return team && slugOwner(teams, teamSlug(team.tag)) === team ? teamSlug(team.tag) : id;
}
/** O time de um link: pelo id (links antigos e siglas repetidas) ou pela sigla. */
export function teamByKey<T extends TeamRef>(teams: T[], key: string): T | undefined {
  return teams.find((t) => t.id === key) ?? (slugOwner(teams, key.toLowerCase()) as T | undefined);
}

/** O endereço vira estado: carta abre por cima da Home, time abre na aba Times, endereço desconhecido cai na Home. */
export function parseRoute(path: string): Route {
  const card = CARD_RE.exec(path)?.[1];
  if (card) return { tab: "home", card };
  const team = TEAM_RE.exec(path)?.[1];
  if (team) return { tab: "teams", team };
  const profile = PROFILE_RE.exec(path)?.[1];
  if (profile) return { tab: "profile", profile: profile.replace("%40", "@") };
  const squad = SQUAD_RE.exec(path);
  if (squad) return squad[1] ? { tab: "compare", squad: squad[1] } : { tab: "compare" };
  const clean = path.replace(/\/+$/, "") || "/";
  const tab = (Object.keys(TAB_PATHS) as RouteTab[]).find((k) => TAB_PATHS[k] === clean && k !== "profile");
  // o Lab já se chamou Comparar: o endereço antigo continua abrindo o Comparar
  if (clean === "/lab/comparar" || clean === "/compare") return { tab: "compare", lab: "compare" };
  return { tab: tab ?? "home" };
}

/** O estado vira endereço: a carta aberta ganha, depois o perfil e o time; senão, o da aba. */
export function routePath(r: Route): string {
  if (r.card) return cardPath(r.card);
  if (r.tab === "profile" && r.profile) return profileUrl(r.profile);
  if (r.tab === "teams" && r.team) return teamPath(r.team);
  if (r.tab === "compare" && r.lab === "compare") return "/lab/comparar";
  if (r.tab === "compare" && r.squad) return `/lab/elenco/${r.squad}`;
  return r.tab === "profile" ? "/" : TAB_PATHS[r.tab];
}
