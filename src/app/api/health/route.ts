import { appVersion, backofficeUrl, composioApiKey, missingRequired } from "@/lib/runtime-config";

// Liveness + configuration probe for the back-office. Public (no session) and secret-free:
// 200 when every required variable is set, 503 otherwise — without saying which is missing.
// `features` says which optional services this deployment was given (never their values).
export const dynamic = "force-dynamic";

export function GET() {
  const ok = missingRequired().length === 0;
  const features = { composio: Boolean(composioApiKey()), catalogue: Boolean(backofficeUrl()) };
  return Response.json({ ok, version: appVersion(), features }, { status: ok ? 200 : 503 });
}
