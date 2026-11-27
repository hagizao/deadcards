import { motion } from "motion/react";
import { useState } from "react";
import type { Player } from "../../lib/types";
import { useData } from "../../lib/data";
import { getPlayerOvr, isMainCard, isRetired, teamOf, useLabel } from "../../lib/cards";
import { strings, useT } from "../../lib/i18n";
import { sectionTitle } from "../../lib/ui";
import { cascade, enter } from "../../lib/motion";
import { Reveal } from "../../components/Motion";
import { RailArrows } from "../../components/Rail";
import { useRail } from "../../lib/rail";
import { ROLES, ROLE_TEXT } from "./roleText";

const S = strings({
  pt: { title: "Quem faz o quê", lead: "Cada time tem cinco funções. Conheça cada uma e quem joga ela melhor.", examples: "Destaques", open: (name: string) => `Ver a carta de ${name}`, prev: "Funções anteriores", next: "Mais funções" },
  en: { title: "Who does what", lead: "Every team has five roles. Get to know each one and who plays it best.", examples: "Standouts", open: (name: string) => `View ${name}'s card`, prev: "Previous roles", next: "More roles" },
  es: { title: "Quién hace qué", lead: "Cada equipo tiene cinco roles. Conoce cada uno y quién lo juega mejor.", examples: "Destacados", open: (name: string) => `Ver la carta de ${name}`, prev: "Roles anteriores", next: "Más roles" },
});

const EXAMPLES = 3;
// no máximo 4 funções à vista: a quinta (Suporte) entra pela seta da direita
const SHOWN = 4;

/** As cinco funções explicadas, cada uma com os três jogadores de maior OVR nela. */
export function Roles({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const roles = useT(ROLE_TEXT);
  const label = useLabel();
  const { players, teams, heroIcon } = useData();
  const main = players.filter((p) => isMainCard(p) && !isRetired(p) && !p.inactive);
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const rail = useRail(railEl, ROLES.length, { item: 200, gap: 32, max: SHOWN, fluid: true });
  const top = (role: string): Player[] => main.filter((p) => p.position === role).sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a)).slice(0, EXAMPLES);

  return (
    <section aria-labelledby="home-roles" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Reveal className="flex flex-col gap-2">
        <h2 id="home-roles" className={sectionTitle}>{t.title}</h2>
        <p className="max-w-2xl text-sm text-pretty text-zinc-300">{t.lead}</p>
        </Reveal>
        <RailArrows rail={rail} prev={t.prev} next={t.next} />
      </div>
      <div ref={setRailEl} className={`${rail.fade} overflow-x-clip`}>
      <motion.ul className="flex gap-8" {...rail.track}>
        {ROLES.map((role, i) => (
          <motion.li
            key={role}
            className="flex shrink-0 flex-col gap-4 border-l border-zinc-200/15 pl-4"
            style={{ width: rail.size }}
            inert={rail.hidden(i) || undefined}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...enter, delay: cascade(i, 0.06) }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-lg tracking-[0.11em] text-dl-text uppercase">{label(role)}</span>
              <p className="text-sm text-pretty text-zinc-300">{roles[role]}</p>
            </div>
            <div className="mt-auto flex flex-col gap-1">
              <span className="text-[14px] font-bold tracking-widest text-zinc-400 uppercase">{t.examples}</span>
              {top(role).map((p) => {
                const icon = heroIcon(p.hero);
                return (
                  <button key={p.id} type="button" onClick={() => onOpenCard(p.id)} aria-label={t.open(p.name)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-zinc-100/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/15">
                    {icon ? <img src={icon} alt="" className="size-9 shrink-0 rounded-full bg-zinc-900 object-cover" /> : <span className="size-9 shrink-0 rounded-full bg-zinc-800" />}
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-sm font-extrabold text-white">{p.name}</span>
                      <span className="truncate text-xs text-zinc-400">{teamOf(teams, p).tag} · {p.hero}</span>
                    </span>
                    <span className="font-black text-dl-text tabular-nums">{getPlayerOvr(p)}</span>
                  </button>
                );
              })}
            </div>
          </motion.li>
        ))}
      </motion.ul>
      </div>
    </section>
  );
}
