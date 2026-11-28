import { motion } from "motion/react";
import { useDeferredValue, useEffect, useState } from "react";
import { Card } from "./Card";
import { HoldButton } from "./HoldButton";
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
    lead: (n: number, name: string) => `${n === 1 ? "1 carta" : `${n} cartas`} com arte de ${name}`,
    likes: (n: number) => (n === 1 ? "1 curtida" : `${n.toLocaleString("pt-BR")} curtidas`), portfolio: "Portfólio", empty: "As cartas com a arte desta pessoa aparecem aqui.",
    admin: "Admin · Artista", mark: "Marcar como artista", marked: "É artista", unmark: "Tirar o selo de artista", unmarkHint: "Segure “É artista” para tirar o selo: a pessoa perde as cartas vinculadas e a carta do perfil, que ela monta de novo sem as opções de artista.", linked: "Cartas com a arte desta pessoa", none: "Nenhuma carta vinculada.",
    unlink: "Desvincular", link: "Vincular", search: "Buscar carta especial para vincular", searchPlaceholder: "Jogador, herói, time ou artista…",
    linkHint: "Vincular dá a carta para a pessoa e faz o Arte por da carta levar a este perfil.", artBy: "Arte por", failed: "Não foi possível salvar. Tente de novo.",
    retired: "fora de circulação", prev: "Cartas anteriores", next: "Próximas cartas",
  },
  en: {
    lead: (n: number, name: string) => `${n === 1 ? "1 card" : `${n} cards`} with art by ${name}`,
    likes: (n: number) => (n === 1 ? "1 like" : `${n.toLocaleString("en-US")} likes`), portfolio: "Portfolio", empty: "Cards with this person's art show up here.",
    admin: "Admin · Artist", mark: "Mark as artist", marked: "Is an artist", unmark: "Remove the artist badge", unmarkHint: "Hold “Is an artist” to remove the badge: this person loses the linked cards and their profile card, which they build again without the artist options.", linked: "Cards with this person's art", none: "No linked cards.",
    unlink: "Unlink", link: "Link", search: "Search a special card to link", searchPlaceholder: "Player, hero, team or artist…",
    linkHint: "Linking gives the card to this person and makes the card's Art by lead to this profile.", artBy: "Art by", failed: "Could not save. Try again.",
    retired: "out of circulation", prev: "Previous cards", next: "Next cards",
  },
  es: {
    lead: (n: number, name: string) => `${n === 1 ? "1 carta" : `${n} cartas`} con arte de ${name}`,
    likes: (n: number) => (n === 1 ? "1 me gusta" : `${n.toLocaleString("es")} me gusta`), portfolio: "Portafolio", empty: "Las cartas con el arte de esta persona aparecen aquí.",
    admin: "Admin · Artista", mark: "Marcar como artista", marked: "Es artista", unmark: "Quitar el sello de artista", unmarkHint: "Mantén presionado “Es artista” para quitar el sello: la persona pierde las cartas vinculadas y la carta del perfil, que vuelve a crear sin las opciones de artista.", linked: "Cartas con el arte de esta persona", none: "Ninguna carta vinculada.",
    unlink: "Desvincular", link: "Vincular", search: "Buscar carta especial para vincular", searchPlaceholder: "Jugador, héroe, equipo o artista…",
    linkHint: "Vincular le da la carta a esta persona y hace que el Arte de la carta lleve a este perfil.", artBy: "Arte de", failed: "No se pudo guardar. Intenta de nuevo.",
    retired: "fuera de circulación", prev: "Cartas anteriores", next: "Siguientes cartas",
  },
});

const byIds = (players: Player[], ids: string[]) => ids.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p);
// as cartas da vitrine são as médias (222 px) 20% maiores
const CARD_W = 266;

/**
 * `headerClassName` e `railClassName` posicionam as duas partes na grade do perfil: o cabeçalho ao lado da ficha
 * e a faixa ao lado da carta, com as cartas alinhadas a ela.
 *
 * Vitrine do artista, no lugar das conquistas: as cartas ativas com a arte da pessoa numa faixa que rola para os lados
 * (como o elenco na aba Times), o botão de curtir o artista (o total soma as curtidas das cartas e as do perfil) e o portfólio.
 */
