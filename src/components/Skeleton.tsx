/** Silhueta de uma carta enquanto os dados chegam: mesmo tamanho e recorte de escudo da carta de verdade. */
export function CardSkeleton({ size = "team" }: { size?: "team" | "medium" }) {
  return <div aria-hidden="true" className={`card-skeleton skeleton ${size === "medium" ? "card-size-team-medium" : "card-size-team"} max-w-full`} />;
}

/** Perfil carregando: carta à esquerda e conquistas à direita, no mesmo desenho da tela pronta. */
export function ProfileSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <p role="status" className="sr-only">{label}</p>
      <div className="noir-glass flex flex-col items-center gap-5 rounded-2xl p-4 sm:p-6 lg:w-fit lg:shrink-0">
        <div className="flex w-full items-center gap-3">
          <div aria-hidden="true" className="skeleton size-12 shrink-0 rounded-xl sm:size-14" />
          <div className="flex flex-1 flex-col gap-2">
            <div aria-hidden="true" className="skeleton h-5 w-40 rounded-md" />
            <div aria-hidden="true" className="skeleton h-3.5 w-24 rounded-md" />
          </div>
        </div>
        <CardSkeleton />
      </div>
      <div className="noir-glass flex flex-1 flex-col gap-4 rounded-2xl p-4 sm:p-6">
        <div aria-hidden="true" className="skeleton h-7 w-48 rounded-md" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}
