import "server-only";
import type { BoDashboardShareView } from "@/lib/backoffice";
import { shareEndOf, type ShareExpiry } from "@/lib/dashboard-expiry";
import { sealShare } from "@/lib/dashboard-token";

/**
 * The share page of a back-office share, sealed: it names neither the instance nor the expert, and ends
 * after `expiry` (from now). Null when sharing is off. Each answer seals a new link; earlier ones keep their end.
 */
export function shareUrlOf(workspaceId: string | undefined, view: BoDashboardShareView | null, expiry: ShareExpiry, nowMs = Date.now()) {
  const none = { shareUrl: null, shareExpiresAt: null, shareExpiry: expiry };
  if (!workspaceId || !view?.share) return none;
  const e = shareEndOf(expiry, nowMs);
  const token = sealShare({ w: workspaceId, s: view.share.id, n: view.share.number, e });
  return token ? { shareUrl: `/dashboards/view?s=${token}`, shareExpiresAt: e === null ? null : new Date(e).toISOString(), shareExpiry: expiry } : none;
}

/** What the owner's browser may see of a share: never its number. */
export function shareForBrowser(view: BoDashboardShareView | null) {
  return {
    share: view?.share ? { mode: view.share.mode, people: view.share.people, updatedAt: view.share.updatedAt } : null,
    candidates: view?.candidates ?? [],
  };
}
