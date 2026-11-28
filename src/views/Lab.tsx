import { strings, useT } from "../lib/i18n";
import { pageTitle, pill } from "../lib/ui";
import { Compare } from "./Compare";
import { DreamTeam } from "./DreamTeam";

const S = strings({
  pt: { subtitle: "Para brincar com as cartas: monte o seu elenco dos sonhos e compare duas cartas.", nav: "Abas do Lab", compare: "Comparar", dream: "Elenco dos sonhos" },
  en: { subtitle: "Play with the cards: build your dream team and compare two cards.", nav: "Lab tabs", compare: "Compare", dream: "Dream team" },
  es: { subtitle: "Para jugar con las cartas: arma tu equipo soñado y compara dos cartas.", nav: "Pestañas del Lab", compare: "Comparar", dream: "Equipo soñado" },
});

export type LabTab = "compare" | "dream";

/** O Lab: as telas para brincar com as cartas, cada uma numa aba com endereço próprio (/lab é o Elenco dos sonhos, /lab/comparar). */
export function Lab({ sub, squad, onSub, onSquadEdit, onOpenCard }: {
  sub: LabTab; squad?: string; onSub: (sub: LabTab) => void; onSquadEdit: () => void; onOpenCard: (id: string) => void;
}) {
  const t = useT(S);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className={pageTitle}>Lab</h1>
        <p className="text-xs text-zinc-400">{t.subtitle}</p>
      </div>
      <nav aria-label={t.nav} className="flex flex-wrap gap-2">
        {(["dream", "compare"] as const).map((k) => (
          <button key={k} type="button" aria-current={sub === k ? "page" : undefined} className={pill(sub === k)} onClick={() => onSub(k)}>{t[k]}</button>
        ))}
      </nav>
      {sub === "dream" ? <DreamTeam squad={squad} onEdit={onSquadEdit} onOpenCard={onOpenCard} /> : <Compare onOpenCard={onOpenCard} />}
    </section>
  );
}
