import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { DataProvider, useData } from "./lib/data";
import { Home } from "./views/Home";
import { Teams } from "./views/Teams";
import { TierList } from "./views/TierList";
import { Collection } from "./views/Collection";
import { Redeem } from "./views/Redeem";
import { Spotlight } from "./components/Spotlight";
import { Login } from "./views/Login";
import { Account } from "./components/Account";
import { finishLink, type LinkResult } from "./lib/authClient";
import { Editor } from "./views/Editor";
import { Legal } from "./views/Legal";
import { Compare } from "./views/Compare";
import { LANGS, LANG_LABEL, LangProvider, type Lang, strings, useLang, useT } from "./lib/i18n";
import { Feedback } from "./views/Feedback";
import { areaStyle, areaTier, type AreaKey } from "./lib/areas";
import { RitualBackground } from "./components/RitualBackground";
import { Icon } from "./components/Icon";
import { Profile } from "./views/Profile";
import { easeOut } from "./lib/ui";
import { Settings } from "./views/Settings";
import { profileUrl } from "./lib/profile";

const REPO = "https://github.com/hagizao/deadcards";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

type Tab = "home" | "teams" | "tierlist" | "collection" | "redeem" | "compare" | "editor" | "privacy" | "terms" | "feedback" | "profile" | "settings";
// ordem da navegação: a tela nova entra pelo lado de quem está à frente ou atrás no menu
const TAB_ORDER: Tab[] = ["home", "teams", "tierlist", "collection", "redeem", "compare", "profile", "settings", "editor", "feedback", "privacy", "terms"];
const TABS = ["teams", "tierlist", "collection", "redeem", "compare"] as const;
// aba -> área de cor (o perfil mostra a coleção da pessoa)
const TAB_AREA: Partial<Record<Tab, AreaKey>> = { teams: "teams", tierlist: "tierlist", collection: "collection", redeem: "redeem", compare: "compare", profile: "collection" };

const NAV_ICON = { teams: "shield", tierlist: "bars", collection: "cards", redeem: "ticket", compare: "versus" } as const;

const S = strings({
  pt: {
    tabs: { teams: "Times", tierlist: "Tier List", collection: "Coleção", redeem: "Resgatar", compare: "Comparar" },
    mainNav: "Navegação principal",
    projectLinks: "Links do projeto",
    language: "Idioma",
    github: "Código aberto no GitHub",
    feedback: "Relatar problema / sugerir ideia",
    contribute: "Como contribuir",
    privacy: "Privacidade",
    terms: "Termos",
    managed: "Projeto 4fun gerenciado pelo Hagizao:",
    notAffiliated: "Não afiliado à Valve.",
    freePacks: "Packs são grátis e nunca serão vendidos.",
    edl: ["Heróis jogados pelos jogadores com dados do", ", sem relação oficial com o site."],
    rmBefore: "Seu sistema está com ",
    rmBold: "movimento reduzido",
    rmAfter: " ativado, então as animações das cartas estão desligadas. Para vê-las, desative essa opção nas configurações de acessibilidade do seu sistema.",
    rmClose: "Fechar aviso",
  },
  en: {
    tabs: { teams: "Teams", tierlist: "Tier List", collection: "Collection", redeem: "Redeem", compare: "Compare" },
    mainNav: "Main navigation",
    projectLinks: "Project links",
    language: "Language",
    github: "Open source on GitHub",
    feedback: "Report a bug / suggest an idea",
    contribute: "How to contribute",
    privacy: "Privacy",
    terms: "Terms",
    managed: "4fun project run by Hagizao:",
    notAffiliated: "Not affiliated with Valve.",
    freePacks: "Packs are free and will never be sold.",
    edl: ["Players' other heroes based on data from", ", with no official affiliation."],
    rmBefore: "Your system has ",
    rmBold: "reduced motion",
    rmAfter: " turned on, so the card animations are off. To see them, turn off that option in your system's accessibility settings.",
    rmClose: "Dismiss notice",
  },
  es: {
    tabs: { teams: "Equipos", tierlist: "Tier List", collection: "Colección", redeem: "Canjear", compare: "Comparar" },
    mainNav: "Navegación principal",
    projectLinks: "Enlaces del proyecto",
    language: "Idioma",
    github: "Código abierto en GitHub",
    feedback: "Reportar un problema / sugerir una idea",
    contribute: "Cómo contribuir",
    privacy: "Privacidad",
    terms: "Términos",
    managed: "Proyecto 4fun administrado por Hagizao:",
    notAffiliated: "No afiliado a Valve.",
    freePacks: "Los packs son gratis y nunca se venderán.",
    edl: ["Héroes jugados por los jugadores con datos de", ", sin relación oficial con el sitio."],
    rmBefore: "Tu sistema tiene activado el ",
    rmBold: "movimiento reducido",
    rmAfter: ", así que las animaciones de las cartas están desactivadas. Para verlas, desactiva esa opción en los ajustes de accesibilidad de tu sistema.",
    rmClose: "Cerrar aviso",
  },
});

