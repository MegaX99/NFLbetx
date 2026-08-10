"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { normalizeScreenName, screenNameError, validateScreenName } from "@/lib/screen-name";
import { invitationDestination, resolvePendingInvite } from "@/lib/pending-invite";

export default function ScreenNamePage() {
  const router = useRouter();
  const [screenName, setScreenName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const pendingInvite = resolvePendingInvite(new URLSearchParams(window.location.search));
      setInviteCode(pendingInvite);
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;

      if (!authData.user) {
        router.replace(invitationDestination("/login", pendingInvite));
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,screen_name_set_at")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!active) return;

      if (profile?.screen_name_set_at) {
        const { data: membership } = await supabase
          .from("pool_members")
          .select("pool_id")
          .eq("user_id", authData.user.id)
          .limit(1)
          .maybeSingle();
        router.replace(membership ? "/" : invitationDestination("/pools?welcome=1", pendingInvite, "code"));
        return;
      }

      setLoading(false);
    }

    loadProfile();
    return () => { active = false; };
  }, [router]);

  async function saveScreenName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = normalizeScreenName(screenName);
    const validationMessage = validateScreenName(cleanName);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    setSaving(true);
    setNotice("");
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.replace("/login");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: cleanName })
      .eq("id", authData.user.id);

    if (error) {
      setNotice(screenNameError(error));
      setSaving(false);
      return;
    }

    router.replace(invitationDestination("/pools?welcome=1", inviteCode, "code"));
    router.refresh();
  }

  return (
    <main className="mx-auto grid w-full max-w-xl flex-1 place-items-center px-4 py-12">
      <section className="panel w-full p-7 sm:p-9">
        <p className="eyebrow">One last step</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Choose your screen name</h1>
        <p className="mt-3 leading-7 text-slate-600">This is the name other players will see in pools and standings. Your email address stays private.</p>
        {inviteCode && <p className="mt-4 rounded-xl bg-lime-50 px-4 py-3 text-sm font-bold text-lime-900">Your pool invitation <span className="font-mono">{inviteCode}</span> is saved and will be ready on the next page.</p>}

        {loading ? <p className="mt-7 text-slate-500">Loading your player profile...</p> : (
          <form className="mt-7" onSubmit={saveScreenName}>
            <label htmlFor="screen-name" className="text-sm font-black text-slate-700">Screen name</label>
            <input
              id="screen-name"
              name="screen-name"
              value={screenName}
              onChange={(event) => setScreenName(event.target.value)}
              autoComplete="nickname"
              autoFocus
              maxLength={24}
              placeholder="Example: VegasAndy"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">3-24 characters. Letters, numbers, spaces, periods, underscores, and hyphens are allowed.</p>
            {notice && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">{notice}</p>}
            <button type="submit" disabled={saving} className="mt-6 w-full rounded-xl bg-lime-400 px-6 py-3.5 font-black text-slate-950 hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving..." : "Save screen name"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
