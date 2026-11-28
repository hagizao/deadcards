import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { ProfileSkeleton } from "../components/Skeleton";
import { Achievements } from "../components/Achievements";
import { ArtistAdminPanel, ArtistShowcase } from "../components/ArtistArea";
import { Card } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { Icon } from "../components/Icon";
import { Range } from "../components/Range";
import { POSITIONS, STAT_KEYS, calculateOVR, getPlayerOvr, teamOf, useLabel } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { MAX_FAVORITES, PROFILE_ART_PATH, PROFILE_CARD_PATH, PROFILE_NAME_MAX, profilePlayer, profileUrl, summarizeCollection, type ProfileCard, type ProfileCardState, type PublicProfile } from "../lib/profile";
import { FRAME_PRESETS, getCardTier } from "../lib/rarity";
import { useMyCards } from "../lib/myCards";
import type { Player } from "../lib/types";
import { easeOut, field, pill, primaryBtn } from "../lib/ui";
import { cascade, useSettled } from "../lib/motion";
import { CountUp, FillBar } from "../components/Motion";

const S = strings({
  pt: {
    favorites: "Favoritas", favoritesHint: `Abra uma carta e toque em Favoritar: até ${MAX_FAVORITES} ficam em destaque aqui.`,
    progress: "Almas recolhidas", best: "Maior OVR", catalog: (owned: number, total: number) => `${owned} de ${total} cartas`,
    rarity: "Filtrar por raridade", all: "Todas", search: "Buscar cartas", searchPlaceholder: "Jogador, herói ou time…",
    noResults: "Nenhuma carta corresponde aos filtros.", more: (n: number) => `Mostrar mais (${n})`,
    name: "Nome na carta", hero: "Herói", role: "Função", stats: "Atributos",
    hint: "Defina como você se vê no jogo. A carta aparece só no seu perfil, fora da tier list.",
    save: "Salvar carta", saving: "Salvando…", cancel: "Cancelar", unsaved: "Alterações não salvas.",
    loading: "Carregando perfil…", history: "Histórico de versões",
    edit: "Editar minha carta", create: "Montar minha carta", share: "Copiar link", copied: "Link copiado.", copyFailed: "Não foi possível copiar o link.",
    file: "Ficha nº", stamp: "Arquivado", artistStamp: "Artista",
    noCard: "Ainda não montou uma carta.", cards: "Coleção", noCards: "Nenhuma carta na coleção ainda.", redeem: "Resgatar carta",
    not_found: "Perfil não encontrado.",
    invalid_card: "Confira o nome, o herói e os atributos.", unavailable: "Não foi possível carregar agora.", login: "Entre para editar sua carta.",
    not_artist: "Só artistas podem usar arte própria na carta.", invalid_image: "Envie uma imagem PNG, JPG ou WebP de até 5 MB.",
    art: "Arte da carta", artHint: "Como artista, você pode usar uma arte sua na carta. Sem ela, a carta usa a arte do herói.",
    artUpload: "Enviar arte", artChange: "Trocar arte", artRemove: "Tirar arte", uploading: "Enviando…",
    frame: "Moldura", frameHint: "Escolha uma moldura de carta especial e ajuste as cores e a espessura.", frameNone: "Sem moldura",
    frameColor: "Cor da moldura", frameGlow: "Cor do brilho", frameWidth: "Espessura",
  },
  en: {
    favorites: "Favorites", favoritesHint: `Open a card and tap Favorite: up to ${MAX_FAVORITES} are featured here.`,
    progress: "Souls collected", best: "Highest OVR", catalog: (owned: number, total: number) => `${owned} of ${total} cards`,
    rarity: "Filter by rarity", all: "All", search: "Search cards", searchPlaceholder: "Player, hero or team…",
    noResults: "No cards match your filters.", more: (n: number) => `Show more (${n})`,
    name: "Name on card", hero: "Hero", role: "Role", stats: "Attributes",
    hint: "Set how you see yourself in game. The card only shows on your profile, outside the tier list.",
    save: "Save card", saving: "Saving…", cancel: "Cancel", unsaved: "Unsaved changes.",
    loading: "Loading profile…", history: "Version history",
    edit: "Edit my card", create: "Build my card", share: "Copy link", copied: "Link copied.", copyFailed: "Could not copy the link.",
    file: "File no.", stamp: "On file", artistStamp: "Artist",
    noCard: "No card built yet.", cards: "Collection", noCards: "No cards in the collection yet.", redeem: "Redeem a card",
    not_found: "Profile not found.",
    invalid_card: "Check the name, hero and attributes.", unavailable: "Could not load right now.", login: "Sign in to edit your card.",
    not_artist: "Only artists can use their own art on the card.", invalid_image: "Send a PNG, JPG or WebP image up to 5 MB.",
    art: "Card art", artHint: "As an artist, you can use your own art on the card. Without it, the card uses the hero art.",
    artUpload: "Upload art", artChange: "Change art", artRemove: "Remove art", uploading: "Uploading…",
    frame: "Frame", frameHint: "Pick a special card frame and tune its colors and thickness.", frameNone: "No frame",
    frameColor: "Frame color", frameGlow: "Glow color", frameWidth: "Thickness",
  },
  es: {
    favorites: "Favoritas", favoritesHint: `Abre una carta y toca Marcar favorita: hasta ${MAX_FAVORITES} se destacan aquí.`,
    progress: "Almas recogidas", best: "OVR más alto", catalog: (owned: number, total: number) => `${owned} de ${total} cartas`,
    rarity: "Filtrar por rareza", all: "Todas", search: "Buscar cartas", searchPlaceholder: "Jugador, héroe o equipo…",
    noResults: "Ninguna carta coincide con los filtros.", more: (n: number) => `Mostrar más (${n})`,
    name: "Nombre en la carta", hero: "Héroe", role: "Rol", stats: "Atributos",
    hint: "Define cómo te ves en el juego. La carta solo aparece en tu perfil, fuera de la tier list.",
    save: "Guardar carta", saving: "Guardando…", cancel: "Cancelar", unsaved: "Cambios sin guardar.",
    loading: "Cargando perfil…", history: "Historial de versiones",
    edit: "Editar mi carta", create: "Armar mi carta", share: "Copiar enlace", copied: "Enlace copiado.", copyFailed: "No se pudo copiar el enlace.",
    file: "Ficha n.º", stamp: "Archivado", artistStamp: "Artista",
    noCard: "Todavía no armó una carta.", cards: "Colección", noCards: "Todavía no hay cartas en la colección.", redeem: "Canjear carta",
    not_found: "Perfil no encontrado.",
    invalid_card: "Revisa el nombre, el héroe y los atributos.", unavailable: "No se pudo cargar ahora.", login: "Inicia sesión para editar tu carta.",
    not_artist: "Solo los artistas pueden usar arte propio en la carta.", invalid_image: "Envía una imagen PNG, JPG o WebP de hasta 5 MB.",
    art: "Arte de la carta", artHint: "Como artista, puedes usar un arte tuyo en la carta. Sin él, la carta usa el arte del héroe.",
    artUpload: "Enviar arte", artChange: "Cambiar arte", artRemove: "Quitar arte", uploading: "Enviando…",
    frame: "Marco", frameHint: "Elige un marco de carta especial y ajusta los colores y el grosor.", frameNone: "Sin marco",
    frameColor: "Color del marco", frameGlow: "Color del brillo", frameWidth: "Grosor",
  },
});

