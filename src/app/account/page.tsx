"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { normalizeScreenName, screenNameError, validateScreenName } from "@/lib/screen-name";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [savedScreenName, setSavedScreenName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (data.user) {
        const [{ data: owner }, { data: profile }] = await Promise.all([
          supabase.rpc("is_site_owner"),
          supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle(),
        ]);
        setIsOwner(Boolean(owner));
        setScreenName(profile?.display_name ?? "");
        setSavedScreenName(profile?.display_name ?? "");
      }
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

  async function saveScreenName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const cleanName = normalizeScreenName(screenName);
    const validationMessage = validateScreenName(cleanName);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    setSaving(true);
    setNotice("");
    const { error } = await createClient()
      .from("profiles")
      .update({ display_name: cleanName })
      .eq("id", user.id);

    if (error) {
      setNotice(screenNameError(error));
    } else {
      setScreenName(cleanName);
      setSavedScreenName(cleanName);
      setNotice("Your screen name has been updated.");
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-7 sm:p-9">
        <p className="eyebrow">Player account</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Your NFLbetx account</h1>

        {loading ? (
          <p className="mt-6 text-slate-500">Loading your account...</p>
        ) : user ? (
          <div className="mt-6">
            <form onSubmit={saveScreenName} className="rounded-xl bg-slate-50 p-5">
              <label htmlFor="account-screen-name" className="text-xs font-bold uppercase tracking-wider text-slate-400">Public screen name</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input id="account-screen-name" value={screenName} onChange={(event) => setScreenName(event.target.value)} autoComplete="nickname" maxLength={24} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100" />
                <button type="submit" disabled={saving || screenName === savedScreenName} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Other players see this name. They do not see your email address.</p>
              {notice && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm font-bold text-slate-700">{notice}</p>}
            </form>
            <div className="mt-4 rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Private login email</p>
              <p className="mt-1 break-all font-bold">{user.email}</p>
              <p className="mt-1 text-xs text-slate-500">Used for signing in and account recovery only.</p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/" className="rounded-xl bg-lime-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-lime-300">Make picks</Link>
              <Link href="/pools" className="rounded-xl border border-slate-200 px-5 py-3 text-center font-bold hover:bg-slate-50">My Pools</Link>
              {isOwner && <Link href="/owner" className="rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white hover:bg-blue-800">Owner Dashboard</Link>}
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

