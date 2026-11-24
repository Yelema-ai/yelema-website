import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backoffice } from "@/lib/backoffice";
import { keepMfaTicket } from "@/lib/mfa-cookie";
import { authViaBackoffice } from "@/lib/runtime-config";
import { writeSession } from "@/lib/session";
import { googleCookieOptions, googleReason, MFA_TICKET, openingStep } from "@/lib/signin-steps";
import { requestHost } from "../../_shared";
import { backToLogin, GOOGLE_COOKIE, siteOrigin } from "../_shared";

// The back office's return: `?ticket=` (single use, 60 s) is exchanged server to server for the session
// or the refusal decided there. A code to enter goes on /login; the ticket never reaches the page.
export async function GET(request: Request) {
  const res = await settle(request);
  res.cookies.set(GOOGLE_COOKIE, "", { ...googleCookieOptions(process.env.NODE_ENV === "production"), maxAge: 0 });
  return res;
}

async function settle(request: Request): Promise<NextResponse> {
  const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
  const started = Boolean((await cookies()).get(GOOGLE_COOKIE)?.value);
  if (!authViaBackoffice()) return backToLogin(request, "unavailable");
  if (!started || !MFA_TICKET.test(ticket)) return backToLogin(request, "cancelled");

  const opening = await openingStep(() => backoffice.googleTicket(ticket));
  if (opening.kind === "session") {
    await writeSession(opening.session);
    return NextResponse.redirect(new URL("/", siteOrigin(request)), 303);
  }
  if (opening.kind === "mfa") {
    await keepMfaTicket(opening.ticket, opening.expiresIn, requestHost(request));
    return NextResponse.redirect(new URL("/login", siteOrigin(request)), 303);
  }
  const reason = googleReason(opening.error);
  if (reason === "unavailable") console.error("[auth] google ticket:", opening.error instanceof Error ? opening.error.message : opening.error);
  return backToLogin(request, reason);
}
