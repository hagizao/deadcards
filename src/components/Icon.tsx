const PATHS = {
  x: "M6 6l12 12M18 6 6 18",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-up": "m6 15 6-6 6 6",
  "chevron-right": "m9 5 7 7-7 7",
  "chevron-left": "m15 5-7 7 7 7",
  "arrow-down": "M12 5v14m-6-6 6 6 6-6",
  check: "m5 12 5 5 9-10",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  shield: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z",
  bars: "M4 6h16M4 12h11M4 18h6",
  cards: "M7 4h11v14H7zM4 7v13h11",
  versus: "M8 4v16M16 4v16M3 9l5-5 5 5M11 15l5 5 5-5",
  ticket: "M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4zM10 4v12",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  medal: "M8 3h3l1 5M16 3h-3l-1 5M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 12.5v5",
  gem: "M7 4h10l4 5-9 11L3 9zM3 9h18M12 20 8.5 9 10 4M12 20l3.5-11L14 4",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
