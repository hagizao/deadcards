import { motion } from "motion/react";
import { useDeferredValue, useEffect, useState } from "react";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { RailArrows } from "./Rail";
import { useRail } from "../lib/rail";
import { isRetired, teamOf } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { artistCardPath, artistLikesPath, artistPath, type ArtistAdmin, type ArtistInfo } from "../lib/artists";
import type { Player } from "../lib/types";
import { field, pill } from "../lib/ui";

const S = strings({
  pt: {
    artist: "Artista", lead: (name: string) => `Cartas com a arte de ${name}`, cards: (n: number) => (n === 1 ? "1 carta" : `${n} cartas`),
    likes: (n: number) => (n === 1 ? "1 curtida" : `${n.toLocaleString("pt-BR")} curtidas`), portfolio: "Portfólio", empty: "As cartas com a arte desta pessoa aparecem aqui.",
    admin: "Admin · Artista", mark: "Marcar como artista", marked: "É artista", linked: "Cartas com a arte desta pessoa", none: "Nenhuma carta vinculada.",
    unlink: "Desvincular", link: "Vincular", search: "Buscar carta especial para vincular", searchPlaceholder: "Jogador, herói, time ou artista…",
    linkHint: "Vincular dá a carta para a pessoa e faz o Arte por da carta levar a este perfil.", artBy: "Arte por", failed: "Não foi possível salvar. Tente de novo.",
    retired: "fora de circulação", prev: "Cartas anteriores", next: "Próximas cartas",
  },
  en: {
    artist: "Artist", lead: (name: string) => `Cards with art by ${name}`, cards: (n: number) => (n === 1 ? "1 card" : `${n} cards`),
    likes: (n: number) => (n === 1 ? "1 like" : `${n.toLocaleString("en-US")} likes`), portfolio: "Portfolio", empty: "Cards with this person's art show up here.",
    admin: "Admin · Artist", mark: "Mark as artist", marked: "Is an artist", linked: "Cards with this person's art", none: "No linked cards.",
    unlink: "Unlink", link: "Link", search: "Search a special card to link", searchPlaceholder: "Player, hero, team or artist…",
    linkHint: "Linking gives the card to this person and makes the card's Art by lead to this profile.", artBy: "Art by", failed: "Could not save. Try again.",
    retired: "out of circulation", prev: "Previous cards", next: "Next cards",
  },
  es: {
    artist: "Artista", lead: (name: string) => `Cartas con arte de ${name}`, cards: (n: number) => (n === 1 ? "1 carta" : `${n} cartas`),
    likes: (n: number) => (n === 1 ? "1 me gusta" : `${n.toLocaleString("es")} me gusta`), portfolio: "Portafolio", empty: "Las cartas con el arte de esta persona aparecen aquí.",
    admin: "Admin · Artista", mark: "Marcar como artista", marked: "Es artista", linked: "Cartas con el arte de esta persona", none: "Ninguna carta vinculada.",
    unlink: "Desvincular", link: "Vincular", search: "Buscar carta especial para vincular", searchPlaceholder: "Jugador, héroe, equipo o artista…",
    linkHint: "Vincular le da la carta a esta persona y hace que el Arte de la carta lleve a este perfil.", artBy: "Arte de", failed: "No se pudo guardar. Intenta de nuevo.",
    retired: "fuera de circulación", prev: "Cartas anteriores", next: "Siguientes cartas",
  },
});

/** Selo de artista, embaixo do nome no perfil: em destaque, com o brilho rosa das curtidas. */
export function ArtistBadge() {
  const t = useT(S);
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-linear-to-r from-rose-500 to-fuchsia-600 px-4 py-1.5 text-sm font-black tracking-[0.2em] text-white uppercase shadow-[0_0_22px_rgba(244,63,94,0.55)]">
      <Icon name="brush" className="size-5" />
      {t.artist}
    </span>
  );
}

const byIds = (players: Player[], ids: string[]) => ids.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p);
const CARD_W = 222;

/**
 * Vitrine do artista, no lugar das conquistas: as cartas ativas com a arte da pessoa numa faixa que rola para os lados
 * (como o elenco na aba Times), o botão de curtir o artista (o total soma as curtidas das cartas e as do perfil) e o portfólio.
 */
