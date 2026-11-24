/** Frente do pack: metalizado (ou a arte enviada), marca e nome. Preenche o elemento pai. */
export function PackFace({ name, art, title = "text-lg" }: { name: string; art?: string; title?: string }) {
  return (
    <div className="pack-foil relative flex size-full flex-col items-center justify-between overflow-hidden px-3 py-6 text-center">
      {art && <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
      <span className="relative text-[10px] font-extrabold tracking-[0.3em] text-dl-text/80 uppercase drop-shadow-[0_1px_4px_rgb(0_0_0/0.9)]">Cardslock</span>
      <span className={`relative font-display ${title} leading-tight font-extrabold tracking-[0.08em] text-dl-text uppercase drop-shadow-[0_2px_10px_rgb(0_0_0/0.9)]`}>{name}</span>
      <span aria-hidden="true" className="relative h-1 w-10 rounded-full bg-dl-text/60" />
    </div>
  );
}

/** Pack fechado em tamanho fixo, para o inventário e o Editor. */
export function PackArt({ name, art, size = "md" }: { name: string; art?: string; size?: "sm" | "md" | "lg" }) {
  const width = size === "lg" ? "w-64" : size === "sm" ? "w-28" : "w-44";
  const title = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  return (
    <div className={`aspect-5/7 ${width} drop-shadow-[0_18px_30px_rgb(0_0_0/0.55)]`}>
      <PackFace name={name} art={art} title={title} />
    </div>
  );
}
