/**
 * Frente do pack: metalizado (ou a arte enviada), com volume nas laterais e faixas de selagem.
 * Marca e nome ficam no terço de cima, longe dos atributos da carta (onde a abertura rasga). Preenche o elemento pai.
 */
export function PackFace({ name, art, title = "text-lg" }: { name: string; art?: string; title?: string }) {
  return (
    <div className="pack-foil relative flex size-full flex-col items-center justify-between overflow-hidden px-3 pt-[14%] pb-6 text-center pack-shape">
      {art && <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
      {/* volume: laterais mais escuras, como um saquinho cheio */}
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.5),transparent_16%,rgb(255_239_215/0.05)_50%,transparent_84%,rgb(0_0_0/0.5))]" />
      {/* faixas de selagem em cima e embaixo */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[6%] bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.28)_0_2px,transparent_2px_5px)] shadow-[0_1px_0_rgb(255_239_215/0.12)]" />
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[6%] bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.28)_0_2px,transparent_2px_5px)] shadow-[0_-1px_0_rgb(255_239_215/0.12)]" />
      <span className="relative flex flex-col items-center gap-2">
        <span className="text-[10px] font-extrabold tracking-[0.3em] text-dl-text/80 uppercase drop-shadow-[0_1px_4px_rgb(0_0_0/0.9)]">Cardslock</span>
        <span data-pack-title className={`font-display ${title} leading-tight font-extrabold tracking-[0.08em] text-dl-text uppercase drop-shadow-[0_2px_10px_rgb(0_0_0/0.9)]`}>{name}</span>
      </span>
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