export function ArtistShowcase({ artist, userId, name, own, onOpenCard }: { artist: ArtistInfo; userId: string; name: string; own: boolean; onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const cards = byIds(players, artist.cards).filter((p) => !isRetired(p));
  const portfolio = cards.map((p) => p.art?.credit?.url).find((u) => u && /^https?:\/\//i.test(u));
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  const rail = useRail(rowEl, cards.length, { item: CARD_W, gap: 24 });

  return (
    <section aria-labelledby="profile-artist-title" className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="profile-artist-title" className="flex items-center gap-3 font-display text-4xl font-black text-rose-300 title-depth">
            <Icon name="brush" className="size-8" />
            {t.artist}
          </h2>
          <p className="text-sm text-zinc-300">{t.lead(name)} · {t.cards(cards.length)}</p>
          {portfolio && (
            <a href={portfolio} target="_blank" rel="noopener noreferrer" className={`${pill(false)} self-start`}>
              {t.portfolio} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        <LikeButton path={artistLikesPath(userId)} own={own} />
      </div>
      {cards.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end"><RailArrows rail={rail} prev={t.prev} next={t.next} /></div>
          {/* o fade das pontas é uma máscara e corta tudo fora da caixa: o padding em volta dá lugar ao brilho e à subida do hover */}
          <div ref={setRowEl} className={`${rail.fadeStrong} overflow-x-clip px-6 pt-4 pb-8 rail-glow`}>
            <motion.ul className="flex gap-6" {...rail.track}>
              {cards.map((p, i) => (
                <li key={p.id} className="shrink-0 drop-shadow-[0_0_24px_rgb(244_63_94/0.3)]" inert={rail.hidden(i) || undefined}>
                  <Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
                </li>
              ))}
            </motion.ul>
          </div>
        </div>
      ) : <p className="text-sm text-zinc-400">{t.empty}</p>}
    </section>
  );
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Só admin: marcar a conta como artista e vincular as cartas com a arte dela. `onChanged` recarrega o perfil. */
export function ArtistAdminPanel({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const t = useT(S);
  const { players, teams, reload } = useData();
  const [state, setState] = useState<ArtistAdmin>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const query = normalize(useDeferredValue(q).trim());

  useEffect(() => {
    const controller = new AbortController();
    fetch(artistPath(userId), { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ArtistAdmin>) : Promise.reject(new Error(String(r.status)))))
      .then(setState)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [userId]);

  const send = async (path: string, method: "PUT" | "DELETE") => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch(path, { method });
      if (!r.ok) throw new Error(String(r.status));
      setState(await r.json() as ArtistAdmin);
      // o perfil (área e coleção) e o Arte por das cartas mudam junto
      onChanged();
      void reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const linked = byIds(players, state?.cards ?? []);
  const label = (p: Player) => `${p.name} · ${p.hero} · ${teamOf(teams, p).tag}`;
  const options = query
    ? players.filter((p) => (p.special || p.art?.url) && !state?.cards.includes(p.id)
      && normalize(`${label(p)} ${p.art?.credit?.name ?? ""} ${p.specialText ?? ""}`).includes(query)).slice(0, 8)
    : [];

  return (
    <section aria-labelledby="profile-artist-admin" className="flex flex-col gap-4 rounded-2xl bg-zinc-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-artist-admin" className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.admin}</h2>
        <button type="button" aria-pressed={!!state?.artist} disabled={!state || busy}
          onClick={() => void send(artistPath(userId), state?.artist ? "DELETE" : "PUT")}
          className={`${pill(!!state?.artist)} disabled:cursor-wait disabled:opacity-60`}>
          <Icon name="brush" className="size-4" />
          {state?.artist ? t.marked : t.mark}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-zinc-100">{t.linked}</span>
        {linked.length ? (
          <ul className="flex flex-col gap-1">
            {linked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/50 px-3 py-1.5 text-sm text-zinc-200">
                <span className="min-w-0">{label(p)}{isRetired(p) && <span className="text-zinc-400"> · {t.retired}</span>}</span>
                <button type="button" disabled={busy} onClick={() => void send(artistCardPath(userId, p.id), "DELETE")} className={`${pill(false)} disabled:cursor-wait disabled:opacity-60`}>{t.unlink}</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-400">{state ? t.none : "…"}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.search} placeholder={t.searchPlaceholder} className={`${field} w-full sm:max-w-md`} />
        <p className="text-xs text-zinc-400">{t.linkHint}</p>
        {options.length > 0 && (
          <ul className="flex flex-col gap-1">
            {options.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/50 px-3 py-1.5 text-sm text-zinc-200">
                <span className="min-w-0">
                  {label(p)}
                  {p.art?.credit && <span className="text-zinc-400"> · {t.artBy} {p.art.credit.name}</span>}
                </span>
                <button type="button" disabled={busy} onClick={() => void send(artistCardPath(userId, p.id), "PUT")} className={`${pill(true)} disabled:cursor-wait disabled:opacity-60`}>{t.link}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {failed && <p role="alert" className="text-sm text-red-300">{t.failed}</p>}
    </section>
  );
}
