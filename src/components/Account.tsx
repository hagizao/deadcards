import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/authClient";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { primaryBtn } from "../lib/ui";

export function TwitchIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

const S = strings({
  pt: { signIn: "Entrar", signOut: "Sair", profile: "Meu perfil", settings: "Configurações", editor: "Editor", account: "Menu da conta" },
  en: { signIn: "Sign in", signOut: "Sign out", profile: "My profile", settings: "Settings", editor: "Editor", account: "Account menu" },
  es: { signIn: "Ingresar", signOut: "Salir", profile: "Mi perfil", settings: "Configuración", editor: "Editor", account: "Menú de la cuenta" },
});

export function Account({ onProfile, onSettings, onEditor }: { onProfile: () => void; onSettings: () => void; onEditor: () => void }) {
  const t = useT(S);
  const { me } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]);

  if (!me) {
    return (
      <motion.a
        href="/login"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className={`${primaryBtn} shadow-[0_0_18px_rgba(255,239,215,0.35)] sm:min-h-10`}
        aria-label={t.signIn}
      >
        <span>{t.signIn}</span>
      </motion.a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.95 }}
        aria-label={t.account}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200/25 bg-zinc-900/70 p-1 shadow-[0_0_14px_rgba(244,244,245,0.15)] hover:border-zinc-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:pr-3"
      >
        {me.image ? <img src={me.image} alt="" className="size-8 rounded-full" /> : <span className="flex size-8 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">{me.name.charAt(0).toUpperCase()}</span>}
        <span className="hidden max-w-32 truncate text-sm font-bold text-zinc-100 sm:inline">{me.name}</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="noir-glass-strong absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-2xl p-2"
          >
            <div className="mb-1 flex items-center gap-2 border-b border-zinc-200/10 p-2">
              <span className="truncate text-sm font-bold text-zinc-100">{me.name}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onProfile(); }}
              className="min-h-11 w-full cursor-pointer rounded-lg px-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/70 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-100 active:bg-zinc-700"
            >
              {t.profile}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSettings(); }}
              className="min-h-11 w-full cursor-pointer rounded-lg px-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/70 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-100 active:bg-zinc-700"
            >
              {t.settings}
            </button>
            {me.admin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onEditor(); }}
                className="min-h-11 w-full cursor-pointer rounded-lg px-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/70 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-100 active:bg-zinc-700"
              >
                {t.editor}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => auth.signOut().then(() => location.assign("/"))}
              className="w-full cursor-pointer rounded-lg p-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
            >
              {t.signOut}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
