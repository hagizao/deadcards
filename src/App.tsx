import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DataProvider, useData } from "./lib/data";
import { hexToRgba } from "./lib/cards";
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
import { Icon } from "./components/Icon";
import { Profile } from "./views/Profile";
import { easeOut } from "./lib/ui";
import { Settings } from "./views/Settings";
import { profileUrl } from "./lib/profile";
import { Intro } from "./views/Intro";
import { markIntroSeen, shouldShowIntro } from "./lib/intro";

const REPO = "https://github.com/hagizao/deadcards";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

type Tab = "home" | "teams" | "tierlist" | "collection" | "redeem" | "compare" | "editor" | "privacy" | "terms" | "feedback" | "profile" | "settings";
const TABS = ["teams", "tierlist", "collection", "compare", "redeem"] as const;

const S = strings({
  pt: {
    tabs: { teams: "Times", tierlist: "Tier List", collection: "Coleção", compare: "Comparar", redeem: "Resgatar", editor: "Editor" },
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
    rmBefore: "Seu sistema está com ",
    rmBold: "movimento reduzido",
    rmAfter: " ativado, então as animações das cartas estão desligadas. Para vê-las, desative essa opção nas configurações de acessibilidade do seu sistema.",
    rmClose: "Fechar aviso",
  },
  en: {
    tabs: { teams: "Teams", tierlist: "Tier List", collection: "Collection", compare: "Compare", redeem: "Redeem", editor: "Editor" },
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
    rmBefore: "Your system has ",
    rmBold: "reduced motion",
    rmAfter: " turned on, so the card animations are off. To see them, turn off that option in your system's accessibility settings.",
    rmClose: "Dismiss notice",
  },
  es: {
    tabs: { teams: "Equipos", tierlist: "Tier List", collection: "Colección", compare: "Comparar", redeem: "Canjear", editor: "Editor" },
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
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-black/50 bg-linear-to-b from-dl-bevel-from to-dl-bevel-to px-3 text-xs font-bold tracking-widest text-white uppercase text-shadow-xs hover:from-dl-bevel-hover-from hover:to-dl-bevel-hover-to focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:min-h-10 sm:text-sm"
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
          {location.pathname === "/login" ? <><Background /><Login /></> : <><Shell /><EntryGate /></>}
        </DataProvider>
      </LangProvider>
    </MotionConfig>
  );
}

/** Tela de entrada por cima do site (que carrega por baixo); some com fade e não volta na mesma sessão. */
function EntryGate() {
  const [open, setOpen] = useState(shouldShowIntro);
  const done = useCallback(() => { markIntroSeen(); setOpen(false); }, []);
  return open ? <Intro onDone={done} /> : null;
}

function Background() {
  const { settings } = useData();
  const bg = settings.bg;
  if (!bg) return null;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {bg.imageUrl && (
        <div
          className="absolute -inset-6 bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${bg.imageUrl}")`, backgroundSize: bg.size || "cover", opacity: bg.imageOpacity / 100, filter: `blur(${bg.blur}px)` }}
        />
      )}
      <div className="absolute inset-0" style={{ background: hexToRgba(bg.color, bg.overlayOpacity / 100) }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 15%, rgba(255,255,255,0.03) 0%, rgba(9,9,11,0.72) 100%)" }} />
    </div>
  );
}

const sharedProfile = () => /^\/u\/((?:@|%40)?[A-Za-z0-9._-]{1,64})$/.exec(location.pathname)?.[1].replace("%40", "@");

function Shell() {
  const [profileId, setProfileId] = useState(sharedProfile);
  const [tab, setTab] = useState<Tab>(() => profileId ? "profile" : location.pathname === "/privacy" ? "privacy" : location.pathname === "/terms" ? "terms" : "home");
  const [focusTeam, setFocusTeam] = useState<string>();
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { me } = useData();
  const t = useT(S);
  const tabs = me?.admin ? [...TABS, "editor" as const] : TABS;
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
      <Background />
      <header className="noir-glass sticky top-0 z-40 border-b border-zinc-200/15">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setTab("home")} className="brand-badge flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left sm:px-6 sm:py-3">
            <span className="size-2.5 rounded-full bg-zinc-100 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
            <span className="font-display text-base font-extrabold tracking-[0.18em] text-zinc-100 uppercase sm:text-xl"><span className="sm:hidden">CL</span><span className="hidden sm:inline">Cardslock</span></span>
          </button>
          <nav className="relative ml-auto flex min-w-0 scrollbar-none items-center gap-2 overflow-x-auto mask-x-from-[calc(100%-1.5rem)] px-6 py-1" aria-label={t.mainNav}>
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={(e) => { setFocusTeam(undefined); setTab(id); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" }); }}
                aria-current={tab === id ? "page" : undefined}
                className={`relative flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border px-3 text-xs font-bold tracking-widest whitespace-nowrap uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-100 sm:min-h-10 sm:px-4 sm:text-sm ${
                  tab === id ? "border-dl-text text-dl-black" : "border-black/50 bg-linear-to-b from-dl-bevel-from to-dl-bevel-to text-white text-shadow-xs hover:from-dl-bevel-hover-from hover:to-dl-bevel-hover-to"
                }`}
              >
                {tab === id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-dl-text shadow-[0_0_18px_rgba(255,239,215,0.35)]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative">{t.tabs[id]}</span>
              </button>
            ))}
          </nav>
          <LangMenu />
          <div className="shrink-0"><Account onProfile={() => { if (me) openProfile(me.handle ?? me.id); }} onSettings={() => setTab("settings")} /></div>
        </div>
      </header>

      <ReducedMotionNotice />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: easeOut }}
          >
            {tab === "home" && <Home onOpenTeam={openTeam} />}
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

      <footer className="mt-6 border-t border-zinc-200/10">
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
        <p className="mx-auto max-w-7xl px-4 pb-6 text-xs text-zinc-500 sm:px-6 lg:px-8">
          {t.managed}{" "}
          <a href="https://www.youtube.com/@hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">YouTube</a> ·{" "}
          <a href="https://www.twitch.tv/hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">Twitch</a> ·{" "}
          <a href="https://kick.com/hagizao" target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">Kick</a>.{" "}
          {t.notAffiliated}
        </p>
      </footer>

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
