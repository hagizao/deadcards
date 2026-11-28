/**
 * Tela de carregamento do site (F5, primeira visita): a marca com o losango aceso e uma barra fina andando.
 * O index.html tem a mesma marcação dentro do #root, para ela aparecer antes do JavaScript; mudou aqui, mude lá.
 */
export function BootScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 boot-screen">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="size-4 rotate-45 boot-mark rounded-[3px] bg-dl-text sm:size-5" />
        <span className="font-display text-3xl font-black tracking-[0.2em] text-white uppercase title-depth sm:text-5xl">
          Cards<span className="text-dl-text">lock</span>
        </span>
      </div>
      <span aria-hidden="true" className="boot-bar h-0.5 w-40 rounded-full bg-zinc-200/10 sm:w-56" />
      <p role="status" className="sr-only">{label}</p>
    </div>
  );
}
