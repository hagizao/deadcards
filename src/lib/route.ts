import { profileUrl } from "./profile";

/**
 * Endereços do site: cada aba tem o seu, e carta, time e perfil têm link próprio para compartilhar.
 * O Worker usa os mesmos padrões para montar a prévia (título e imagem) desses links.
 */
export const TAB_PATHS = {
  home: "/", teams: "/teams", tierlist: "/tierlist", collection: "/collection", redeem: "/redeem", compare: "/compare",
  profile: "/profile", art: "/art", settings: "/settings", editor: "/editor", feedback: "/feedback", privacy: "/privacy", terms: "/terms",
} as const;
export type RouteTab = keyof typeof TAB_PATHS;

export type Route = { tab: RouteTab; profile?: string; card?: string; team?: string };

const ID = "[\\w-]{1,64}";
export const CARD_RE = new RegExp(`^/c/(${ID})/?$`);
export const TEAM_RE = new RegExp(`^/t/(${ID})/?$`);
export const PROFILE_RE = /^\/u\/((?:@|%40)?[A-Za-z0-9._-]{1,64})\/?$/;

export const cardPath = (id: string) => `/c/${id}`;
export const teamPath = (id: string) => `/t/${id}`;

/** O endereço vira estado: carta abre por cima da Home, time abre na aba Times, endereço desconhecido cai na Home. */
export function parseRoute(path: string): Route {
  const card = CARD_RE.exec(path)?.[1];
  if (card) return { tab: "home", card };
  const team = TEAM_RE.exec(path)?.[1];
  if (team) return { tab: "teams", team };
  const profile = PROFILE_RE.exec(path)?.[1];
  if (profile) return { tab: "profile", profile: profile.replace("%40", "@") };
  const clean = path.replace(/\/+$/, "") || "/";
  const tab = (Object.keys(TAB_PATHS) as RouteTab[]).find((k) => TAB_PATHS[k] === clean && k !== "profile");
  return { tab: tab ?? "home" };
}

/** O estado vira endereço: a carta aberta ganha, depois o perfil e o time; senão, o da aba. */
export function routePath(r: Route): string {
  if (r.card) return cardPath(r.card);
  if (r.tab === "profile" && r.profile) return profileUrl(r.profile);
  if (r.tab === "teams" && r.team) return teamPath(r.team);
  return r.tab === "profile" ? "/" : TAB_PATHS[r.tab];
}
