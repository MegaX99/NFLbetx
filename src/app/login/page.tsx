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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "signup") return;
    const timer = window.setTimeout(() => setMode("signup"), 0);
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: "https://nf-lbetx.vercel.app/" },
        });
        if (error) throw error;

        if (data.session) {
          router.push("/");
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
        router.push("/");
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

        {mode === "forgot" ? (
          <button type="button" onClick={() => { setMode("signin"); setMessage(""); }} className="mt-5 text-sm font-bold text-blue-700 hover:underline">Back to sign in</button>
        ) : (
          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => { setMode("signin"); setMessage(""); }}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signin" ? "bg-white shadow-sm" : "text-slate-500"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setMessage(""); }}
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
            <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" />
          </label>}
          {mode === "signin" && <button type="button" onClick={() => { setMode("forgot"); setPassword(""); setMessage(""); }} className="text-sm font-bold text-blue-700 hover:underline">Forgot password?</button>}
          {message && <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm leading-5 text-slate-700">{message}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
          </button>
        </form>
      </div>
    </main>
  );
}

