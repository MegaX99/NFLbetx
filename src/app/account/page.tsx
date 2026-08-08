"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-7 sm:p-9">
        <p className="eyebrow">Player account</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Your NFLbetx account</h1>

        {loading ? (
          <p className="mt-6 text-slate-500">Loading your accountâ€¦</p>
        ) : user ? (
          <div className="mt-6">
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
              <p className="mt-1 break-all font-bold">{user.email}</p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/" className="rounded-xl bg-lime-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-lime-300">Make picks</Link>
              <Link href="/pools" className="rounded-xl border border-slate-200 px-5 py-3 text-center font-bold hover:bg-slate-50">My Pools</Link>
              <button type="button" onClick={signOut} className="rounded-xl border border-slate-200 px-5 py-3 font-bold hover:bg-slate-50">Sign out</button>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-amber-50 p-5">
            <p className="font-bold text-amber-950">You are not signed in.</p>
            <Link href="/login" className="mt-3 inline-flex font-black text-amber-900 underline underline-offset-4">Go to sign in</Link>
          </div>
        )}
      </div>
    </main>
  );
}
