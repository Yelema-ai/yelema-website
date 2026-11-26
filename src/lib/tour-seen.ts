// Whether the member already went through the guided tour. The back office's `tour` preference is the truth
// once it keeps it (the member's first sign-in, whatever the device); until then, this browser remembers.
import { apiFetch } from "@/lib/api";
import type { MemberPrefs } from "@/lib/backoffice";
import { bootstrap } from "@/lib/bootstrap-client";
import { parseTourPrefs } from "@/lib/tour-state";

const URL = "/api/account/preferences";
const localKey = (user: string) => `yelema.tour-seen:${user.trim().toLowerCase()}`;

/** Whether the back office answered with a `tour` section: only then is it written to. */
let keptByBackoffice = false;

function seenHere(user: string): boolean {
  try {
    return localStorage.getItem(localKey(user)) !== null;
  } catch {
    return false;
  }
}

function rememberHere(user: string): void {
  try {
    localStorage.setItem(localKey(user), new Date().toISOString());
  } catch {
    // No storage: the back office, when it keeps the tour, is the only memory.
  }
}

function sendDone(): void {
  void apiFetch(URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tour: { done: true } }) }).catch(() => undefined);
}

/** True when the tour must not start. Signed in through the back office, an unreadable answer starts nothing. */
export async function tourSeen(user: string, viaBackoffice: boolean): Promise<boolean> {
  if (!viaBackoffice) return seenHere(user);
  const prefs: MemberPrefs | null = (await bootstrap())?.preferences ?? (await apiFetch<MemberPrefs>(URL).catch(() => null));
  if (!prefs) return true;
  keptByBackoffice = "tour" in prefs;
  if (!keptByBackoffice) return seenHere(user);
  if (parseTourPrefs(prefs.tour).seenAt !== null) {
    rememberHere(user);
    return true;
  }
  // Seen in this browser before the back office kept it, or a send that did not get through: sent again.
  if (seenHere(user)) {
    sendDone();
    return true;
  }
  return false;
}

/** The member finished or left the tour: remembered here, and by the back office when it keeps it. */
export function markTourSeen(user: string): void {
  rememberHere(user);
  if (keptByBackoffice) sendDone();
}
