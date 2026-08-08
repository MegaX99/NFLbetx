"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Metrics = { total_users: number; total_pools: number; total_entries: number; total_picks: number; total_commissioners: number; activity_7d: number };
type RecentUser = { id: string; display_name: string; created_at: string; pool_count: number };
type PoolSummary = { id: string; name: string; code: string; created_at: string; commissioner_name: string; member_count: number; entry_count: number };
type Activity = { id: string; event_type: string; message: string; created_at: string; actor_name: string | null; subject_name: string | null; pool_name: string | null };
type OwnerData = { metrics: Metrics; recent_users: RecentUser[]; pools: PoolSummary[]; activity: Activity[] };

const labels: Record<string, string> = {
  user_created: "Account",
  pool_created: "New pool",
  pool_renamed: "Pool setting",
  invite_code_changed: "Invitation",
  pool_avatar_changed: "Pool setting",
  member_joined: "Membership",
  member_removed: "Membership",
};

export function OwnerDashboard() {
  const [data, setData] = useState<OwnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setMessage("Sign in with the NFLbetx owner account."); setLoading(false); return; }
    const { data: dashboard, error } = await supabase.rpc("get_owner_dashboard");
    if (error) setMessage("This page is restricted to the NFLbetx owner.");
    else setData(dashboard as OwnerData);
    setLoading(false);
  }

  useEffect(() => {
    async function initialize() { await load(); }
    initialize();
  }, []);

  if (loading) return <main className="mx-auto w-full max-w-6xl px-4 py-12"><div className="panel p-8 text-center text-slate-500">Loading owner metricsâ€¦</div></main>;
  if (!data) return <main className="mx-auto w-full max-w-xl px-4 py-12"><div className="panel p-8 text-center"><p className="text-xl font-black">Owner access unavailable</p><p className="mt-2 text-slate-500">{message}</p><Link href="/account" className="mt-5 inline-flex font-bold text-blue-700">Return to account</Link></div></main>;

  const metricCards: Array<[string, number, string]> = [
    ["Total users", data.metrics.total_users, "Registered accounts"],
    ["Pools", data.metrics.total_pools, "All active pools"],
    ["Commissioners", data.metrics.total_commissioners, "Unique pool managers"],
    ["Entries", data.metrics.total_entries, "Active contest entries"],
    ["Saved picks", data.metrics.total_picks, "Selections in repository"],
    ["7-day activity", data.metrics.activity_7d, "Recorded site events"],
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">NFLbetx administration</p><h1 className="mt-2 text-4xl font-black tracking-tight">Owner Dashboard</h1><p className="mt-2 text-slate-500">Site-wide health, growth, pools, and activity.</p></div><div className="flex gap-3"><button type="button" onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Refresh metrics</button><Link href="/pools" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold">My Pools</Link></div></div>

      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {metricCards.map(([label, value, detail]) => <article key={label} className="panel p-5 sm:p-6"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-4xl font-black">{value}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></article>)}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="panel overflow-hidden"><div className="border-b border-slate-200 p-6"><p className="eyebrow">Network</p><h2 className="mt-2 text-2xl font-black">All pools</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Pool</th><th className="p-4">Commissioner</th><th className="p-4">Members</th><th className="p-4">Entries</th><th className="p-4">Created</th></tr></thead><tbody>{data.pools.map((pool) => <tr key={pool.id} className="border-t border-slate-100"><td className="p-4"><p className="font-black">{pool.name}</p><p className="mt-1 font-mono text-xs text-slate-400">{pool.code}</p></td><td className="p-4 font-bold">{pool.commissioner_name}</td><td className="p-4">{pool.member_count}</td><td className="p-4">{pool.entry_count}</td><td className="p-4 text-sm text-slate-500">{new Date(pool.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></div>

        <div className="panel p-6"><p className="eyebrow">Growth</p><h2 className="mt-2 text-2xl font-black">Newest users</h2><div className="mt-5 divide-y divide-slate-100">{data.recent_users.map((user) => <div key={user.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-bold">{user.display_name}</p><p className="text-xs text-slate-400">Joined {new Date(user.created_at).toLocaleDateString()}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{user.pool_count} {user.pool_count === 1 ? "pool" : "pools"}</span></div>)}</div></div>
      </section>

      <section className="panel mt-8 p-6"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Application log</p><h2 className="mt-2 text-2xl font-black">Recent activity</h2></div><span className="text-xs text-slate-400">Latest 40 events</span></div><div className="mt-5 divide-y divide-slate-100">{data.activity.map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4"><span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{labels[item.event_type] ?? "Activity"}</span><p className="text-sm"><strong>{item.actor_name ?? item.subject_name ?? "NFLbetx"}</strong> Â· {item.message}{item.pool_name ? ` Â· ${item.pool_name}` : ""}</p><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div>)}</div></section>
    </main>
  );
}