export function ArtistShowcase({ artist, userId, name, own, onOpenCard, headerClassName = "", railClassName = "" }: {
  artist: ArtistInfo; userId: string; name: string; own: boolean; onOpenCard: (id: string) => void; headerClassName?: string; railClassName?: string;
}) {
  const t = useT(S);
  const { players } = useData();
  const cards = byIds(players, artist.cards).filter((p) => !isRetired(p));
  const portfolio = cards.map((p) => p.art?.credit?.url).find((u) => u && /^https?:\/\//i.test(u));
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  const rail = useRail(rowEl, cards.length, { item: CARD_W, gap: 24 });

  return (
    // display: contents: o cabeçalho e a faixa viram células da grade do perfil
    <section aria-labelledby="profile-artist-title" className="contents">
      {/* lg:px-16 = o padding da faixa: o título começa na linha da primeira carta e o curtir termina na linha das setas */}
      <div className={`flex min-w-0 flex-wrap items-end justify-between gap-4 lg:px-16 ${headerClassName}`}>
        <div className="flex flex-col gap-2">
          {/* o carimbo da ficha já diz "Artista": o título é o que a vitrine mostra */}
          <h2 id="profile-artist-title" className="flex items-center gap-2 font-display text-xl font-black text-balance text-zinc-100 sm:text-2xl">
            <Icon name="brush" className="size-6 shrink-0 -rotate-12 text-rose-300" />
            {t.lead(cards.length, name)}
          </h2>
          {portfolio && (
            <a href={portfolio} target="_blank" rel="noopener noreferrer" className={`${pill(false)} self-start`}>
              {t.portfolio} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        <LikeButton path={artistLikesPath(userId)} own={own} />
      </div>
      {cards.length ? (
        <div className={`relative min-w-0 ${railClassName}`}>
          {/* as setas ficam junto da faixa, no espaço de cima dela */}
          <div className="absolute top-0 right-4 z-10 lg:right-16"><RailArrows rail={rail} prev={t.prev} next={t.next} /></div>
          {/* o fade das pontas é uma máscara e corta tudo fora da caixa: o padding em volta dá lugar ao brilho e à subida do hover.
              pt-17 = o pt-12 da coluna da carta + metade da diferença de altura (430 − 389): os centros das cartas se alinham.
              No celular cabe uma carta: o padding lateral a centraliza e o fade é curto, para não apagar a carta */}
          <div ref={setRowEl} className={`rail-fade ${rail.at > 0 ? "[--fade-l:2rem] lg:[--fade-l:10rem]" : ""} ${rail.at < rail.last ? "[--fade-r:2rem] lg:[--fade-r:10rem]" : ""} overflow-x-clip px-[max(1rem,calc((100%-266px)/2))] pt-14 pb-12 rail-glow lg:px-16 lg:pt-17 lg:pb-28`}>
            <motion.ul className="flex gap-6" {...rail.track}>
              {cards.map((p, i) => (
                <li key={p.id} className="h-[389px] w-[266px] shrink-0" inert={rail.hidden(i) || undefined}>
                  <div className="origin-top-left scale-120"><Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} /></div>
                </li>
              ))}
            </motion.ul>
          </div>
        </div>
      ) : <p className={`text-sm text-zinc-400 ${railClassName}`}>{t.empty}</p>}
    </section>
  );
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Só admin: marcar a conta como artista e vincular as cartas com a arte dela. `onChanged` recarrega o perfil. */
// botão de marcar/tirar o selo de artista: pílula cheia, rosa quando a conta é artista
const artistToggle = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-bold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 disabled:cursor-wait disabled:opacity-60 sm:min-h-9";

export function ArtistAdminPanel({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const t = useT(S);
  const { players, teams, reload } = useData();
  const [state, setState] = useState<ArtistAdmin>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
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
      {/* recolhida por padrão: abre ao clicar no título */}
      <h2 id="profile-artist-admin">
        <button type="button" aria-expanded={open} aria-controls="profile-artist-admin-body" onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg text-xs font-bold tracking-widest text-zinc-400 uppercase transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:text-white sm:min-h-9">
          {t.admin}
          <Icon name={open ? "chevron-up" : "chevron-down"} className="size-4" />
        </button>
      </h2>
      {open && (
      <div id="profile-artist-admin-body" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {state?.artist ? (
          // tirar o selo apaga a carta do perfil e tira as cartas vinculadas da coleção: segurar para confirmar
          <HoldButton onConfirm={() => void send(artistPath(userId), "DELETE")} disabled={busy} label={t.unmark}
            className={`${artistToggle} bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/50 hover:bg-rose-500/25 hover:text-white active:bg-rose-500/35`}>
            <span className="flex items-center gap-2"><Icon name="brush" className="size-4" />{t.marked}</span>
          </HoldButton>
        ) : (
          <button type="button" disabled={!state || busy} onClick={() => void send(artistPath(userId), "PUT")}
            className={`${artistToggle} bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:text-white active:bg-zinc-600`}>
            <Icon name="brush" className="size-4" />
            {t.mark}
          </button>
        )}
      </div>
      {state?.artist && <p className="text-xs text-zinc-400">{t.unmarkHint}</p>}

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
      </div>
      )}
    </section>
  );
}
