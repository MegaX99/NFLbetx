"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Pool = { id: string; name: string; code: string; season: number; commissioner_id: string; avatar_path: string | null };
type Member = { user_id: string; role: "commissioner" | "member"; joined_at: string; display_name: string; picks: number };
type Activity = { id: string; event_type: string; message: string; created_at: string; actor_name: string | null; subject_name: string | null };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "NX";
}

function publicAvatarUrl(path: string | null) {
  return path ? createClient().storage.from("pool-avatars").getPublicUrl(path).data.publicUrl : null;
}

export function CommissionerDashboard({ poolId }: { poolId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [gameCount, setGameCount] = useState(0);
  const [poolName, setPoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  async function load(currentUser?: User) {
    const supabase = createClient();
    const signedInUser = currentUser ?? (await supabase.auth.getUser()).data.user;
    if (!signedInUser) { setLoading(false); return; }
    setUser(signedInUser);

    const { data: poolRow, error: poolError } = await supabase
      .from("pools")
      .select("id,name,code,season,commissioner_id,avatar_path")
      .eq("id", poolId)
      .maybeSingle();
    if (poolError || !poolRow || poolRow.commissioner_id !== signedInUser.id) {
      setNotice("This dashboard is available only to the pool commissioner.");
      setLoading(false);
      return;
    }
    const currentPool = poolRow as Pool;
    setPool(currentPool);
    setPoolName(currentPool.name);

    const [{ data: memberRows }, { data: entryRows }, gameResult, activityResult] = await Promise.all([
      supabase.from("pool_members").select("user_id,role,joined_at").eq("pool_id", poolId).order("joined_at"),
      supabase.from("entries").select("id,user_id").eq("pool_id", poolId).eq("is_active", true),
      supabase.from("games").select("id", { count: "exact", head: true }).eq("season", currentPool.season).eq("week", 1),
      supabase.rpc("get_pool_activity", { target_pool_id: poolId }),
    ]);

    const userIds = (memberRows ?? []).map((row) => row.user_id);
    const entryIds = (entryRows ?? []).map((row) => row.id);
    const [{ data: profiles }, { data: pickRows }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id,display_name").in("id", userIds) : Promise.resolve({ data: [] }),
      entryIds.length ? supabase.from("picks").select("entry_id").in("entry_id", entryIds) : Promise.resolve({ data: [] }),
    ]);
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
    const entryOwners = new Map((entryRows ?? []).map((entry) => [entry.id, entry.user_id]));
    const pickCounts = new Map<string, number>();
    for (const pick of pickRows ?? []) {
      const owner = entryOwners.get(pick.entry_id);
      if (owner) pickCounts.set(owner, (pickCounts.get(owner) ?? 0) + 1);
    }
    setMembers((memberRows ?? []).map((member) => ({
      ...member,
      role: member.role as "commissioner" | "member",
      display_name: names.get(member.user_id) ?? "Player",
      picks: pickCounts.get(member.user_id) ?? 0,
    })));
    setGameCount(gameResult.count ?? 0);
    setActivity((activityResult.data ?? []) as Activity[]);
    setLoading(false);
  }

  useEffect(() => {
    async function initialize() { await load(); }
    initialize();
    // The pool id is the only route input that should trigger a full reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  const totalPicks = useMemo(() => members.reduce((sum, member) => sum + member.picks, 0), [members]);
  const avatar = publicAvatarUrl(pool?.avatar_path ?? null);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!pool) return;
    setWorking(true); setNotice("");
    const { error } = await createClient().from("pools").update({ name: poolName.trim() }).eq("id", pool.id);
    if (error) setNotice(error.message);
    else { setNotice("Pool name saved."); await load(user ?? undefined); }
    setWorking(false);
  }

  async function regenerateCode() {
    if (!pool) return;
    setWorking(true); setNotice("");
    const { data, error } = await createClient().rpc("regenerate_pool_code", { target_pool_id: pool.id });
    if (error) setNotice(error.message);
    else { setNotice(`New invitation code: ${data}`); await load(user ?? undefined); }
    setWorking(false);
  }

  async function copyCode() {
    if (!pool) return;
    await navigator.clipboard.writeText(pool.code);
    setNotice("Invitation code copied.");
  }

  async function uploadAvatar(file?: File) {
    if (!file || !pool) return;
    if (!["image/png", "image/gif"].includes(file.type)) { setNotice("Please choose a PNG or GIF image."); return; }
    if (file.size > 2 * 1024 * 1024) { setNotice("Please choose an image smaller than 2 MB."); return; }
    setWorking(true); setNotice("");
    const supabase = createClient();
    const extension = file.type === "image/gif" ? "gif" : "png";
    const path = `${pool.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("pool-avatars").upload(path, file, { contentType: file.type });
    if (uploadError) setNotice(uploadError.message);
    else {
      const { error } = await supabase.from("pools").update({ avatar_path: path }).eq("id", pool.id);
      if (error) { await supabase.storage.from("pool-avatars").remove([path]); setNotice(error.message); }
      else { if (pool.avatar_path) await supabase.storage.from("pool-avatars").remove([pool.avatar_path]); setNotice("Pool avatar updated."); await load(user ?? undefined); }
    }
    setWorking(false);
  }

  async function restoreDefaultAvatar() {
    if (!pool?.avatar_path) return;
    setWorking(true);
    const supabase = createClient();
    const oldPath = pool.avatar_path;
    const { error } = await supabase.from("pools").update({ avatar_path: null }).eq("id", pool.id);
    if (error) setNotice(error.message);
    else { await supabase.storage.from("pool-avatars").remove([oldPath]); setNotice("Default avatar restored."); await load(user ?? undefined); }
    setWorking(false);
  }

  async function removeMember(member: Member) {
    if (!pool || !window.confirm(`Remove ${member.display_name} and their saved picks from this pool?`)) return;
    setWorking(true); setNotice("");
    const { error } = await createClient().rpc("remove_pool_member", { target_pool_id: pool.id, target_user_id: member.user_id });
    if (error) setNotice(error.message);
    else { setNotice(`${member.display_name} was removed from the pool.`); await load(user ?? undefined); }
    setWorking(false);
  }

  if (loading) return <main className="mx-auto w-full max-w-6xl px-4 py-12"><div className="panel p-8 text-center text-slate-500">Loading commissioner controlsâ€¦</div></main>;
  if (!user) return <main className="mx-auto w-full max-w-xl px-4 py-12"><div className="panel p-8 text-center"><p className="font-black">Sign in to open commissioner controls.</p><Link href="/login" className="mt-4 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign in</Link></div></main>;
  if (!pool) return <main className="mx-auto w-full max-w-xl px-4 py-12"><div className="panel p-8 text-center"><p className="font-black">Commissioner access unavailable</p><p className="mt-2 text-slate-500">{notice}</p><Link href="/pools" className="mt-4 inline-flex font-bold text-blue-700">Return to My Pools</Link></div></main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="eyebrow">Master control panel</p><h1 className="mt-2 text-4xl font-black tracking-tight">Commissioner Dashboard</h1><p className="mt-2 text-slate-500">{pool.name} Â· {pool.season} season</p></div>
        <div className="flex gap-3"><Link href={`/?pool=${pool.id}`} className="rounded-xl bg-lime-400 px-5 py-3 font-black text-slate-950">Open picks</Link><Link href="/pools" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold">My Pools</Link></div>
      </div>
      {notice && <p role="status" className="panel mt-6 border-lime-200 bg-lime-50 p-4 text-sm font-bold text-lime-900">{notice}</p>}

      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Members", members.length], ["Active entries", members.length], ["Week 1 picks", totalPicks], ["Possible picks", members.length * gameCount]].map(([label, value]) => <div key={label} className="panel p-5"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <p className="eyebrow">Pool identity</p><h2 className="mt-2 text-2xl font-black">Name and avatar</h2>
          <div className="mt-5 flex items-center gap-4">{avatar ? <Image src={avatar} alt="Pool avatar" width={88} height={88} unoptimized className="h-22 w-22 rounded-2xl object-cover" /> : <div className="grid h-22 w-22 place-items-center rounded-2xl bg-slate-950 text-2xl font-black text-lime-400">{initials(pool.name)}</div>}<div className="flex flex-col gap-2 text-sm font-bold"><label className="cursor-pointer text-blue-700 hover:underline">Upload PNG/GIF<input type="file" accept="image/png,image/gif" disabled={working} className="sr-only" onChange={(event) => uploadAvatar(event.target.files?.[0])} /></label>{pool.avatar_path && <button type="button" onClick={restoreDefaultAvatar} disabled={working} className="text-left text-slate-500 hover:underline">Use default avatar</button>}<span className="font-normal text-slate-400">Maximum 2 MB</span></div></div>
          <form onSubmit={saveName} className="mt-5"><label htmlFor="commissioner-pool-name" className="text-sm font-bold">Pool name</label><div className="mt-2 flex gap-3"><input id="commissioner-pool-name" value={poolName} onChange={(e) => setPoolName(e.target.value)} maxLength={100} required className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-lime-500" /><button disabled={working} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Save</button></div></form>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Invitations</p><h2 className="mt-2 text-2xl font-black">Pool invitation code</h2><p className="mt-3 text-sm leading-6 text-slate-500">Share this code with players. Regenerating it stops the old code from working.</p>
          <div className="mt-6 rounded-2xl bg-slate-950 p-6 text-center font-mono text-3xl font-black tracking-[.2em] text-lime-400">{pool.code}</div>
          <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={copyCode} className="rounded-xl bg-lime-400 px-4 py-3 font-black">Copy code</button><button type="button" onClick={regenerateCode} disabled={working} className="rounded-xl border border-slate-300 px-4 py-3 font-bold">New code</button></div>
        </div>
      </section>

      <section className="panel mt-8 overflow-hidden">
        <div className="border-b border-slate-200 p-6"><p className="eyebrow">Roster</p><h2 className="mt-2 text-2xl font-black">Pool members</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Player</th><th className="p-4">Role</th><th className="p-4">Week 1 picks</th><th className="p-4">Joined</th><th className="p-4 text-right">Control</th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id} className="border-t border-slate-100"><td className="p-4 font-bold">{member.display_name}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${member.role === "commissioner" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{member.role}</span></td><td className="p-4 font-black">{member.picks} / {gameCount}</td><td className="p-4 text-sm text-slate-500">{new Date(member.joined_at).toLocaleDateString()}</td><td className="p-4 text-right">{member.role === "member" && <button type="button" onClick={() => removeMember(member)} disabled={working} className="font-bold text-red-600 hover:underline">Remove</button>}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel mt-8 p-6"><p className="eyebrow">Audit trail</p><h2 className="mt-2 text-2xl font-black">Recent pool activity</h2><div className="mt-5 divide-y divide-slate-100">{activity.length ? activity.map((item) => <div key={item.id} className="flex flex-col justify-between gap-1 py-3 sm:flex-row"><p className="text-sm"><strong>{item.actor_name ?? item.subject_name ?? "NFLbetx"}</strong> Â· {item.message}</p><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div>) : <p className="py-4 text-sm text-slate-500">No pool activity recorded yet.</p>}</div></section>
    </main>
  );
}

