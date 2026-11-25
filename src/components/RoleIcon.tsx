// Emblema de cada posição (chaves de POSITIONS em lib/cards), em traço, para usar sobre fundo escuro.

const PATHS: Record<string, string[]> = {
  // mira: quem carrega o dano
  Carry: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M12 7a5 5 0 1 0 0.01 0", "M12 11.2v1.6"],
  // espada: dano secundário
  OffCarry: ["M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15Z", "M6 12l6 6", "M3.5 20.5l3-3"],
  // escudo: linha de frente
  Frontline: ["M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6Z", "M12 8v8", "M8.5 11h7"],
  // setas trocando: joga em qualquer função
  Flex: ["M4 9h13l-3-3", "M20 15H7l3 3"],
  // cruz: suporte
  Suporte: ["M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5Z"],
};

export function RoleIcon({ position, className }: { position: string; className?: string }) {
  const d = PATHS[position];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}
