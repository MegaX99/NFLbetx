const players = [
  ["1", "Gridiron Gary", "42–22", "65.6%", "3–1"],
  ["2", "Sunday Sarah", "40–24", "62.5%", "2–2"],
  ["3", "Cover King", "38–26", "59.4%", "4–0"],
  ["4", "Andy F.", "36–28", "56.3%", "2–2"],
  ["5", "Two-Minute Tina", "35–29", "54.7%", "1–3"],
];

export default function StandingsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <p className="eyebrow">The Sunday Lines Pool</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Season standings</h1>
      <p className="mt-2 text-slate-500">Sample standings for the Version 0.1 preview.</p>
      <div className="panel mt-8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Rank</th><th className="p-4">Player</th><th className="p-4">Record</th><th className="p-4">Win %</th><th className="p-4">Week 1</th></tr></thead>
            <tbody>{players.map(([rank, name, record, pct, week]) => <tr key={rank} className="border-t border-slate-100"><td className="p-4 font-black">{rank}</td><td className="p-4 font-bold">{name}</td><td className="p-4">{record}</td><td className="p-4">{pct}</td><td className="p-4 font-bold text-lime-700">{week}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
