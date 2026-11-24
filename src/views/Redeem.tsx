import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { call, useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { easeOut, field, pageTitle, primaryBtn } from "../lib/ui";
import { addOwned } from "../lib/myCards";
import { Card } from "../components/Card";
import { SignInOptions } from "./Login";

const S = strings({
  pt: {
    title: "Resgatar código",
    subtitle: "Digite o código para colocar a carta na sua coleção.",
    signIn: "Entre para resgatar cartas com um código.",
    got: "Nova carta na sua coleção",
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
    subtitle: "Enter the code to add the card to your collection.",
    signIn: "Sign in to redeem cards with a code.",
    got: "New card in your collection",
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
    subtitle: "Escribe el código para sumar la carta a tu colección.",
    signIn: "Inicia sesión para canjear cartas con un código.",
    got: "Nueva carta en tu colección",
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

/** Aba Resgatar: código vira carta na coleção, e a carta nova aparece grande logo abaixo. */
export function Redeem({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { me, players } = useData();
  const [last, setLast] = useState<string | null>(null);
  const card = last ? players.find((p) => p.id === last) : undefined;
  return (
    <section className="flex flex-col gap-6">
      <div className="noir-glass flex flex-col gap-4 rounded-2xl p-5 sm:p-7">
        <div>
          <h1 className={pageTitle}>{t.title}</h1>
          <p className="mt-1.5 text-xs text-zinc-400">{me ? t.subtitle : t.signIn}</p>
        </div>
        {me
          ? <RedeemForm onRedeemed={(id) => { addOwned(id); setLast(id); }} />
          : <div className="max-w-sm"><SignInOptions /></div>}
      </div>
      <AnimatePresence mode="wait">
        {card && (
          <motion.div key={card.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: easeOut }}
            className="flex flex-col items-center gap-4">
            <p className="text-xs font-bold tracking-[0.2em] text-amber-200 uppercase">{t.got}</p>
            <Card player={card} onOpen={() => onOpenCard(card.id)} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Formulário de resgate por código. Avisa quem chamou com o id da carta nova. */
function RedeemForm({ onRedeemed }: { onRedeemed: (id: string) => void }) {
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
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t.placeholder}
        aria-label={t.label}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        className={`${field} w-56 tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:normal-case`}
      />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? t.redeeming : t.redeem}
      </button>
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
    </form>
  );
}
