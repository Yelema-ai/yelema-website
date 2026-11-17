import { NextResponse } from "next/server";
import { backoffice } from "@/lib/backoffice";
import { dropGuestCookie, guardPost, guestSession, ipOf, noStore } from "@/lib/guest-session";

// `POST /invite/logout` — closes the guest's session at the back office (best effort) and drops the cookie.
export async function POST(request: Request) {
  const refused = guardPost(request, "logout");
  if (refused) return refused;
  const session = await guestSession();
  if (session) await backoffice.guestLogout(session, ipOf(request)).catch(() => undefined);
  return dropGuestCookie(noStore(new NextResponse(null, { status: 204 })));
}
