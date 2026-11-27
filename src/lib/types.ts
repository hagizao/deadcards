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
  /** Versão do mesmo jogador com outro herói que ele joga (a principal é o herói de assinatura). */
  altHero?: boolean;
  inactive?: boolean;
  /** Carta exclusiva: nunca sai em pack (só por código ou outro meio). */
  exclusive?: boolean;
  art?: ArtLayer & { credit?: ArtCredit; fg?: ArtLayer };
};

export type ArtLayer = { url: string; zoom?: number; x?: number; y?: number };

export type ArtCredit = { name: string; url?: string };

export type HeroArt = { name: string; url: string; zoom: number; x: number; y: number };

export type TierBand = { key: string; min: number; max: number; bg: string; text: string };

export const HOME_FEATURED_MAX = 5;

/** Campeonato do calendário da Home: nome, descrição curta (o balão do hover) e logo. */
export type Tournament = { id: string; name: string; description: string; logo?: string; url?: string };
/** Um dia de campeonato: startsAt em segundos UTC; label diferencia edições ("67 EU"). */
export type ScheduleEntry = { id: string; tournamentId: string; startsAt: number; label: string };
export const TOURNAMENT_NAME_MAX = 60;
export const TOURNAMENT_DESC_MAX = 280;
export const SCHEDULE_LABEL_MAX = 24;

export type Settings = {
  tierConfig?: TierBand[];
  bg?: BgSettings;
  homeHero?: string;
  homeFeatured?: string[];
  /** Carta usada em "Como ler uma carta" na Home; sem escolha, a primeira em destaque. */
  homeGuide?: string;
};

export type AppData = {
  teams: Team[];
  players: Player[];
  heroes: Record<string, HeroArt>;
  settings: Settings;
  tournaments: Tournament[];
  schedule: ScheduleEntry[];
};