// Bandeiras simplificadas (viewBox 3:2) para ler bem a ~20x14 px.
const FLAGS: Record<Lang, (clip: string) => React.ReactNode> = {
  pt: () => (
    <>
      <rect width="60" height="40" fill="#009b3a" />
      <path d="M30 4 56 20 30 36 4 20z" fill="#fedf00" />
      <circle cx="30" cy="20" r="9" fill="#002776" />
      <path d="M21.5 19q8.5-3 17 3" stroke="#fff" strokeWidth="2" fill="none" />
    </>
  ),
  en: (clip) => (
    <>
      <clipPath id={clip}><path d="M30 20h30v20zv20H0zH0V0zV0h30z" /></clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#c8102e" strokeWidth="4" clipPath={`url(#${clip})`} />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
      <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
    </>
  ),
  es: () => (
    <>
      <rect width="60" height="40" fill="#aa151b" />
      <rect y="10" width="60" height="20" fill="#f1bf00" />
    </>
  ),
};

function Flag({ lang }: { lang: Lang }) {
  const clip = useId().replace(/:/g, "");
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-sm ring-1 ring-zinc-200/20">
      <svg viewBox="0 0 60 40" className="block aspect-3/2 w-5" aria-hidden="true">{FLAGS[lang](clip)}</svg>
    </span>
  );
}

function LangMenu() {
  const t = useT(S);
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[LANGS.indexOf(lang)]?.focus();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
        else if (e.key === "Tab") setOpen(false);
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    items.current[(i + d + LANGS.length) % LANGS.length]?.focus();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <motion.button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.95 }}
        aria-label={t.language}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-base font-bold tracking-widest text-zinc-200 uppercase transition-colors hover:bg-zinc-100/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:min-h-10 sm:text-lg"
      >
        <Flag lang={lang} />
        <span className="hidden sm:inline">{lang}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`hidden size-3 transition-transform duration-150 sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={t.language}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="noir-glass-strong absolute right-0 z-50 mt-2 w-40 origin-top-right rounded-2xl p-2"
          >
            {LANGS.map((l, i) => (
              <button
                key={l}
                ref={(el) => { items.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={l === lang}
                tabIndex={l === lang ? 0 : -1}
                onKeyDown={(e) => move(e, i)}
                onClick={() => { setLang(l); setOpen(false); button.current?.focus(); }}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-left text-sm hover:bg-zinc-800/70 hover:text-white focus-visible:bg-zinc-800/70 focus-visible:text-white ${l === lang ? "font-bold text-white" : "text-zinc-300"}`}
              >
                <span className="flex items-center gap-2">
                  <Flag lang={l} />
                  {LANG_LABEL[l]}
                </span>
                {l === lang && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden="true">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LangProvider>
        <DataProvider>
          {location.pathname === "/login" ? <><RitualBackground /><Login /></> : <Shell />}
        </DataProvider>
      </LangProvider>
    </MotionConfig>
  );
}

const sharedProfile = () => /^\/u\/((?:@|%40)?[A-Za-z0-9._-]{1,64})$/.exec(location.pathname)?.[1].replace("%40", "@");

