import { useState, type FormEvent } from "react";
import { call, useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { field, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    title: "Resgatar código",
    placeholder: "Código",
    label: "Código de resgate",
    redeeming: "Resgatando…",
    redeem: "Resgatar",
    done: (name: string) => `Carta resgatada: ${name}`,
    errors: {
      login: "entre para resgatar",
      empty: "código vazio",
      invalid: "código inválido, expirado ou esgotado",
      owned: "essa carta já está na sua coleção",
    } as Record<string, string>,
  },
  en: {
    title: "Redeem a code",
    placeholder: "Code",
    label: "Redeem code",
    redeeming: "Redeeming…",
    redeem: "Redeem",
    done: (name: string) => `Card redeemed: ${name}`,
    errors: {
      login: "Sign in to redeem.",
      empty: "Empty code.",
      invalid: "Invalid, expired or used-up code.",
      owned: "That card is already in your collection.",
    },
  },
  es: {
    title: "Canjear código",
    placeholder: "Código",
    label: "Código de canje",
    redeeming: "Canjeando…",
    redeem: "Canjear",
    done: (name: string) => `Carta canjeada: ${name}`,
    errors: {
      login: "Inicia sesión para canjear.",
      empty: "Código vacío.",
      invalid: "Código inválido, vencido o agotado.",
      owned: "Esa carta ya está en tu colección.",
    },
  },
});

/** Resgate de carta por código (fica na Coleção). Avisa quem chamou com o id da carta nova. */
export function RedeemForm({ onRedeemed }: { onRedeemed: (id: string) => void }) {
  const t = useT(S);
  const { players } = useData();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = await call("/api/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const id = body.playerId!;
      onRedeemed(id);
      setCode("");
      setMsg({ ok: true, text: t.done(players.find((p) => p.id === id)?.name ?? id) });
    } catch (err) {
      const e = err as Error & { code?: string };
      setMsg({ ok: false, text: (e.code && t.errors[e.code]) || e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label={t.title} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.title}</span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t.placeholder}
        aria-label={t.label}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        className={`${field} w-48 tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:normal-case`}
      />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? t.redeeming : t.redeem}
      </button>
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
    </form>
  );
}
