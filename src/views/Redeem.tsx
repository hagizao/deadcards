import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, call, useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { easeOut, field, pageTitle, primaryBtn } from "../lib/ui";
import { addOwned } from "../lib/myCards";
import { Card } from "../components/Card";
import { SignInOptions } from "./Login";
import { PackArt } from "../components/Pack";
import { PackOpening } from "../components/PackOpening";
import type { InventoryPack } from "../lib/packs";

const S = strings({
  pt: {
    title: "Resgatar código",
    subtitle: "Digite o código para ganhar uma carta ou um pack.",
    signIn: "Entre para resgatar cartas e packs com um código.",
    packs: "Seus packs",
    noPacks: "Nenhum pack fechado. Packs chegam por código.",
    open: "Abrir",
    testPack: "Teste · não gasta",
    packDone: "Pack no seu inventário. Abra quando quiser!",
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
      pack_owned: "você já resgatou este pack",
    } as Record<string, string>,
  },
  en: {
    title: "Redeem a code",
    subtitle: "Enter the code to get a card or a pack.",
    signIn: "Sign in to redeem cards and packs with a code.",
    packs: "Your packs",
    noPacks: "No closed packs. Packs come from codes.",
    open: "Open",
    testPack: "Test · not spent",
    packDone: "Pack added to your inventory. Open it whenever you want!",
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
      pack_owned: "You already redeemed this pack.",
    },
  },
  es: {
    title: "Canjear código",
    subtitle: "Escribe el código para ganar una carta o un pack.",
    signIn: "Inicia sesión para canjear cartas y packs con un código.",
    packs: "Tus packs",
    noPacks: "Ningún pack cerrado. Los packs llegan por código.",
    open: "Abrir",
    testPack: "Prueba · no se gasta",
    packDone: "Pack en tu inventario. ¡Ábrelo cuando quieras!",
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
      pack_owned: "Ya canjeaste este pack.",
    },
  },
});

/** Aba Resgatar: código vira carta na coleção, e a carta nova aparece grande logo abaixo. */
export function Redeem({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const t = useT(S);
  const { me, players } = useData();
  const [last, setLast] = useState<string | null>(null);
  const card = last ? players.find((p) => p.id === last) : undefined;
  const [packs, setPacks] = useState<InventoryPack[] | null>(null);
  const [opening, setOpening] = useState<InventoryPack | null>(null);
  const loadPacks = useCallback(() => api.inventory().then((r) => setPacks(r.packs)).catch(() => setPacks([])), []);
  useEffect(() => { if (me) loadPacks(); }, [me, loadPacks]);
  const closeOpening = useCallback(() => { setOpening(null); loadPacks(); }, [loadPacks]);
  return (
    <section className="flex flex-col gap-6">
      <div className="noir-glass flex flex-col gap-4 rounded-2xl p-5 sm:p-7">
        <div>
          <h1 className={pageTitle}>{t.title}</h1>
          <p className="mt-1.5 text-xs text-zinc-400">{me ? t.subtitle : t.signIn}</p>
        </div>
        {me
          ? <RedeemForm onCard={(id) => { addOwned(id); setLast(id); }} onPack={() => { setLast(null); loadPacks(); }} />
          : <div className="max-w-sm"><SignInOptions /></div>}
      </div>

      {me && packs && (
        <div className="noir-glass flex flex-col gap-4 rounded-2xl p-5 sm:p-7">
          <h2 className="text-sm font-extrabold tracking-[0.2em] text-dl-text uppercase">{t.packs} {packs.length > 0 && <span className="text-zinc-400">({packs.length})</span>}</h2>
          {packs.length === 0 ? <p className="text-xs text-zinc-400">{t.noPacks}</p> : (
            <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
              {packs.map((p, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setOpening(p)} aria-label={`${t.open}: ${p.type.name}${p.test ? ` (${t.testPack})` : ""}`}
                    className="group flex cursor-pointer flex-col items-center gap-2 rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dl-text">
                    <span className="transition group-hover:-translate-y-1 group-active:scale-95 motion-reduce:transition-none"><PackArt name={p.type.name} art={p.type.art} alive delay={i * 1.3} /></span>
                    <span className="text-xs font-extrabold tracking-widest text-dl-text uppercase">{t.open}</span>
                    {p.test && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300 uppercase">{t.testPack}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AnimatePresence>
        {opening && <PackOpening key={opening.id} pack={opening} onClose={closeOpening} onOpened={addOwned} />}
      </AnimatePresence>

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

/** Formulário de resgate por código: o código dá uma carta (vai para a coleção) ou um pack (vai para o inventário). */
function RedeemForm({ onCard, onPack }: { onCard: (id: string) => void; onPack: () => void }) {
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
      setCode("");
      if (body.packId) {
        onPack();
        setMsg({ ok: true, text: t.packDone });
        return;
      }
      const id = body.playerId!;
      onCard(id);
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
