export const easeOut = [0.23, 1, 0.32, 1] as const;

const focus ="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100";

/**
 * Botão de filtro e ação secundária, sem caixa: só o texto. Ativo fica branco com uma barra embaixo;
 * o fundo aparece só no hover, para mostrar que é clicável.
 */
export const pill = (active: boolean) =>
  `min-h-11 sm:min-h-9 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-bold uppercase tracking-widest cursor-pointer transition-colors ${focus} ${
    active
      ? "text-white shadow-[inset_0_-2px_0_var(--color-dl-text)]"
      : "text-zinc-400 hover:bg-zinc-100/5 hover:text-white active:bg-zinc-100/10"
  }`;

/** Campo e select sem caixa: só uma linha embaixo, que acende no foco; o texto começa na mesma linha do rótulo (px-0). O menu do select é estilizado no index.css. */
export const field = `min-h-11 sm:min-h-9 px-0 bg-transparent border-0 border-b border-zinc-200/20 rounded-none text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors hover:border-zinc-200/45 focus:border-dl-text ${focus}`;

export const primaryBtn = `min-h-11 sm:min-h-9 inline-flex items-center justify-center px-5 rounded-lg bg-dl-text text-xs font-extrabold uppercase tracking-widest text-dl-black cursor-pointer transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed ${focus}`;

/** Títulos levam a cor da área (lib/areas.ts) e volume (title-depth no index.css); o resto do site fica no branco. */
export const pageTitle = "font-display text-4xl font-extrabold tracking-[0.11em] text-area uppercase title-depth sm:text-5xl";
export const sectionTitle = "font-display text-xl font-extrabold tracking-[0.11em] text-area uppercase title-depth sm:text-2xl";
