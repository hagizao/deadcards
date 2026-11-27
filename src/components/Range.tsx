export function Range({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase"><span>{label}</span><span className="text-zinc-100 tabular-nums">{value}</span></span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-zinc-100 disabled:cursor-not-allowed disabled:opacity-40" />
    </label>
  );
}
