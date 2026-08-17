"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { PlayerAvatar } from "@/components/player-avatar";
import { commissionerPassTier, formatPassPrice } from "@/lib/commissioner-pass";

type Pool = { id: string; name: string; code: string; season: number; commissioner_id: string; avatar_path: string | null };
type Member = { user_id: string; role: "commissioner" | "member"; joined_at: string; display_name: string; avatar_path: string | null; picks: number };
type Activity = { id: string; event_type: string; message: string; created_at: string; actor_name: string | null; subject_name: string | null };
type CommissionerPass = {
  status: "pending" | "active" | "suspended" | "refunded";
  paid_capacity: number;
  amount_paid_cents: number;
  due_at: string;
  paid_at: string | null;
};

const PUBLIC_SITE_URL = "https://nf-lbetx.vercel.app";

function poolInviteUrl(code: string) {
  return `${PUBLIC_SITE_URL}/pools?code=${encodeURIComponent(code)}`;
}

function poolInviteEmailUrl(pool: Pool) {
  const subject = `You're invited to ${pool.name} on NFLbetx`;
  const body = [
    `You're invited to join "${pool.name}" on NFLbetx.`,
    "",
    "Use this link to create an account or sign in and join the pool:",
    poolInviteUrl(pool.code),
    "",
    `Invitation code: ${pool.code}`,
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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
  const [commissionerPass, setCommissionerPass] = useState<CommissionerPass | null>(null);
  const [passIsOverdue, setPassIsOverdue] = useState(false);
  const [gameCount, setGameCount] = useState(0);
  const [poolName, setPoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const paypalReturnHandled = useRef(false);

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

    const [{ data: memberRows }, { data: entryRows }, gameResult, activityResult, passResult] = await Promise.all([
      supabase.from("pool_members").select("user_id,role,joined_at").eq("pool_id", poolId).order("joined_at"),
      supabase.from("entries").select("id,user_id").eq("pool_id", poolId).eq("is_active", true),
      supabase.from("games").select("id", { count: "exact", head: true }).eq("season", currentPool.season).eq("week", 1),
      supabase.rpc("get_pool_activity", { target_pool_id: poolId }),
      supabase.from("commissioner_passes").select("status,paid_capacity,amount_paid_cents,due_at,paid_at").eq("pool_id", poolId).maybeSingle(),
    ]);

    const userIds = (memberRows ?? []).map((row) => row.user_id);
    const entryIds = (entryRows ?? []).map((row) => row.id);
    const [{ data: profiles }, { data: pickRows }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id,display_name,avatar_path").in("id", userIds) : Promise.resolve({ data: [] }),
      entryIds.length ? supabase.from("picks").select("entry_id").in("entry_id", entryIds) : Promise.resolve({ data: [] }),
    ]);
    const profileDetails = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const entryOwners = new Map((entryRows ?? []).map((entry) => [entry.id, entry.user_id]));
    const pickCounts = new Map<string, number>();
    for (const pick of pickRows ?? []) {
      const owner = entryOwners.get(pick.entry_id);
      if (owner) pickCounts.set(owner, (pickCounts.get(owner) ?? 0) + 1);
    }
    setMembers((memberRows ?? []).map((member) => ({
      ...member,
      role: member.role as "commissioner" | "member",
      display_name: profileDetails.get(member.user_id)?.display_name ?? "Player",
      avatar_path: profileDetails.get(member.user_id)?.avatar_path ?? null,
      picks: pickCounts.get(member.user_id) ?? 0,
    })));
    setGameCount(gameResult.count ?? 0);
    setActivity((activityResult.data ?? []) as Activity[]);
    const pass = (passResult.data as CommissionerPass | null) ?? null;
    setCommissionerPass(pass);
    setPassIsOverdue(Boolean(pass && pass.status !== "active" && new Date(pass.due_at).getTime() < Date.now()));
    setLoading(false);
  }

  useEffect(() => {
    async function initialize() { await load(); }
    initialize();
    // The pool id is the only route input that should trigger a full reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  useEffect(() => {
    if (paypalReturnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypal") === "cancelled") {
      paypalReturnHandled.current = true;
      const noticeTimer = window.setTimeout(() => {
        setNotice("PayPal Sandbox checkout was cancelled. Nothing was charged.");
      }, 0);
      params.delete("paypal");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      return () => window.clearTimeout(noticeTimer);
    }
  }, [poolId]);

  useEffect(() => {
    if (!user || paypalReturnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("token");
    if (params.get("paypal") !== "approved" || !orderId) return;
    paypalReturnHandled.current = true;

    async function capturePayment() {
      setCheckoutWorking(true);
      setNotice("Confirming your PayPal Sandbox payment...");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setNotice("Your sign-in expired before payment confirmation. Sign in again, then return to this pool.");
        setCheckoutWorking(false);
        return;
      }

      try {
        const response = await fetch("/api/paypal/capture", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const result = await response.json() as { message?: string };
        setNotice(result.message ?? (response.ok ? "Sandbox payment confirmed." : "Payment confirmation failed."));
        if (response.ok) await load(user ?? undefined);
      } catch {
        setNotice("The sandbox payment could not be confirmed. Please try again; do not start another payment.");
      } finally {
        params.delete("paypal");
        params.delete("token");
        params.delete("PayerID");
        const query = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        setCheckoutWorking(false);
      }
    }

    capturePayment();
    // The signed-in user and PayPal return parameters should trigger this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, poolId]);

  const totalPicks = useMemo(() => members.reduce((sum, member) => sum + member.picks, 0), [members]);
  const avatar = publicAvatarUrl(pool?.avatar_path ?? null);
  const requiredTier = commissionerPassTier(members.length);
  const displayedTier = commissionerPass?.status === "active"
    ? { capacity: commissionerPass.paid_capacity, priceCents: commissionerPass.amount_paid_cents }
    : requiredTier;
  const displayCapacity = displayedTier.capacity;
  const remainingSpots = Math.max(0, displayCapacity - members.length);
  const upgradeTier = commissionerPass?.status === "active"
    ? commissionerPassTier(commissionerPass.paid_capacity + 1)
    : requiredTier;
  const checkoutAmountCents = commissionerPass?.status === "active"
    ? Math.max(0, upgradeTier.priceCents - commissionerPass.amount_paid_cents)
    : requiredTier.priceCents;
  const checkoutIsAvailable = commissionerPass?.status !== "active" || remainingSpots === 0;

  async function beginPayPalCheckout() {
    if (!pool) return;
    setCheckoutWorking(true);
    setNotice("");
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setNotice("Please sign in again before opening PayPal Sandbox.");
      setCheckoutWorking(false);
      return;
    }

    try {
      const response = await fetch("/api/paypal/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poolId: pool.id }),
      });
      const result = await response.json() as {
        approvalUrl?: string;
        captureReady?: boolean;
        orderId?: string;
        message?: string;
      };
      if (!response.ok) {
        setNotice(result.message ?? "PayPal Sandbox checkout could not be opened.");
        setCheckoutWorking(false);
        return;
      }
      if (result.captureReady && result.orderId) {
        setNotice("Recovering your completed PayPal Sandbox payment...");
        const captureResponse = await fetch("/api/paypal/capture", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: result.orderId }),
        });
        const captureResult = await captureResponse.json() as { message?: string };
        setNotice(captureResult.message ?? (captureResponse.ok ? "Sandbox payment confirmed." : "Payment confirmation failed."));
        if (captureResponse.ok) await load(user ?? undefined);
        setCheckoutWorking(false);
        return;
      }
      if (!result.approvalUrl) {
        setNotice(result.message ?? "PayPal Sandbox checkout could not be opened.");
        setCheckoutWorking(false);
        return;
      }
      window.location.assign(result.approvalUrl);
    } catch {
      setNotice("PayPal Sandbox checkout could not be reached.");
      setCheckoutWorking(false);
    }
  }

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

  async function copyInviteLink() {
    if (!pool) return;
    await navigator.clipboard.writeText(poolInviteUrl(pool.code));
    setNotice("Invitation link copied. Paste it into an email or text message.");
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

  if (loading) return <main className="mx-auto w-full max-w-6xl px-4 py-12"><div className="panel p-8 text-center text-slate-500">Loading commissioner controls...</div></main>;
  if (!user) return <main className="mx-auto w-full max-w-xl px-4 py-12"><div className="panel p-8 text-center"><p className="font-black">Sign in to open commissioner controls.</p><Link href="/login" className="mt-4 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign in</Link></div></main>;
  if (!pool) return <main className="mx-auto w-full max-w-xl px-4 py-12"><div className="panel p-8 text-center"><p className="font-black">Commissioner access unavailable</p><p className="mt-2 text-slate-500">{notice}</p><Link href="/pools" className="mt-4 inline-flex font-bold text-blue-700">Return to My Pools</Link></div></main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="eyebrow">Master control panel</p><h1 className="mt-2 text-4xl font-black tracking-tight">Commissioner Dashboard</h1><p className="mt-2 text-slate-500">{pool.name} - {pool.season} season</p></div>
        <div className="flex flex-wrap gap-3"><Link href={`/picks?pool=${pool.id}`} className="rounded-xl bg-lime-400 px-5 py-3 font-black text-slate-950">Open picks</Link><Link href={`/standings?pool=${pool.id}`} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Standings</Link><Link href="/pools" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold">My Pools</Link></div>
      </div>
      {notice && <p role="status" className="panel mt-6 border-lime-200 bg-lime-50 p-4 text-sm font-bold text-lime-900">{notice}</p>}

      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Members", members.length], ["Active entries", members.length], ["Week 1 picks", totalPicks], ["Possible picks", members.length * gameCount]].map(([label, value]) => <div key={label} className="panel p-5"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
      </section>

      <section className="panel mt-8 overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="eyebrow">2026 Commissioner Pass</p>
              <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${commissionerPass?.status === "active" ? "bg-lime-100 text-lime-800" : passIsOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                {commissionerPass?.status === "active" ? "Paid" : passIsOverdue ? "Payment overdue" : "Payment due"}
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-black">{formatPassPrice(displayedTier.priceCents)} for up to {displayedTier.capacity} players</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Your commissioner counts as one player. Every five additional verified players above 12 adds $10 to this pool&apos;s season pass. Each pool is billed separately.
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200" aria-label={`${members.length} of ${displayCapacity} player spots used`}>
              <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${Math.min(100, (members.length / Math.max(1, displayCapacity)) * 100)}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm font-bold">
              <span>{members.length} of {displayCapacity} spots used</span>
              <span className="text-slate-500">{remainingSpots} {remainingSpots === 1 ? "spot" : "spots"} available</span>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950 p-6 text-white">
            <p className="text-sm font-bold text-slate-400">{commissionerPass?.status === "active" ? "Pass paid" : "Amount for current roster"}</p>
            <p className="mt-2 text-4xl font-black text-lime-400">{formatPassPrice(displayedTier.priceCents)}</p>
            <p className="mt-3 text-sm text-slate-300">
              Due {commissionerPass ? new Date(commissionerPass.due_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "September 22, 2026"}
            </p>
            {commissionerPass?.status === "active" && (
              <p className="mt-5 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold">
                Pass active for up to {commissionerPass.paid_capacity} players.
              </p>
            )}
            {checkoutIsAvailable && (
              <div className="mt-5">
                <p className="mb-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-xs font-bold text-amber-200">
                  Sandbox test only - no real money will move.
                </p>
                <button type="button" onClick={beginPayPalCheckout} disabled={checkoutWorking} className="w-full rounded-xl bg-[#ffc439] px-4 py-3 font-black text-slate-950 disabled:cursor-wait disabled:opacity-60">
                  {checkoutWorking
                    ? "Opening PayPal Sandbox..."
                    : `${commissionerPass?.status === "active" ? "Upgrade" : "Pay"} ${formatPassPrice(checkoutAmountCents)} with PayPal`}
                </button>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {commissionerPass?.status === "active"
                    ? `Adds five spots, increasing this pass to ${upgradeTier.capacity} players.`
                    : "Use a PayPal sandbox buyer account. Live payments are disabled."}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <p className="eyebrow">Pool identity</p><h2 className="mt-2 text-2xl font-black">Name and avatar</h2>
          <div className="mt-5 flex items-center gap-4">{avatar ? <Image src={avatar} alt="Pool avatar" width={88} height={88} unoptimized className="h-22 w-22 rounded-2xl object-cover" /> : <div className="grid h-22 w-22 place-items-center rounded-2xl bg-slate-950 text-2xl font-black text-lime-400">{initials(pool.name)}</div>}<div className="flex flex-col gap-2 text-sm font-bold"><label className="cursor-pointer text-blue-700 hover:underline">Upload PNG/GIF<input type="file" accept="image/png,image/gif" disabled={working} className="sr-only" onChange={(event) => uploadAvatar(event.target.files?.[0])} /></label>{pool.avatar_path && <button type="button" onClick={restoreDefaultAvatar} disabled={working} className="text-left text-slate-500 hover:underline">Use default avatar</button>}<span className="font-normal text-slate-400">Maximum 2 MB</span></div></div>
          <form onSubmit={saveName} className="mt-5"><label htmlFor="commissioner-pool-name" className="text-sm font-bold">Pool name</label><div className="mt-2 flex gap-3"><input id="commissioner-pool-name" value={poolName} onChange={(e) => setPoolName(e.target.value)} maxLength={100} required className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-lime-500" /><button disabled={working} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Save</button></div></form>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Invitations</p><h2 className="mt-2 text-2xl font-black">Pool invitation</h2><p className="mt-3 text-sm leading-6 text-slate-500">Send players the complete link below. It carries the pool code automatically. Regenerating the code stops the old link from working.</p>
          <div className="mt-6 rounded-2xl bg-slate-950 p-6 text-center font-mono text-3xl font-black tracking-[.2em] text-lime-400">{pool.code}</div>
          <a href={poolInviteUrl(pool.code)} className="mt-3 block break-all text-center text-sm font-bold text-blue-700 hover:underline">{poolInviteUrl(pool.code)}</a>
          <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={copyInviteLink} className="rounded-xl bg-lime-400 px-4 py-3 font-black">Copy invite link</button><a href={poolInviteEmailUrl(pool)} className="rounded-xl bg-slate-950 px-4 py-3 text-center font-black text-white">Email invitation</a></div>
          <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={copyCode} className="rounded-xl border border-slate-300 px-4 py-3 font-bold">Copy code only</button><button type="button" onClick={regenerateCode} disabled={working} className="rounded-xl border border-slate-300 px-4 py-3 font-bold">New code</button></div>
        </div>
      </section>

      <section className="panel mt-8 overflow-hidden">
        <div className="border-b border-slate-200 p-6"><p className="eyebrow">Roster</p><h2 className="mt-2 text-2xl font-black">Pool members</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Player</th><th className="p-4">Role</th><th className="p-4">Week 1 picks</th><th className="p-4">Joined</th><th className="p-4 text-right">Control</th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id} className="border-t border-slate-100"><td className="p-4"><div className="flex items-center gap-3"><PlayerAvatar screenName={member.display_name} avatarPath={member.avatar_path} size={40} /><span className="font-bold">{member.display_name}</span></div></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${member.role === "commissioner" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{member.role}</span></td><td className="p-4 font-black">{member.picks} / {gameCount}</td><td className="p-4 text-sm text-slate-500">{new Date(member.joined_at).toLocaleDateString()}</td><td className="p-4 text-right">{member.role === "member" && <button type="button" onClick={() => removeMember(member)} disabled={working} className="font-bold text-red-600 hover:underline">Remove</button>}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel mt-8 p-6"><p className="eyebrow">Audit trail</p><h2 className="mt-2 text-2xl font-black">Recent pool activity</h2><div className="mt-5 divide-y divide-slate-100">{activity.length ? activity.map((item) => <div key={item.id} className="flex flex-col justify-between gap-1 py-3 sm:flex-row"><p className="text-sm"><strong>{item.actor_name ?? item.subject_name ?? "NFLbetx"}</strong> - {item.message}</p><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div>) : <p className="py-4 text-sm text-slate-500">No pool activity recorded yet.</p>}</div></section>
    </main>
  );
}
