"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Pool = {
  id: string;
  name: string;
  code: string;
  season: number;
  commissioner_id: string;
  avatar_path: string | null;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "NX";
}

function avatarUrl(path: string | null) {
  if (!path) return null;
  return createClient().storage.from("pool-avatars").getPublicUrl(path).data.publicUrl;
}

export function PoolsDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPools(currentUser: User) {
    const { data, error } = await createClient()
      .from("pools")
      .select("id,name,code,season,commissioner_id,avatar_path")
      .order("created_at");
    if (error) setNotice(error.message);
    setPools((data ?? []) as Pool[]);
    setUser(currentUser);
  }

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (data.user) await loadPools(data.user);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function createPool(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setNotice("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_pool", { pool_name: poolName, pool_season: 2026 });
    if (error) setNotice(error.message);
    else if (user) {
      setPoolName("");
      await loadPools(user);
      const created = Array.isArray(data) ? data[0] : null;
      setNotice(`Pool created. Invitation code: ${created?.invite_code ?? "available below"}`);
    }
    setWorking(false);
  }

  async function joinPool(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setNotice("");
    const { data, error } = await createClient().rpc("join_pool", { invite_code: inviteCode });
    if (error) setNotice(error.message);
    else if (user) {
      setInviteCode("");
      await loadPools(user);
      setNotice("You joined the pool. Your contest entry is ready.");
      if (typeof data === "string") window.history.replaceState(null, "", `/pools?joined=${data}`);
    }
    setWorking(false);
  }

  async function uploadAvatar(pool: Pool, file: File | undefined) {
    if (!file || !user) return;
    if (!(["image/png", "image/gif"].includes(file.type))) {
      setNotice("Please choose a PNG or GIF image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Please choose an image smaller than 2 MB.");
      return;
    }

    setWorking(true);
    setNotice("");
    const supabase = createClient();
    const extension = file.type === "image/gif" ? "gif" : "png";
    const path = `${pool.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("pool-avatars").upload(path, file, { contentType: file.type });
    if (uploadError) setNotice(uploadError.message);
    else {
      const { error: updateError } = await supabase.from("pools").update({ avatar_path: path }).eq("id", pool.id);
      if (updateError) {
        await supabase.storage.from("pool-avatars").remove([path]);
        setNotice(updateError.message);
      } else {
        if (pool.avatar_path) await supabase.storage.from("pool-avatars").remove([pool.avatar_path]);
        await loadPools(user);
        setNotice("Pool avatar updated.");
      }
    }
    setWorking(false);
  }

  async function removeAvatar(pool: Pool) {
    if (!pool.avatar_path || !user) return;
    setWorking(true);
    const supabase = createClient();
    const { error } = await supabase.from("pools").update({ avatar_path: null }).eq("id", pool.id);
    if (error) setNotice(error.message);
    else {
      await supabase.storage.from("pool-avatars").remove([pool.avatar_path]);
      await loadPools(user);
      setNotice("Default avatar restored.");
    }
    setWorking(false);
  }

  if (loading) return <main className="mx-auto w-full max-w-5xl px-4 py-12"><div className="panel p-8 text-center text-slate-500">Loading your poolsâ€¦</div></main>;

  if (!user) return (
    <main className="mx-auto grid w-full max-w-xl flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-8 text-center">
        <p className="eyebrow">My pools</p>
        <h1 className="mt-2 text-3xl font-black">Sign in to manage your pools</h1>
        <Link href="/login" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign in</Link>
      </div>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <p className="eyebrow">Pool headquarters</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">My Pools</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Run your own contest or join friends using their invitation code.</p>
      </div>

      {notice && <p role="status" className="panel mt-6 border-lime-200 bg-lime-50 p-4 text-sm font-bold text-lime-900">{notice}</p>}

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <form onSubmit={createPool} className="panel p-6">
          <p className="eyebrow">Become a commissioner</p>
          <h2 className="mt-2 text-2xl font-black">Create a pool</h2>
          <label className="mt-5 block text-sm font-bold" htmlFor="pool-name">Pool name</label>
          <input id="pool-name" value={poolName} onChange={(e) => setPoolName(e.target.value)} maxLength={100} required placeholder="Fred's Work Pool" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200" />
          <button disabled={working} className="mt-4 w-full rounded-xl bg-lime-400 px-5 py-3 font-black text-slate-950 hover:bg-lime-300 disabled:opacity-60">Create my pool</button>
        </form>

        <form onSubmit={joinPool} className="panel p-6">
          <p className="eyebrow">Have an invitation?</p>
          <h2 className="mt-2 text-2xl font-black">Join a pool</h2>
          <label className="mt-5 block text-sm font-bold" htmlFor="invite-code">Invitation code</label>
          <input id="invite-code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} maxLength={40} required placeholder="AB12CD34" autoCapitalize="characters" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono font-bold uppercase tracking-widest outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200" />
          <button disabled={working} className="mt-4 w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800 disabled:opacity-60">Join this pool</button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-black">Your pool list</h2>
        <div className="mt-5 grid gap-4">
          {pools.map((pool) => {
            const commissioner = pool.commissioner_id === user.id;
            const image = avatarUrl(pool.avatar_path);
            return (
              <article key={pool.id} className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                {image ? <Image src={image} alt={`${pool.name} avatar`} width={80} height={80} unoptimized className="h-20 w-20 rounded-2xl border border-slate-200 object-cover" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-slate-950 text-2xl font-black text-lime-400">{initials(pool.name)}</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-xl font-black">{pool.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${commissioner ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{commissioner ? "Commissioner" : "Player"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Invite code <strong className="font-mono tracking-wider text-slate-800">{pool.code}</strong></p>
                  {commissioner && <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold"><label className="cursor-pointer text-blue-700 hover:underline">Upload PNG/GIF<input type="file" accept="image/png,image/gif" className="sr-only" disabled={working} onChange={(e) => uploadAvatar(pool, e.target.files?.[0])} /></label>{pool.avatar_path && <button type="button" onClick={() => removeAvatar(pool)} disabled={working} className="text-slate-500 hover:underline">Use default</button>}</div>}
                </div>
                <div className="flex flex-col gap-2">
                  <Link href={`/?pool=${pool.id}`} className="rounded-xl bg-lime-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-lime-300">Open pool</Link>
                  {commissioner && <Link href={`/commissioner?pool=${pool.id}`} className="rounded-xl border border-slate-300 px-5 py-3 text-center font-bold hover:bg-slate-50">Manage pool</Link>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

