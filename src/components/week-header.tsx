export function WeekHeader({ firstKickoff }: { firstKickoff?: string }) {
  const lockLabel = firstKickoff
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(firstKickoff))
    : "To be announced";

  return (
    <div>
      <p className="eyebrow">2026 regular season</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Week 1 Picks</h1>
          <p className="mt-2 text-slate-500">Choose one side in every matchup. Picks save automatically.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">First lock</p>
          <p className="font-black text-slate-950">{lockLabel}</p>
        </div>
      </div>
    </div>
  );
}
