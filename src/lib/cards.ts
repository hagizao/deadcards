import type { Player, Team, TierBand, HistoryPoint } from "./types";
import { strings, useT } from "./i18n";
import { getPlayerOvr, isAltHero, isMainCard } from "./cardKinds";

// regras de tipo de carta e OVR ficam sem React para o worker também usar
export { ALT_HERO_DROP, STAT_KEYS, calculateOVR, getPlayerOvr, isAltHero, isMainCard, isRetired } from "./cardKinds";

// Brasil deixou de ser região (os times foram para América do Sul); o rótulo e a classe dele ficam para dado antigo.
export const REGIONS = ["Europa", "América do Norte", "América do Sul", "Ásia", "Sem Time"];

// Os valores de REGIONS e position são chaves salvas no banco; só o rótulo exibido muda por idioma.
const LABELS = strings<Record<string, string>>({
  pt: {},
  en: { Europa: "Europe", "América do Norte": "North America", Brasil: "Brazil", "América do Sul": "South America", Ásia: "Asia", "Sem Time": "No Team", Suporte: "Support" },
  es: { "América do Norte": "América del Norte", Brasil: "Brasil", "América do Sul": "América del Sur", Ásia: "Asia", "Sem Time": "Sin equipo", Suporte: "Soporte" },
});

/** Rótulo traduzido de uma região (ou posição) salva; valor desconhecido volta como veio. */
export function useLabel(): (key: string) => string {
  const t = useT(LABELS);
  return (key) => t[key] ?? key;
}

export const DEFAULT_TIER_CONFIG: TierBand[] = [
  { key: "SS", min: 93, max: 99, bg: "#ff7f7f", text: "#18181b" },
  { key: "S", min: 88, max: 92, bg: "#ffbf7f", text: "#18181b" },
  { key: "A", min: 83, max: 87, bg: "#ffdf7f", text: "#18181b" },
  { key: "B", min: 77, max: 82, bg: "#ffff7f", text: "#18181b" },
  { key: "C", min: 70, max: 76, bg: "#bfff7f", text: "#18181b" },
  { key: "D", min: 1, max: 69, bg: "#7fff7f", text: "#18181b" },
];

export const POSITIONS = ["Carry", "OffCarry", "Frontline", "Flex", "Suporte"];


function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getPlayerHistory(p: Player): HistoryPoint[] {
  const cur = getPlayerOvr(p);
  const raw = p.history?.length
    ? p.history.map((h) => ({ date: h.date || today(), ovr: Number(h.ovr) || cur, base: !!h.base }))
    : [{ date: today(), ovr: cur }];
  raw.sort((a, b) => a.date.localeCompare(b.date));
  raw[raw.length - 1].ovr = cur;
  return raw;
}

export function getPlayerTrend(p: Player): number {
  const h = getPlayerHistory(p);
  if (h.length < 2) return 0;
  const last = h[h.length - 1];
  return last.base ? 0 : last.ovr - h[h.length - 2].ovr;
}

export function isRosterCard(players: Player[], p: Player): boolean {
  // herói jogado é a mesma pessoa com outro herói: nunca entra no elenco nem na média do time
  if (p.inactive || isAltHero(p)) return false;
  // Versão no mesmo time da carta principal é o mesmo jogador: fica fora do elenco e da média do time.
  return isMainCard(p) || !players.some((m) => m.id === p.variantOf && m.teamId === p.teamId);
}

export function cardVersions(players: Player[], p: Player): Player[] {
  const main = isMainCard(p) ? p.id : p.variantOf!;
  return players.filter((c) => c.id === main || c.variantOf === main).sort((a, b) => Number(!isMainCard(a)) - Number(!isMainCard(b)));
}

export function activeRoster(players: Player[], teamId: string): Player[] {
  return players.filter((p) => p.teamId === teamId && isRosterCard(players, p));
}

export function teamOvr(players: Player[], teamId: string) {
  const roster = activeRoster(players, teamId);
  if (!roster.length) return { exact: 0, rounded: 0, count: 0 };
  const exact = roster.reduce((a, p) => a + getPlayerOvr(p), 0) / roster.length;
  return { exact, rounded: Math.round(exact), count: roster.length };
}

export function teamHistory(players: Player[], teamId: string) {
  const roster = activeRoster(players, teamId);
  if (!roster.length) return [];
  const hists = roster.map(getPlayerHistory);
  const dates = [...new Set(hists.flat().map((h) => h.date))].sort();
  return dates.map((date) => {
    const sum = hists.reduce((acc, h) => {
      let v = h[0].ovr;
      for (const pt of h) if (pt.date <= date) v = pt.ovr;
      return acc + v;
    }, 0);
    return { date, ovr: Math.round(sum / roster.length) };
  });
}

export function teamTrend(players: Player[], teamId: string): number {
  const h = teamHistory(players, teamId);
  return h.length < 2 ? 0 : h[h.length - 1].ovr - h[h.length - 2].ovr;
}

export function tierKeyForOvr(ovr: number, cfg: TierBand[]): string {
  const hit = cfg.find((t) => ovr >= t.min && ovr <= t.max);
  if (hit) return hit.key;
  const sorted = [...cfg].sort((a, b) => b.min - a.min);
  return (sorted.find((t) => ovr >= t.min) ?? sorted[sorted.length - 1]).key;
}

export function regionClass(region: string): string {
  const n = String(region || "Europa").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
  if (n === "europa") return "team-region-europa";
  if (n === "na" || n === "americadonorte") return "team-region-na";
  if (n === "brasil") return "team-region-brasil";
  if (n === "americasul" || n === "americadosul") return "team-region-americasul";
  if (n === "semtime") return "team-region-semtime";
  return "team-region-asia";
}

export function hexToRgba(hex: string, alpha = 1): string {
  let c = String(hex || "#18181b").replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}$/i.test(c)) return `rgba(24, 24, 27, ${alpha})`;
  return `rgba(${parseInt(c.slice(0, 2), 16)}, ${parseInt(c.slice(2, 4), 16)}, ${parseInt(c.slice(4, 6), 16)}, ${alpha})`;
}

export function teamOf(teams: Team[], p: Player): Team {
  return teams.find((t) => t.id === p.teamId) ?? { id: "", name: "Sem Time", tag: "FA", region: "Sem Time" };
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}
