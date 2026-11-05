import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BackofficeError } from "@/lib/backoffice";
import { clientIp, encodeGuestCookie, guestCookieName, guestCookieOptions, guestRefusal, guestSessionOf, rateWindow, sameOriginPost } from "@/lib/guest-access";
import { apiError, handleError } from "@/lib/http";

// The guest routes' server side (`src/app/invite/**`): the session cookie (httpOnly, path /invite), the
// same-origin check of their POSTs and a per-address limit on the code. Member routes never read this cookie.

const production = process.env.NODE_ENV === "production";
export const GUEST_COOKIE = guestCookieName(production);
export const ENDED = "Votre accès à ce salon a pris fin.";

// Per server instance, in front of the back office's own limits.
const codeLimit = rateWindow(5, 10 * 60_000);
const verifyLimit = rateWindow(10, 10 * 60_000);

export const ipOf = (request: Request): string => clientIp(request.headers, Boolean(process.env.VERCEL));

/** null to go on; otherwise the refusal (cross-site POST, too many tries from this address). */
export function guardPost(request: Request, kind: "code" | "verify" | "logout"): NextResponse | null {
  if (!sameOriginPost(request.headers)) return apiError("Requête refusée.", 403, "forbidden");
  if (kind === "logout") return null;
  const limit = (kind === "code" ? codeLimit : verifyLimit)(ipOf(request) || "?", Date.now());
  if (limit.ok) return null;
  const res = apiError("Trop d’essais. Réessayez dans quelques minutes.", 429, "rate_limited");
  res.headers.set("Retry-After", String(limit.retryAfter));
  return res;
}

export async function guestSession(token?: string): Promise<string | null> {
  return guestSessionOf((await cookies()).get(GUEST_COOKIE)?.value, token);
}

/** Sets (or slides) the cookie; past the end of the access, drops it. */
export function keepGuestCookie(res: NextResponse, session: string, token: string, expiresAt: string): NextResponse {
  const options = guestCookieOptions(expiresAt, Date.now(), production);
  if (options) res.cookies.set(GUEST_COOKIE, encodeGuestCookie(session, token), options);
  else dropGuestCookie(res);
  return res;
}

export function dropGuestCookie(res: NextResponse): NextResponse {
  res.cookies.set(GUEST_COOKIE, "", { httpOnly: true, secure: production, sameSite: "lax", path: "/invite", maxAge: 0 });
  return res;
}

/** A back-office refusal for a guest: an ended access or a dead session also drop the cookie. */
export function guestFailure(e: unknown): NextResponse {
  if (e instanceof BackofficeError) {
    const refusal = guestRefusal(e.status, e.code);
    if (refusal === "ended") return dropGuestCookie(apiError(ENDED, 410, "access_ended"));
    if (refusal === "signed_out") return dropGuestCookie(apiError("Votre session a expiré.", 401, "unauthorized"));
    if (e.status === 429) {
      const res = apiError("Trop d’essais. Réessayez dans quelques minutes.", 429, "rate_limited");
      if (e.retryAfter) res.headers.set("Retry-After", String(e.retryAfter));
      return res;
    }
  }
  return handleError(e);
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