/** Número da ficha do dossiê: sai do id da conta, então é sempre o mesmo para a mesma pessoa. */
const fileNo = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return String(h % 10000).padStart(4, "0");
};

type Issue = "invalid_card" | "unavailable" | "login" | "not_found" | "not_artist" | "invalid_image";
const ISSUES: Issue[] = ["invalid_card", "unavailable", "login", "not_found", "not_artist", "invalid_image"];

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.ok) return response.json() as Promise<T>;
  const payload = await response.json().catch(() => null) as { code?: Issue } | null;
  throw new Error(payload?.code ?? "unavailable");
}

function issueOf(error: unknown): Issue {
  const code = error instanceof Error ? error.message : "";
  return (ISSUES as string[]).includes(code) ? code as Issue : "unavailable";
}

/** `onArtist`: avisa se o perfil aberto é de artista, para o fundo do site pegar o degradê rosa. */
export function Profile({ userId, onOpenCard, onRedeem, onArtist }: { userId: string; onOpenCard: (id: string) => void; onRedeem: () => void; onArtist: (artist: boolean) => void }) {
  const t = useT(S);
  const { me, settings, heroArt } = useData();
  const [profile, setProfile] = useState<PublicProfile>();
  const [error, setError] = useState<Issue>();
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState<"copied" | "copyFailed">();
  const cardRef = useRef<HTMLDivElement>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    profileRequest<PublicProfile>(`/api/users/${encodeURIComponent(userId)}`, { signal: controller.signal })
      .then((p) => {
        setProfile(p);
        if (p.handle && p.handle !== userId) history.replaceState(null, "", profileUrl(p.handle));
      })
      .catch((e) => { if (!controller.signal.aborted) setError(issueOf(e)); });
    return () => controller.abort();
  }, [userId, version]);

  const isArtist = !!profile?.artist;
  useEffect(() => {
    onArtist(isArtist);
    return () => onArtist(false);
  }, [isArtist, onArtist]);

  const share = () => {
    navigator.clipboard.writeText(location.origin + profileUrl(profile?.handle ?? userId))
      .then(() => setCopy("copied"), () => setCopy("copyFailed"));
  };

  if (error) return <p role="alert" className="text-sm text-red-300">{t[error]}</p>;
  if (!profile) return <ProfileSkeleton label={t.loading} />;

  const owner = me?.id === profile.id;
  const card = profile.card;
  const tier = card && getCardTier(profilePlayer(card), settings.tierConfig!);
  // atrás da ficha: a arte própria da carta (artistas) ou, sem ela, a arte do herói
  const art = card?.art ?? (card && heroArt(card.hero));
  // ficha do dossiê: foto 3×4 com carimbo, número da ficha à máquina de escrever, nome em destaque
  const identity = (
    <div className="flex min-w-0 items-center gap-7">
      <div className="relative shrink-0 -rotate-2 bg-dl-text p-1 shadow-[0_8px_20px_rgb(0_0_0/0.5)]">
        {profile.image
          ? <img src={profile.image} alt="" className="aspect-square w-16 object-cover grayscale-[0.35] sm:w-20" />
          : <span aria-hidden="true" className="flex aspect-square w-16 items-center justify-center bg-zinc-800 font-display text-2xl font-black text-dl-text sm:w-20">{profile.name.charAt(0).toUpperCase()}</span>}
        {/* no perfil de artista o carimbo da ficha diz Artista, em rosa */}
        <span aria-hidden={!profile.artist} className={`dossier-stamp absolute -right-4 bottom-1 rotate-[-14deg] ${profile.artist ? "dossier-stamp-artist" : ""}`}>{profile.artist ? t.artistStamp : t.stamp}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-typewriter text-xs tracking-[0.2em] text-zinc-300 uppercase">{t.file} {fileNo(profile.id)}</span>
        {/* nome do perfil um terço menor que o título das abas (pageTitle) */}
        <h1 id="profile-title" className={`font-display text-2xl font-extrabold tracking-[0.11em] text-balance wrap-break-word ${profile.artist ? "text-dl-text" : "text-area"} uppercase title-depth sm:text-[2rem] lg:text-2xl`}>{profile.name}</h1>
        {profile.handle && <p className="truncate text-sm font-semibold text-zinc-300">@{profile.handle}</p>}
        {card && <p className="truncate text-sm text-zinc-400">{card.name === profile.name ? card.hero : `${card.name} · ${card.hero}`}</p>}
      </div>
    </div>
  );

  const cardBlock = (
    <>
      {card && <div ref={cardRef} className="w-fit max-w-full"><Card player={profilePlayer(card)} /></div>}
      {card && tier ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="font-display text-4xl/none font-black text-dl-text tabular-nums">{calculateOVR(card.stats)}</span>
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">OVR</span>
          <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.name}</span>
        </div>
      ) : <p className="text-sm text-zinc-400">{t.noCard}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {owner && <button type="button" onClick={() => setEditing(true)} className={primaryBtn}>{card ? t.edit : t.create}</button>}
        <button type="button" onClick={share} className={pill(false)}>{t.share}</button>
        {card && <CardExportButton cardRef={cardRef} name={card.name} />}
      </div>
      {copy && <p role="status" className={`text-sm ${copy === "copied" ? "text-emerald-300" : "text-red-300"}`}>{t[copy]}</p>}
    </>
  );

  return (
    <section className="flex flex-col gap-6" aria-labelledby="profile-title">
      {editing ? (
        <>
          {identity}
          <ProfileEditor
            artist={!!profile.artist}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => { setProfile({ ...profile, card: saved }); setEditing(false); }}
          />
        </>
      ) : (
        // carta do perfil à esquerda (só a carta, sem os atributos detalhados) e conquistas ocupando o resto da largura;
        // atrás, a arte da carta (a própria ou a do herói), grande e na cor da raridade dela
        // no perfil de artista vira grade: ficha e cabeçalho da vitrine em cima, carta e faixa de cartas embaixo, alinhadas
        <div className={`relative isolate flex flex-col gap-6 ${profile.artist ? "lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-6" : "lg:flex-row"}`}>
          {art && tier && (
            <div aria-hidden="true" className={`dossier-hero pointer-events-none absolute -top-28 -left-56 -z-10 size-176 ${profile.artist ? "dossier-hero-artist" : ""}`} style={{ "--hero-c": tier.c } as CSSProperties}>
              <img src={art.url} alt="" className="size-full object-cover object-top" style={card?.art ? { objectPosition: `${card.art.x ?? 50}% ${card.art.y ?? 50}%` } : undefined} />
            </div>
          )}
          {profile.artist ? (
            <>
              <div className="flex flex-col items-center lg:col-start-1 lg:row-start-1"><div className="w-full lg:max-w-96">{identity}</div></div>
              <div className="flex flex-col items-center gap-5 lg:col-start-1 lg:row-start-2 lg:pt-12">{cardBlock}</div>
              <ArtistShowcase artist={profile.artist} userId={profile.id} name={profile.name} own={owner} onOpenCard={onOpenCard}
                headerClassName="lg:col-start-2 lg:row-start-1" railClassName="lg:col-start-2 lg:row-start-2" />
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-5 lg:w-fit lg:shrink-0">
                <div className="w-full lg:max-w-96">{identity}</div>
                {cardBlock}
              </div>
              <Achievements ids={profile.cards} profileCard={!!profile.card} favorites={profile.favorites.length} collapsible seenKey={owner ? `achievements-seen:${profile.id}` : undefined} />
            </>
          )}
        </div>
      )}

      {me?.admin && <ArtistAdminPanel userId={profile.id} onChanged={() => setVersion((v) => v + 1)} />}
      {(editing || profile.artist) && <Achievements ids={profile.cards} profileCard={!!profile.card} favorites={profile.favorites.length} collapsible seenKey={owner ? `achievements-seen:${profile.id}` : undefined} />}
      <ProfileFavorites ids={profile.cards} profileFavorites={profile.favorites} owner={owner} onOpenCard={onOpenCard} />
      <ProfileCards ids={profile.cards} profileFavorites={profile.favorites} owner={owner} onOpenCard={onOpenCard} onRedeem={onRedeem} />
    </section>
  );
}

