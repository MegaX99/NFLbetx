"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const OPEN_PATHS = new Set(["/login", "/reset-password"]);
const NO_POOL_ALLOWED_PATHS = new Set(["/screen-name", "/pools", "/account"]);

export function ScreenNameGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkProfile() {
      if (OPEN_PATHS.has(pathname)) {
        setReady(true);
        return;
      }

      setReady(false);
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;

      if (!authData.user) {
        setReady(true);
        return;
      }

      const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("screen_name_set_at")
          .eq("id", authData.user.id)
          .maybeSingle(),
        supabase
          .from("pool_members")
          .select("pool_id")
          .eq("user_id", authData.user.id)
          .limit(1)
          .maybeSingle(),
      ]);
      if (!active) return;

      if (!profileError && !profile?.screen_name_set_at && pathname !== "/screen-name") {
        router.replace("/screen-name");
        return;
      }

      if (
        !profileError
        && profile?.screen_name_set_at
        && !membershipError
        && !membership
        && !NO_POOL_ALLOWED_PATHS.has(pathname)
      ) {
        router.replace("/pools?welcome=1");
        return;
      }

      setReady(true);
    }

    checkProfile();
    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) {
    return <main className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-4 py-12"><div className="panel w-full p-8 text-center text-slate-500">Loading your player profile...</div></main>;
  }

  return children;
}

