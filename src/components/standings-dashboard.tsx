"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { PlayerAvatar } from "@/components/player-avatar";

type Pool = { id: string; name: string; season: number };
type Standing = {
  rank: number;
  entry_id: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  wins: number;
  losses: number;
  pushes: number;
  games_decided: number;
  win_percentage: number | string;
  week_number: number;
  week_wins: number;
  week_losses: number;
  week_pushes: number;
};

function record(wins: number, losses: number, pushes: number) {
  return pushes ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

export function StandingsDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolId, setPoolId] = useState("");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function loadStandings(selectedPoolId: string) {
    setLoading(true);
    setNotice("");
    const { data, error } = await createClient().rpc("get_pool_standings", { target_pool_id: selectedPoolId });
    if (error) {
      setNotice(error.message);
      setStandings([]);
    } else {
      setStandings((data ?? []) as Standing[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;
      setUser(authData.user);
      if (!authData.user) { setLoading(false); return; }

      const { data, error } = await supabase.from("pools").select("id,name,season").order("created_at");
      if (!active) return;
      if (error) { setNotice(error.message); setLoading(false); return; }

      const availablePools = (data ?? []) as Pool[];
      setPools(availablePools);
      const requestedPool = new URLSearchParams(window.location.search).get("pool");
      const selectedPool = availablePools.find((pool) => pool.id === requestedPool) ?? availablePools[0];
      if (!selectedPool) { setLoading(false); return; }
      setPoolId(selectedPool.id);
      await loadStandings(selectedPool.id);
    }

    initialize();
    return () => { active = false; };
  }, []);

  async function switchPool(nextPoolId: string) {
    setPoolId(nextPoolId);
    window.history.replaceState(null, "", `/standings?pool=${encodeURIComponent(nextPoolId)}`);
    await loadStandings(nextPoolId);
  }

  const selectedPool = pools.find((pool) => pool.id === poolId);
  const weekNumber = standings[0]?.week_number ?? 1;

  if (!user) return <main className="mx-auto grid w-full max-w-xl flex-1 place-items-center px-4 py-12"><div className="panel w-full p-8 text-center"><h1 className="text-3xl font-black">Sign in to view standings</h1><Link href="/login" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign in</Link></div></main>;

  if (!loading && !pools.length) return <main className="mx-auto grid w-full max-w-xl flex-1 place-items-center px-4 py-12"><div className="panel w-full p-8 text-center"><h1 className="text-3xl font-black">Join a pool first</h1><p className="mt-3 text-slate-500">Standings are kept separately for every pool.</p><Link href="/pools" className="mt-5 inline-flex rounded-xl bg-lime-400 px-5 py-3 font-black text-slate-950">Join or create a pool</Link></div></main>;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{selectedPool?.name ?? "Your pool"}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Season standings</h1>
          <p className="mt-2 text-slate-500">Records update as NFL games are graded throughout the season.</p>
        </div>
        {pools.length > 1 && <label className="text-sm font-bold">Pool<select value={poolId} onChange={(event) => switchPool(event.target.value)} className="mt-2 block min-w-56 rounded-xl border border-slate-300 bg-white px-4 py-3">{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select></label>}
      </div>

      {notice && <p role="status" className="panel mt-6 border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{notice}</p>}

      <div className="panel mt-8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Rank</th><th className="p-4">Player</th><th className="p-4">Record</th><th className="p-4">Win %</th><th className="p-4">Week {weekNumber}</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading standings...</td></tr> : standings.length ? standings.map((player) => (
                <tr key={player.entry_id} className="border-t border-slate-100">
                  <td className="p-4 text-xl font-black">{player.rank}</td>
                  <td className="p-4"><div className="flex items-center gap-3"><PlayerAvatar screenName={player.display_name} avatarPath={player.avatar_path} /><span className="font-black">{player.display_name}</span></div></td>
                  <td className="p-4 font-bold">{record(player.wins, player.losses, player.pushes)}</td>
                  <td className="p-4">{Number(player.win_percentage).toFixed(1)}%</td>
                  <td className="p-4 font-bold text-lime-700">{record(player.week_wins, player.week_losses, player.week_pushes)}</td>
                </tr>
              )) : <tr><td colSpan={5} className="p-8 text-center text-slate-500">No active players are in this pool yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
