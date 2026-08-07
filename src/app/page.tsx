import Link from "next/link";
import { GameCard } from "@/components/game-card";
import { WeekHeader } from "@/components/week-header";

const games = [
  { id: "buf-kc", away: "Buffalo Bills", awayCode: "BUF", awayRecord: "11–6", home: "Kansas City Chiefs", homeCode: "KC", homeRecord: "12–5", spread: -2.5, kickoff: "Thu, Sep 10 · 5:20 PM" },
  { id: "phi-dal", away: "Philadelphia Eagles", awayCode: "PHI", awayRecord: "13–4", home: "Dallas Cowboys", homeCode: "DAL", homeRecord: "10–7", spread: 3.5, kickoff: "Sun, Sep 13 · 1:25 PM" },
  { id: "sf-sea", away: "San Francisco 49ers", awayCode: "SF", awayRecord: "12–5", home: "Seattle Seahawks", homeCode: "SEA", homeRecord: "9–8", spread: 5.5, kickoff: "Sun, Sep 13 · 5:20 PM" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <WeekHeader />
          <div className="mt-6 space-y-4">
            {games.map((game) => <GameCard key={game.id} game={game} />)}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-6">
            <p className="eyebrow">Your week</p>
            <div className="mt-4 flex items-end justify-between">
              <div><span className="text-4xl font-black">0</span><span className="text-slate-400"> / 16 picks</span></div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">OPEN</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-0 bg-lime-500" /></div>
            <p className="mt-4 text-sm leading-6 text-slate-500">Make every pick before the first game locks Thursday at 5:20 PM.</p>
          </div>
          <div className="panel overflow-hidden bg-slate-950 p-6 text-white">
            <p className="eyebrow text-lime-400">Pool leader</p>
            <p className="mt-4 text-2xl font-black">Gridiron Gary</p>
            <p className="mt-1 text-sm text-slate-400">42–22 · 65.6% ATS</p>
            <Link href="/standings" className="mt-6 inline-flex text-sm font-bold text-lime-400 hover:text-lime-300">View full standings →</Link>
          </div>
          <div className="panel p-6">
            <p className="font-bold">How it works</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Pick each team against the spread. Every correct pick earns one point. Most points wins the week.</p>
            <Link href="/rules" className="mt-4 inline-flex text-sm font-bold text-slate-950 underline decoration-lime-400 decoration-2 underline-offset-4">Read the rules</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
