import { motion } from "motion/react";
import { useData } from "../../lib/data";
import { strings, useT } from "../../lib/i18n";
import { cascade, enter } from "../../lib/motion";
import { pill, primaryBtn, sectionTitle } from "../../lib/ui";
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
  },
  en: {
    title: "First time here?",
    steps: [
      ["Explore", "Browse the players, see what each card says and discover the teams from every region."],
      ["Sign in", "Sign in with Twitch or Google to get your collection and your own card."],
      ["Collect", "Streams drop codes that turn into cards and packs. Always free."],
    ],
    signIn: "Sign in", tierlist: "See the tier list",
  },
  es: {
    title: "¿Primera vez por aquí?",
    steps: [
      ["Conoce", "Recorre a los jugadores, mira lo que dice cada carta y descubre los equipos de cada región."],
      ["Entra", "Entra con Twitch o Google para tener tu colección y tu propia carta."],
      ["Colecciona", "En los directos salen códigos que se convierten en cartas y packs. Siempre gratis."],
    ],
    signIn: "Entrar", tierlist: "Ver la tier list",
  },
});

/** Boas-vindas para quem ainda não entrou: os três passos e o botão de entrar. */
export function Welcome({ onNavigate }: { onNavigate: (area: Area) => void }) {
  const t = useT(S);
  const { me } = useData();

  // quem já entrou não vê esta seção: a coleção fica na aba Coleção
  if (me) return null;

  return (
    <section aria-labelledby="home-welcome" className="flex flex-col gap-5">
      <h2 id="home-welcome" className={`${sectionTitle} deco-arch`}>{t.title}</h2>
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