const PAGE = 18;

/** Favoritas do perfil (até MAX_FAVORITES), em destaque antes da coleção. No seu perfil acompanham o que você marca no destaque da carta. */
function useFavorites(profileFavorites: string[], owner: boolean) {
  const mine = useMyCards();
  return owner && mine.owned ? mine.favorites : profileFavorites;
}

// a estrela só indica; marcar e desmarcar é no destaque da carta
function FavoriteStar({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} className="pointer-events-none absolute top-2 right-2 z-20 flex size-9 items-center justify-center rounded-full bg-dl-black/80 text-amber-300">
      <Icon name="star" className="size-5 fill-current" />
    </span>
  );
}

function ProfileFavorites({ ids, profileFavorites, owner, onOpenCard }: { ids: string[]; profileFavorites: string[]; owner: boolean; onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const favorites = useFavorites(profileFavorites, owner);
  const owned = new Set(ids);
  const pinned = players.filter((p) => owned.has(p.id) && favorites.includes(p.id))
    .sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name)).slice(0, MAX_FAVORITES);
  if (!pinned.length && !owner) return null;
  return (
    <section aria-labelledby="profile-favorites-title" className="flex flex-col gap-4 border-t border-zinc-200/15 pt-6">
      <h2 id="profile-favorites-title" className="flex items-center gap-2 font-display text-lg font-black text-amber-200">
        <Icon name="star" className="size-4 fill-current" />
        {t.favorites}
        <span className="text-sm text-zinc-400 tabular-nums">{pinned.length}/{MAX_FAVORITES}</span>
      </h2>
      {pinned.length ? (
        // vitrine: um cone de luz âmbar de cima e um reflexo no chão, como numa estante iluminada
        <ul className="dossier-showcase relative isolate flex flex-wrap justify-center gap-6 px-2 pt-6 pb-8">
          {/* marcar ou desmarcar uma favorita no destaque faz a carta pular para cá (ou sair) e as outras abrirem espaço */}
          <AnimatePresence mode="popLayout">
            {pinned.map((player) => (
              <motion.li key={player.id} layout className="relative drop-shadow-[0_0_28px_rgb(252_211_77/0.35)]"
                initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                <Card player={player} onOpen={() => onOpenCard(player.id)} />
                <FavoriteStar label={t.favorites} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : <p className="text-sm text-zinc-400">{t.favoritesHint}</p>}
    </section>
  );
}

function ProfileCards({ ids, profileFavorites, owner, onOpenCard, onRedeem }: { ids: string[]; profileFavorites: string[]; owner: boolean; onOpenCard: (id: string) => void; onRedeem: () => void }) {
  const t = useT(S);
  const { players, teams, settings } = useData();
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<string>();
  const [limit, setLimit] = useState(PAGE);
  const settled = useSettled();
  const favorites = useFavorites(profileFavorites, owner);
  const query = useDeferredValue(q.trim().toLowerCase());

  const summary = summarizeCollection(players, ids, settings.tierConfig!);
  const byOvr = (a: Player, b: Player) => getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name);
  // a coleção toda por OVR, do maior para o menor; as favoritas também aparecem aqui, com a estrela
  const list = summary.cards
    .filter((p) => !rarity || getCardTier(p, settings.tierConfig!).tierKey === rarity)
    .filter((p) => !query || `${p.name} ${p.hero} ${teamOf(teams, p).name} ${teamOf(teams, p).tag}`.toLowerCase().includes(query))
    .sort(byOvr);
  const pick = (key?: string) => { setRarity(key); setLimit(PAGE); };

  return (
    <section aria-labelledby="profile-cards-title" className="flex flex-col gap-5 border-t border-zinc-200/15 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-cards-title" className="font-display text-lg font-black text-area title-depth">{t.cards} · {summary.cards.length}</h2>
        {owner && <button type="button" onClick={onRedeem} className={pill(false)}>{t.redeem}</button>}
      </div>
      {summary.cards.length ? (
        <>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div className="flex min-w-48 flex-1 flex-col gap-2">
              <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.progress}</span>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-3xl font-black text-dl-text tabular-nums"><CountUp value={summary.percent} delay={0.15} />%</span>
                <span className="text-sm text-zinc-400">{t.catalog(summary.cards.length, summary.total)}</span>
              </div>
              <div role="progressbar" aria-label={t.progress} aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-zinc-800">
                <FillBar pct={summary.percent} delay={0.15} className="h-full rounded-full" barClassName="bg-dl-text" />
              </div>
            </div>
            {summary.best && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.best}</span>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-3xl font-black text-dl-text tabular-nums">{getPlayerOvr(summary.best)}</span>
                  <span className="text-sm text-zinc-400">{summary.best.name}</span>
                </div>
              </div>
            )}
          </div>

          {(list.length > 0 || rarity || query) && (
            <>
              <div role="group" aria-label={t.rarity} className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!rarity} onClick={() => pick()} className={pill(!rarity)}>{t.all}</button>
                {summary.rarities.map((r) => (
                  <button key={r.tierKey} type="button" aria-pressed={rarity === r.tierKey} disabled={!r.count}
                    onClick={() => pick(rarity === r.tierKey ? undefined : r.tierKey)}
                    className={`${pill(rarity === r.tierKey)} disabled:cursor-not-allowed disabled:opacity-40`}>
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: r.c }} />
                    {r.name}
                    <span className="tabular-nums opacity-70">{r.count}</span>
                  </button>
                ))}
              </div>
              <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t.searchPlaceholder} aria-label={t.search} className={`${field} w-full sm:max-w-sm`} />
              {list.length ? (
                <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
                  {list.slice(0, limit).map((player, i) => (
                    <motion.li key={player.id} className="relative" initial={{ opacity: 0, y: settled ? 0 : 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: settled ? 0.2 : 0.35, ease: easeOut, delay: settled ? 0 : cascade(i) }}>
                      <Card player={player} variant="medium" onOpen={() => onOpenCard(player.id)} />
                      {favorites.includes(player.id) && <FavoriteStar label={t.favorites} />}
                    </motion.li>
                  ))}
                </ul>
              ) : <p role="status" className="text-sm text-zinc-400">{t.noResults}</p>}
              {list.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={`${primaryBtn} self-center`}>{t.more(list.length - limit)}</button>
              )}
            </>
          )}
        </>
      ) : <p className="text-sm text-zinc-400">{t.noCards}</p>}
    </section>
  );
}

