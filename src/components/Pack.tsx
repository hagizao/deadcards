/**
 * Pack fechado: a mesma maleta da abertura vista de frente, com a etiqueta de papel e o nome do pack.
 * Tudo é medido em `cqw` (largura da maleta), então o desenho escala junto com o tamanho.
 * A arte enviada no Editor, se houver, vira o fundo da etiqueta.
 */
export function PackArt({ name, art, size = "md" }: { name: string; art?: string; size?: "sm" | "md" | "lg" }) {
  const width = size === "lg" ? "w-80" : size === "sm" ? "w-36" : "w-56";
  return (
    <div className={`@container relative aspect-3/2 ${width} drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)]`}>
      {/* alça */}
      <span aria-hidden="true" className="absolute top-0 left-1/2 h-[17%] w-[30%] -translate-x-1/2 rounded-t-[40cqw] border-[2.6cqw] border-b-0 border-[#3a3129] shadow-[inset_0_0.6cqw_0_rgb(255_239_215/0.12)]" />
      {/* corpo */}
      <div className="pack-case absolute inset-x-0 top-[13%] bottom-0 overflow-hidden rounded-[5cqw]">
        {/* frisos da tampa e da base */}
        <span aria-hidden="true" className="absolute inset-x-[6%] top-[9%] h-[3%] rounded-full bg-black/45 shadow-[0_0.4cqw_0_rgb(255_239_215/0.06)]" />
        <span aria-hidden="true" className="absolute inset-x-[6%] top-[66%] h-[3%] rounded-full bg-black/45 shadow-[0_0.4cqw_0_rgb(255_239_215/0.06)]" />
        {/* etiqueta */}
        <span className="absolute inset-x-[15%] top-[17%] flex h-[36%] flex-col items-center justify-center gap-[1cqw] overflow-hidden rounded-[0.8cqw] px-[3cqw] text-center pack-label">
          {art && <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover opacity-60" />}
          <span className="relative font-display text-[2.6cqw] font-extrabold tracking-[0.25em] text-dl-black/70 uppercase">Cardslock</span>
          <span data-pack-title className="relative line-clamp-2 font-display text-[7cqw] leading-none font-extrabold tracking-[0.04em] text-dl-black uppercase">{name}</span>
        </span>
        {/* travas */}
        <span aria-hidden="true" className="absolute top-[61%] left-[14%] h-[14%] w-[11%] rounded-[1cqw] pack-latch" />
        <span aria-hidden="true" className="absolute top-[61%] right-[14%] h-[14%] w-[11%] rounded-[1cqw] pack-latch" />
      </div>
    </div>
  );
}
