"use client";

import { useState } from "react";

type Game = {
  id: string; away: string; awayCode: string; awayRecord: string;
  home: string; homeCode: string; homeRecord: string; spread: number; kickoff: string;
};

function TeamButton({ name, code, record, line, selected, onClick }: {
  name: string; code: string; record: string; line: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${selected ? "border-lime-500 bg-lime-50 ring-2 ring-lime-400/30" : "border-slate-200 hover:border-slate-400"}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xs font-black ${selected ? "bg-lime-500 text-slate-950" : "bg-slate-100 text-slate-700"}`}>{code}</span>
      <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-950">{name}</span><span className="text-xs text-slate-400">{record}</span></span>
      <span className="rounded-md bg-slate-950 px-2.5 py-1.5 text-sm font-black text-white">{line}</span>
    </button>
  );
}

export function GameCard({ game }: { game: Game }) {
  const [pick, setPick] = useState<string | null>(null);
  const awayLine = game.spread > 0 ? `+${game.spread}` : `${game.spread}`;
  const homeSpread = game.spread * -1;
  const homeLine = homeSpread > 0 ? `+${homeSpread}` : `${homeSpread}`;

  return (
    <article className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{game.kickoff}</p>
        <span className="text-xs font-semibold text-slate-400">Demo lines</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamButton name={game.away} code={game.awayCode} record={game.awayRecord} line={awayLine} selected={pick === game.awayCode} onClick={() => setPick(game.awayCode)} />
        <span className="text-center text-xs font-black text-slate-300">AT</span>
        <TeamButton name={game.home} code={game.homeCode} record={game.homeRecord} line={homeLine} selected={pick === game.homeCode} onClick={() => setPick(game.homeCode)} />
      </div>
    </article>
  );
}
