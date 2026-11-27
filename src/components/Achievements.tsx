import { useState } from "react";
import { ACHIEVEMENT_RARITIES, achievementsFor, type Achievement, type AchievementId, type AchievementRarity } from "../lib/achievements";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { MAX_FAVORITES } from "../lib/profile";
import { pill } from "../lib/ui";
import { Icon } from "./Icon";

type Text = { title: string; desc: (goal: number) => string };
type Texts = {
  heading: string; done: (n: number, total: number) => string; all: string; unlocked: string; locked: string; showAll: (n: number) => string; showLess: string;
  rarities: Record<AchievementRarity, string>; items: Record<AchievementId, Text>;
};

const S = strings<Texts>({
  pt: {
    heading: "Conquistas", done: (n, total) => `${n} de ${total}`, all: "Todas", unlocked: "Desbloqueada", locked: "Bloqueada", showAll: (n) => `Ver todas (${n})`, showLess: "Mostrar menos",
    rarities: { bronze: "Bronze", silver: "Prata", gold: "Ouro", diamond: "Diamante" },
    items: {
      "first-card": { title: "Primeira carta", desc: () => "Tenha sua primeira carta." },
      "profile-card": { title: "Essa é a minha cara", desc: () => "Monte a sua carta de perfil." },
      "first-favorite": { title: "Queridinha", desc: () => "Marque uma carta como favorita." },
      "five-cards": { title: "Começando a coleção", desc: (g) => `Tenha ${g} cartas.` },
      "first-played": { title: "Outro herói", desc: () => "Tenha uma carta de herói jogado." },
      "ovr-85": { title: "Promessa", desc: () => "Tenha uma carta com OVR 85 ou mais." },
      "twenty-five": { title: "Colecionador", desc: (g) => `Tenha ${g} cartas.` },
      "all-roles": { title: "Time equilibrado", desc: () => "Tenha uma carta de cada função." },
      "five-teams": { title: "Sem bandeira", desc: (g) => `Tenha cartas de ${g} times diferentes.` },
      "ovr-90": { title: "Classe mundial", desc: () => "Tenha uma carta com OVR 90 ou mais." },
      "played-10": { title: "Fora da zona de conforto", desc: (g) => `Tenha ${g} cartas de herói jogado.` },
      "favorites-max": { title: "Pódio", desc: (g) => `Tenha ${g} cartas favoritas.` },
      "same-hero": { title: "Especialista", desc: (g) => `Tenha ${g} cartas do mesmo herói.` },
      "roster-1": { title: "Time fechado", desc: () => "Complete o elenco de 1 time." },
      "fifty": { title: "Álbum cheio", desc: (g) => `Tenha ${g} cartas.` },
      "world": { title: "Volta ao mundo", desc: () => "Tenha cartas de times de todas as regiões." },
      "special-1": { title: "Edição especial", desc: () => "Tenha uma carta especial." },
      "full-player": { title: "Fã número 1", desc: () => "Tenha todas as versões de um jogador." },
      "heroes-20": { title: "Pool infinito", desc: (g) => `Tenha cartas de ${g} heróis diferentes.` },
      "elite": { title: "Elite", desc: (g) => `Tenha ${g} cartas com OVR 93 ou mais.` },
      "roster-2": { title: "Dono da liga", desc: () => "Complete o elenco de 2 times." },
      "hundred": { title: "Centenário", desc: (g) => `Tenha ${g} cartas.` },
      "half": { title: "Meio caminho", desc: () => "Tenha metade de todas as cartas do jogo." },
      "specials-3": { title: "Caçador de especiais", desc: (g) => `Tenha ${g} cartas especiais.` },
      "ovr-95": { title: "Lenda", desc: () => "Tenha uma carta com OVR 95 ou mais." },
      "roster-3": { title: "Dinastia", desc: () => "Complete o elenco de 3 times." },
    },
  },
  en: {
    heading: "Achievements", done: (n, total) => `${n} of ${total}`, all: "All", unlocked: "Unlocked", locked: "Locked", showAll: (n) => `Show all (${n})`, showLess: "Show less",
    rarities: { bronze: "Bronze", silver: "Silver", gold: "Gold", diamond: "Diamond" },
    items: {
      "first-card": { title: "First card", desc: () => "Get your first card." },
      "profile-card": { title: "That's me", desc: () => "Build your profile card." },
      "first-favorite": { title: "Teacher's pet", desc: () => "Mark a card as favorite." },
      "five-cards": { title: "Starting out", desc: (g) => `Own ${g} cards.` },
      "first-played": { title: "Another hero", desc: () => "Own a played-hero card." },
      "ovr-85": { title: "Prospect", desc: () => "Own a card with 85 OVR or more." },
      "twenty-five": { title: "Collector", desc: (g) => `Own ${g} cards.` },
      "all-roles": { title: "Balanced team", desc: () => "Own a card of every role." },
      "five-teams": { title: "No colors", desc: (g) => `Own cards from ${g} different teams.` },
      "ovr-90": { title: "World class", desc: () => "Own a card with 90 OVR or more." },
      "played-10": { title: "Off the comfort zone", desc: (g) => `Own ${g} played-hero cards.` },
      "favorites-max": { title: "Podium", desc: (g) => `Have ${g} favorite cards.` },
      "same-hero": { title: "Specialist", desc: (g) => `Own ${g} cards of the same hero.` },
      "roster-1": { title: "Full squad", desc: () => "Complete 1 team's roster." },
      "fifty": { title: "Full album", desc: (g) => `Own ${g} cards.` },
      "world": { title: "Around the world", desc: () => "Own cards from teams in every region." },
      "special-1": { title: "Special edition", desc: () => "Own a special card." },
      "full-player": { title: "Number one fan", desc: () => "Own every version of one player." },
      "heroes-20": { title: "Endless pool", desc: (g) => `Own cards of ${g} different heroes.` },
      "elite": { title: "Elite", desc: (g) => `Own ${g} cards with 93 OVR or more.` },
      "roster-2": { title: "League owner", desc: () => "Complete 2 teams' rosters." },
      "hundred": { title: "Centurion", desc: (g) => `Own ${g} cards.` },
      "half": { title: "Halfway there", desc: () => "Own half of every card in the game." },
      "specials-3": { title: "Special hunter", desc: (g) => `Own ${g} special cards.` },
      "ovr-95": { title: "Legend", desc: () => "Own a card with 95 OVR or more." },
      "roster-3": { title: "Dynasty", desc: () => "Complete 3 teams' rosters." },
    },
  },
  es: {
    heading: "Logros", done: (n, total) => `${n} de ${total}`, all: "Todos", unlocked: "Desbloqueado", locked: "Bloqueado", showAll: (n) => `Ver todos (${n})`, showLess: "Mostrar menos",
    rarities: { bronze: "Bronce", silver: "Plata", gold: "Oro", diamond: "Diamante" },
    items: {
      "first-card": { title: "Primera carta", desc: () => "Consigue tu primera carta." },
      "profile-card": { title: "Ese soy yo", desc: () => "Arma tu carta de perfil." },
      "first-favorite": { title: "Consentida", desc: () => "Marca una carta como favorita." },
      "five-cards": { title: "Empezando la colección", desc: (g) => `Ten ${g} cartas.` },
      "first-played": { title: "Otro héroe", desc: () => "Ten una carta de héroe jugado." },
      "ovr-85": { title: "Promesa", desc: () => "Ten una carta con OVR 85 o más." },
      "twenty-five": { title: "Coleccionista", desc: (g) => `Ten ${g} cartas.` },
      "all-roles": { title: "Equipo equilibrado", desc: () => "Ten una carta de cada rol." },
      "five-teams": { title: "Sin bandera", desc: (g) => `Ten cartas de ${g} equipos distintos.` },
      "ovr-90": { title: "Clase mundial", desc: () => "Ten una carta con OVR 90 o más." },
      "played-10": { title: "Fuera de la zona de confort", desc: (g) => `Ten ${g} cartas de héroe jugado.` },
      "favorites-max": { title: "Podio", desc: (g) => `Ten ${g} cartas favoritas.` },
      "same-hero": { title: "Especialista", desc: (g) => `Ten ${g} cartas del mismo héroe.` },
      "roster-1": { title: "Equipo cerrado", desc: () => "Completa la plantilla de 1 equipo." },
      "fifty": { title: "Álbum lleno", desc: (g) => `Ten ${g} cartas.` },
      "world": { title: "Vuelta al mundo", desc: () => "Ten cartas de equipos de todas las regiones." },
      "special-1": { title: "Edición especial", desc: () => "Ten una carta especial." },
      "full-player": { title: "Fan número 1", desc: () => "Ten todas las versiones de un jugador." },
      "heroes-20": { title: "Pool infinito", desc: (g) => `Ten cartas de ${g} héroes distintos.` },
      "elite": { title: "Élite", desc: (g) => `Ten ${g} cartas con OVR 93 o más.` },
      "roster-2": { title: "Dueño de la liga", desc: () => "Completa la plantilla de 2 equipos." },
      "hundred": { title: "Centenario", desc: (g) => `Ten ${g} cartas.` },
      "half": { title: "A mitad de camino", desc: () => "Ten la mitad de todas las cartas del juego." },
      "specials-3": { title: "Cazador de especiales", desc: (g) => `Ten ${g} cartas especiales.` },
      "ovr-95": { title: "Leyenda", desc: () => "Ten una carta con OVR 95 o más." },
      "roster-3": { title: "Dinastía", desc: () => "Completa la plantilla de 3 equipos." },
    },
  },
});

