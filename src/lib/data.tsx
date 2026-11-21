import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData, HeroArt } from "./types";
import { DEFAULT_TIER_CONFIG } from "./cards";
import { strings, useT } from "./i18n";

type ApiHero = { name: string; player_selectable?: boolean; images?: { icon_hero_card_webp?: string; icon_image_small_webp?: string } };

export type Me = { id: string; handle: string | null; providers: string[]; name: string; image: string | null; admin: boolean } | null;

type Ctx = AppData & {
  heroNames: string[];
  heroArt: (name: string) => HeroArt | null;
  heroIcon: (name: string) => string | null;
  me: Me;
  reload: () => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);

const S = strings({
  pt: { loadFail: "Falha ao carregar dados", loading: "Carregando…" },
  en: { loadFail: "Failed to load data", loading: "Loading…" },
  es: { loadFail: "Error al cargar los datos", loading: "Cargando…" },
});

export async function call(path: string, init: RequestInit) {
  const r = await fetch(path, init);
  const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string; url?: string; playerId?: string };
  if (!r.ok) throw Object.assign(new Error(body.error ?? `HTTP ${r.status}`), { code: body.code });
  return body;
}

export const api = {
  save: (kind: "players" | "teams" | "heroes" | "settings", id: string, body: unknown) =>
    call(`/api/${kind}/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  remove: (kind: "players" | "teams" | "heroes", id: string) => call(`/api/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createCode: (body: { code: string; playerId: string; maxUses: number; startsAt: number | null; expiresAt: number | null }) =>
    call("/api/codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  removeCode: (code: string) => call(`/api/codes/${encodeURIComponent(code)}`, { method: "DELETE" }),
  upload: async (folder: "players" | "teams" | "heroes" | "bg" | "home" | "sounds", file: File) =>
    (await call(`/api/upload/${folder}`, { method: "POST", headers: { "content-type": file.type }, body: file })).url!,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const t = useT(S);
  const [data, setData] = useState<AppData | null>(null);
  const [apiHeroes, setApiHeroes] = useState<ApiHero[]>([]);
  const [me, setMe] = useState<Me>(null);
  const [error, setError] = useState("");

  const reload = () =>
    fetch("/api/data")
      .then((r) => (r.ok ? (r.json() as Promise<AppData>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
    fetch("/api/me").then((r) => (r.ok ? (r.json() as Promise<Me>) : null)).then(setMe).catch(() => setMe(null));
    fetch("/api/deadlock?path=/v1/assets/heroes")
      .then((r) => (r.ok ? (r.json() as Promise<ApiHero[]>) : []))
      .then((list) => setApiHeroes(list.filter((h) => h.player_selectable !== false)))
      .catch(() => setApiHeroes([]));
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const byName = new Map(apiHeroes.map((h) => [h.name.toLowerCase(), h]));
    const settings = { ...data.settings, tierConfig: data.settings.tierConfig?.length ? data.settings.tierConfig : DEFAULT_TIER_CONFIG };
    return {
      ...data,
      settings,
      heroNames: [...new Set([...apiHeroes.map((h) => h.name), ...Object.keys(data.heroes)])].sort(),
      heroArt: (name) => {
        const own = data.heroes[name];
        if (own) return own;
        const url = byName.get(name.toLowerCase())?.images?.icon_hero_card_webp;
        return url ? { name, url, zoom: 100, x: 50, y: 20 } : null;
      },
      heroIcon: (name) => byName.get(name.toLowerCase())?.images?.icon_image_small_webp ?? null,
      me,
      reload,
    };
  }, [data, apiHeroes, me]);

  if (error) return <div className="flex min-h-dvh items-center justify-center text-sm text-red-300">{t.loadFail}: {error}</div>;
  if (!value) return <div className="flex min-h-dvh items-center justify-center text-xs tracking-[0.3em] text-zinc-400 uppercase">{t.loading}</div>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}
