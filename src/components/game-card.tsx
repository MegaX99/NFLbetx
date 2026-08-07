"use client";

import type { Game, PickSide } from "@/lib/picks";
import { teamName } from "@/lib/picks";

function TeamButton({ name, code, line, selected, disabled, onClick }: {
  name: string;
  code: string;
  line: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${
        selected
          ? "border-lime-500 bg-lime-50 ring-2 ring-lime-400/30"
          : "border-slate-200 hover:border-slate-400"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xs font-black ${selected ? "bg-lime-500 text-slate-950" : "bg-slate-100 text-slate-700"}`}>
        {code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-slate-950">{name}</span>
        <span className="text-xs text-slate-400">{selected ? "Your pick" : "Select team"}</span>
      </span>
      <span className="rounded-md bg-slate-950 px-2.5 py-1.5 text-sm font-black text-white">{line}</span>
    </button>
  );
}

export function GameCard({ game, selected, saving, locked, onPick }: {
  game: Game;
  selected: PickSide | null;
  saving: boolean;
  locked: boolean;
  onPick: (side: PickSide) => void;
}) {
  const awaySpread = game.home_spread * -1;
  const awayLine = awaySpread === 0 ? "PK" : awaySpread > 0 ? `+${awaySpread}` : `${awaySpread}`;
  const homeLine = game.home_spread === 0 ? "PK" : game.home_spread > 0 ? `+${game.home_spread}` : `${game.home_spread}`;
  const kickoff = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(game.kickoff_at));

  return (
    <article className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{kickoff}</p>
        <span className={`text-xs font-semibold ${locked ? "text-amber-700" : "text-slate-400"}`}>
          {saving ? "Savingâ€¦" : locked ? "Locked" : selected ? "Saved" : "Open"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamButton name={teamName(game.away_team)} code={game.away_team} line={awayLine} selected={selected === "away"} disabled={locked || saving} onClick={() => onPick("away")} />
        <span className="text-center text-xs font-black text-slate-300">AT</span>
        <TeamButton name={teamName(game.home_team)} code={game.home_team} line={homeLine} selected={selected === "home"} disabled={locked || saving} onClick={() => onPick("home")} />
      </div>
    </article>
  );
}