function Shell() {
  const [profileId, setProfileId] = useState(sharedProfile);
  const [tab, setTab] = useState<Tab>(() => profileId ? "profile" : location.pathname === "/privacy" ? "privacy" : location.pathname === "/terms" ? "terms" : "home");
  // direção da troca de aba, derivada durante a renderização (padrão do React para "valor anterior")
  const [shown, setShown] = useState({ tab, dir: 0 });
  if (shown.tab !== tab) setShown({ tab, dir: Math.sign(TAB_ORDER.indexOf(tab) - TAB_ORDER.indexOf(shown.tab)) });
  const [focusTeam, setFocusTeam] = useState<string>();
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { me } = useData();
  const t = useT(S);
  const go = (id: Tab) => { setFocusTeam(undefined); setTab(id); };
  const openTeam = (id: string) => { setFocusTeam(id); setTab("teams"); };
  const editCard = (id: string) => { setSpotlight(null); setEditId(id); setTab("editor"); };
  const openProfile = (id: string) => { setProfileId(id); setTab("profile"); };
  useEffect(() => { window.scrollTo(0, 0); }, [tab, profileId]);
  const [linkResult, setLinkResult] = useState<LinkResult>();
  useEffect(() => {
    if (new URLSearchParams(location.search).get("link") !== "finish") return;
    void finishLink().then((result) => { if (result) { setLinkResult(result); setTab("settings"); } });
  }, []);
  useEffect(() => {
    const path = tab === "profile" && profileId ? profileUrl(profileId) : tab === "privacy" || tab === "terms" ? `/${tab}` : "/";
    if (location.pathname !== path) history.replaceState(null, "", path);
  }, [tab, profileId]);

  return (
    <>
      <RitualBackground color={TAB_AREA[tab] && areaTier(TAB_AREA[tab]).c} />
      {/* cabeçalho sem caixa: no topo é transparente; rolando, uma sombra escura desce atrás dele para o menu seguir legível */}
      <header className="sticky top-0 z-40">
        <ScrollShade />
        {/* uma faixa fina, que some nas pontas, marca onde o cabeçalho acaba */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-zinc-200/35 to-transparent" />
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setTab("home")} className="brand-badge group flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-md text-left active:scale-[0.98]">
            <span aria-hidden="true" className="size-3 rotate-45 rounded-[3px] bg-dl-text shadow-[0_0_14px_rgba(255,239,215,0.8)] transition-transform duration-200 group-hover:rotate-135 motion-reduce:transition-none sm:size-3.5" />
            <span className="font-display text-xl font-black tracking-[0.2em] text-white uppercase title-depth sm:text-[2rem]">Cards<span className="text-dl-text">lock</span></span>
          </button>
          <nav className="hidden flex-1 items-center justify-center gap-1 xl:flex" aria-label={t.mainNav}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                data-nav={id}
                onClick={() => go(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`relative flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-xl font-bold tracking-widest whitespace-nowrap uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 xl:px-4 ${tab === id ? "text-dl-black" : "text-zinc-300 hover:bg-zinc-100/10 hover:text-white"}`}
              >
                {tab === id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-dl-text shadow-[0_0_18px_rgba(255,239,215,0.35)]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative">{t.tabs[id]}</span>
              </button>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            <LangMenu />
            <Account onProfile={() => { if (me) openProfile(me.handle ?? me.id); }} onSettings={() => setTab("settings")} onEditor={() => setTab("editor")} />
          </div>
        </div>
      </header>

      <ReducedMotionNotice />
      {/* clip no eixo x: a tela que entra deslizando de lado não pode criar rolagem horizontal no celular */}
      <main className="mx-auto max-w-7xl overflow-x-clip px-4 py-6 sm:px-6 sm:py-10 lg:px-8" style={areaStyle(TAB_AREA[tab])}>
        <motion.div
            key={tab}
            initial={{ opacity: 0, x: shown.dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: easeOut }}
          >
            {tab === "home" && <Home onOpenTeam={openTeam} onOpenCard={setSpotlight} onNavigate={go} />}
            {tab === "teams" && <Teams focusTeamId={focusTeam} onOpenCard={setSpotlight} />}
            {tab === "tierlist" && <TierList onOpenCard={setSpotlight} onOpenTeam={openTeam} />}
            {tab === "collection" && <Collection onOpenCard={setSpotlight} />}
            {tab === "redeem" && <Redeem onOpenCard={setSpotlight} />}
            {tab === "compare" && <Compare onOpenCard={setSpotlight} />}
            {tab === "profile" && profileId && <Profile key={profileId} userId={profileId} onOpenCard={setSpotlight} onRedeem={() => setTab("redeem")} />}
            {tab === "settings" && me && <Settings link={linkResult} />}
            {tab === "editor" && me?.admin && <Editor editId={editId} onEditId={setEditId} />}
            {(tab === "privacy" || tab === "terms") && <Legal page={tab} />}
            {tab === "feedback" && <Feedback />}
          </motion.div>
      </main>

      <footer className="mt-6 border-t border-zinc-200/10 pb-[calc(4rem+env(safe-area-inset-bottom))] xl:pb-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-400 sm:px-6 lg:px-8">
          <a href={REPO} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-bold tracking-wider text-zinc-300 uppercase hover:text-white">
            <GitHubIcon /> {t.github}
          </a>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t.projectLinks}>
            <button type="button" onClick={() => setTab("feedback")} className="cursor-pointer hover:text-white">{t.feedback}</button>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer" className="hover:text-white">{t.contribute}</a>
            <button type="button" onClick={() => setTab("privacy")} className="cursor-pointer hover:text-white">{t.privacy}</button>
            <button type="button" onClick={() => setTab("terms")} className="cursor-pointer hover:text-white">{t.terms}</button>
          </nav>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 pb-6 text-xs text-zinc-500 sm:px-6 lg:px-8">
        <p>
          {t.managed}{" "}
          <a href="https://www.youtube.com/@hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">YouTube</a> ·{" "}
          <a href="https://www.twitch.tv/hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">Twitch</a> ·{" "}
          <a href="https://kick.com/hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">Kick</a>.{" "}
          {t.notAffiliated} {t.freePacks}
        </p>
        <p>
          {t.edl[0]} <a href="https://edl.gg" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">edl.gg</a>{t.edl[1]}
        </p>
        </div>
      </footer>

      <nav className="noir-glass-strong fixed inset-x-0 bottom-0 z-40 flex border-t border-zinc-200/15 pb-[env(safe-area-inset-bottom)] xl:hidden" aria-label={t.mainNav}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            data-nav={id}
            onClick={() => go(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-wider uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-100 ${tab === id ? "text-dl-text" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            <span className="relative flex h-7 w-12 items-center justify-center">
              {tab === id && <motion.span layoutId="nav-pill-bottom" className="absolute inset-0 rounded-full bg-dl-text/15" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <Icon name={NAV_ICON[id]} className="relative size-5" />
            </span>
            <span className="max-w-full truncate px-0.5">{t.tabs[id]}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {spotlight && <Spotlight key="spotlight" playerId={spotlight} onClose={() => setSpotlight(null)} onSwitch={setSpotlight} onEdit={me?.admin ? editCard : undefined} />}
      </AnimatePresence>
    </>
  );
}

function ReducedMotionNotice() {
  const t = useT(S);
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("rm-notice") === "1"; } catch { return false; } });
  if (!reduced || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem("rm-notice", "1"); } catch { /* sem storage */ } };
  return (
    <div role="status" className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-xl border border-zinc-200/15 bg-zinc-900/80 px-4 py-3 text-xs text-zinc-300">
        <p className="flex-1">{t.rmBefore}<strong>{t.rmBold}</strong>{t.rmAfter}</p>
        <button type="button" onClick={close} aria-label={t.rmClose} className="shrink-0 cursor-pointer text-zinc-400 hover:text-white"><Icon name="x" /></button>
      </div>
    </div>
  );
}

/** Fundo do cabeçalho só depois de rolar: um degradê escuro, sem caixa nem borda, para o menu continuar legível. */
function ScrollShade() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const on = () => setDown(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-[170%] bg-linear-to-b from-dl-black from-55% to-transparent transition-opacity duration-200 ${down ? "opacity-100" : "opacity-0"}`} />;
}
