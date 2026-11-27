import { useState } from "react";
import { auth, finishLink, startLink, type LinkProvider, type LinkResult } from "../lib/authClient";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { pageTitle, pill, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    title: "Configurações", accounts: "Contas vinculadas", linked: "vinculada", linking: "Abrindo login…", link: (p: string) => `Vincular ${p}`,
    accountsHint: "Seu @ vem da Twitch ou do canal do YouTube. Se a outra conta já tiver um perfil aqui, as cartas dela vêm para este perfil.",
    linkFailed: "Não foi possível iniciar a vinculação.",
    confirm: (name: string, cards: number) => `Você entrou na conta ${name}, que já existe aqui e tem ${cards} ${cards === 1 ? "carta" : "cartas"}. Juntar com a sua? Ela deixa de existir e tudo passa para o seu perfil.`,
    join: "Juntar contas", joining: "Juntando…", cancel: "Cancelar e sair",
    already_linked: "Essa conta já junta Twitch e YouTube, então não dá para vincular. Você está nela agora; saia para voltar à sua.",
    failed: "Não foi possível vincular as contas. Confira em qual conta você está e tente de novo.",
  },
  en: {
    title: "Settings", accounts: "Linked accounts", linked: "linked", linking: "Opening sign-in…", link: (p: string) => `Link ${p}`,
    accountsHint: "Your @ comes from Twitch or your YouTube channel. If the other account already has a profile here, its cards move to this profile.",
    linkFailed: "Could not start linking.",
    confirm: (name: string, cards: number) => `You signed in to ${name}, an existing account here with ${cards} ${cards === 1 ? "card" : "cards"}. Join it with yours? It stops existing and everything moves to your profile.`,
    join: "Join accounts", joining: "Joining…", cancel: "Cancel and sign out",
    already_linked: "That account already joins Twitch and YouTube, so it can't be linked. You are signed in to it now; sign out to go back to yours.",
    failed: "Could not link the accounts. Check which account you are in and try again.",
  },
  es: {
    title: "Configuración", accounts: "Cuentas vinculadas", linked: "vinculada", linking: "Abriendo inicio de sesión…", link: (p: string) => `Vincular ${p}`,
    accountsHint: "Tu @ viene de Twitch o de tu canal de YouTube. Si la otra cuenta ya tiene un perfil aquí, sus cartas pasan a este perfil.",
    linkFailed: "No se pudo iniciar la vinculación.",
    confirm: (name: string, cards: number) => `Entraste en la cuenta ${name}, que ya existe aquí y tiene ${cards} ${cards === 1 ? "carta" : "cartas"}. ¿Unirla con la tuya? Deja de existir y todo pasa a tu perfil.`,
    join: "Unir cuentas", joining: "Uniendo…", cancel: "Cancelar y salir",
    already_linked: "Esa cuenta ya une Twitch y YouTube, así que no se puede vincular. Estás en ella ahora; sal para volver a la tuya.",
    failed: "No se pudieron vincular las cuentas. Revisa en qué cuenta estás e inténtalo de nuevo.",
  },
});

const PROVIDERS: { id: LinkProvider; label: string }[] = [{ id: "twitch", label: "Twitch" }, { id: "google", label: "YouTube" }];

export function Settings({ link: initial }: { link?: LinkResult }) {
  const t = useT(S);
  const { me } = useData();
  const providers = me?.providers ?? [];
  const [busy, setBusy] = useState<LinkProvider>();
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState(initial);
  const [joining, setJoining] = useState(false);
  const link = (provider: LinkProvider) => {
    setBusy(provider);
    setFailed(false);
    startLink(provider).catch(() => { setFailed(true); setBusy(undefined); });
  };
  const join = () => {
    setJoining(true);
    void finishLink(true).then((next) => { setResult(next); setJoining(false); });
  };
  const leave = () => { void auth.signOut().finally(() => location.assign("/")); };
  return (
    <section aria-labelledby="settings-title" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 id="settings-title" className={pageTitle}>{t.title}</h1>
      {result && (
        <div role="alert" className="flex flex-col gap-3 border-l-2 border-zinc-200/30 pl-4">
          <p className={`text-sm ${result.code === "confirm" ? "text-zinc-100" : "text-red-300"}`}>
            {result.code === "confirm" ? t.confirm(result.name, result.cards) : t[result.code]}
          </p>
          {result.code === "confirm" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={joining} onClick={join} className={primaryBtn}>{joining ? t.joining : t.join}</button>
              <button type="button" disabled={joining} onClick={leave} className={`${pill(false)} disabled:opacity-60`}>{t.cancel}</button>
            </div>
          )}
        </div>
      )}
      <section aria-labelledby="settings-accounts-title" className="flex flex-col gap-3 border-t border-zinc-200/15 pt-6">
        <h2 id="settings-accounts-title" className="font-display text-lg font-black text-area title-depth">{t.accounts}</h2>
        <p className="text-sm text-zinc-400">{t.accountsHint}</p>
        <ul className="flex flex-wrap gap-2">
          {PROVIDERS.map(({ id, label }) => (
            <li key={id}>
              {providers.includes(id)
                ? <span className="inline-flex min-h-11 items-center rounded-lg bg-zinc-900/70 px-4 text-sm font-semibold text-zinc-100 sm:min-h-9">{label} · {t.linked}</span>
                : <button type="button" disabled={!!busy} onClick={() => link(id)} className={`${pill(false)} disabled:cursor-wait disabled:opacity-60`}>
                    {busy === id ? t.linking : t.link(label)}
                  </button>}
            </li>
          ))}
        </ul>
        {failed && <p role="alert" className="text-sm text-red-300">{t.linkFailed}</p>}
      </section>
    </section>
  );
}
