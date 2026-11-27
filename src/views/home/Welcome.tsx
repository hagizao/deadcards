import { motion } from "motion/react";
import { useData } from "../../lib/data";
import { strings, useT } from "../../lib/i18n";
import { useMyCards } from "../../lib/myCards";
import { cascade, enter } from "../../lib/motion";
import { pill, primaryBtn } from "../../lib/ui";
import { CountUp, FillBar } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import type { Area } from "../Home";

const S = strings({
  pt: {
    title: "Primeira vez por aqui?",
    steps: [
      ["Conheça", "Passe pelos jogadores, veja o que cada carta diz e descubra os times de cada região."],
      ["Entre", "Entre com a Twitch ou o Google para ter a sua coleção e a sua própria carta."],
      ["Colecione", "Nas lives saem códigos que viram cartas e packs. Tudo de graça, sempre."],
    ],
    signIn: "Entrar", tierlist: "Ver a tier list",
    mine: "Sua coleção", progress: (n: number, total: number) => `${n} de ${total} cartas`, collection: "Ver minha coleção", redeem: "Resgatar código",
  },
  en: {
    title: "First time here?",
    steps: [
      ["Explore", "Browse the players, see what each card says and discover the teams from every region."],
      ["Sign in", "Sign in with Twitch or Google to get your collection and your own card."],
      ["Collect", "Streams drop codes that turn into cards and packs. Always free."],
    ],
    signIn: "Sign in", tierlist: "See the tier list",
    mine: "Your collection", progress: (n: number, total: number) => `${n} of ${total} cards`, collection: "See my collection", redeem: "Redeem code",
  },
  es: {
    title: "¿Primera vez por aquí?",
    steps: [
      ["Conoce", "Recorre a los jugadores, mira lo que dice cada carta y descubre los equipos de cada región."],
      ["Entra", "Entra con Twitch o Google para tener tu colección y tu propia carta."],
      ["Colecciona", "En los directos salen códigos que se convierten en cartas y packs. Siempre gratis."],
    ],
    signIn: "Entrar", tierlist: "Ver la tier list",
    mine: "Tu colección", progress: (n: number, total: number) => `${n} de ${total} cartas`, collection: "Ver mi colección", redeem: "Canjear código",
  },
});

/** Boas-vindas: para quem chega agora, os três passos; para quem já entrou, o progresso da coleção. */
export function Welcome({ onNavigate }: { onNavigate: (area: Area) => void }) {
  const t = useT(S);
  const { me, players } = useData();
  const { owned } = useMyCards();

  if (me) {
    const total = players.length;
    const mine = owned ? players.filter((p) => owned.has(p.id)).length : 0;
    const pct = total ? Math.round((mine / total) * 100) : 0;
    return (
      <section aria-labelledby="home-welcome" className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <h2 id="home-welcome" className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.mine}</h2>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-3xl font-black text-dl-text tabular-nums"><CountUp value={pct} />%</span>
            <span className="text-sm text-zinc-400">{t.progress(mine, total)}</span>
          </div>
          <div role="progressbar" aria-label={t.mine} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 max-w-md rounded-full bg-zinc-800">
            <FillBar pct={pct} className="h-full rounded-full" barClassName="bg-dl-text" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate("collection")} className={primaryBtn}>{t.collection}</button>
          <button type="button" onClick={() => onNavigate("redeem")} className={pill(false)}>{t.redeem}</button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-welcome" className="flex flex-col gap-5">
      <h2 id="home-welcome" className="font-display text-xl font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-2xl">{t.title}</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {t.steps.map(([title, text], i) => (
          <motion.li key={title} className="flex gap-3" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...enter, delay: cascade(i, 0.08) }}>
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-display text-lg text-dl-text">{i + 1}</span>
            <span className="flex flex-col gap-1">
              <span className="font-extrabold text-white">{title}</span>
              <span className="text-sm text-pretty text-zinc-300">{text}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href="/login" className={primaryBtn}>{t.signIn}</a>
        <button type="button" onClick={() => onNavigate("tierlist")} className={`${pill(false)} gap-2`}>
          {t.tierlist}
          <Icon name="chevron-right" className="size-4" />
        </button>
      </div>
    </section>
  );
}
