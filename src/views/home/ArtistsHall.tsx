import { motion } from "motion/react";
import { useState } from "react";
import type { Player } from "../../lib/types";
import { useData } from "../../lib/data";
import { getPlayerHistory } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { sectionTitle } from "../../lib/ui";
import { Card } from "../../components/Card";
import { ArtCreditLine } from "../../components/Spotlight";
import { RailArrows } from "../../components/Rail";
import { useRail } from "../../lib/rail";
import { Reveal } from "../../components/Motion";

const S = strings({
  pt: { title: "Hall dos artistas", lead: "As cartas especiais e quem desenhou cada uma.", prev: "Cartas anteriores", next: "Mais cartas", artBy: "Arte por" },
  en: { title: "Artists' hall", lead: "The special cards and who drew each one.", prev: "Previous cards", next: "More cards", artBy: "Art by" },
  es: { title: "Salón de artistas", lead: "Las cartas especiales y quién dibujó cada una.", prev: "Cartas anteriores", next: "Más cartas", artBy: "Arte de" },
});

// data em que a carta entrou: o primeiro ponto do histórico de OVR (sem histórico, vai para o fim)
const addedAt = (p: Player) => getPlayerHistory(p)[0]?.date ?? "";

/** Todas as cartas especiais com arte, da mais nova para a mais antiga, numa faixa sem barra de rolagem. */
// especial sem arte própria não tem artista para homenagear, então fica de fora
export function ArtistsHall({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const latest = players
    .filter((p) => p.special && p.art?.url && !p.inactive)
    .sort((a, b) => addedAt(b).localeCompare(addedAt(a)) || b.id.localeCompare(a.id));

  // carta média: 222 px, com gap-5 (20 px) entre elas
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const rail = useRail(railEl, latest.length, { item: 222, gap: 20 });

  if (!latest.length) return null;

  return (
    <section aria-labelledby="home-artists" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Reveal className="flex flex-col gap-2">
          <h2 id="home-artists" className={`${sectionTitle} deco-star`}>{t.title}</h2>
          <p className="text-sm text-zinc-300">{t.lead}</p>
        </Reveal>
        <RailArrows rail={rail} prev={t.prev} next={t.next} />
      </div>
      {/* o fade das pontas é uma máscara e corta tudo fora da caixa: o padding em volta dá lugar ao brilho e à subida do hover (useRail mede só a área de dentro) */}
      <div ref={setRailEl} className={`${rail.fade} overflow-x-clip px-6 pt-6 pb-10 rail-glow`}>
        <motion.ul className="flex gap-5" {...rail.track}>
          {latest.map((p, i) => (
            <li key={p.id} className="flex shrink-0 flex-col items-center gap-3" inert={rail.hidden(i) || undefined}>
              <Card player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
              {p.art?.credit && <ArtCreditLine credit={p.art.credit} label={t.artBy} />}
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
