import tableArt from "../assets/game/table.webp";

/**
 * Fundo do Cardslock Game antes da partida: o salão do bar visto da cadeira. Parede escura de papel listrado ao fundo,
 * a mesa de madeira em perspectiva embaixo do leque, o cone do lampião e fumaça passando devagar. Na partida a câmera
 * desce e a mesma madeira vira a mesa vista de cima (BarTable). Fica por cima do fundo do site.
 */
export function BarRoom() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bar-night">
      {/* parede: papel listrado bordô quase preto, mais escuro perto do chão */}
      <div className="absolute inset-0 bar-wall" />
      {/* mesa: a madeira deitada em perspectiva na metade de baixo, sumindo no escuro do fundo */}
      <div className="absolute inset-x-[-30%] bottom-0 h-[62%] perspective-[900px]">
        <img src={tableArt} alt="" draggable={false}
          className="size-full origin-bottom rotate-x-58 mask-t-from-35% mask-t-to-95% object-cover brightness-45 saturate-75" />
      </div>
      {/* cone e poça do lampião, oscilando de leve como a luz da mesa */}
      <div className="absolute inset-x-0 top-0 h-full bar-cone" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 table-flicker bg-radial-[ellipse_45%_55%_at_50%_70%] from-amber-300/20 via-amber-600/8 to-transparent to-70%" />
      {/* fumaça */}
      <div className="absolute top-[15%] left-[-20%] h-1/2 w-[70%] bar-smoke rounded-full bg-stone-300/8 blur-3xl" />
      <div className="absolute top-[35%] right-[-25%] h-2/5 w-[60%] bar-smoke rounded-full bg-stone-300/6 blur-3xl [--d:-14s]" />
      {/* bordas no escuro */}
      <div className="absolute inset-0 bg-radial-[ellipse_75%_70%_at_50%_45%] from-transparent from-45% to-black/80" />
    </div>
  );
}
