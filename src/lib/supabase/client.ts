import { useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePublicConfig } from "@/components/PublicConfigProvider";

// Browser Supabase client (Auth only — the tables are not reachable with the anon key). The
// URL and anon key come from the runtime config the root layout provides.
//
// Null when the back office owns the sign-in (authVia "backoffice"): the pages then go through
// this app's /api/auth routes and the browser never talks to Supabase.
export function useSupabase() {
  const { authVia, supabaseUrl, supabaseAnonKey } = usePublicConfig();
  return useMemo(
    () => (authVia === "backoffice" ? null : createBrowserClient(supabaseUrl, supabaseAnonKey)),
    [authVia, supabaseUrl, supabaseAnonKey]
  );
}

// Sign out, whoever owns the sign-in. Shared by every "se déconnecter".
export async function signOutEverywhere(supabase: ReturnType<typeof useSupabase>): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  else await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
