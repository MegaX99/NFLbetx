"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session?.user) {
        setReady(true);
        setLoading(false);
      }
    });

    async function checkRecoverySession() {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;

        if (!exchangeError) {
          window.history.replaceState(null, "", window.location.pathname);
          setReady(true);
          setLoading(false);
          return;
        }

        // The auth-state listener may have completed the exchange first.
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        if (data.user) {
          window.history.replaceState(null, "", window.location.pathname);
          setReady(true);
        } else {
          setMessage("This reset link could not be completed. Request a new one from the login page.");
        }
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user) setReady(true);
      else if (error) setMessage("This reset link is invalid or has expired. Request a new one from the login page.");
      setLoading(false);
    }

    checkRecoverySession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("The two passwords do not match.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    await supabase.rpc("record_auth_event", {
      event_kind: "password_changed",
      attempted_email: null,
    });
    setMessage("Your password has been updated. Returning you to NFLbetx...");
    window.setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-7">
        <Link href="/" className="grid h-12 w-12 place-items-center rounded-xl bg-lime-400 font-black">NX</Link>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-500">Use at least 8 characters and avoid reusing a password from another site.</p>

        {loading ? (
          <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Checking your secure reset link...</p>
        ) : ready ? (
          <form onSubmit={updatePassword} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">
              New password
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" />
            </label>
            <label className="block text-sm font-bold">
              Confirm new password
              <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" />
            </label>
            {message && <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm leading-5 text-slate-700">{message}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{saving ? "Updating password..." : "Update password"}</button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
            <p>{message || "This password-reset link is not available."}</p>
            <Link href="/login" className="mt-4 inline-flex font-black text-blue-700">Request another reset email</Link>
          </div>
        )}
      </div>
    </main>
  );
}

