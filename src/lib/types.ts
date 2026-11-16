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

export type EdlMatch = { matchId: number; event: string; series: string; game?: number; teams?: string; startTime?: number };

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
