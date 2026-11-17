import { backoffice } from "@/lib/backoffice";
import { guestDirectory } from "@/lib/guest-access";
import { guestFailure, guestSession, ipOf, noStore } from "@/lib/guest-session";
import { apiError, json } from "@/lib/http";

// `GET /invite/salon/participants` — who is in the guest's salon (names, kinds and relay keys only).
export async function GET(request: Request) {
  const session = await guestSession();
  if (!session) return noStore(apiError("Votre session a expiré.", 401, "unauthorized"));
  try {
    const { data } = await backoffice.guestParticipants(session, ipOf(request));
    return noStore(json({ directory: guestDirectory(Array.isArray(data) ? data : []) }));
  } catch (e) {
    return noStore(guestFailure(e));
  }
}
