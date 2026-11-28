import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { HoldButton } from "../components/HoldButton";
import { Range } from "../components/Range";
import { ART_PENDING_MAX, ART_SUBMISSIONS_PATH, ART_SUBMISSION_MAX_BYTES, previewCard, type ArtLayout, type ArtSubmission } from "../lib/artSubmissions";
import { getPlayerOvr, isMainCard, isRetired, teamOf } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { FRAME_PRESETS } from "../lib/rarity";
import { field, pageTitle, pill, primaryBtn, sectionTitle } from "../lib/ui";

const S = strings({
  pt: {
    title: "Enviar arte",
    lead: "Mande sua arte para o banco de artes do Cardslock. Teste à vontade numa carta especial: só você vê a prévia, e nada aparece no site até ser usado.",
    image: "Arte", pick: "Escolher imagem", change: "Trocar imagem", single: "Imagem única", split: "Fundo e personagem separados",
    splitHint: "Separados, eles ganham efeito paralaxe: o personagem se mexe na frente do fundo quando a carta inclina. Passe o mouse (ou o dedo) na prévia para ver.",
    whole: "Imagem", bgLayer: "Fundo", fgLayer: "Personagem", fgFormat: "PNG transparente, só o personagem.",
    formats: `PNG, JPG ou WebP, até ${ART_SUBMISSION_MAX_BYTES / 1024 / 1024} MB.`,
    preview: "Testar na carta", card: "Carta da prévia", frame: "Moldura especial", frameDefault: "Padrão da carta",
    zoom: "Zoom", x: "X", y: "Y", fgZoom: "Zoom do personagem", fgX: "X do personagem", fgY: "Y do personagem",
    credit: "Seu nome no crédito", creditPh: "@seunome", link: "Seu link", linkPh: "https://instagram.com/seunome",
    own: "Fiz esta arte (não é de IA nem de outra pessoa).",
    consent: "Autorizo o Cardslock a usar esta arte nas cartas especiais, com o meu crédito.",
    send: "Enviar arte", sending: "Enviando…", sent: "Arte enviada! Ela fica em análise.",
    mine: "Minhas artes", none: "Você ainda não enviou nenhuma arte.", limit: (n: number) => `Até ${n} artes em análise ou recusadas por vez; apague as recusadas para enviar mais.`,
    status: { pending: "Em análise", used: "Usada numa carta", rejected: "Recusada" },
    del: "Apagar", delLabel: "Apagar esta arte",
    errors: { consent: "Marque as duas confirmações.", credit: "Confira o nome e o link do crédito: o link é obrigatório.", image: "A imagem precisa ser PNG, JPG ou WebP de até 5 MB.", limit: `Você já tem ${ART_PENDING_MAX} artes em análise ou recusadas. Apague uma recusada para enviar outra.`, login: "Entre para enviar artes.", failed: "Não foi possível enviar agora." },
  },
  en: {
    title: "Submit art",
    lead: "Send your art to the Cardslock art bank. Test it freely on a special card: only you see the preview, and nothing shows on the site until it is used.",
    image: "Art", pick: "Choose image", change: "Change image", single: "Single image", split: "Background and character apart",
    splitHint: "Apart, they get a parallax effect: the character moves in front of the background as the card tilts. Hover (or drag a finger over) the preview to see it.",
    whole: "Image", bgLayer: "Background", fgLayer: "Character", fgFormat: "Transparent PNG with just the character.",
    formats: `PNG, JPG or WebP, up to ${ART_SUBMISSION_MAX_BYTES / 1024 / 1024} MB.`,
    preview: "Test on a card", card: "Preview card", frame: "Special frame", frameDefault: "Card default",
    zoom: "Zoom", x: "X", y: "Y", fgZoom: "Character zoom", fgX: "Character X", fgY: "Character Y",
    credit: "Your name in the credit", creditPh: "@yourname", link: "Your link", linkPh: "https://instagram.com/yourname",
    own: "I made this art (not AI and not someone else's).",
    consent: "I allow Cardslock to use this art on special cards, with my credit.",
    send: "Submit art", sending: "Submitting…", sent: "Art submitted! It is now under review.",
    mine: "My art", none: "You haven't submitted any art yet.", limit: (n: number) => `Up to ${n} pieces under review or declined at a time; delete declined ones to submit more.`,
    status: { pending: "Under review", used: "Used on a card", rejected: "Declined" },
    del: "Delete", delLabel: "Delete this art",
    errors: { consent: "Check both confirmations.", credit: "Check the credit name and link: the link is required.", image: "The image must be PNG, JPG or WebP up to 5 MB.", limit: `You already have ${ART_PENDING_MAX} pieces under review or declined. Delete a declined one to submit another.`, login: "Sign in to submit art.", failed: "Could not submit right now." },
  },
  es: {
    title: "Enviar arte",
    lead: "Manda tu arte al banco de artes de Cardslock. Pruébala libremente en una carta especial: solo tú ves la vista previa y nada aparece en el sitio hasta que se use.",
    image: "Arte", pick: "Elegir imagen", change: "Cambiar imagen", single: "Imagen única", split: "Fondo y personaje por separado",
    splitHint: "Por separado, tienen efecto paralaje: el personaje se mueve delante del fondo cuando la carta se inclina. Pasa el mouse (o el dedo) por la vista previa para verlo.",
    whole: "Imagen", bgLayer: "Fondo", fgLayer: "Personaje", fgFormat: "PNG transparente, solo el personaje.",
    formats: `PNG, JPG o WebP, hasta ${ART_SUBMISSION_MAX_BYTES / 1024 / 1024} MB.`,
    preview: "Probar en la carta", card: "Carta de la vista previa", frame: "Marco especial", frameDefault: "El de la carta",
    zoom: "Zoom", x: "X", y: "Y", fgZoom: "Zoom del personaje", fgX: "X del personaje", fgY: "Y del personaje",
    credit: "Tu nombre en el crédito", creditPh: "@tunombre", link: "Tu enlace", linkPh: "https://instagram.com/tunombre",
    own: "Hice esta arte (no es de IA ni de otra persona).",
    consent: "Autorizo a Cardslock a usar esta arte en cartas especiales, con mi crédito.",
    send: "Enviar arte", sending: "Enviando…", sent: "¡Arte enviada! Queda en revisión.",
    mine: "Mis artes", none: "Todavía no enviaste ninguna arte.", limit: (n: number) => `Hasta ${n} artes en revisión o rechazadas a la vez; borra las rechazadas para enviar más.`,
    status: { pending: "En revisión", used: "Usada en una carta", rejected: "Rechazada" },
    del: "Borrar", delLabel: "Borrar esta arte",
    errors: { consent: "Marca las dos confirmaciones.", credit: "Revisa el nombre y el enlace del crédito: el enlace es obligatorio.", image: "La imagen debe ser PNG, JPG o WebP de hasta 5 MB.", limit: `Ya tienes ${ART_PENDING_MAX} artes en revisión o rechazadas. Borra una rechazada para enviar otra.`, login: "Inicia sesión para enviar artes.", failed: "No se pudo enviar ahora." },
  },
});