/** `artist`: só artistas veem a opção de usar arte própria na carta. */
function ProfileEditor({ artist, onSaved, onCancel }: { artist: boolean; onSaved: (card: ProfileCard) => void; onCancel: () => void }) {
  const t = useT(S);
  const locale = useLocale();
  const { me, heroNames } = useData();
  const label = useLabel();
  const [state, setState] = useState<ProfileCardState>();
  const [draft, setDraft] = useState<ProfileCard>();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Issue>();

  useEffect(() => {
    const controller = new AbortController();
    profileRequest<ProfileCardState>(PROFILE_CARD_PATH, { signal: controller.signal })
      .then(setState)
      .catch((e) => { if (!controller.signal.aborted) setError(issueOf(e)); });
    return () => controller.abort();
  }, []);

  const current = state?.history[0];
  const card = draft ?? current?.card ?? (state && {
    name: (me?.name ?? "").slice(0, PROFILE_NAME_MAX),
    hero: heroNames[0] ?? "Abrams",
    stats: { MIR: 50, MAC: 50, SUP: 50, MOV: 50, POL: 50, CON: 50 },
  });
  const dirty = !!card && JSON.stringify(card) !== JSON.stringify(current?.card);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const update = (patch: Partial<ProfileCard>) => { if (card) setDraft({ ...card, ...patch }); };

  const uploadArt = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("image", file);
      const { url } = await profileRequest<{ url: string }>(PROFILE_ART_PATH, { method: "POST", body: form });
      update({ art: { url, zoom: 100, x: 50, y: 50 } });
    } catch (err) {
      setError(issueOf(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!card) return;
    setError(undefined);
    setBusy(true);
    try {
      const next = await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...card, name: card.name.trim() }),
      });
      onSaved(next.history[0].card);
    } catch (err) {
      setError(issueOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!card) return error
    ? <p role="alert" className="text-sm text-red-300">{t[error]}</p>
    : <p role="status" className="text-sm text-zinc-400">{t.loading}</p>;

  return (
    <div className="flex min-w-0 flex-col items-center gap-5 md:flex-row md:items-start">
      <Card player={profilePlayer(card)} />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400">{t.hint}</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.name}
              <input value={card.name} onChange={(e) => update({ name: e.target.value })} maxLength={PROFILE_NAME_MAX} required
                autoComplete="off" disabled={busy} className={`${field} disabled:opacity-60`} />
            </label>
            <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.hero}
              <select value={card.hero} onChange={(e) => update({ hero: e.target.value })} disabled={busy} className={`${field} disabled:opacity-60`}>
                {!heroNames.includes(card.hero) && <option value={card.hero}>{card.hero}</option>}
                {heroNames.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.role}
              <select value={card.position ?? "Flex"} onChange={(e) => update({ position: e.target.value })} disabled={busy} className={`${field} disabled:opacity-60`}>
                {POSITIONS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-3" disabled={busy}>
            <legend className="mb-3 flex w-full items-center justify-between text-sm font-bold text-zinc-100">
              {t.stats}
              <span className="text-zinc-400 tabular-nums">OVR {calculateOVR(card.stats)}</span>
            </legend>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {STAT_KEYS.map((k) => (
                <Range key={k} label={k} value={card.stats[k]} min={1} max={99} onChange={(v) => update({ stats: { ...card.stats, [k]: v } })} />
              ))}
            </div>
          </fieldset>
          {artist && (
            <fieldset className="flex flex-col gap-3" disabled={busy || uploading}>
              <legend className="mb-3 text-sm font-bold text-zinc-100">{t.art}</legend>
              <p className="text-xs text-zinc-400">{t.artHint}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`${pill(false)} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-zinc-100 has-disabled:cursor-wait has-disabled:opacity-60`}>
                  <Icon name="brush" className="size-4" />
                  {card.art ? t.artChange : t.artUpload}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadArt} className="sr-only" />
                </label>
                {card.art && <button type="button" onClick={() => update({ art: undefined })} className={pill(false)}>{t.artRemove}</button>}
                {uploading && <span role="status" className="text-sm text-zinc-400">{t.uploading}</span>}
              </div>
              {card.art && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Range label="Zoom" value={card.art.zoom ?? 100} min={50} max={300} onChange={(v) => update({ art: { ...card.art!, zoom: v } })} />
                  <Range label="X" value={card.art.x ?? 50} min={0} max={100} onChange={(v) => update({ art: { ...card.art!, x: v } })} />
                  <Range label="Y" value={card.art.y ?? 50} min={0} max={100} onChange={(v) => update({ art: { ...card.art!, y: v } })} />
                </div>
              )}
            </fieldset>
          )}
          {artist && (
            <fieldset className="flex flex-col gap-3" disabled={busy}>
              <legend className="mb-3 text-sm font-bold text-zinc-100">{t.frame}</legend>
              <p className="text-xs text-zinc-400">{t.frameHint}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!card.frame} onClick={() => update({ frame: undefined })} className={pill(!card.frame)}>{t.frameNone}</button>
                {Object.entries(FRAME_PRESETS).map(([key, preset]) => (
                  <button key={key} type="button" aria-pressed={card.frame?.style === key} onClick={() => update({ frame: { style: key } })} className={pill(card.frame?.style === key)}>
                    {/* amostra nas cores da própria moldura: dado, não tema */}
                    <span aria-hidden="true" className="size-3 rounded-full" style={{ background: `linear-gradient(135deg, ${preset.c1}, ${preset.c2})` }} />
                    {preset.name}
                  </button>
                ))}
              </div>
              {card.frame && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-zinc-300">
                    {t.frameColor}
                    <input type="color" className="h-11 w-full cursor-pointer rounded-lg bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
                      value={card.frame.c1 ?? FRAME_PRESETS[card.frame.style]?.c1} onChange={(e) => update({ frame: { ...card.frame!, c1: e.target.value } })} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-zinc-300">
                    {t.frameGlow}
                    <input type="color" className="h-11 w-full cursor-pointer rounded-lg bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
                      value={card.frame.c2 ?? FRAME_PRESETS[card.frame.style]?.c2} onChange={(e) => update({ frame: { ...card.frame!, c2: e.target.value } })} />
                  </label>
                  <Range label={t.frameWidth} value={card.frame.pad ?? FRAME_PRESETS[card.frame.style]?.pad ?? 4} min={2} max={10} onChange={(v) => update({ frame: { ...card.frame!, pad: v } })} />
                </div>
              )}
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy || !dirty} className={primaryBtn}>{busy ? t.saving : t.save}</button>
            <button type="button" disabled={busy} onClick={onCancel} className={`${pill(false)} disabled:opacity-50`}>{t.cancel}</button>
            {current && dirty && <p role="status" className="text-sm text-amber-200">{t.unsaved}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-300">{t[error]}</p>}
        </form>

        {!!state?.history.length && (
          <div className="flex w-full flex-col gap-2">
            <h2 className="text-sm font-bold text-zinc-100">{t.history}</h2>
            <ol className="flex flex-col gap-2">
              {state.history.map(({ id, updatedAt, card: version }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-300">
                  <time dateTime={new Date(updatedAt).toISOString()} className="font-semibold text-zinc-100">{date.format(updatedAt)}</time>
                  <span>{version.hero} · OVR {calculateOVR(version.stats)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
