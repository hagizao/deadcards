import { useEffect, useId, useState } from "react";
import { STAT_KEYS } from "../lib/cards";
import { strings, useT } from "../lib/i18n";
import type { Stats } from "../lib/types";

type StatKey = (typeof STAT_KEYS)[number];
type HintKey = StatKey | "ovr" | "role" | "rarity";

const S = strings({
  pt: {
    stats: "Atributos e termos", role: "Função", rarity: "Raridade",
    ovrTip: "Nota geral da carta. Por padrão, é a média arredondada dos seis atributos.",
    rarityTip: "O tier é a faixa de OVR, de D a SS. Ele define a moldura padrão da carta. Algumas cartas têm moldura especial.",
    roleTip: "A função descreve o papel que o jogador costuma assumir na equipe.",
    names: { MIR: "Mira", MAC: "Macro", SUP: "Suporte", MOV: "Movimentação", POL: "Pool de heróis", CON: "Consistência" },
    tips: {
      MIR: "Precisão dos tiros ao acompanhar alvos, causar dano e garantir orbes de almas.",
      MAC: "Leitura do mapa e decisões sobre rotações, recursos e objetivos.",
      SUP: "Como o jogador contribui com a equipe protegendo aliados, criando oportunidades e usando suas habilidades.",
      MOV: "Uso da movimentação para se posicionar, desviar de ataques e entrar ou sair de combates.",
      POL: "Variedade de heróis que o jogador consegue usar bem.",
      CON: "Regularidade do desempenho de uma partida para outra.",
    },
    roles: {
      Carry: "Prioriza recursos para se tornar uma das principais fontes de dano da equipe.",
      OffCarry: "Complementa o carry com dano e pressão, dividindo a responsabilidade de decidir lutas.",
      Frontline: "Joga na linha de frente e cria espaço para os aliados avançarem ou causarem dano.",
      Flex: "Adapta a função e a escolha de herói ao que a equipe precisa.",
      Suporte: "Protege aliados e cria oportunidades com cura, controle ou outras habilidades de utilidade.",
    } as Record<string, string>,
  },
  en: {
    stats: "Attributes and terms", role: "Role", rarity: "Rarity",
    ovrTip: "The card's overall rating. By default, it is the rounded average of the six attributes.",
    rarityTip: "The tier is the OVR range, from D to SS. It sets the card's default frame. Some cards have a special frame.",
    roleTip: "The role describes what the player usually does for the team.",
    names: { MIR: "Aim", MAC: "Macro", SUP: "Support", MOV: "Movement", POL: "Hero pool", CON: "Consistency" },
    tips: {
      MIR: "Shooting accuracy when tracking targets, dealing damage, and securing soul orbs.",
      MAC: "Map awareness and decisions about rotations, resources, and objectives.",
      SUP: "How the player helps the team by protecting allies, creating opportunities, and using abilities.",
      MOV: "How the player moves to position themselves, dodge attacks, and enter or leave fights.",
      POL: "The range of heroes the player can use effectively.",
      CON: "How steadily the player performs from one match to the next.",
    },
    roles: {
      Carry: "Prioritizes resources to become one of the team's main damage dealers.",
      OffCarry: "Complements the carry with damage and pressure, sharing the job of winning fights.",
      Frontline: "Plays up front and creates space for allies to advance or deal damage.",
      Flex: "Adapts their role and hero choice to what the team needs.",
      Suporte: "Protects allies and creates opportunities with healing, crowd control, or other utility.",
    },
  },
  es: {
    stats: "Atributos y términos", role: "Función", rarity: "Rareza",
    ovrTip: "Valoración general de la carta. Por defecto, es el promedio redondeado de los seis atributos.",
    rarityTip: "El tier es el rango de OVR, de D a SS. Define el marco habitual de la carta. Algunas cartas tienen un marco especial.",
    roleTip: "La función describe el papel que suele asumir el jugador en el equipo.",
    names: { MIR: "Puntería", MAC: "Macro", SUP: "Apoyo", MOV: "Movimiento", POL: "Pool de héroes", CON: "Consistencia" },
    tips: {
      MIR: "Precisión de los disparos al seguir objetivos, infligir daño y asegurar orbes de almas.",
      MAC: "Lectura del mapa y decisiones sobre rotaciones, recursos y objetivos.",
      SUP: "Cómo el jugador ayuda al equipo al proteger aliados, crear oportunidades y usar sus habilidades.",
      MOV: "Cómo el jugador se mueve para posicionarse, esquivar ataques y entrar o salir de los combates.",
      POL: "Variedad de héroes que el jugador puede usar bien.",
      CON: "Regularidad del rendimiento de una partida a otra.",
    },
    roles: {
      Carry: "Prioriza recursos para convertirse en una de las principales fuentes de daño del equipo.",
      OffCarry: "Complementa al carry con daño y presión y comparte la responsabilidad de decidir los combates.",
      Frontline: "Juega en primera línea y crea espacio para que sus aliados avancen o inflijan daño.",
      Flex: "Adapta su función y su elección de héroe a las necesidades del equipo.",
      Suporte: "Protege a sus aliados y crea oportunidades con curación, control u otras habilidades de utilidad.",
    },
  },
});

