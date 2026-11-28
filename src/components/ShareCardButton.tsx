import { useEffect, useState } from "react";
import { strings, useT } from "../lib/i18n";
import { cardPath } from "../lib/route";
import { pill } from "../lib/ui";

const S = strings({
  pt: { share: "Compartilhar carta", copied: "Link copiado", text: (name: string) => `A carta de ${name} no Cardslock`, failed: "Copie o link:" },
  en: { share: "Share card", copied: "Link copied", text: (name: string) => `${name}'s card on Cardslock`, failed: "Copy the link:" },
  es: { share: "Compartir carta", copied: "Enlace copiado", text: (name: string) => `La carta de ${name} en Cardslock`, failed: "Copia el enlace:" },
});

/** O link da carta (/c/<id>, com a prévia da arte). */
export function ShareCardButton({ id, name }: { id: string; name: string }) {
  const t = useT(S);
  return <ShareLinkButton path={cardPath(id)} label={t.share} title={t.text(name)} />;
}

/** Compartilha um link do site: no celular abre o compartilhar do sistema; no computador, copia. */
export function ShareLinkButton({ path, label, title, disabled }: { path: string; label: string; title: string; disabled?: boolean }) {
  const t = useT(S);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const url = new URL(path, location.origin).href;
  useEffect(() => {
    // o aviso de copiado some sozinho; o campo do link (quando a cópia falha) fica até a carta fechar
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const share = async () => {
    // compartilhar do sistema só onde há toque (celular): no computador ele abre uma janela pouco útil, copiar é mais direto
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => void share()} disabled={disabled}
        className={`${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`}>
        <span aria-live="polite">{state === "copied" ? t.copied : label}</span>
      </button>
      {state === "failed" && (
        <label className="flex flex-col gap-1 text-xs text-zinc-300">
          {t.failed}
          {/* sem permissão de copiar: o link aparece já selecionado para copiar à mão */}
          <input readOnly value={url} ref={(el) => el?.select()} onFocus={(e) => e.target.select()}
            className="w-64 max-w-full rounded-md bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-100" />
        </label>
      )}
    </div>
  );
}