// classes inteiras por raridade (borda e cor em src/index.css) e o ícone de cada uma
const TILE: Record<AchievementRarity, string> = { bronze: "ach-tile ach-bronze", silver: "ach-tile ach-silver", gold: "ach-tile ach-gold", diamond: "ach-tile ach-diamond" };
const ICON = { bronze: "medal", silver: "star", gold: "trophy", diamond: "gem" } as const;
const COLOR: Record<AchievementRarity, string> = { bronze: "text-ach-bronze", silver: "text-ach-silver", gold: "text-ach-gold", diamond: "text-ach-diamond" };
// recolhida, a seção mostra só as primeiras (desbloqueadas e as mais perto de sair)
const COLLAPSED = 12;
// no celular a coluna é única: recolhida mostra menos para as favoritas não ficarem lá embaixo
const COLLAPSED_SMALL = 4;
const RANK: Record<AchievementRarity, number> = { bronze: 0, silver: 1, gold: 2, diamond: 3 };

export function Achievements({ ids, profileCard, favorites, collapsible = false }: { ids: string[]; profileCard: boolean; favorites: number; collapsible?: boolean }) {
  const t = useT(S);
  const { players, teams } = useData();
  const [rarity, setRarity] = useState<AchievementRarity>();
  const [open, setOpen] = useState(!collapsible);
  const all = achievementsFor(players, teams, ids, { profileCard, favorites: Math.min(favorites, MAX_FAVORITES) });
  const done = all.filter((a) => a.done).length;
  // desbloqueadas primeiro (as mais raras na frente); depois as mais perto de sair
  const shown = all.filter((a) => !rarity || a.rarity === rarity)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.done) - Number(x.a.done)
      || (x.a.done ? RANK[y.a.rarity] - RANK[x.a.rarity] : y.a.value / y.a.goal - x.a.value / x.a.goal)
      || x.i - y.i)
    .map(({ a }) => a);

  return (
    <section aria-labelledby="achievements-title" className="noir-glass flex min-w-0 flex-1 flex-col gap-5 rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="achievements-title" className="font-display text-lg font-black text-dl-text">{t.heading}</h2>
        <span className="text-sm text-zinc-400 tabular-nums">{t.done(done, all.length)}</span>
      </div>
      <div role="group" aria-label={t.heading} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!rarity} onClick={() => setRarity(undefined)} className={pill(!rarity)}>{t.all}</button>
        {ACHIEVEMENT_RARITIES.map((r) => {
          const of = all.filter((a) => a.rarity === r);
          return (
            <button key={r} type="button" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? undefined : r)} className={pill(rarity === r)}>
              <Icon name={ICON[r]} className={`size-4 ${COLOR[r]}`} />
              {t.rarities[r]}
              <span className="tabular-nums opacity-70">{of.filter((a) => a.done).length}/{of.length}</span>
            </button>
          );
        })}
      </div>
      <ul id="achievements-list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(open ? shown : shown.slice(0, COLLAPSED)).map((a, i) => <AchievementTile key={a.id} a={a} t={t} hide={!open && i >= COLLAPSED_SMALL} />)}
      </ul>
      {collapsible && shown.length > COLLAPSED_SMALL && (
        <button type="button" aria-expanded={open} aria-controls="achievements-list" onClick={() => setOpen((o) => !o)} className={`${pill(false)} self-center ${!open && shown.length <= COLLAPSED ? "lg:hidden" : ""}`}>
          {open ? t.showLess : t.showAll(shown.length)}
          <Icon name={open ? "chevron-up" : "chevron-down"} className="size-4" />
        </button>
      )}
    </section>
  );
}

function AchievementTile({ a, t, hide }: { a: Achievement; t: Texts; hide: boolean }) {
  const text = t.items[a.id];
  const pct = Math.round((a.value / a.goal) * 100);
  return (
    <li data-locked={a.done ? undefined : ""} className={`${TILE[a.rarity]} ${hide ? "max-lg:hidden" : ""} flex items-center gap-3 rounded-xl p-3`}>
      <span className="ach-medal relative flex size-12 shrink-0 items-center justify-center rounded-full bg-zinc-950">
        <Icon name={ICON[a.rarity]} className="size-6" />
        {!a.done && (
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <Icon name="lock" className="size-3" />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`truncate text-sm font-extrabold ${a.done ? "text-dl-text" : "text-zinc-300"}`}>{text.title}</span>
        <span className="text-xs text-zinc-400">{text.desc(a.goal)}</span>
        <span className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase">
          <span className={a.done ? COLOR[a.rarity] : "text-zinc-500"}>{t.rarities[a.rarity]}</span>
          {a.done && <span className="text-zinc-400">· {t.unlocked}</span>}
        </span>
        {!a.done && (
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
