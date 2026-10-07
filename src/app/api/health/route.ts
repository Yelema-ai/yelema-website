import { appVersion, authViaBackoffice, backofficeUrl, composioApiKey, missingRequired, multiTenant } from "@/lib/runtime-config";

// Liveness + configuration probe for the back-office. Public (no session) and secret-free:
// 200 when every required variable is set, 503 otherwise — without saying which is missing.
// `features` says which optional services this deployment was given (never their values).
export const dynamic = "force-dynamic";

export function GET() {
  const ok = missingRequired().length === 0;
  const features = {
    composio: Boolean(composioApiKey()),
    catalogue: Boolean(backofficeUrl()),
    // "backoffice" when the back office signs users in and lists what they see.
    auth: authViaBackoffice() ? "backoffice" : "supabase",
    // "multi": one deployment for every client, each request resolved by its host.
    mode: multiTenant() ? "multi" : "single",
  };
  return Response.json({ ok, version: appVersion(), features }, { status: ok ? 200 : 503 });
}
