import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { likesPath, type CardLikes } from "../lib/likes";
import { Icon } from "./Icon";

const S = strings({
  pt: { like: "Curtir", liked: "Curtida", count: (n: number) => (n === 1 ? "1 curtida" : `${n.toLocaleString("pt-BR")} curtidas`), hint: "Dê moral para o artista", signIn: "Entre para curtir", failed: "Não foi possível salvar a curtida." },
  en: { like: "Like", liked: "Liked", count: (n: number) => (n === 1 ? "1 like" : `${n.toLocaleString("en-US")} likes`), hint: "Cheer on the artist", signIn: "Sign in to like", failed: "Could not save the like." },
  es: { like: "Me gusta", liked: "Te gusta", count: (n: number) => (n === 1 ? "1 me gusta" : `${n.toLocaleString("es")} me gusta`), hint: "Anima al artista", signIn: "Ingresa para dar me gusta", failed: "No se pudo guardar el me gusta." },
});

/**
 * Curtir carta especial: botão grande, com o total à vista de todos, para dar moral para quem fez a arte.
 * Sem login, o mesmo botão leva para entrar.
 */
export function LikeButton({ id }: { id: string }) {
  const t = useT(S);
  const { me } = useData();
  const still = useReducedMotion();
  const [scope, animate] = useAnimate();
  const [state, setState] = useState<{ id: string } & CardLikes>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(likesPath(id), { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CardLikes>) : Promise.reject(new Error(String(r.status)))))
      .then((l) => setState({ id, ...l }))
      .catch(() => { /* sem total: o botão espera, e curtir ainda funciona */ });
    return () => controller.abort();
  }, [id, me?.id]);

  const likes = state?.id === id ? state : undefined;
  const liked = !!likes?.liked;

  const flip = async () => {
    if (busy) return;
    const before = likes ?? { id, count: 0, liked: false };
    // muda na hora e confirma com o servidor; se falhar, volta
    setState({ id, liked: !before.liked, count: Math.max(0, before.count + (before.liked ? -1 : 1)) });
    setFailed(false);
    if (!before.liked && !still) animate("[data-heart]", { scale: [1, 1.45, 0.9, 1] }, { duration: 0.35 });
    setBusy(true);
    try {
      const r = await fetch(likesPath(id), { method: before.liked ? "DELETE" : "PUT" });
      if (!r.ok) throw new Error(String(r.status));
      setState({ id, ...(await r.json() as CardLikes) });
    } catch {
      setState(before);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const look = `flex min-h-12 cursor-pointer items-center gap-3 rounded-full px-5 text-base font-extrabold tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:cursor-wait ${
    liked
      ? "bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] hover:bg-rose-400 active:bg-rose-600"
      : "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/50 hover:bg-rose-500/25 hover:text-white active:bg-rose-500/35"
  }`;
  const body = (
    <>
      <span data-heart className="flex"><Icon name="heart" className={`size-6 ${liked ? "fill-current" : ""}`} /></span>
      <span>{liked ? t.liked : t.like}</span>
      <span aria-hidden="true" className="h-5 w-px bg-current opacity-40" />
      <span className="font-display text-xl tabular-nums" aria-live="polite">{likes ? likes.count.toLocaleString() : "–"}</span>
    </>
  );

  return (
    <div ref={scope} className="flex w-fit flex-col items-center gap-1.5">
      {me ? (
        <motion.button type="button" aria-pressed={liked} aria-label={`${liked ? t.liked : t.like} · ${t.count(likes?.count ?? 0)}`} disabled={busy}
          whileTap={still ? undefined : { scale: 0.95 }} onClick={flip} className={look}>
          {body}
        </motion.button>
      ) : (
        <a href="/login" className={look} aria-label={`${t.signIn} · ${t.count(likes?.count ?? 0)}`} title={t.signIn}>{body}</a>
      )}
      <span className="text-xs whitespace-nowrap text-zinc-400">{me ? t.hint : t.signIn}</span>
      {failed && <p role="alert" className="max-w-52 text-center text-sm text-red-300">{t.failed}</p>}
    </div>
  );
}
