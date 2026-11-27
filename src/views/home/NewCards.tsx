import { motion } from "motion/react";
import { useState } from "react";
import type { Player } from "../../lib/types";
import { useData } from "../../lib/data";
import { getPlayerHistory, isMainCard, isRetired } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { sectionTitle } from "../../lib/ui";
import { Card } from "../../components/Card";
import { RailArrows } from "../../components/Rail";
import { useRail } from "../../lib/rail";
import { Reveal } from "../../components/Motion";

const S = strings({
  pt: { title: "Chegaram agora", lead: "Os jogadores que entraram por último no site.", prev: "Cartas anteriores", next: "Mais cartas" },
  en: { title: "Just arrived", lead: "The latest players added to the site.", prev: "Previous cards", next: "More cards" },
  es: { title: "Recién llegados", lead: "Los últimos jugadores que entraron al sitio.", prev: "Cartas anteriores", next: "Más cartas" },
});

const COUNT = 8;
// data em que a carta entrou: o primeiro ponto do histórico de OVR (sem histórico, vai para o fim)
const addedAt = (p: Player) => getPlayerHistory(p)[0]?.date ?? "";

/** As cartas principais mais recentes numa faixa sem barra de rolagem: as setas (ou arrastar) passam as cartas. */
export function NewCards({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const latest = players
    .filter((p) => isMainCard(p) && !isRetired(p) && !p.inactive)
    .sort((a, b) => addedAt(b).localeCompare(addedAt(a)) || b.id.localeCompare(a.id))
    .slice(0, COUNT);

  // carta média: 222 px, com gap-5 (20 px) entre elas
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const rail = useRail(railEl, latest.length, { item: 222, gap: 20 });

  if (!latest.length) return null;

  return (
    <section aria-labelledby="home-new" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Reveal className="flex flex-col gap-2">
          <h2 id="home-new" className={sectionTitle}>{t.title}</h2>
          <p className="text-sm text-zinc-300">{t.lead}</p>
        </Reveal>
        <RailArrows rail={rail} prev={t.prev} next={t.next} />
      </div>
      {/* corta só na horizontal: o brilho e a subida da carta no hover continuam visíveis em cima e embaixo */}
      <div ref={setRailEl} className={`${rail.fade} overflow-x-clip pt-2 pb-6`}>
        <motion.ul className="flex gap-5" {...rail.track}>
          {latest.map((p, i) => (
            <li key={p.id} className="shrink-0" inert={rail.hidden(i) || undefined}>
              <Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
