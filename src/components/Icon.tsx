const PATHS = {
  x: "M6 6l12 12M18 6 6 18",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-right": "m9 6 6 6-6 6",
  info: "M12 11v6m0-10v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  shuffle: "M4 7h3l10 10h3m0 0-3-3m3 3-3 3M4 17h3l3-3m4-4 3-3h3m0 0-3-3m3 3-3 3",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-up": "m6 15 6-6 6 6",
  "arrow-down": "M12 5v14m-6-6 6 6 6-6",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z",
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