export function SpotlightHints({ stats, position }: { stats: Stats; position: string }) {
  const t = useT(S);
  const prefix = useId();
  const [hint, setHint] = useState<{ key: HintKey; pinned: boolean }>();
  const tipId = hint && `${prefix}-${hint.key}`;

  useEffect(() => {
    if (!tipId) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !document.getElementById(tipId)?.parentElement?.contains(event.target)) {
        setHint(undefined);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setHint(undefined);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [tipId]);

  const terms: { key: HintKey; label: string; name?: string; value?: number; description: string }[] = [
    ...STAT_KEYS.map((key) => ({
      key,
      label: key,
      name: t.names[key],
      value: stats[key],
      description: t.tips[key],
    })),
    { key: "ovr", label: "OVR", description: t.ovrTip },
    { key: "role", label: t.role, description: t.roles[position] ?? t.roleTip },
    { key: "rarity", label: t.rarity, description: t.rarityTip },
  ];

  return (
    <section aria-labelledby={prefix} className="flex flex-col gap-2">
      <h3 id={prefix} className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.stats}</h3>
      <ul className="grid grid-cols-6 gap-2">
        {terms.map(({ key, label, name, value, description }) => {
          const id = `${prefix}-${key}`;
          const open = hint?.key === key;
          return (
            <li
              key={key}
              className={name ? "relative col-span-3 min-w-0" : "relative col-span-2 min-w-0"}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHint((current) => current?.pinned ? current : { key, pinned: false });
              }}
              onPointerLeave={(event) => {
                const focused = document.activeElement;
                if (event.pointerType !== "mouse" || (focused?.matches(":focus-visible") && event.currentTarget.contains(focused))) return;
                setHint((current) => current?.key === key && !current.pinned ? undefined : current);
              }}
            >
              <button
                type="button"
                aria-describedby={id}
                aria-expanded={open}
                aria-controls={id}
                className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-zinc-900/60 px-2 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-700 aria-expanded:bg-zinc-800"
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) setHint({ key, pinned: false });
                }}
                onBlur={() => setHint((current) => current?.key === key ? undefined : current)}
                onClick={() => setHint((current) => current?.key === key && current.pinned ? undefined : { key, pinned: true })}
              >
                <span className="shrink-0 font-bold underline decoration-dotted underline-offset-4">{label}</span>
                {name && <span className="min-w-0 flex-1 text-zinc-300">{name}</span>}
                {value !== undefined && <span className="shrink-0 font-bold tabular-nums">{value}</span>}
              </button>
              <span id={id} role="tooltip" hidden={!open} className="absolute inset-x-0 bottom-full z-10 rounded-lg bg-zinc-800 p-2 text-xs text-zinc-100 shadow-lg">
                {description}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
