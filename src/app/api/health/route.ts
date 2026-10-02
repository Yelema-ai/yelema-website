import { appVersion, missingRequired } from "@/lib/runtime-config";

// Liveness + configuration probe for the back-office. Public (no session) and secret-free:
// 200 when every required variable is set, 503 otherwise — without saying which is missing.
export const dynamic = "force-dynamic";

export function GET() {
  const ok = missingRequired().length === 0;
  return Response.json({ ok, version: appVersion() }, { status: ok ? 200 : 503 });
}
