import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useData } from "../../lib/data";
import { strings, useLocale, useT } from "../../lib/i18n";
import { enter } from "../../lib/motion";
import { arrowBtn, sectionTitle } from "../../lib/ui";
import { Reveal } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { TournamentLogo } from "../../components/TournamentLogo";
import type { ScheduleEntry, Tournament } from "../../lib/types";

const S = strings({
  pt: {
    title: "Calendário", lead: "Quando o competitivo joga. Escolha um dia para ver o que tem; os horários estão no seu fuso.",
    prev: "Mês anterior", next: "Próximo mês", today: "Hoje", nothing: "Nada marcado neste dia.",
    upNext: "Próximo", more: "Ver no site do campeonato", events: (n: number) => `${n} ${n === 1 ? "campeonato" : "campeonatos"}`,
    startsIn: "Começa em", started: "Já começou", brazil: "Brasil em jogo", legend: "Dia com time brasileiro em jogo",
  },
  en: {
    title: "Calendar", lead: "When the competitive scene plays. Pick a day to see what's on; times are in your time zone.",
    prev: "Previous month", next: "Next month", today: "Today", nothing: "Nothing scheduled on this day.",
    upNext: "Up next", more: "See on the tournament site", events: (n: number) => `${n} ${n === 1 ? "tournament" : "tournaments"}`,
    startsIn: "Starts in", started: "Already started", brazil: "Brazil playing", legend: "Day with a Brazilian team playing",
  },
  es: {
    title: "Calendario", lead: "Cuándo juega el competitivo. Elige un día para ver qué hay; los horarios están en tu zona horaria.",
    prev: "Mes anterior", next: "Mes siguiente", today: "Hoy", nothing: "Nada programado este día.",
    upNext: "Próximo", more: "Ver en el sitio del torneo", events: (n: number) => `${n} ${n === 1 ? "torneo" : "torneos"}`,
    startsIn: "Empieza en", started: "Ya empezó", brazil: "Brasil en juego", legend: "Día con equipo brasileño en juego",
  },
});

type Ev = ScheduleEntry & { t: Tournament };
type Day = { y: number; m: number; d: number };
/** Dia no fuso de quem visita: o mesmo campeonato pode cair em dias diferentes para cada pessoa. */
const dayOf = (date: Date): Day => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
const keyOf = ({ y, m, d }: Day) => `${y}-${m}-${d}`;
const dateOf = ({ y, m, d }: Day) => new Date(y, m, d);
const sameDay = (a: Day, b: Day) => a.y === b.y && a.m === b.m && a.d === b.d;
// até 3 logos por dia no quadro, uma por campeonato; o resto vira "+n" (o painel do dia mostra cada edição)
const LOGOS = 3;
/** Nome por extenso da edição: "Deadlock Night Shift" + "EU #67". */
const fullName = (ev: Ev) => (ev.label ? `${ev.t.name} ${ev.label}` : ev.t.name);

