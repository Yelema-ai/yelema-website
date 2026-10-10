import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { backoffice, BackofficeError, type BoInstance, type BoInstanceReading, type BoMe, type BoSession } from "@/lib/backoffice";
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
// each would otherwise be a round-trip to the back office.
const TTL_MS = 30_000;
// An answer older than TTL_MS is served once more while it is renewed, never one older than this.
// A suspension is felt at the request after the renewal, so within this delay at the very most.
const STALE_MS = 5 * 60_000;

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

const refused = (e: unknown) => e instanceof BackofficeError && (e.status === 401 || e.status === 403);

// Keyed by the workspace as well as the session: an answer given for one client is never served
// to a request for another, even with the same token.
//
// The calls a page makes together share ONE round-trip (the request in flight is what is kept, not
// only its answer). An answer past TTL_MS is still served while a new one is fetched, so nobody
// waits on the back office after a pause; past STALE_MS it is not, and the request waits. A refusal
// drops the kept answer at once, so a suspended user gets at most the requests already under way.
function memo<T>(load: (token: string) => Promise<T>) {
  const store = new Map<string, { at: number; value: T }>();
  const flying = new Map<string, Promise<T>>();

  function refresh(key: string, token: string): Promise<T> {
    let pending = flying.get(key);
    if (!pending) {
      pending = load(token).then(
        (value) => {
          flying.delete(key);
          store.set(key, { at: Date.now(), value });
          // Sessions come and go: keep the map from growing without bound.
          if (store.size > 500) for (const [k, v] of store) if (Date.now() - v.at >= STALE_MS) store.delete(k);
          return value;
        },
        (e) => {
          flying.delete(key);
          if (refused(e)) store.delete(key);
          throw e;
        }
      );
      flying.set(key, pending);
    }
    return pending;
  }

  return async (workspace: string, token: string): Promise<T> => {
    const key = `${workspace}:${fingerprint(token)}`;
    const hit = store.get(key);
    const age = hit ? Date.now() - hit.at : Infinity;
    if (hit && age < TTL_MS) return hit.value;
    const fresh = refresh(key, token);
    if (!hit || age >= STALE_MS) return fresh;
    // Nobody waits for this one: its failure is the next request's to see.
    const settled = fresh.then(noop, noop);
    try {
      // Keeps the function alive until the answer is in, where the host would otherwise freeze it.
      after(() => settled);
    } catch {
      // Outside a request there is nothing to keep alive.
    }
    return hit.value;
  };
}

function noop(): void {}

const meOf = memo((token) => backoffice.me(token));
const instanceOf = memo((token) => backoffice.instance(token));

// A refused session (expired, suspended, no longer a member) reads as "nobody signed in"; an
// outage is NOT that, and is thrown so the caller answers "try again" rather than signing out.
function nobodyOn(e: unknown): null {
  if (refused(e)) return null;
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

// What the back office says of the signed-in user's instance; null when nobody is signed in.
const currentReading = cache(async (): Promise<BoInstanceReading | null> => {
  const session = await readSession();
  if (!session) return null;
  const workspace = await pinnedWorkspaceId();
  if (!workspace) return null;
  // Asked alongside "who is this" rather than after it. The back office refuses the instance to a
  // session this client does not admit, and the answer is kept only for a user this request admits.
  const [me, reading] = await Promise.all([currentPrincipal(), instanceOf(workspace, session.accessToken).catch(nobodyOn)]);
  return me ? reading : null;
});

/** The signed-in user's own instance with its installed experts; null when they have none yet. */
export const currentInstance = cache(async (): Promise<BoInstance | null> => (await currentReading())?.instance ?? null);

/** Where the installation of the signed-in user's team stands; null when nobody is signed in. */
export const currentInstallation = cache(async (): Promise<Pick<BoInstanceReading, "installation" | "failedExperts"> | null> => {
  const reading = await currentReading();
  return reading ? { installation: reading.installation, failedExperts: reading.failedExperts } : null;
});
