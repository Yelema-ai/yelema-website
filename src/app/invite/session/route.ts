import { backoffice } from "@/lib/backoffice";
import { guestView, INVITE_TOKEN } from "@/lib/guest-access";
import { guestCookie, guestFailure, ipOf, keepGuestCookie, noStore } from "@/lib/guest-session";
import { apiError, json } from "@/lib/http";

// `GET /invite/session` — the guest's salon when this browser holds a session opened from the invitation it
// shows (`X-Invite-Token`, never in the address); each answer slides the cookie, never past the access's end.
export async function GET(request: Request) {
  const token = request.headers.get("x-invite-token") ?? "";
  if (!INVITE_TOKEN.test(token)) return apiError("Votre session a expiré.", 401, "unauthorized");
  const cookie = await guestCookie(token);
  if (!cookie) return noStore(apiError("Votre session a expiré.", 401, "unauthorized"));
  try {
    const view = await backoffice.guestSession(cookie.session, ipOf(request));
    return keepGuestCookie(noStore(json(guestView(view))), cookie, token, view.expiresAt);
  } catch (e) {
    return noStore(guestFailure(e));
  }
}
