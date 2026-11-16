// Logo de time do EDL (URL externa); sem imagem mostra a tag.
export function EdlLogo({ url, tag, name, className = "size-9" }: { url?: string; tag?: string; name?: string; className?: string }) {
  return url ? (
    <img src={url} alt="" title={name} loading="lazy" draggable={false} className={`${className} shrink-0 rounded-lg bg-zinc-950/60 object-contain`} />
  ) : (
    <span aria-hidden="true" title={name} className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200/15 bg-zinc-900 text-[10px] font-extrabold tracking-wider text-zinc-300 uppercase`}>{(tag || name || "?").slice(0, 4)}</span>
  );
}
