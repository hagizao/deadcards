import type { GameConfig } from "./game/config";

export type Stats ={ MIR: number; MAC: number; SUP: number; MOV: number; POL: number; CON: number };

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
  /** Heróis de afinidade: outras versões que o jogador pode usar no deck do jogo. */
  heroPool?: string[];
  art?: { url: string; zoom?: number; x?: number; y?: number; credit?: ArtCredit };
};

export type ArtCredit = { name: string; url?: string };

export type HeroArt = { name: string; url: string; zoom: number; x: number; y: number };

export type TierBand = { key: string; min: number; max: number; bg: string; text: string };

export type Settings = {
  tierConfig?: TierBand[];
  bg?: BgSettings;
  homeHero?: string;
  /** Foto de fundo do salão do Cardslock Game (lobby, oficina e draft); sem ela, o bar desenhado. */
  gameBg?: string;
  game?: GameConfig;
};

export type AppData = {
  teams: Team[];
  players: Player[];
  heroes: Record<string, HeroArt>;
  settings: Settings;
};
