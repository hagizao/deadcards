export type Stats = { MIR: number; MAC: number; SUP: number; MOV: number; POL: number; CON: number };

export type HistoryPoint = { date: string; ovr: number; base?: boolean; note?: string };

export type Frame = { style: string; c1?: string; c2?: string; pad?: number };

export type BgSettings = {
  enabled?: boolean;
  color: string;
  imageUrl?: string;
  imageOpacity: number;
  overlayOpacity: number;
  blur: number;
  size: string;
};

export type Team = {
  id: string;
  name: string;
  tag: string;
  region: string;
  logo?: string;
  bg?: BgSettings;
  /** Slug do time no edl.gg (ex.: "dog6"); ausente = não ligado. */
  edlSlug?: string;
};

export type Player = {
  id: string;
  teamId: string;
  name: string;
  position: string;
  hero: string;
  stats: Stats;
  ovr?: number;
  c1: string;
  c2: string;
  history: HistoryPoint[];
  footer?: string;
  footerSize?: number;
  footerColor?: string;
  special?: boolean;
  specialText?: string;
  frame?: Frame;
  variantOf?: string;
  inactive?: boolean;
  art?: { url: string; zoom?: number; x?: number; y?: number };
  /** SteamID3 (account_id da deadlock-api); só na carta base, variantes herdam pelo variantOf. */
  accountId?: number;
};

export type MatchSource = "edl" | "pub";

export type PlayerMatch = {
  matchId: number;
  source: MatchSource;
  event?: string;
  series?: string;
  heroId: number;
  startTime: number;
  durationS: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  won: boolean;
};

export type MatchLookupPlayer = {
  accountId: number;
  team: number;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  name?: string;
  avatar?: string;
};

export type MatchLookup = { matchId: number; startTime: number; durationS: number; winningTeam: number; players: MatchLookupPlayer[] };

/** Outra carta do mesmo jogador que pode receber o accountId da carta atual (backfill manual). */
export type BackfillCandidate = {
  playerId: string;
  name: string;
  teamId: string;
  inactive?: boolean;
  /** accountId atual da carta; se for diferente do da carta de origem é conflito e não pode ser marcada. */
  accountId?: number;
  /** variant: tem variantOf apontando para a carta; name: mesmo nome (sem diferenciar maiúsculas/espaços). */
  by: "variant" | "name";
};

export type BackfillResult = { updated: string[]; skipped: { item: string; reason: string }[] };

export type EdlTeam = { slug: string; name: string; tag?: string; region?: string; countryCode?: string; logoUrl?: string };

export type EdlTeamField = "name" | "tag" | "logo" | "region";

/** Um jogador do elenco do EDL e o que fazer com ele. */
export type EdlRosterEntry = {
  slug: string;
  alias: string;
  countryCode?: string;
  /** account_id descoberto cruzando as séries do time com o metadata; ausente = ainda não resolvido. */
  accountId?: number;
  heroIds: number[];
  /** Carta existente encontrada (primeiro por accountId, depois por nome). */
  card?: { playerId: string; name: string; teamId: string; accountId?: number; by: "account" | "name" };
  /** link: vincular a carta; create: não há carta; linked: já vinculada a esse account; relink: carta do time com o mesmo nome tem OUTRO account (provável troca de conta; card.accountId é o antigo); conflict: account usado em carta de outro jogador; unresolved: sem accountId. */
  action: "link" | "create" | "linked" | "relink" | "conflict" | "unresolved";
  /** Só em relink: quantas partidas guardadas a conta antiga tem, para o admin comparar. */
  oldMatches?: number;
  reason?: string;
};

export type EdlImportPreview = {
  team: EdlTeam;
  /** Só os campos que mudariam: valor atual -> valor do EDL. */
  fields: { key: EdlTeamField; current?: string; edl: string }[];
  roster: EdlRosterEntry[];
  /** Cartas base ativas do time que não batem com ninguém do elenco do EDL (nem por account nem por nome). */
  leavers: { playerId: string; name: string; accountId?: number }[];
  /** Times com região "Sem Time", destino de quem saiu; vazio = não dá para mover. */
  freeAgentTeams: { id: string; name: string; tag: string }[];
};

export type EdlImportApply = {
  fields: EdlTeamField[];
  link: { playerId: string; accountId: number }[];
  create: { slug: string }[];
  /** Trocar o account de uma carta do time (troca de conta). */
  relink: { playerId: string; accountId: number }[];
  /** Mover cartas que saíram para um time com região "Sem Time". */
  release: { playerId: string; teamId: string }[];
};

export type EdlImportResult = {
  applied: { fields: EdlTeamField[]; linked: string[]; created: string[]; relinked: string[]; released: string[] };
  skipped: { item: string; reason: string }[];
};

export type EdlTeamSeries = {
  event: string;
  series: string;
  opponent: { name: string; tag?: string; logoUrl?: string };
  score: [number, number];
  won: boolean;
  startTime?: number;
  games: { matchId: number; game: number; won: boolean }[];
};

export type EdlMatch = { matchId: number; event: string; series: string; game?: number; teams?: string; startTime?: number };

// Estado do sync em lotes; `paused` lista as rotas externas em pausa por limite de requisições (until = unix s).
export type SyncStatus = {
  lastRunAt?: number;
  accounts: number;
  staleAccounts: number;
  pendingEdlMatches: number;
  scannedEvents: number;
  paused: { route: string; until: number }[];
};

export type HeroArt = { name: string; url: string; zoom: number; x: number; y: number };

export type TierBand = { key: string; min: number; max: number; bg: string; text: string };

export type Settings = {
  tierConfig?: TierBand[];
  bg?: BgSettings;
  homeHero?: string;
};

export type AppData = {
  teams: Team[];
  players: Player[];
  heroes: Record<string, HeroArt>;
  settings: Settings;
};
