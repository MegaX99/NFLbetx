"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type HomePool = { id: string; name: string; commissioner_id: string };
type Entry = { id: string; pool_id: string };
type SavedPick = { entry_id: string; game_id: string };
type WeekGame = { id: string; kickoff_at: string };

export function HomeDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [pools, setPools] = useState<HomePool[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [picks, setPicks] = useState<SavedPick[]>([]);
  const [games, setGames] = useState<WeekGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("type") === "recovery") {
      window.location.replace(`/reset-password${window.location.hash}`);
      return () => { active = false; };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") {
        window.location.replace("/reset-password");
      }
    });

    async function loadHome() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!active) return;

      if (new URLSearchParams(window.location.search).get("error_code") === "otp_expired") {
        setNotice("This confirmation link has already been used or has expired. If you just confirmed your email, log in with your email and password.");
      }

      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
        return;
      }

      const [profileResult, poolResult, entryResult, gameResult] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", currentUser.id).maybeSingle(),
        supabase.from("pools").select("id,name,commissioner_id").order("created_at"),
        supabase.from("entries").select("id,pool_id").eq("user_id", currentUser.id).eq("is_active", true),
        supabase.from("games").select("id,kickoff_at").eq("season", 2026).eq("week", 1).order("kickoff_at"),
      ]);

      if (!active) return;
      const firstError = profileResult.error ?? poolResult.error ?? entryResult.error ?? gameResult.error;
      if (firstError) setNotice("Your home dashboard could not be completely loaded. Please refresh and try again.");

      const nextPools = (poolResult.data ?? []) as HomePool[];
      const nextEntries = (entryResult.data ?? []) as Entry[];
      const nextGames = (gameResult.data ?? []) as WeekGame[];
      setDisplayName(profileResult.data?.display_name ?? "Player");
      setPools(nextPools);
      setEntries(nextEntries);
      setGames(nextGames);

      if (nextEntries.length && nextGames.length) {
        const { data: pickRows, error: pickError } = await supabase
          .from("picks")
          .select("entry_id,game_id")
          .in("entry_id", nextEntries.map((entry) => entry.id))
          .in("game_id", nextGames.map((game) => game.id));
        if (!active) return;
        if (pickError) setNotice("Your saved-pick progress could not be loaded. Please refresh and try again.");
        setPicks((pickRows ?? []) as SavedPick[]);
      }

      setLoading(false);
    }

    loadHome();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const currentPool = pools[0] ?? null;
  const currentEntry = entries.find((entry) => entry.pool_id === currentPool?.id) ?? null;
  const completedPicks = currentEntry ? picks.filter((pick) => pick.entry_id === currentEntry.id).length : 0;
  const progress = games.length ? Math.round((completedPicks / games.length) * 100) : 0;
  const commissionerCount = user ? pools.filter((pool) => pool.commissioner_id === user.id).length : 0;
  const firstKickoff = useMemo(() => games[0]?.kickoff_at, [games]);

  if (loading) {
    return <main className="mx-auto grid w-full max-w-6xl flex-1 place-items-center px-4 py-12"><div className="panel w-full p-10 text-center text-slate-500">Loading NFLbetx...</div></main>;
  }

  if (!user) {
    return (
      <main className="flex-1">
        <section className="overflow-hidden bg-slate-950 text-white">
          {notice && <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6"><p role="status" className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">{notice}</p></div>}
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div>
              <p className="eyebrow text-lime-400">Friendly NFL competition</p>
              <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[.95] tracking-tight sm:text-6xl">Pick every game.<br /><span className="text-lime-400">Beat the spread.</span></h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Create a private pick&apos;em pool, invite your friends, and compete against the point spread all season long.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/login?mode=signup" className="rounded-xl bg-lime-400 px-6 py-3.5 text-center font-black text-slate-950 hover:bg-lime-300">Create free account</Link>
                <Link href="/login" className="rounded-xl border border-slate-600 px-6 py-3.5 text-center font-black text-white hover:bg-slate-800">Log in</Link>
              </div>
            </div>
            <div className="relative rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-400/20 blur-3xl" />
              <p className="text-xs font-black uppercase tracking-[.2em] text-lime-400">Week 1</p>
              <h2 className="mt-3 text-3xl font-black">Your Sunday starts here.</h2>
              <div className="mt-7 space-y-3">
                {["Choose every game against the spread", "Picks save automatically", "Follow standings all season"].map((item, index) => (
                  <div key={item} className="flex items-center gap-4 rounded-xl bg-white/5 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime-400 font-black text-slate-950">{index + 1}</span>
                    <span className="font-bold text-slate-100">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="text-center"><p className="eyebrow">Simple from kickoff to final</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">How NFLbetx works</h2></div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Join a pool", "Use a friend's invitation code, or create a pool of your own."],
              ["2", "Make your picks", "Select every NFL matchup against the posted point spread."],
              ["3", "Climb the standings", "Track results, weekly records, and the season-long leaderboard."],
            ].map(([number, title, copy]) => (
              <article key={number} className="panel p-7"><span className="grid h-11 w-11 place-items-center rounded-xl bg-lime-400 font-black">{number}</span><h3 className="mt-5 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-slate-600">{copy}</p></article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-10"><p className="eyebrow text-lime-400">Your NFLbetx home</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Welcome back, {displayName}.</h1><p className="mt-3 max-w-2xl text-slate-300">Here&apos;s everything you need for Week 1.</p></section>
      {notice && <p role="status" className="panel mt-5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}

      {currentPool ? (
        <section className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          <article className="panel p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Current pool</p><h2 className="mt-2 text-3xl font-black">{currentPool.name}</h2></div><span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-black text-lime-800">WEEK 1</span></div>
            <div className="mt-7 flex items-end justify-between gap-4"><div><span className="text-5xl font-black">{completedPicks}</span><span className="text-slate-400"> / {games.length} picks</span></div><span className="text-sm font-black text-slate-500">{progress}% complete</span></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${progress}%` }} /></div>
            {firstKickoff && <p className="mt-4 text-sm text-slate-500">First kickoff: {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(firstKickoff))}</p>}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Link href={`/picks?pool=${currentPool.id}`} className="rounded-xl bg-lime-400 px-6 py-3.5 text-center font-black text-slate-950 hover:bg-lime-300">{completedPicks ? "Continue Week 1 picks" : "Make Week 1 picks"}</Link><Link href="/pools" className="rounded-xl border border-slate-300 px-6 py-3.5 text-center font-bold hover:bg-slate-50">Switch pool</Link></div>
          </article>
          <aside className="panel p-6 sm:p-8">
            <p className="eyebrow">Your season</p>
            <dl className="mt-5 space-y-5"><div className="flex items-center justify-between"><dt className="text-slate-500">Pools joined</dt><dd className="text-2xl font-black">{pools.length}</dd></div><div className="flex items-center justify-between border-t border-slate-100 pt-5"><dt className="text-slate-500">Pools managed</dt><dd className="text-2xl font-black">{commissionerCount}</dd></div><div className="flex items-center justify-between border-t border-slate-100 pt-5"><dt className="text-slate-500">Week 1 picks</dt><dd className="text-2xl font-black">{completedPicks}</dd></div></dl>
            <Link href="/history" className="mt-7 inline-flex font-black text-lime-700 hover:text-lime-800">View pick history -&gt;</Link>
          </aside>
        </section>
      ) : (
        <section className="panel mt-7 p-8 text-center sm:p-12"><p className="eyebrow">Your first step</p><h2 className="mt-3 text-3xl font-black">Join a pool to start picking</h2><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">Enter the invitation code your friend sent you, or create a pool and become the commissioner.</p><Link href="/pools" className="mt-7 inline-flex rounded-xl bg-lime-400 px-6 py-3.5 font-black text-slate-950 hover:bg-lime-300">Join or create a pool</Link></section>
      )}

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <Link href="/pools" className="panel p-6 transition hover:-translate-y-0.5 hover:shadow-md"><p className="eyebrow">Pools</p><p className="mt-2 text-xl font-black">Join, create, or manage</p></Link>
        <Link href="/standings" className="panel p-6 transition hover:-translate-y-0.5 hover:shadow-md"><p className="eyebrow">Standings</p><p className="mt-2 text-xl font-black">See who&apos;s leading</p></Link>
        <Link href="/rules" className="panel p-6 transition hover:-translate-y-0.5 hover:shadow-md"><p className="eyebrow">Rules</p><p className="mt-2 text-xl font-black">How scoring works</p></Link>
      </section>
    </main>
  );
}

