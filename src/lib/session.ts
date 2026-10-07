import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { backoffice, BackofficeError, type BoInstance, type BoMe, type BoSession } from "@/lib/backoffice";
import { pinnedWorkspaceId } from "@/lib/tenant";

// The signed-in user when the back office owns the sign-in (AUTH_VIA_BACKOFFICE): its session
// tokens live in ONE httpOnly cookie set by this server, never readable by the page's scripts.
// The proxy (src/lib/supabase/middleware.ts) renews it shortly before it expires.

// `__Host-` binds the cookie to the exact host that set it (no Domain, Secure, Path=/): on a
// deployment that serves every client, one client's sub-domain can neither read nor replace
// another's. It needs HTTPS, so plain HTTP in development keeps the bare name. The bare name is
// still READ in production for one version, so nobody is signed out by the rename.
export const LEGACY_SESSION_COOKIE = "yelema_session";
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? `__Host-${LEGACY_SESSION_COOKIE}` : LEGACY_SESSION_COOKIE;
// The renewal token outlives the access token by weeks; the cookie follows it.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
// Who the user is and what their instance holds, kept this long: a page makes many BFF calls, and
// each would otherwise be a round-trip to the back office. A suspension is felt within this delay.
const TTL_MS = 30_000;

export function encodeSession(session: BoSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined): BoSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<BoSession>;
    if (typeof s.accessToken !== "string" || typeof s.refreshToken !== "string" || typeof s.expiresAt !== "number") return null;
    return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

// Seconds left before the access token expires (the back office gives epoch seconds).
export function secondsLeft(session: BoSession): number {
  const expiresAt = session.expiresAt > 1e12 ? session.expiresAt / 1000 : session.expiresAt;
  return expiresAt - Date.now() / 1000;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

/** The session cookie's value under its current name, else under the one it had before. */
export function sessionCookieValue(jar: { get(name: string): { value: string } | undefined }): string | undefined {
  return jar.get(SESSION_COOKIE)?.value ?? jar.get(LEGACY_SESSION_COOKIE)?.value;
}

export async function writeSession(session: BoSession): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions);
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) jar.delete(LEGACY_SESSION_COOKIE);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) jar.delete(LEGACY_SESSION_COOKIE);
}

export async function readSession(): Promise<BoSession | null> {
  return decodeSession(sessionCookieValue(await cookies()));
}

// ---- Who is signed in, and their instance ------------------------------------------------------

const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

// Keyed by the workspace as well as the session: an answer given for one client is never served
// to a request for another, even with the same token.
function memo<T>(load: (token: string) => Promise<T>) {
  const store = new Map<string, { at: number; value: T }>();
  return async (workspace: string, token: string): Promise<T> => {
    const key = `${workspace}:${fingerprint(token)}`;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = await load(token);
    store.set(key, { at: Date.now(), value });
    // Sessions come and go: keep the map from growing without bound.
    if (store.size > 500) for (const [k, v] of store) if (Date.now() - v.at >= TTL_MS) store.delete(k);
    return value;
  };
}

const meOf = memo((token) => backoffice.me(token));
const instanceOf = memo((token) => backoffice.instance(token));

// A refused session (expired, suspended, no longer a member) reads as "nobody signed in"; an
// outage is NOT that, and is thrown so the caller answers "try again" rather than signing out.
function nobodyOn(e: unknown): null {
  if (e instanceof BackofficeError && (e.status === 401 || e.status === 403)) return null;
  throw e;
}

/**
 * The signed-in user, their role and workspace; null when nobody is. Read once per request. A
 * session of another client than the request's is nobody here: the back office refuses it, and the
 * workspace it answers with is checked again.
 */
export const currentPrincipal = cache(async (): Promise<BoMe | null> => {
  const session = await readSession();
  if (!session) return null;
  const workspace = await pinnedWorkspaceId();
  if (!workspace) return null;
  const me = await meOf(workspace, session.accessToken).catch(nobodyOn);
  return me && me.workspace.id === workspace ? me : null;
});

/** The signed-in user's own instance with its installed experts; null when they have none yet. */
export const currentInstance = cache(async (): Promise<BoInstance | null> => {
  const session = await readSession();
  if (!session) return null;
  // Only for a user this request's client admits.
  if (!(await currentPrincipal())) return null;
  const workspace = await pinnedWorkspaceId();
  if (!workspace) return null;
  return instanceOf(workspace, session.accessToken).catch(nobodyOn);
});
