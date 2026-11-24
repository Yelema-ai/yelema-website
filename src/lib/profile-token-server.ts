import "server-only";
import { createHash } from "node:crypto";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { memo } from "@/lib/memo";

// A profile token's seal is the back office's to check: what this app serves itself for an instance (its tools,
// its supervision) waits for its accounts answer with that same bearer. Kept a minute per token, a refusal 10 s.
const vouched = memo<Record<string, string> | null>({ ttlMs: 60_000, ttlOf: (v) => (v ? 60_000 : 10_000), maxEntries: 5000, maxFlightMs: 10_000 });

/** The default accounts the back office answers for this profile token; null when it refuses the token. Throws on an outage. */
export function profileTokenAccounts(token: string, workspace: string): Promise<Record<string, string> | null> {
  return vouched.get(`${workspace}|${createHash("sha256").update(token).digest("hex")}`, async () => {
    try {
      return (await backoffice.appsAccounts(token, workspace)).defaults ?? {};
    } catch (e) {
      if (e instanceof BackofficeError && e.status >= 400 && e.status < 500) return null;
      throw e;
    }
  });
}
