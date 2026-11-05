import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { clientIp, guestCookieKey, guestCookieName, guestCookieOptions, guestLimits, guestRefusal, openGuestCookie, sameOriginPost, sealGuestCookie, sessionTag, type GuestCookie, type GuestParticipant, type GuestSessionView } from "@/lib/guest-access";
import { apiError, handleError } from "@/lib/http";
import { resolverToken } from "@/lib/runtime-config";

// The guest routes' server side (`src/app/invite/**`): the sealed session cookie (httpOnly, path /invite, holds
// the guest's relay key), the same-origin check of their POSTs and their limits. Member routes never read it.

const production = process.env.NODE_ENV === "production";
export const GUEST_COOKIE = guestCookieName(production);
export const ENDED = "Votre accès à ce salon a pris fin.";

const LIMITS = guestLimits();

export const ipOf = (request: Request): string => clientIp(request.headers, Boolean(process.env.VERCEL));

/** null to go on; otherwise a 429 for `key` (an address, or a session's tag). */
export function tooMany(kind: keyof typeof LIMITS, key: string): NextResponse | null {
  const limit = LIMITS[kind](key || "?", Date.now());
  if (limit.ok) return null;
  const res = apiError("Trop de demandes. Réessayez dans quelques minutes.", 429, "rate_limited");
  res.headers.set("Retry-After", String(limit.retryAfter));
  return res;
}

/** null to go on; otherwise the refusal (cross-site POST, too many tries from this address). */
export function guardPost(request: Request, kind: "code" | "verify" | "logout" | "message"): NextResponse | null {
  if (!sameOriginPost(request.headers)) return apiError("Requête refusée.", 403, "forbidden");
  return kind === "code" || kind === "verify" ? tooMany(kind, ipOf(request)) : null;
}

/** null when the resolver token is missing: then no guest can enter (an outage, never a readable cookie). */
export const cookieKey = (): Buffer | null => guestCookieKey(resolverToken());

export async function guestCookie(token?: string): Promise<GuestCookie | null> {
  const key = cookieKey();
  return key ? openGuestCookie(key, (await cookies()).get(GUEST_COOKIE)?.value, token) : null;
}

export async function guestSession(token?: string): Promise<string | null> {
  return (await guestCookie(token))?.session ?? null;
}

/** Sets (or slides) the sealed cookie; past the end of the access, drops it. */
export function keepGuestCookie(res: NextResponse, c: GuestCookie, token: string, expiresAt: string): NextResponse {
  const options = guestCookieOptions(expiresAt, Date.now(), production);
  const key = cookieKey();
  if (options && key) res.cookies.set(GUEST_COOKIE, sealGuestCookie(key, c, token), options);
  else dropGuestCookie(res);
  return res;
}

// The back office's word on a session, and its salon's participants, kept ≤ 30 s per session in this instance.
const FRESH_MS = 30_000;
function memo<T>() {
  const m = new Map<string, { v: T; until: number }>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const hit = m.get(key);
    if (hit && hit.until > now) return hit.v;
    if (m.size >= 5000) for (const [k, e] of m) if (e.until <= now || m.size >= 5000) m.delete(k);
    const v = await load();
    m.set(key, { v, until: now + FRESH_MS });
    return v;
  };
}
const views = memo<GuestSessionView>();
const people = memo<Map<string, string>>();

export const checkedView = (session: string, ip: string): Promise<GuestSessionView> => views(sessionTag(session), () => backoffice.guestSession(session, ip));

/** Each key of the salon's participants → their name. */
export const salonNames = (session: string, ip: string): Promise<Map<string, string>> =>
  people(sessionTag(session), async () => {
    const { data } = await backoffice.guestParticipants(session, ip);
    return new Map((Array.isArray(data) ? (data as GuestParticipant[]) : []).flatMap((p) => p.cles.map((k): [string, string] => [k, p.nom])));
  });

export interface GuestContext { cookie: GuestCookie; view: GuestSessionView; tag: string; ip: string }

/** The guest of this request, its session re-checked (≤ 30 s old); otherwise the response to send. */
export async function guestContext(request: Request): Promise<GuestContext | NextResponse> {
  const cookie = await guestCookie();
  if (!cookie) return noStore(apiError("Votre session a expiré.", 401, "unauthorized"));
  const ip = ipOf(request);
  try {
    return { cookie, view: await checkedView(cookie.session, ip), tag: sessionTag(cookie.session), ip };
  } catch (e) {
    return noStore(guestFailure(e));
  }
}

/** For a stream: whether the session still holds (an outage of the back office keeps it open). */
export async function recheckGuest(session: string, ip: string): Promise<"ok" | "ended" | "signed_out"> {
  try {
    await checkedView(session, ip);
    return "ok";
  } catch (e) {
    return e instanceof BackofficeError ? (guestRefusal(e.status, e.code) ?? "ok") : "ok";
  }
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
