"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      if (params.get("mode") === "signup") setMode("signup");
      const invited = params.get("invite")?.trim().toUpperCase();
      if (invited && invited.length <= 40) setInviteCode(invited);
      if (params.get("confirmed") === "1") {
        setMode("signin");
        setMessage("Email confirmed. Sign in with the password you created.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: "https://nf-lbetx.vercel.app/reset-password",
        });
        if (error) throw error;
        await supabase.rpc("record_auth_event", {
          event_kind: "password_reset_requested",
          attempted_email: email,
        });
        setMessage("If an NFLbetx account exists for that email, a password-reset message is on its way.");
      } else if (mode === "signup") {
        const confirmationUrl = new URL("/login", "https://nf-lbetx.vercel.app");
        confirmationUrl.searchParams.set("confirmed", "1");
        if (inviteCode) confirmationUrl.searchParams.set("invite", inviteCode);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: confirmationUrl.toString() },
        });
        if (error) throw error;

        if (data.session) {
          router.push(inviteCode ? `/pools?code=${encodeURIComponent(inviteCode)}` : "/");
          router.refresh();
        } else {
          setMessage("Check your email to confirm your new NFLbetx account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          await supabase.rpc("record_auth_event", {
            event_kind: "login_failed",
            attempted_email: email,
          });
          throw error;
        }
        await supabase.rpc("record_auth_event", {
          event_kind: "login_succeeded",
          attempted_email: null,
        });
        router.push(inviteCode ? `/pools?code=${encodeURIComponent(inviteCode)}` : "/");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-7">
        <Link href="/" className="grid h-12 w-12 place-items-center rounded-xl bg-lime-400 font-black">NX</Link>
        <h1 className="mt-5 text-3xl font-black tracking-tight">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Join NFLbetx" : "Reset your password"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {mode === "signin" ? "Sign in to make and manage your weekly picks." : mode === "signup" ? "Create your account to join a pool and start picking." : "Enter your email and we will send you a secure reset link."}
        </p>
        {inviteCode && <p className="mt-4 rounded-xl bg-lime-50 px-4 py-3 text-sm font-bold text-lime-900">Pool invitation ready: <span className="font-mono">{inviteCode}</span></p>}

        {mode === "forgot" ? (
          <button type="button" onClick={() => { setMode("signin"); setMessage(""); }} className="mt-5 text-sm font-bold text-blue-700 hover:underline">Back to sign in</button>
        ) : (
          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => { setMode("signin"); setShowPassword(false); setMessage(""); }}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signin" ? "bg-white shadow-sm" : "text-slate-500"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setShowPassword(false); setMessage(""); }}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signup" ? "bg-white shadow-sm" : "text-slate-500"}`}>Create account</button>
          </div>
        )}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-bold">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" />
          </label>
          {mode !== "forgot" && <label className="block text-sm font-bold">
            Password
            <span className="relative mt-2 block">
              <input type={showPassword ? "text" : "password"} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password} onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters" className="w-full rounded-xl border border-slate-200 py-3 pl-4 pr-12 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-lime-400"
              >
                {showPassword ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 4.2A10.6 10.6 0 0112 4c5.5 0 9 5 9 5a16.8 16.8 0 01-2.1 2.6M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5 9 5c1 0 2-.2 2.8-.5" /></svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z" /><circle cx="12" cy="12" r="2.5" /></svg>
                )}
              </button>
            </span>
          </label>}
          {mode === "signin" && <button type="button" onClick={() => { setMode("forgot"); setPassword(""); setShowPassword(false); setMessage(""); }} className="text-sm font-bold text-blue-700 hover:underline">Forgot password?</button>}
          {message && <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm leading-5 text-slate-700">{message}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          Need help? <a href="mailto:support@nflbetx.com" className="font-bold text-blue-700 hover:underline">Contact support</a>
        </p>
      </div>
    </main>
  );
}

