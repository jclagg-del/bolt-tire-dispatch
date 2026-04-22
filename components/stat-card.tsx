export function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {subtext ? <p className="mt-2 text-xs text-slate-400">{subtext}</p> : null}
    </div>
  );
}
