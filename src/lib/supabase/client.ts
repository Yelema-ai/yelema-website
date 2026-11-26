import { useMemo } from "react";
import type { createBrowserClient } from "@supabase/ssr";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { BUZZ_KEY } from "@/lib/buzz-key-store";
import { wipeDevice } from "@/lib/device-cache-client";
import { within } from "@/lib/first-screen";

type BrowserClient = ReturnType<typeof createBrowserClient>;
// The client, loaded on first use: supabase-js stays out of every page's first load.
export type SupabaseLoader = () => Promise<BrowserClient>;

// Browser Supabase client (Auth only — the tables are not reachable with the anon key). The
// URL and anon key come from the runtime config the root layout provides.
//
// Null when the back office owns the sign-in (authVia "backoffice"): the pages then go through
// this app's /api/auth routes and the browser never talks to Supabase.
export function useSupabase(): SupabaseLoader | null {
  const { authVia, supabaseUrl, supabaseAnonKey } = usePublicConfig();
  return useMemo(() => {
    if (authVia === "backoffice") return null;
    let client: Promise<BrowserClient> | null = null;
    return () => (client ??= import("@supabase/ssr").then((m) => m.createBrowserClient(supabaseUrl, supabaseAnonKey)));
  }, [authVia, supabaseUrl, supabaseAnonKey]);
}

// The back office stops admitting this browser's messaging key (best effort; the messaging code loads only if a key rests here).
async function dropMessagingKey(): Promise<void> {
  if (!hasMessagingKey()) return;
  const pubkey = (await import("@/lib/buzz-keys")).heldPubkey();
  if (pubkey) await fetch("/api/buzz/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey }), keepalive: true });
}

function hasMessagingKey(): boolean {
  try {
    return Boolean(localStorage.getItem(BUZZ_KEY) ?? sessionStorage.getItem(BUZZ_KEY));
  } catch {
    return false;
  }
}

// Sign out, whoever owns the sign-in. Shared by every "se déconnecter".
export async function signOutEverywhere(supabase: SupabaseLoader | null): Promise<void> {
  await within(dropMessagingKey(), 2_000).catch(() => undefined);
  await wipeDevice();
  if (supabase) await (await supabase()).auth.signOut();
  else await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
