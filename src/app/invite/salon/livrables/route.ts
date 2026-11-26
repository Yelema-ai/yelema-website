import { backoffice } from "@/lib/backoffice";
import { guestDeliverables } from "@/lib/guest-access";
import { guestFailure, guestSession, ipOf, noStore } from "@/lib/guest-session";
import { apiError, json } from "@/lib/http";

// `GET /invite/salon/livrables` — the files of the guest's salon only, each behind a short signed link.
export async function GET(request: Request) {
  const session = await guestSession();
  if (!session) return noStore(apiError("Votre session a expiré.", 401, "unauthorized"));
  try {
    const { data } = await backoffice.guestDeliverables(session, ipOf(request));
    return noStore(json({ items: guestDeliverables(Array.isArray(data) ? data : []) }));
  } catch (e) {
    return noStore(guestFailure(e));
  }
}
