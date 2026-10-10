import { backoffice, BackofficeError } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { mailToken, noStore } from "../_session";

// `GET /api/mail/inboxes` — the experts' inboxes this member may read. Where the feature is off
// (another sign-in mode, or the back office answers 404) the list is empty and no tab shows.
export async function GET() {
  try {
    if (!authViaBackoffice()) return noStore(json({ items: [] }));
    const token = await mailToken();
    try {
      return noStore(json({ items: await backoffice.mailInboxes(token) }));
    } catch (e) {
      if (e instanceof BackofficeError && e.status === 404) return noStore(json({ items: [] }));
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
