import { NextResponse } from "next/server";
import { backoffice } from "@/lib/backoffice";
import { guestFailure, guestSession, ipOf, noStore } from "@/lib/guest-session";
import { apiError } from "@/lib/http";

// `GET /invite/salon/fichier?p=<chemin>` — each open re-checks the guest's session at the back office, which
// signs a fresh short address for a file its salon's list still holds; the browser is sent there.
export async function GET(request: Request) {
  const session = await guestSession();
  if (!session) return noStore(apiError("Votre session a expiré.", 401, "unauthorized"));
  const p = new URL(request.url).searchParams.get("p") ?? "";
  if (!p || p.length > 1024) return noStore(apiError("Ce fichier est introuvable.", 404, "not_found"));
  try {
    const { data } = await backoffice.guestFile(session, ipOf(request), p);
    return noStore(NextResponse.redirect(data.url, 302));
  } catch (e) {
    return noStore(guestFailure(e));
  }
}
