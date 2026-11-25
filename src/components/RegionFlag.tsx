// Bandeiras dos blocos regionais, desenhadas aqui (sem arquivo): Europa = União Europeia,
// América do Sul = UNASUL (bandeira de 2008), Ásia = ASEAN. A América do Norte não tem bloco com
// bandeira; a dela segue o desenho da UNASUL em azul-marinho. Brasil usa a da América do Sul.

type Flag = "eu" | "sa" | "na" | "asia";

function flagOf(region: string): Flag | null {
  const n = String(region || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
  if (n === "europa") return "eu";
  if (n === "americadosul" || n === "americasul" || n === "brasil") return "sa";
  if (n === "americadonorte" || n === "na") return "na";
  if (n === "asia") return "asia";
  return null;
}

/** Estrela de 5 pontas centrada em (cx, cy). */
const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};

// silhuetas simplificadas numa caixa 100x100
const SOUTH_AMERICA = "M33 4 L52 2 L66 9 L78 15 L90 24 L98 31 L93 42 L84 50 L76 60 L66 68 L58 74 L53 81 L48 90 L43 99 L38 96 L37 86 L37 74 L35 62 L31 50 L22 41 L16 31 L20 22 L26 14 Z";
const NORTH_AMERICA = "M2 28 L8 20 L16 14 L24 12 L34 10 L44 8 L54 14 L58 26 L64 22 L66 14 L74 10 L84 16 L92 24 L88 30 L84 34 L78 40 L74 48 L72 54 L74 62 L70 60 L64 56 L56 58 L52 62 L52 70 L58 74 L60 78 L56 82 L62 90 L64 96 L60 96 L52 88 L44 82 L38 74 L32 64 L28 56 L22 46 L18 38 L14 32 L10 30 L6 32 Z";

function Silhouette({ d, fill }: { d: string; fill: string }) {
  // cabe no anel de raio 38 centrado em (75, 50)
  return <path d={d} fill={fill} transform="translate(46 21) scale(0.58)" />;
}

export function RegionFlag({ region, className }: { region: string; className?: string }) {
  const flag = flagOf(region);
  if (!flag) return null;
  return (
    <svg viewBox="0 0 150 100" className={className} aria-hidden="true">
      {flag === "eu" && (
        <>
          <rect width="150" height="100" fill="#003399" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <polygon key={i} points={star(75 + 33 * Math.sin(a), 50 - 33 * Math.cos(a), 5.6)} fill="#ffcc00" />;
          })}
        </>
      )}
      {flag === "sa" && (
        <>
          <rect width="150" height="100" fill="#c8102e" />
          <circle cx="75" cy="50" r="38" fill="none" stroke="#f2c230" strokeWidth="3.5" />
          <Silhouette d={SOUTH_AMERICA} fill="#f2c230" />
        </>
      )}
      {flag === "na" && (
        <>
          <rect width="150" height="100" fill="#0b2a5b" />
          <circle cx="75" cy="50" r="38" fill="none" stroke="#f4f4f5" strokeWidth="3.5" />
          <Silhouette d={NORTH_AMERICA} fill="#f4f4f5" />
        </>
      )}
      {flag === "asia" && (
        <>
          <rect width="150" height="100" fill="#0039a6" />
          <circle cx="75" cy="50" r="33" fill="#f4f4f5" />
          <circle cx="75" cy="50" r="30" fill="#ce1126" />
          {/* os dez feixes de arroz da ASEAN, em pé e amarrados no meio */}
          {Array.from({ length: 10 }, (_, i) => {
            const a = -27 + i * 6;
            return (
              <g key={i}>
                <g transform={`rotate(${a} 75 58)`}>
                  <line x1="75" y1="58" x2="75" y2="34" stroke="#fcd116" strokeWidth="1.3" />
                  {[0, 1, 2, 3].map((k) => <ellipse key={k} cx={k % 2 ? 76.6 : 73.4} cy={30 + k * 3.2} rx="1.3" ry="2.4" fill="#fcd116" />)}
                </g>
                <line x1="75" y1="58" x2={75 + (i - 4.5) * 1.6} y2="72" stroke="#fcd116" strokeWidth="1.3" />
              </g>
            );
          })}
          <rect x="70" y="55.5" width="10" height="4" rx="1.5" fill="#fcd116" />
        </>
      )}
      {/* brilho de tecido */}
      <rect width="150" height="100" fill="url(#flag-sheen)" />
      <defs>
        <linearGradient id="flag-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0.12" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