/** Quanto falta para o jogo, em dias, horas e minutos; anda sozinho enquanto o balão está aberto. */
function Countdown({ at, startsIn, started }: { at: number; startsIn: string; started: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const left = Math.floor((at * 1000 - now) / 60_000);
  if (left < 0) return <span className="font-bold text-area">{started}</span>;
  const d = Math.floor(left / 1440), h = Math.floor((left % 1440) / 60), m = left % 60;
  return <>{startsIn} <span className="font-bold text-area tabular-nums">{d > 0 && `${d}d `}{(d > 0 || h > 0) && `${h}h `}{m}m</span></>;
}

export function Calendar() {
  const { tournaments, schedule } = useData();
  const t = useT(S);
  const locale = useLocale();
  const [now] = useState(() => new Date());
  const today = dayOf(now);
  const [selected, setSelected] = useState<Day>(today);
  const [month, setMonth] = useState({ y: today.y, m: today.m, dir: 0 });
  // campeonato aceso pelo mouse ou foco: as logos dele brilham no mês todo e o balão abre
  const [hot, setHot] = useState<{ id: string; cell: string } | null>(null);

  const events: Ev[] = schedule
    .flatMap((s) => { const tr = tournaments.find((x) => x.id === s.tournamentId); return tr ? [{ ...s, t: tr }] : []; })
    .sort((a, b) => a.startsAt - b.startsAt);
  const byDay = new Map<string, Ev[]>();
  for (const ev of events) {
    const k = keyOf(dayOf(new Date(ev.startsAt * 1000)));
    byDay.set(k, [...(byDay.get(k) ?? []), ev]);
  }

  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(month.y, month.m, 1));
  const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  // 29/11/2026 é um domingo: daí saem os nomes dos dias da semana, começando no domingo
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, 29 + i)));

  const first = new Date(month.y, month.m, 1);
  const lead = first.getDay();
  const weeks = Math.ceil((lead + new Date(month.y, month.m + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => dayOf(new Date(month.y, month.m, 1 - lead + i)));

  const shift = (dir: number) => setMonth(({ y, m }) => { const d = new Date(y, m + dir, 1); return { y: d.getFullYear(), m: d.getMonth(), dir }; });
  const pick = (day: Day) => {
    setSelected(day);
    if (day.y !== month.y || day.m !== month.m) setMonth({ y: day.y, m: day.m, dir: Math.sign(dateOf(day).getTime() - first.getTime()) });
  };

  const dayEvents = byDay.get(keyOf(selected)) ?? [];
  const upcoming = events.find((ev) => ev.startsAt * 1000 >= now.getTime());

  return (
    <section className="flex flex-col gap-6" aria-labelledby="home-calendar">
      <Reveal className="flex flex-col gap-2">
        <h2 id="home-calendar" className={sectionTitle}>{t.title}</h2>
        <p className="text-sm text-zinc-300">{t.lead}</p>
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
        {/* o dia escolhido: tudo o que tem nele, com hora, descrição e link */}
        <div className="order-2 flex flex-col gap-5 border-t border-zinc-200/15 pt-6 lg:order-1 lg:border-t-0 lg:border-r lg:pt-0 lg:pr-10" aria-live="polite">
          <div className="flex flex-col gap-1">
            {sameDay(selected, today) && <span className="text-xs font-bold tracking-widest text-area uppercase">{t.today}</span>}
            <h3 className="font-display text-2xl font-extrabold tracking-wide text-white title-depth first-letter:uppercase">{longDay.format(dateOf(selected))}</h3>
            {dayEvents.length > 0 && <span className="text-xs text-zinc-400">{t.events(dayEvents.length)}</span>}
          </div>
          {dayEvents.length ? (
            <ul className="flex flex-col gap-5">
              {dayEvents.map((ev) => (
                <li key={ev.id} className="flex gap-4">
                  <TournamentLogo t={ev.t} className="size-12 text-base" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="font-display text-base/tight font-extrabold tracking-wide text-white uppercase">
                      {ev.t.name}{ev.label && <span className="text-area"> {ev.label}</span>}
                    </p>
                    <p className="text-xs font-bold text-zinc-200 tabular-nums">{time.format(new Date(ev.startsAt * 1000))}</p>
                    {ev.brazil && <BrazilTag text={t.brazil} />}
                    {ev.t.description && <p className="text-xs text-zinc-400">{ev.t.description}</p>}
                    {ev.t.url && (
                      <a href={ev.t.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-xs font-bold text-dl-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:min-h-0">
                        {t.more}<Icon name="chevron-right" className="size-4" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-zinc-400">{t.nothing}</p>
              {upcoming && (
                <button type="button" onClick={() => pick(dayOf(new Date(upcoming.startsAt * 1000)))}
                  className="group flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-xl py-2 pr-3 text-left transition-colors hover:bg-zinc-100/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-100/10">
                  <TournamentLogo t={upcoming.t} className="size-10 text-sm" />
                  <span className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-area uppercase">{t.upNext}</span>
                    <span className="text-sm font-bold text-white">{fullName(upcoming)}</span>
                    <span className="text-xs text-zinc-400 tabular-nums first-letter:uppercase">{shortDay.format(new Date(upcoming.startsAt * 1000))} · {time.format(new Date(upcoming.startsAt * 1000))}</span>
                  </span>
                  <Icon name="chevron-right" className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* o mês: cada dia com as logos dos campeonatos; passar o mouse numa logo acende o campeonato e abre o balão */}
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-xl font-extrabold tracking-wider text-white uppercase" aria-live="polite">{monthName}</p>
            <div className="flex gap-2">
              <button type="button" className={arrowBtn} aria-label={t.prev} onClick={() => shift(-1)}><Icon name="chevron-left" className="size-5" /></button>
              <button type="button" className={arrowBtn} aria-label={t.next} onClick={() => shift(1)}><Icon name="chevron-right" className="size-5" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold tracking-wider text-zinc-500 uppercase" aria-hidden="true">
            {weekdays.map((w) => <span key={w}>{w.replace(".", "")}</span>)}
          </div>
          <AnimatePresence mode="wait" initial={false} custom={month.dir}>
            <motion.div
              key={`${month.y}-${month.m}`}
              className="grid grid-cols-7 gap-1"
              initial={{ opacity: 0, x: month.dir * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: month.dir * -16 }}
              transition={enter}
            >
              {cells.map((day, i) => {
                const k = keyOf(day);
                const evs = byDay.get(k) ?? [];
                const out = day.m !== month.m;
                const isToday = sameDay(day, today);
                const isSel = sameDay(day, selected);
                const logos = [...new Map(evs.map((ev) => [ev.t.id, ev.t])).values()];
                const br = evs.some((ev) => ev.brazil);
                const tip = hot?.cell === k ? evs.filter((ev) => ev.t.id === hot.id) : [];
                const col = i % 7;
                return (
                  <div key={k} className="relative">
                    <button
                      type="button"
                      onClick={() => pick(day)}
                      onFocus={() => evs[0] && setHot({ id: evs[0].t.id, cell: k })}
                      onBlur={() => setHot(null)}
                      aria-pressed={isSel}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={[longDay.format(dateOf(day)), ...evs.map((ev) => `${fullName(ev)}, ${time.format(new Date(ev.startsAt * 1000))}${ev.brazil ? `, ${t.brazil}` : ""}`)].join(". ")}
                      aria-describedby={tip.length ? `cal-tip-${k}` : undefined}
                      className={`flex min-h-14 w-full cursor-pointer flex-col items-center gap-1 rounded-lg px-0.5 py-1 ${logos.length ? "justify-center" : "pt-1.5"} ${br ? "br-frame" : ""} transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-100 active:bg-zinc-100/10 sm:min-h-20 ${
                        isSel ? "bg-zinc-100/10 shadow-[inset_0_-2px_0_var(--color-area)]" : "hover:bg-zinc-100/5"}`}
                    >
                      {/* dia com campeonato mostra só a logo; o número fica no rótulo para leitor de tela */}
                      {logos.length ? (
                        <span className={`flex flex-wrap items-center justify-center gap-px rounded-lg sm:gap-0.5 ${isToday ? "ring-2 ring-area ring-offset-2 ring-offset-zinc-950" : ""}`}>
                          {logos.slice(0, LOGOS).map((tr) => (
                            <span
                              key={tr.id}
                              onPointerEnter={() => setHot({ id: tr.id, cell: k })}
                              onPointerLeave={() => setHot(null)}
                              className={`transition-[scale,opacity,filter] duration-200 motion-reduce:transition-none ${
                                !hot ? "" : hot.id === tr.id ? "scale-115 drop-shadow-[0_0_8px_var(--color-area)]" : "opacity-35"}`}
                            >
                              <TournamentLogo t={tr} className={logos.length > 1 ? "size-5 text-[8px] sm:size-8 sm:text-[11px]" : "size-9 text-[11px] sm:size-14 sm:text-base"} />
                            </span>
                          ))}
                          {logos.length > LOGOS && <span className="text-[10px] font-bold text-zinc-400">+{logos.length - LOGOS}</span>}
                        </span>
                      ) : (
                        <span className={`flex size-6 items-center justify-center rounded-full text-sm tabular-nums sm:size-7 ${
                          isToday ? "bg-area font-black text-dl-black" : out ? "text-zinc-600" : "text-zinc-400"}`}>{day.d}</span>
                      )}
                    </button>
                    <AnimatePresence>
                      {tip.length > 0 && (
                        <motion.div
                          id={`cal-tip-${k}`}
                          role="tooltip"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.15 }}
                          className={`pointer-events-none absolute bottom-[calc(100%+0.5rem)] z-30 flex w-max max-w-72 flex-col gap-3 rounded-xl bg-zinc-950 p-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.65)] sm:max-w-80 ${
                            col < 2 ? "left-0" : col > 4 ? "right-0" : "left-1/2 -translate-x-1/2"}`}
                        >
                          {tip.map((ev) => (
                            <span key={ev.id} className="flex flex-col gap-1">
                              <span className="font-display text-base/tight font-extrabold tracking-wide text-white uppercase">{fullName(ev)}</span>
                              <span className="text-xs text-zinc-400"><Countdown at={ev.startsAt} startsIn={t.startsIn} started={t.started} /></span>
                            </span>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
          {events.some((ev) => ev.brazil) && (
            <p className="flex w-fit items-center gap-4 rounded-xl bg-br-green/20 py-3 pr-5 pl-3 font-display text-base/tight font-extrabold tracking-wide text-br-yellow uppercase sm:text-lg/tight">
              <span aria-hidden="true" className="br-frame size-10 shrink-0 rounded-lg" />
              {t.legend}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Selo do evento em que um time brasileiro joga, com a mesma listra verde e amarela da borda do dia. */
function BrazilTag({ text }: { text: string }) {
  return (
    <span className="flex w-fit items-center gap-2 rounded-md bg-br-green/15 py-1 pr-2 pl-1 text-xs font-extrabold tracking-wide text-br-yellow uppercase">
      <span aria-hidden="true" className="br-frame size-4 shrink-0 rounded-sm" />
      {text}
    </span>
  );
}
