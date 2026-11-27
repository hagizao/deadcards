import { useState, type FormEvent } from "react";
import { call, useData } from "../lib/data";
import { pageTitle, pill, primaryBtn } from "../lib/ui";

const field = "w-full px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-200/15 text-sm text-zinc-100 placeholder:text-zinc-500";

export function Feedback() {
  const { me } = useData();
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [anon, setAnon] = useState(false);
  const [nick, setNick] = useState(me?.name ?? "");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const website = new FormData(e.currentTarget).get("website");
    try {
      const body = await call("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, title, message, nick: anon ? "" : nick, website }),
      });
      setTitle("");
      setMessage("");
      setMsg({ ok: true, text: "Enviado! Obrigado.", url: body.url });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className={pageTitle}>Feedback</h1>
        <p className="mt-1.5 text-xs text-zinc-400">Achou um bug ou tem uma ideia? Vira uma issue pública no GitHub do projeto.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo">
          {(["bug", "idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={pill(kind === k)}
            >
              {k === "bug" ? "Reportar bug" : "Sugerir ideia"}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título" required minLength={5} maxLength={100} className={field} />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={kind === "bug" ? "O que aconteceu e como reproduzir?" : "Qual é a ideia?"}
          aria-label="Mensagem"
          required
          minLength={10}
          maxLength={3000}
          rows={6}
          className={field}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" className="size-4 accent-zinc-100" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Enviar anônimo
        </label>
        {!anon && <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Seu nick (opcional)" aria-label="Nick" maxLength={40} className={field} />}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Enviando…" : "Enviar"}
          </button>
          {msg && (
            <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
              {msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noreferrer" className="underline">Ver no GitHub</a>}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
