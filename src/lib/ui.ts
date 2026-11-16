export const easeOut = [0.23, 1, 0.32, 1] as const;

const focus ="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100";

export const pill = (active: boolean) =>
  `min-h-11 sm:min-h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-bold uppercase tracking-widest cursor-pointer ${focus} ${
    active
      ? "border-dl-text bg-dl-text text-dl-black shadow-[0_0_12px_rgba(255,239,215,0.2)]"
      : "border-black/50 bg-linear-to-b from-dl-bevel-from to-dl-bevel-to text-white text-shadow-xs hover:from-dl-bevel-hover-from hover:to-dl-bevel-hover-to"
  }`;

export const field = `min-h-11 sm:min-h-9 px-3 rounded-lg bg-zinc-900/80 border border-zinc-200/15 text-sm text-zinc-100 placeholder:text-zinc-500 ${focus}`;

export const primaryBtn = `min-h-11 sm:min-h-9 inline-flex items-center justify-center px-5 rounded-lg bg-dl-text text-xs font-extrabold uppercase tracking-widest text-dl-black cursor-pointer transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed ${focus}`;

export const pageTitle = "font-display text-2xl font-extrabold tracking-[0.11em] text-dl-text uppercase sm:text-3xl";

// Estilos de formulário do Editor (admin).
export const input = "w-full rounded-xl bg-zinc-950/80 border border-zinc-200/20 focus:border-zinc-200/70 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none";
export const btn = "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
export const primary = `${btn} bg-zinc-100 hover:bg-white text-zinc-950`;
export const ghost = `${btn} border border-zinc-200/20 text-zinc-300 hover:text-white bg-zinc-900/60`;
export const danger = `${btn} bg-red-600/90 hover:bg-red-500 text-white`;

/** "grand-finals-2026" -> "Grand Finals 2026" (slugs do EDL). */
export const slugName = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