type ErrorCode = keyof (typeof S)["pt"]["errors"];
const STATUS_TONE = { pending: "text-amber-200", used: "text-emerald-300", rejected: "text-zinc-400" } as const;

/** Imagem local para a prévia: um endereço blob: que some quando a imagem muda ou a tela fecha. Nada sobe antes do envio. */
function useLocalImage() {
  const [file, setFile] = useState<File>();
  const url = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return { file, url, setFile };
}

function ImageInput({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label className={`${pill(false)} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-100`}>
      {label}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

/** Uma camada da arte: escolher a imagem e, com ela escolhida, ajustar zoom e posição. */
function Layer({ title, hint, image, value, labels, onChange }: {
  title: string; hint: string; image: ReturnType<typeof useLocalImage>;
  value: { zoom: number; x: number; y: number }; labels: { pick: string; change: string; zoom: string; x: string; y: string };
  onChange: (patch: Partial<{ zoom: number; x: number; y: number }>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-24 text-sm font-semibold text-zinc-100">{title}</span>
        <ImageInput label={image.file ? labels.change : labels.pick} onFile={image.setFile} />
        <span className="text-xs text-zinc-400">{hint}</span>
      </div>
      {image.url && (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Range label={labels.zoom} value={value.zoom} min={50} max={300} onChange={(v) => onChange({ zoom: v })} />
          <Range label={labels.x} value={value.x} min={0} max={100} onChange={(v) => onChange({ x: v })} />
          <Range label={labels.y} value={value.y} min={0} max={100} onChange={(v) => onChange({ y: v })} />
        </div>
      )}
    </div>
  );
}

export function ArtSubmit() {
  const t = useT(S);
  const { players, teams } = useData();
  const bg = useLocalImage();
  const fg = useLocalImage();
  // fundo e personagem separados: duas imagens, e a carta faz o paralaxe entre elas
  const [split, setSplit] = useState(false);
  // cartas principais em uso, da maior OVR para a menor: a prévia começa na primeira
  const cards = players.filter((p) => isMainCard(p) && !isRetired(p)).sort((a, b) => getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name));
  const [layout, setLayout] = useState<ArtLayout>({ zoom: 100, x: 50, y: 50, fg: { zoom: 100, x: 50, y: 50 }, frame: "deco" });
  const [playerId, setPlayerId] = useState("");
  const [credit, setCredit] = useState({ name: "", url: "" });
  const [own, setOwn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [mine, setMine] = useState<ArtSubmission[]>();
  const ids = { card: useId(), credit: useId(), link: useId() };

  const load = () => fetch(ART_SUBMISSIONS_PATH).then((r) => (r.ok ? r.json() as Promise<ArtSubmission[]> : [])).then((list: ArtSubmission[]) => setMine(list), () => setMine([]));
  useEffect(() => { void load(); }, []);

  const player = cards.find((p) => p.id === playerId) ?? cards[0];
  const set = (patch: Partial<ArtLayout>) => setLayout((l) => ({ ...l, ...patch }));
  const setFg = (patch: Partial<NonNullable<ArtLayout["fg"]>>) => setLayout((l) => ({ ...l, fg: { ...l.fg!, ...patch } }));
  const chooseSplit = (on: boolean) => { setSplit(on); if (!on) fg.setFile(undefined); };
  const labels = { pick: t.pick, change: t.change, zoom: t.zoom, x: t.x, y: t.y };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bg.file) return;
    setBusy(true);
    setMsg(undefined);
    const form = new FormData();
    form.set("image", bg.file);
    if (fg.file) form.set("fg", fg.file);
    form.set("meta", JSON.stringify({ own, consent, credit: { name: credit.name.trim(), url: credit.url.trim() || undefined }, layout: { ...layout, fg: fg.file ? layout.fg : undefined, playerId: player?.id } }));
    try {
      const r = await fetch(ART_SUBMISSIONS_PATH, { method: "POST", body: form });
      if (!r.ok) {
        const code = ((await r.json().catch(() => null)) as { code?: string } | null)?.code;
        setMsg({ ok: false, text: t.errors[(code && code in t.errors ? code : "failed") as ErrorCode] });
        return;
      }
      setMsg({ ok: true, text: t.sent });
      bg.setFile(undefined);
      fg.setFile(undefined);
      setSplit(false);
      setOwn(false);
      setConsent(false);
      await load();
    } catch {
      setMsg({ ok: false, text: t.errors.failed });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`${ART_SUBMISSIONS_PATH}/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <section className="flex flex-col gap-10" aria-labelledby="art-title">
      <div className="flex flex-col gap-2">
        <h1 id="art-title" className={pageTitle}>{t.title}</h1>
        <p className="max-w-2xl text-sm text-zinc-200">{t.lead}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex justify-center lg:sticky lg:top-28 lg:w-80 lg:shrink-0">
          {player && bg.url
            ? <Card player={previewCard(player, { ...layout, fg: fg.url ? layout.fg : undefined }, bg.url, fg.url, credit.name.trim() ? { name: credit.name.trim() } : undefined)} />
            : player && <Card player={{ ...player, special: true, frame: layout.frame ? { style: layout.frame } : player.frame }} />}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-7">
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-3 text-xs font-bold tracking-widest text-zinc-300 uppercase">{t.image}</legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div role="group" aria-label={t.image} className="flex shrink-0 flex-wrap gap-2">
                <button type="button" aria-pressed={!split} onClick={() => chooseSplit(false)} className={pill(!split)}>{t.single}</button>
                <button type="button" aria-pressed={split} onClick={() => chooseSplit(true)} className={pill(split)}>{t.split}</button>
              </div>
              {/* a explicação do paralaxe fica ao lado da opção: é o convite para mandar separado */}
              <p className="max-w-prose text-xs text-zinc-300">{t.splitHint}</p>
            </div>
            <Layer title={split ? t.bgLayer : t.whole} hint={t.formats} image={bg} value={layout} labels={labels} onChange={set} />
            {split && <Layer title={t.fgLayer} hint={t.fgFormat} image={fg} value={layout.fg!} labels={{ ...labels, zoom: t.fgZoom, x: t.fgX, y: t.fgY }} onChange={setFg} />}
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-xs font-bold tracking-widest text-zinc-300 uppercase">{t.preview}</legend>
            <label htmlFor={ids.card} className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.card}
              <select id={ids.card} value={player?.id ?? ""} onChange={(e) => setPlayerId(e.target.value)} className={`${field} sm:max-w-sm`}>
                {cards.map((p) => <option key={p.id} value={p.id}>{p.name} · {teamOf(teams, p).tag} · {p.hero}</option>)}
              </select>
            </label>
            <div role="group" aria-label={t.frame} className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!layout.frame} onClick={() => set({ frame: undefined })} className={pill(!layout.frame)}>{t.frameDefault}</button>
              {Object.entries(FRAME_PRESETS).map(([key, pr]) => (
                <button key={key} type="button" aria-pressed={layout.frame === key} onClick={() => set({ frame: key })} className={pill(layout.frame === key)}>
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${pr.c1}, ${pr.c2})` }} />
                  {pr.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-4">
            <label htmlFor={ids.credit} className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.credit}
              <input id={ids.credit} required maxLength={60} placeholder={t.creditPh} value={credit.name} onChange={(e) => setCredit((c) => ({ ...c, name: e.target.value }))} className={field} />
            </label>
            <label htmlFor={ids.link} className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.link}
              <input id={ids.link} type="url" required maxLength={300} placeholder={t.linkPh} value={credit.url} onChange={(e) => setCredit((c) => ({ ...c, url: e.target.value }))} className={field} />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input type="checkbox" required checked={own} onChange={(e) => setOwn(e.target.checked)} className="size-5 shrink-0 accent-dl-text" />
              {t.own}
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-5 shrink-0 accent-dl-text" />
              {t.consent}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy || !bg.file || (split && !fg.file)} className={primaryBtn}>{busy ? t.sending : t.send}</button>
            {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
          </div>
        </div>
      </form>

      <MySubmissions list={mine} onRemove={remove} />
    </section>
  );
}

function MySubmissions({ list, onRemove }: { list?: ArtSubmission[]; onRemove: (id: string) => void }) {
  const t = useT(S);
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <section aria-labelledby="art-mine" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="art-mine" className={`${sectionTitle} deco-gem`}>{t.mine}</h2>
        <span className="text-xs text-zinc-400">{t.limit(ART_PENDING_MAX)}</span>
      </div>
      {list && !list.length && <p className="text-sm text-zinc-300">{t.none}</p>}
      {!!list?.length && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-5">
          {list.map((s) => (
            <li key={s.id} className="flex flex-col gap-2">
              <img src={s.image} alt={s.credit.name} loading="lazy" className="aspect-3/4 w-full rounded-lg bg-zinc-900 object-cover" />
              <span className={`text-xs font-bold tracking-wider uppercase ${STATUS_TONE[s.status]}`}>{t.status[s.status]}</span>
              <span className="text-xs text-zinc-400">{s.credit.name} · {date.format(s.createdAt)}</span>
              {s.status !== "used" && (
                <HoldButton onConfirm={() => onRemove(s.id)} label={t.delLabel} className={`${pill(false)} self-start`}>{t.del}</HoldButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
