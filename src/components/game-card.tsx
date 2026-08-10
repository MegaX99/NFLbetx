"use client";

import Image from "next/image";
import { useState } from "react";
import type { Game, PickSide } from "@/lib/picks";
import { teamLogoUrl, teamName } from "@/lib/picks";

export type TeamRecord = { wins: number; losses: number; ties: number };

function recordText(record?: TeamRecord) {
  const { wins = 0, losses = 0, ties = 0 } = record ?? {};
  return ties > 0 ? `${wins}\u2013${losses}\u2013${ties}` : `${wins}\u2013${losses}`;
}

function TeamLogo({ code }: { code: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {imageFailed ? (
        <span className="text-xs font-black text-slate-600">{code}</span>
      ) : (
        <Image
          src={teamLogoUrl(code)}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 object-contain p-1"
          onError={() => setImageFailed(true)}
        />
      )}
    </span>
  );
}

function TeamButton({ name, code, line, record, selected, disabled, onClick }: {
  name: string;
  code: string;
  line: string;
  record?: TeamRecord;
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
      <span className="flex shrink-0 flex-col items-center gap-1.5">
        <TeamLogo code={code} />
        <span
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600"
          title={`${name} season record`}
          aria-label={`${name} season record: ${record?.wins ?? 0} wins, ${record?.losses ?? 0} losses${record?.ties ? `, ${record.ties} ties` : ""}`}
        >
          {recordText(record)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-slate-950">{name}</span>
        <span className="text-xs text-slate-400">{selected ? "Your pick" : "Select team"}</span>
      </span>
      <span className="rounded-md bg-slate-950 px-2.5 py-1.5 text-sm font-black text-white">{line}</span>
    </button>
  );
}

export function GameCard({ game, awayRecord, homeRecord, selected, saving, locked, onPick }: {
  game: Game;
  awayRecord?: TeamRecord;
  homeRecord?: TeamRecord;
  selected: PickSide | null;
  saving: boolean;
  locked: boolean;
  onPick: (side: PickSide) => void;
}) {
  const linePending = !game.spread_source;
  const awaySpread = game.home_spread * -1;
  const awayLine = linePending ? "TBD" : awaySpread === 0 ? "PK" : awaySpread > 0 ? `+${awaySpread}` : `${awaySpread}`;
  const homeLine = linePending ? "TBD" : game.home_spread === 0 ? "PK" : game.home_spread > 0 ? `+${game.home_spread}` : `${game.home_spread}`;
  const kickoff = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(game.kickoff_at));

  return (
    <article className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{kickoff}</p>
        <div className="flex items-center gap-2 text-xs font-semibold">
          {game.spread_source && <span className="text-slate-400">{game.spread_source} line</span>}
          <span className={locked || linePending ? "text-amber-700" : "text-slate-400"}>
            {saving ? "Saving..." : linePending ? "Line pending" : locked ? "Locked" : selected ? "Saved" : "Open"}
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamButton name={teamName(game.away_team)} code={game.away_team} line={awayLine} record={awayRecord} selected={selected === "away"} disabled={locked || linePending || saving} onClick={() => onPick("away")} />
        <span className="text-center text-xs font-black text-slate-300">AT</span>
        <TeamButton name={teamName(game.home_team)} code={game.home_team} line={homeLine} record={homeRecord} selected={selected === "home"} disabled={locked || linePending || saving} onClick={() => onPick("home")} />
      </div>
    </article>
  );
}

