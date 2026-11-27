import { useState } from "react";
import { achievementsFor, type Achievement, type AchievementId, type AchievementLevel } from "../lib/achievements";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { pill } from "../lib/ui";
import { Icon } from "./Icon";
import { TeamLogo } from "./TeamLogo";

type Text = { title: string; desc: (goal: number) => string };
type Texts = {
  heading: string; done: (n: number, total: number) => string; all: string; unlocked: string;
  levels: Record<AchievementLevel, string>; items: Record<Exclude<AchievementId, "team">, Text>; team: { title: (name: string) => string; desc: string };
};

const S = strings<Texts>({
  pt: {
    heading: "Conquistas", done: (n, total) => `${n} de ${total}`, all: "Todas", unlocked: "Desbloqueada",
    levels: { easy: "Fáceis", medium: "Médias", hard: "Difíceis", team: "Elencos" },
    items: {
      "first-card": { title: "Primeira carta", desc: () => "Tenha sua primeira carta." },
      "profile-card": { title: "Essa é a minha cara", desc: () => "Monte a sua carta de perfil." },
      "first-favorite": { title: "Queridinha", desc: () => "Marque uma carta como favorita." },
      "five-cards": { title: "Começando a coleção", desc: (g) => `Tenha ${g} cartas.` },
      "twenty-five": { title: "Colecionador", desc: (g) => `Tenha ${g} cartas.` },
      "all-roles": { title: "Time equilibrado", desc: () => "Tenha uma carta de cada função." },
      "five-teams": { title: "Sem bandeira", desc: (g) => `Tenha cartas de ${g} times diferentes.` },
      "ovr-90": { title: "Classe mundial", desc: () => "Tenha uma carta com OVR 90 ou mais." },
      "played-10": { title: "Fora da zona de conforto", desc: (g) => `Tenha ${g} cartas de herói jogado.` },
      "special-1": { title: "Edição especial", desc: () => "Tenha uma carta especial." },
      "hundred": { title: "Centenário", desc: (g) => `Tenha ${g} cartas.` },
      "half": { title: "Meio caminho", desc: () => "Tenha metade de todas as cartas do jogo." },
      "world": { title: "Volta ao mundo", desc: () => "Tenha cartas de times de todas as regiões." },
      "elite": { title: "Elite", desc: (g) => `Tenha ${g} cartas com OVR 93 ou mais.` },
      "specials-3": { title: "Caçador de especiais", desc: (g) => `Tenha ${g} cartas especiais.` },
      "full-player": { title: "Fã número 1", desc: () => "Tenha todas as versões de um jogador." },
      "first-roster": { title: "Elenco fechado", desc: () => "Complete o elenco de qualquer time." },
    },
    team: { title: (name) => `Elenco completo: ${name}`, desc: "Tenha todas as cartas do elenco deste time." },
  },
  en: {
    heading: "Achievements", done: (n, total) => `${n} of ${total}`, all: "All", unlocked: "Unlocked",
    levels: { easy: "Easy", medium: "Medium", hard: "Hard", team: "Rosters" },
    items: {
      "first-card": { title: "First card", desc: () => "Get your first card." },
      "profile-card": { title: "That's me", desc: () => "Build your profile card." },
      "first-favorite": { title: "Teacher's pet", desc: () => "Mark a card as favorite." },
      "five-cards": { title: "Starting out", desc: (g) => `Own ${g} cards.` },
      "twenty-five": { title: "Collector", desc: (g) => `Own ${g} cards.` },
      "all-roles": { title: "Balanced team", desc: () => "Own a card of every role." },
      "five-teams": { title: "No colors", desc: (g) => `Own cards from ${g} different teams.` },
      "ovr-90": { title: "World class", desc: () => "Own a card with 90 OVR or more." },
      "played-10": { title: "Off the comfort zone", desc: (g) => `Own ${g} played-hero cards.` },
      "special-1": { title: "Special edition", desc: () => "Own a special card." },
      "hundred": { title: "Centurion", desc: (g) => `Own ${g} cards.` },
      "half": { title: "Halfway there", desc: () => "Own half of every card in the game." },
      "world": { title: "Around the world", desc: () => "Own cards from teams in every region." },
      "elite": { title: "Elite", desc: (g) => `Own ${g} cards with 93 OVR or more.` },
      "specials-3": { title: "Special hunter", desc: (g) => `Own ${g} special cards.` },
      "full-player": { title: "Number one fan", desc: () => "Own every version of one player." },
      "first-roster": { title: "Full squad", desc: () => "Complete any team's roster." },
    },
    team: { title: (name) => `Full roster: ${name}`, desc: "Own every card in this team's roster." },
  },
  es: {
    heading: "Logros", done: (n, total) => `${n} de ${total}`, all: "Todos", unlocked: "Desbloqueado",
    levels: { easy: "Fáciles", medium: "Medios", hard: "Difíciles", team: "Plantillas" },
    items: {
      "first-card": { title: "Primera carta", desc: () => "Consigue tu primera carta." },
      "profile-card": { title: "Ese soy yo", desc: () => "Arma tu carta de perfil." },
      "first-favorite": { title: "Consentida", desc: () => "Marca una carta como favorita." },
      "five-cards": { title: "Empezando la colección", desc: (g) => `Ten ${g} cartas.` },
      "twenty-five": { title: "Coleccionista", desc: (g) => `Ten ${g} cartas.` },
      "all-roles": { title: "Equipo equilibrado", desc: () => "Ten una carta de cada rol." },
      "five-teams": { title: "Sin bandera", desc: (g) => `Ten cartas de ${g} equipos distintos.` },
      "ovr-90": { title: "Clase mundial", desc: () => "Ten una carta con OVR 90 o más." },
      "played-10": { title: "Fuera de la zona de confort", desc: (g) => `Ten ${g} cartas de héroe jugado.` },
      "special-1": { title: "Edición especial", desc: () => "Ten una carta especial." },
      "hundred": { title: "Centenario", desc: (g) => `Ten ${g} cartas.` },
      "half": { title: "A mitad de camino", desc: () => "Ten la mitad de todas las cartas del juego." },
      "world": { title: "Vuelta al mundo", desc: () => "Ten cartas de equipos de todas las regiones." },
      "elite": { title: "Élite", desc: (g) => `Ten ${g} cartas con OVR 93 o más.` },
      "specials-3": { title: "Cazador de especiales", desc: (g) => `Ten ${g} cartas especiales.` },
      "full-player": { title: "Fan número 1", desc: () => "Ten todas las versiones de un jugador." },
      "first-roster": { title: "Plantilla cerrada", desc: () => "Completa la plantilla de cualquier equipo." },
    },
    team: { title: (name) => `Plantilla completa: ${name}`, desc: "Ten todas las cartas de la plantilla de este equipo." },
  },
});

