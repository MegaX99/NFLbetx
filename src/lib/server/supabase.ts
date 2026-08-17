import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

export function createAuthenticatedServerClient(accessToken: string) {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase publishable key is not configured.");

  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createAdminServerClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase server secret is not configured.");

  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticateRequest(request: Request): Promise<{
  user: User;
  supabase: SupabaseClient;
} | null> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) return null;

  const supabase = createAuthenticatedServerClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { user: data.user, supabase };
}
