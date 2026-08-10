"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GameCard, type TeamRecord } from "@/components/game-card";
import { WeekHeader } from "@/components/week-header";
import { createClient } from "@/lib/supabase";
import { DEFAULT_POOL_ID, type Game, type PickSide } from "@/lib/picks";

type PickMap = Record<string, PickSide>;
type CompletedGame = Pick<Game, "away_team" | "home_team" | "away_score" | "home_score">;

function calculateTeamRecords(games: CompletedGame[]) {
  const records: Record<string, TeamRecord> = {};
  const getRecord = (team: string) => {
    records[team] ??= { wins: 0, losses: 0, ties: 0 };
    return records[team];
  };

  for (const game of games) {
    if (game.away_score === null || game.home_score === null) continue;
    const away = getRecord(game.away_team);
    const home = getRecord(game.home_team);
    if (game.away_score > game.home_score) {
      away.wins += 1;
      home.losses += 1;
    } else if (game.home_score > game.away_score) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.ties += 1;
      home.ties += 1;
    }
  }
  return records;
}

export function PicksDashboard({ poolId }: { poolId?: string }) {
  const activePoolId = poolId ?? DEFAULT_POOL_ID;
  const [games, setGames] = useState<Game[]>([]);
  const [teamRecords, setTeamRecords] = useState<Record<string, TeamRecord>>({});
  const [picks, setPicks] = useState<PickMap>({});
  const [entryId, setEntryId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [poolName, setPoolName] = useState("NFLbetx 2026");
  const [loading, setLoading] = useState(true);
  const [savingGame, setSavingGame] = useState<string | null>(null);
  const [refreshingOdds, setRefreshingOdds] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setNow(Date.now());
      const supabase = createClient();
      const { data: gameRows, error: gameError } = await supabase
        .from("games")
        .select("id,season,week,away_team,home_team,kickoff_at,home_spread,status,away_score,home_score,odds_event_id,spread_source,spread_updated_at")
        .eq("season", 2026)
        .eq("week", 1)
        .order("kickoff_at");

      if (!active) return;
      if (gameError) setNotice(gameError.message);
      setGames((gameRows ?? []) as Game[]);

      const { data: completedGames, error: recordError } = await supabase
        .from("games")
        .select("away_team,home_team,away_score,home_score")
        .eq("season", 2026)
        .eq("status", "final")
        .not("away_score", "is", null)
        .not("home_score", "is", null);

      if (!active) return;
      if (recordError) setNotice(recordError.message);
      setTeamRecords(calculateTeamRecords((completedGames ?? []) as CompletedGame[]));

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      setSignedIn(Boolean(user));

      if (user) {
        const { data: pool, error: poolError } = await supabase
          .from("pools")
          .select("name,commissioner_id")
          .eq("id", activePoolId)
          .maybeSingle();
        if (poolError || !pool) {
          setNotice("This pool is not available to your account. Choose one from My Pools.");
          setLoading(false);
          return;
        }
        setPoolName(pool.name);
        setIsCommissioner(pool?.commissioner_id === user.id);

        const { data: entry, error: entryError } = await supabase
          .from("entries")
          .select("id")
          .eq("pool_id", activePoolId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active) return;
        if (entryError) setNotice(entryError.message);
        if (entry) {
          setEntryId(entry.id);
          const { data: savedPicks, error: pickError } = await supabase
            .from("picks")
            .select("game_id,selected_side")
            .eq("entry_id", entry.id);

          if (!active) return;
          if (pickError) setNotice(pickError.message);
          const next: PickMap = {};
          for (const pick of savedPicks ?? []) next[pick.game_id] = pick.selected_side as PickSide;
          setPicks(next);
        }
      }

      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, [activePoolId]);

  const completed = Object.keys(picks).length;
  const firstKickoff = useMemo(() => games[0]?.kickoff_at, [games]);

  async function savePick(gameId: string, side: PickSide) {
    if (!signedIn || !entryId) {
      setNotice("Sign in before making picks so they can be saved.");
      return;
    }

    const previous = picks[gameId];
    setPicks((current) => ({ ...current, [gameId]: side }));
    setSavingGame(gameId);
    setNotice("");

    const { error } = await createClient().from("picks").upsert(
      { entry_id: entryId, game_id: gameId, selected_side: side },
      { onConflict: "entry_id,game_id" },
    );

    if (error) {
      setPicks((current) => {
        const next = { ...current };
        if (previous) next[gameId] = previous;
        else delete next[gameId];
        return next;
      });
      setNotice(error.message);
    }
    setSavingGame(null);
  }

  async function refreshOdds() {
    setRefreshingOdds(true);
    setNotice("");

    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setNotice("Please sign in again before updating point spreads.");
      setRefreshingOdds(false);
      return;
    }

    try {
      const response = await fetch("/api/odds/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poolId: activePoolId }),
      });
      const result = await response.json() as {
        message?: string;
        updates?: Array<Pick<Game, "id" | "home_spread" | "spread_source" | "spread_updated_at">>;
      };

      if (!response.ok) throw new Error(result.message || "Point spreads could not be updated.");

      if (result.updates?.length) {
        const updates = new Map(result.updates.map((game) => [game.id, game]));
        setGames((current) => current.map((game) => ({ ...game, ...updates.get(game.id) })));
      }
      setNotice(result.message || "BetMGM lines checked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Point spreads could not be updated.");
    } finally {
      setRefreshingOdds(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950 px-5 py-4 text-white">
            <div><p className="text-xs font-bold uppercase tracking-widest text-lime-400">Current pool</p><p className="mt-1 text-lg font-black">{poolName}</p></div>
            <Link href="/pools" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-800">Switch pool</Link>
          </div>
          <WeekHeader firstKickoff={firstKickoff} />
          {loading ? (
            <div className="panel mt-6 p-8 text-center text-slate-500">Loading Week 1...</div>
          ) : games.length ? (
            <div className="mt-6 space-y-4">
              {games.map((game) => (
                <GameCard key={game.id} game={game} awayRecord={teamRecords[game.away_team]} homeRecord={teamRecords[game.home_team]} selected={picks[game.id] ?? null} saving={savingGame === game.id} locked={new Date(game.kickoff_at).getTime() <= now} onPick={(side) => savePick(game.id, side)} />
              ))}
            </div>
          ) : (
            <div className="panel mt-6 p-8 text-center text-slate-500">No games are available for this week yet.</div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel p-6">
            <p className="eyebrow">Your week</p>
            <div className="mt-4 flex items-end justify-between">
              <div><span className="text-4xl font-black">{completed}</span><span className="text-slate-400"> / {games.length} picks</span></div>
              <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-bold text-lime-800">SAVED</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-lime-500 transition-all" style={{ width: games.length ? `${(completed / games.length) * 100}%` : "0%" }} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">Each selection is saved immediately and stays in your history after the week closes.</p>
          </div>

          {!signedIn && (
            <div className="panel border-amber-200 bg-amber-50 p-6">
              <p className="font-black text-amber-950">Sign in to save picks</p>
              <p className="mt-2 text-sm leading-6 text-amber-800">You can view the schedule now, but an account is required to make selections.</p>
              <Link href="/login" className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">Sign in</Link>
            </div>
          )}

          {isCommissioner && (
            <div className="panel border-blue-200 bg-blue-50 p-6">
              <p className="eyebrow text-blue-700">Commissioner</p>
              <p className="mt-3 font-black text-blue-950">BetMGM point spreads</p>
              <p className="mt-2 text-sm leading-6 text-blue-800">Import current Week 1 lines. A line freezes after the first pick on that game.</p>
              <button
                type="button"
                onClick={refreshOdds}
                disabled={refreshingOdds}
                className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                {refreshingOdds ? "Checking BetMGM..." : "Update BetMGM lines"}
              </button>
            </div>
          )}

          {notice && <p role="status" className="panel border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}

          <div className="panel overflow-hidden bg-slate-950 p-6 text-white">
            <p className="eyebrow text-lime-400">Pick archive</p>
            <p className="mt-4 text-xl font-black">Your selections, week by week</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Review saved picks and results from every completed week.</p>
            <Link href="/history" className="mt-5 inline-flex text-sm font-bold text-lime-400 hover:text-lime-300">View pick history -&gt;</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}

