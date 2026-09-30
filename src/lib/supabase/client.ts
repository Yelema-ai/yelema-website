import { useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePublicConfig } from "@/components/PublicConfigProvider";

// Browser Supabase client (Auth only — the tables are not reachable with the anon key). The
// URL and anon key come from the runtime config the root layout provides.
export function useSupabase() {
  const { supabaseUrl, supabaseAnonKey } = usePublicConfig();
  return useMemo(() => createBrowserClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);
}
