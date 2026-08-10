"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { normalizeScreenName, screenNameError, validateScreenName } from "@/lib/screen-name";
import { PlayerAvatar } from "@/components/player-avatar";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [savedScreenName, setSavedScreenName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarWorking, setAvatarWorking] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (data.user) {
        const [{ data: owner }, { data: profile }] = await Promise.all([
          supabase.rpc("is_site_owner"),
          supabase.from("profiles").select("display_name,avatar_path").eq("id", data.user.id).maybeSingle(),
        ]);
        setIsOwner(Boolean(owner));
        setScreenName(profile?.display_name ?? "");
        setSavedScreenName(profile?.display_name ?? "");
        setAvatarPath(profile?.avatar_path ?? null);
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

  async function uploadAvatar(file?: File) {
    if (!file || !user) return;
    if (!["image/png", "image/gif"].includes(file.type)) {
      setNotice("Please choose a PNG or GIF image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Please choose an image smaller than 2 MB.");
      return;
    }

    setAvatarWorking(true);
    setNotice("");
    const supabase = createClient();
    const extension = file.type === "image/gif" ? "gif" : "png";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("player-avatars").upload(path, file, { contentType: file.type });

    if (uploadError) {
      setNotice(uploadError.message);
    } else {
      const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
      if (updateError) {
        await supabase.storage.from("player-avatars").remove([path]);
        setNotice(updateError.message);
      } else {
        if (avatarPath) await supabase.storage.from("player-avatars").remove([avatarPath]);
        setAvatarPath(path);
        setNotice("Your player avatar has been updated.");
      }
    }
    setAvatarWorking(false);
  }

  async function restoreDefaultAvatar() {
    if (!avatarPath || !user) return;
    setAvatarWorking(true);
    setNotice("");
    const supabase = createClient();
    const oldPath = avatarPath;
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
    if (error) {
      setNotice(error.message);
    } else {
      await supabase.storage.from("player-avatars").remove([oldPath]);
      setAvatarPath(null);
      setNotice("Your initials avatar has been restored.");
    }
    setAvatarWorking(false);
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
            <section className="mb-4 rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Player avatar</p>
              <div className="mt-4 flex items-center gap-5">
                <PlayerAvatar screenName={savedScreenName || screenName || "NFLbetx Player"} avatarPath={avatarPath} size={88} />
                <div className="flex flex-col gap-2 text-sm font-bold">
                  <label className="cursor-pointer text-blue-700 hover:underline">
                    Upload PNG/GIF
                    <input type="file" accept="image/png,image/gif" disabled={avatarWorking} className="sr-only" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
                  </label>
                  {avatarPath && <button type="button" onClick={restoreDefaultAvatar} disabled={avatarWorking} className="text-left text-slate-500 hover:underline">Use initials avatar</button>}
                  <span className="font-normal text-slate-400">Maximum 2 MB</span>
                </div>
              </div>
            </section>
            <form onSubmit={saveScreenName} className="rounded-xl bg-slate-50 p-5">
              <label htmlFor="account-screen-name" className="text-xs font-bold uppercase tracking-wider text-slate-400">Public screen name</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input id="account-screen-name" value={screenName} onChange={(event) => setScreenName(event.target.value)} autoComplete="nickname" maxLength={24} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100" />
                <button type="submit" disabled={saving || screenName === savedScreenName} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Other players see this name. They do not see your email address.</p>
            </form>
            {notice && <p role="status" className="mt-4 rounded-lg bg-lime-50 p-3 text-sm font-bold text-lime-900">{notice}</p>}
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