const LEVELS: AchievementLevel[] = ["easy", "medium", "hard", "team"];
// cor da medalha por dificuldade: bronze, prata, ouro e o creme do site para os elencos
const MEDAL: Record<AchievementLevel, string> = { easy: "text-orange-300", medium: "text-sky-200", hard: "text-amber-300", team: "text-dl-text" };

export function Achievements({ ids, profileCard, favorites }: { ids: string[]; profileCard: boolean; favorites: number }) {
  const t = useT(S);
  const { players, teams } = useData();
  const [level, setLevel] = useState<AchievementLevel>();
  const all = achievementsFor(players, teams, ids, { profileCard, favorites });
  const done = all.filter((a) => a.done).length;
  // desbloqueadas primeiro, depois as mais perto de sair; dentro do nível, a ordem do jogo
  const shown = all.filter((a) => !level || a.level === level)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.done) - Number(x.a.done) || (x.a.done ? x.i - y.i : y.a.value / y.a.goal - x.a.value / x.a.goal || x.i - y.i))
    .map(({ a }) => a);

  return (
    <section aria-labelledby="achievements-title" className="noir-glass flex flex-col gap-5 rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="achievements-title" className="font-display text-lg font-black text-dl-text">{t.heading}</h2>
        <span className="text-sm text-zinc-400 tabular-nums">{t.done(done, all.length)}</span>
      </div>
      <div role="group" aria-label={t.heading} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!level} onClick={() => setLevel(undefined)} className={pill(!level)}>{t.all}</button>
        {LEVELS.map((l) => {
          const of = all.filter((a) => a.level === l);
          return of.length > 0 && (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(level === l ? undefined : l)} className={pill(level === l)}>
              {t.levels[l]}
              <span className="tabular-nums opacity-70">{of.filter((a) => a.done).length}/{of.length}</span>
            </button>
          );
        })}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => <AchievementTile key={a.key} a={a} t={t} />)}
      </ul>
    </section>
  );
}

function AchievementTile({ a, t }: { a: Achievement; t: Texts }) {
  const text = a.team ? { title: t.team.title(a.team.name), desc: t.team.desc } : { title: t.items[a.id as Exclude<AchievementId, "team">].title, desc: t.items[a.id as Exclude<AchievementId, "team">].desc(a.goal) };
  const pct = Math.round((a.value / a.goal) * 100);
  return (
    <li className={`flex items-center gap-3 rounded-xl p-3 ${a.done ? "bg-zinc-800/70 shadow-[0_0_18px_rgb(255_239_215/0.08)]" : "bg-zinc-900/50"}`}>
      <span className={`relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${a.done ? `bg-zinc-950 ${MEDAL[a.level]}` : "bg-zinc-900 text-zinc-600"}`}>
        {a.team
          ? <span className={`size-8 overflow-hidden rounded-md ${a.done ? "" : "opacity-40 grayscale"}`}><TeamLogo team={a.team} /></span>
          : <Icon name={a.done ? "trophy" : "lock"} className="size-6" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`truncate text-sm font-extrabold ${a.done ? "text-dl-text" : "text-zinc-300"}`}>{text.title}</span>
        <span className="text-xs text-zinc-400">{text.desc}</span>
        {a.done ? (
          <span className={`text-[11px] font-bold tracking-widest uppercase ${MEDAL[a.level]}`}>{t.unlocked}</span>
        ) : (
          <div className="flex items-center gap-2">
            <div role="progressbar" aria-label={text.title} aria-valuenow={a.value} aria-valuemin={0} aria-valuemax={a.goal} className="h-1.5 flex-1 rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-zinc-400" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-zinc-400 tabular-nums">{a.value}/{a.goal}</span>
          </div>
        )}
      </div>
    </li>
  );
}
