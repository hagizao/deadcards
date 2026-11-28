// Mês do calendário de campeonatos, usado na Home e no Editor. Tudo no fuso de quem vê.

export type Day = { y: number; m: number; d: number };

/** Dia no fuso de quem visita: o mesmo campeonato pode cair em dias diferentes para cada pessoa. */
export const dayOf = (date: Date): Day => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
export const dayKey = ({ y, m, d }: Day) => `${y}-${m}-${d}`;
export const dateOf = ({ y, m, d }: Day) => new Date(y, m, d);
export const sameDay = (a: Day, b: Day) => a.y === b.y && a.m === b.m && a.d === b.d;

/** Semanas inteiras (domingo a sábado) que cobrem o mês, com as pontas dos meses vizinhos. */
export function monthCells(y: number, m: number): Day[] {
  const lead = new Date(y, m, 1).getDay();
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => dayOf(new Date(y, m, 1 - lead + i)));
}

/** Nomes curtos dos dias da semana, de domingo a sábado (29/11/2026 é um domingo). */
export const weekdayNames = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, 29 + i)).replace(".", ""));

/** Agrupa por dia local, na ordem em que os itens vierem. */
export function groupByDay<T extends { startsAt: number }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = dayKey(dayOf(new Date(it.startsAt * 1000)));
    out.set(k, [...(out.get(k) ?? []), it]);
  }
  return out;
}
