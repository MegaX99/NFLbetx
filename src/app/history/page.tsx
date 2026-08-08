"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_POOL_ID, type Game, type PickSide, teamName } from "@/lib/picks";
import { createClient } from "@/lib/supabase";

type SavedPick = {
  game_id: string;
  selected_side: PickSide;
  outcome: "win" | "loss" | "push" | null;
  points: number | null;
  submitted_at: string;
};

export default function HistoryPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<SavedPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!active) return;
      setSignedIn(Boolean(user));

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: entry, error: entryError } = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", DEFAULT_POOL_ID)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (entryError || !entry) {
        setMessage(entryError?.message ?? "Your pool entry is not available yet.");
        setLoading(false);
        return;
      }

      const [{ data: pickRows, error: pickError }, { data: gameRows, error: gameError }] = await Promise.all([
        supabase.from("picks").select("game_id,selected_side,outcome,points,submitted_at").eq("entry_id", entry.id),
        supabase.from("games").select("id,season,week,away_team,home_team,kickoff_at,home_spread,status,away_score,home_score").order("season", { ascending: false }).order("week", { ascending: false }).order("kickoff_at"),
      ]);

      if (!active) return;
      if (pickError || gameError) setMessage(pickError?.message ?? gameError?.message ?? "History could not be loaded.");
      setPicks((pickRows ?? []) as SavedPick[]);
      setGames((gameRows ?? []) as Game[]);
      setLoading(false);
    }

    loadHistory();
    return () => { active = false; };
  }, []);

  const gameMap = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const grouped = useMemo(() => {
    const weeks = new Map<string, SavedPick[]>();
    for (const pick of picks) {
      const game = gameMap.get(pick.game_id);
      if (!game) continue;
      const key = `${game.season}-${game.week}`;
      weeks.set(key, [...(weeks.get(key) ?? []), pick]);
    }
    return [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [gameMap, picks]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Personal archive</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Pick history</h1>
      <p className="mt-2 text-slate-500">Every saved selection remains here after its game and week close.</p>

      {loading ? (
        <div className="panel mt-8 p-8 text-center text-slate-500">Loading your historyâ€¦</div>
      ) : !signedIn ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="font-black">Sign in to view your pick history.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign in</Link>
        </div>
      ) : grouped.length === 0 ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="font-black">No saved picks yet.</p>
          <p className="mt-2 text-sm text-slate-500">Your Week 1 selections will appear here as soon as you make them.</p>
          <Link href="/picks" className="mt-4 inline-flex rounded-xl bg-lime-400 px-5 py-3 font-black text-slate-950">Make Week 1 picks</Link>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {grouped.map(([key, weekPicks]) => {
            const firstGame = gameMap.get(weekPicks[0].game_id)!;
            const complete = weekPicks.every((pick) => gameMap.get(pick.game_id)?.status === "final");
            return (
              <section key={key} className="panel overflow-hidden">
                <header className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-lime-400">{firstGame.season} season</p><h2 className="text-xl font-black">Week {firstGame.week}</h2></div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{complete ? "FINAL" : "OPEN"}</span>
                </header>
                <div className="divide-y divide-slate-100">
                  {weekPicks.map((pick) => {
                    const game = gameMap.get(pick.game_id)!;
                    const selectedCode = pick.selected_side === "away" ? game.away_team : game.home_team;
                    return (
                      <div key={pick.game_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                        <div><p className="text-xs font-bold text-slate-400">{game.away_team} at {game.home_team}</p><p className="mt-1 font-black">{teamName(selectedCode)}</p></div>
                        <div className="text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Result</p><p className={`mt-1 font-black ${pick.outcome === "win" ? "text-lime-700" : pick.outcome === "loss" ? "text-red-600" : "text-slate-600"}`}>{pick.outcome ? pick.outcome.toUpperCase() : "Pending"}</p></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {message && <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    </main>
  );
}

