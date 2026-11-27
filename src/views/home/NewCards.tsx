import { motion } from "motion/react";
import type { Player } from "../../lib/types";
import { useData } from "../../lib/data";
import { getPlayerHistory, isMainCard, isRetired } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { cascade, enter } from "../../lib/motion";
import { Card } from "../../components/Card";
import { Reveal } from "../../components/Motion";

const S = strings({
  pt: { title: "Chegaram agora", lead: "Os jogadores que entraram por último no site." },
  en: { title: "Just arrived", lead: "The latest players added to the site." },
  es: { title: "Recién llegados", lead: "Los últimos jugadores que entraron al sitio." },
});

const COUNT = 8;
// data em que a carta entrou: o primeiro ponto do histórico de OVR (sem histórico, vai para o fim)
const addedAt = (p: Player) => getPlayerHistory(p)[0]?.date ?? "";

/** As cartas principais mais recentes, numa faixa que rola para o lado. */
export function NewCards({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const latest = players
    .filter((p) => isMainCard(p) && !isRetired(p) && !p.inactive)
    .sort((a, b) => addedAt(b).localeCompare(addedAt(a)) || b.id.localeCompare(a.id))
    .slice(0, COUNT);
  if (!latest.length) return null;

  return (
    <section aria-labelledby="home-new" className="flex flex-col gap-4">
      <Reveal className="flex flex-col gap-2">
        <h2 id="home-new" className="font-display text-xl font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-2xl">{t.title}</h2>
        <p className="text-sm text-zinc-300">{t.lead}</p>
      </Reveal>
      {/* faixa rolável: a borda direita some em degradê para mostrar que tem mais para o lado */}
      <ul className="flex snap-x snap-mandatory gap-5 overflow-x-auto mask-r-from-90% px-1 pt-2 pb-6">
        {latest.map((p, i) => (
          <motion.li key={p.id} className="shrink-0 snap-start" initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ ...enter, delay: cascade(i, 0.05) }}>
            <Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
