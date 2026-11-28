import { strings, useT } from "../lib/i18n";
import { pageTitle, pill } from "../lib/ui";
import { Compare } from "./Compare";
import { DreamTeam } from "./DreamTeam";

const S = strings({
  pt: { nav: "Abas do Lab", compare: "Comparar", dream: "Elenco dos sonhos" },
  en: { nav: "Lab tabs", compare: "Compare", dream: "Dream team" },
  es: { nav: "Pestañas del Lab", compare: "Comparar", dream: "Equipo soñado" },
});

export type LabTab = "compare" | "dream";

/** O Lab: as telas para brincar com as cartas, cada uma numa aba com endereço próprio (/lab é o Elenco dos sonhos, /lab/comparar). */
export function Lab({ sub, squad, onSub, onSquadEdit, onOpenCard }: {
  sub: LabTab; squad?: string; onSub: (sub: LabTab) => void; onSquadEdit: () => void; onOpenCard: (id: string) => void;
}) {
  const t = useT(S);
  return (
    <section className="flex flex-col gap-6">
      <h1 className={pageTitle}>Lab</h1>
      <nav aria-label={t.nav} className="flex flex-wrap gap-2">
        {(["dream", "compare"] as const).map((k) => (
          <button key={k} type="button" aria-current={sub === k ? "page" : undefined} className={pill(sub === k)} onClick={() => onSub(k)}>{t[k]}</button>
        ))}
      </nav>
      {sub === "dream" ? <DreamTeam squad={squad} onEdit={onSquadEdit} onOpenCard={onOpenCard} /> : <Compare onOpenCard={onOpenCard} />}
    </section>
  );
}
