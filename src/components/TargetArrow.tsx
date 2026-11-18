// Seta de mira do Cardslock Game, como no Hearthstone: sai da carta, segue o cursor e encaixa no alvo válido.
// As escolhas já feitas no turno ficam marcadas com uma linha até a carta ou o local escolhido. As duas são traços de pincel seco,
// como as bordas das faixas: grossos, com a borda rasgada e falhas irregulares. A Vindicta mira com um laser de sniper reto.
import { useEffect, useRef } from "react";

type Props = {
  /** Seletor da carta que está mirando (sem ela, nenhuma seta ativa). */
  from: string | null;
  /** Escolhas já feitas: linha tracejada de `from` até `to` (seletores); `laser` desenha o laser da sniper. */
  lines: { from: string; to: string; laser?: boolean }[];
  /** A mira ativa é um laser de sniper reto (Vindicta), no lugar da seta. */
  laser?: boolean;
  /** Esc ou botão direito: deixa a escolha automática ou cancela. */
  onCancel: () => void;
};

/** Traços e falhas do pincel (a soma, 101, é o passo da animação em aim-brush). */
const BRUSH_DASH = "30 7 16 5 36 7";

const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
/** Curva que sobe antes de descer no alvo, como um arco de mira. */
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - Math.min(140, d * 0.35);
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
};

/** Reta da mira de sniper. */
const straight = (a: { x: number; y: number }, b: { x: number; y: number }) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

export function TargetArrow({ from, lines, laser = false, onCancel }: Props) {
  const pt = useRef<{ x: number; y: number } | null>(null);
  const aim = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => { cancel.current = onCancel; });

  // pontos do cursor e atalhos para sair da mira
  useEffect(() => {
    if (!from) return;
    pt.current = null;
    const move = (e: PointerEvent) => { pt.current = { x: e.clientX, y: e.clientY }; };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cancel.current(); };
    const menu = (e: MouseEvent) => { e.preventDefault(); cancel.current(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move);
    window.addEventListener("keydown", key);
    window.addEventListener("contextmenu", menu);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("keydown", key);
      window.removeEventListener("contextmenu", menu);
    };
  }, [from]);

  // a cada quadro: as cartas se mexem (molas), então a seta e as linhas acompanham sem renderizar o React
  useEffect(() => {
    if (!from && !lines.length) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = svg.current;
      if (!root) return;
      root.querySelectorAll<SVGPathElement>("[data-line]").forEach((p) => {
        const l = lines[Number(p.dataset.line)];
        const a = l && document.querySelector(l.from), b = l && document.querySelector(l.to);
        p.style.display = a && b ? "" : "none";
        if (a && b) p.setAttribute("d", (l.laser ? straight : curve)(center(a), center(b)));
      });
      const src = from ? document.querySelector(from) : null;
      if (!aim.current || !ring.current) return;
      if (!src) { aim.current.style.display = "none"; ring.current.style.display = "none"; glow.current?.style.setProperty("display", "none"); return; }
      const a = center(src);
      const p = pt.current ?? { x: a.x, y: a.y - 90 };
      const hot = pt.current ? document.elementFromPoint(p.x, p.y)?.closest("[data-target]") : null;
      const b = hot ? center(hot) : p;
      const d = (laser ? straight : curve)(a, b);
      aim.current.style.display = "";
      aim.current.setAttribute("d", d);
      aim.current.dataset.hot = hot ? "1" : "";
      if (glow.current) { glow.current.style.display = ""; glow.current.setAttribute("d", d); }
      // o ponto do laser fica sempre na ponta; o anel da seta só aparece sobre um alvo
      ring.current.style.display = hot || laser ? "" : "none";
      ring.current.setAttribute("cx", String(b.x));
      ring.current.setAttribute("cy", String(b.y));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [from, lines, laser]);

  if (!from && !lines.length) return null;
  return (
    <svg ref={svg} className="pointer-events-none fixed inset-0 z-65 size-full overflow-visible" aria-hidden="true">
      <defs>
        <marker id="aim-head" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 L2.5 5 z" className="fill-game-brass" />
        </marker>
        <marker id="aim-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.4" markerHeight="2.4">
          <circle cx="5" cy="5" r="4" className="fill-game-me" />
        </marker>
        {/* pincel seco: deslocamento por ruído rasga a borda e um grão de ruído come fiapos do traço */}
        <filter id="aim-brush" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={4} result="wave" />
          <feDisplacementMap in="SourceGraphic" in2="wave" scale={7} xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feTurbulence type="fractalNoise" baseFrequency="0.3 0.08" numOctaves={3} seed={9} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 7 -2.4" result="dry" />
          <feComposite in="torn" in2="dry" operator="in" />
        </filter>
      </defs>
      {lines.map((l, i) => l.laser ? (
        <path key={`${l.from}>${l.to}`} data-line={i} fill="none" strokeWidth="1.5" className="stroke-red-500 opacity-70 drop-shadow-[0_0_3px_var(--color-red-500)]" />
      ) : (
        <path key={`${l.from}>${l.to}`} data-line={i} fill="none" strokeWidth="7" strokeDasharray={BRUSH_DASH} strokeLinecap="butt" markerEnd="url(#aim-dot)"
          filter="url(#aim-brush)" className="aim-brush stroke-game-me opacity-80" />
      ))}
      {from && laser && (
        <>
          {/* laser de sniper: um halo largo e fraco, o fio fino e claro no meio e o ponto vermelho na ponta */}
          <path ref={glow} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-red-600/30 blur-[2px]" />
          <path ref={aim} fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-red-200 drop-shadow-[0_0_4px_var(--color-red-500)]" />
          <circle ref={ring} r="5" className="fill-red-500 drop-shadow-[0_0_6px_var(--color-red-500)]" />
        </>
      )}
      {from && !laser && (
        <>
          <path ref={aim} fill="none" strokeWidth="11" strokeLinecap="butt" strokeDasharray={BRUSH_DASH} markerEnd="url(#aim-head)"
            filter="url(#aim-brush)" className="aim-brush stroke-game-brass" />
          <circle ref={ring} r="24" fill="none" strokeWidth="6" strokeDasharray="26 6 18 5" filter="url(#aim-brush)" className="aim-ring stroke-game-brass" />
        </>
      )}
    </svg>
  );
}
