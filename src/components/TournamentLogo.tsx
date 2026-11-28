import type { Tournament } from "../lib/types";

/** Logo do campeonato; sem logo, as iniciais do nome num quadrado. */
export function TournamentLogo({ t, className }: { t: Pick<Tournament, "name" | "logo">; className: string }) {
  if (t.logo) return <img src={t.logo} alt="" className={`${className} shrink-0 rounded-lg object-contain`} />;
  const initials = t.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return <span aria-hidden="true" className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-zinc-800 font-black text-dl-text`}>{initials}</span>;
}
