import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { backoffice, BackofficeError, type BoInstance, type BoInstanceReading, type BoMe, type BoSession } from "@/lib/backoffice";
import { tokenKid, verifyEs256, type Jwk } from "@/lib/jwt";
import { memo } from "@/lib/memo";
import { deployVersion, supabaseAnonKey, supabaseUrl } from "@/lib/runtime-config";
import { sharedCacheOn, sharedLayer, throughShared, vercelRuntimeCache } from "@/lib/shared-cache";
import { pinnedWorkspaceId } from "@/lib/tenant";
import type { WorkspaceWithRole } from "@/lib/types";

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
// The back office down: the last answer keeps the member working this long (a refusal still drops it).
const STALE_ON_OUTAGE_MS = 30 * 60_000;
// SHARED_SESSION_CACHE=on (Vercel only): the same answers shared by the region's functions, this long.
const SHARED_TTL_S = 15;

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
// to a request for another, even with the same token. Calls made together share one round-trip; an
// answer past TTL_MS is served while renewed (up to STALE_MS); a refusal drops it at once.
function sessionMemo<T>(name: string, load: (token: string) => Promise<T>) {
  const m = memo<T>({ ttlMs: TTL_MS, staleMs: STALE_MS, staleOnErrorMs: STALE_ON_OUTAGE_MS, evict: refused, maxEntries: 2000, background: keepAlive });
  const shared = sharedCacheOn(process.env) ? sharedLayer<T>(name, SHARED_TTL_S, () => vercelRuntimeCache(deployVersion())) : null;
  const key = (workspace: string, token: string) => `${workspace}:${fingerprint(token)}`;
  const read = (workspace: string, token: string): Promise<T> => {
    const k = key(workspace, token);
    return m.get(k, shared ? () => throughShared(shared, `${name}:${k}`, () => load(token), refused, keepAlive) : () => load(token));
  };
  // An answer the caller already holds (the back office's reply to a change) replaces the kept one.
  const put = (workspace: string, token: string, value: T): void => {
    m.put(key(workspace, token), value);
    if (shared) keepAlive(shared.write(`${name}:${key(workspace, token)}`, value));
  };
  const drop = (workspace: string, token: string): void => {
    m.drop(key(workspace, token));
    if (shared) keepAlive(shared.drop(`${name}:${key(workspace, token)}`));
  };
  return Object.assign(read, { put, drop });
}

// Keeps the function alive until a revalidation is in, where the host would otherwise freeze it.
function keepAlive(settled: Promise<void>): void {
  try {
    after(() => settled);
  } catch {
    // Outside a request there is nothing to keep alive.
  }
}

const meOf = sessionMemo("me", (token) => backoffice.me(token));

/** After the user changed their own profile: the next page shows it at once, not the kept answer. */
export function rememberPrincipal(workspace: string, token: string, me: BoMe): void {
  meOf.put(workspace, token, me);
}

/** After a change to what `me` carries, answered without it (the company's logo): read it again next time. */
export function forgetPrincipal(workspace: string, token: string): void {
  meOf.drop(workspace, token);
}
const instanceOf = sessionMemo("instance", (token) => backoffice.instance(token));

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

// What the back office says of the signed-in user's instance; null when nobody is signed in. It is
// asked for this request's workspace and refused to a session this client does not admit.
const currentReading = cache(async (): Promise<BoInstanceReading | null> => {
  const session = await readSession();
  if (!session) return null;
  const workspace = await pinnedWorkspaceId();
  if (!workspace) return null;
  return instanceOf(workspace, session.accessToken).catch(nobodyOn);
});

// ---- Who is signed in, checked here ------------------------------------------------------------

const JWKS_TTL_MS = 10 * 60_000;
const jwks = memo<Jwk[]>({ ttlMs: JWKS_TTL_MS, staleOnErrorMs: 6 * 60 * 60_000, maxEntries: 4, maxFlightMs: 6_000 });
let jwksForcedAt = 0;

async function readJwks(base: string): Promise<Jwk[]> {
  const anon = supabaseAnonKey();
  const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`, {
    headers: { Accept: "application/json", ...(anon ? { apikey: anon } : {}) },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`jwks answered ${res.status}`);
  const body = (await res.json()) as { keys?: unknown };
  return Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
}

/** The account a session's token names, checked against the project's keys; null when it cannot be told here. */
async function localClaims(token: string): Promise<{ sub: string; email: string | null } | null> {
  const base = supabaseUrl()?.replace(/\/+$/, "");
  if (!base) return null;
  const expect = { issuer: `${base}/auth/v1`, audience: "authenticated" };
  try {
    let keys = await jwks.get(base, () => readJwks(base));
    // A key rotated since the last read: read the set once more, at most once a minute.
    const kid = tokenKid(token);
    if (kid && !keys.some((k) => k.kid === kid) && Date.now() - jwksForcedAt > 60_000) {
      jwksForcedAt = Date.now();
      jwks.drop(base);
      keys = await jwks.get(base, () => readJwks(base));
    }
    const check = verifyEs256(token, keys, expect);
    return check.ok ? { sub: check.claims.sub, email: check.claims.email } : null;
  } catch {
    return null;
  }
}

/**
 * The id of the signed-in account, read from the session's token when its signature checks out
 * (no call); otherwise from the back office. Says WHO, not that they are admitted: a route that
 * reads the user's instance or data has the back office check that.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const session = await readSession();
  if (!session) return null;
  const local = await localClaims(session.accessToken);
  if (local) return local.sub;
  return (await currentPrincipal())?.user.id ?? null;
});

/** The signed-in user's own instance with its installed experts; null when they have none yet. */
export const currentInstance = cache(async (): Promise<BoInstance | null> => (await currentReading())?.instance ?? null);

/** Where the installation of the signed-in user's team stands; null when nobody is signed in. */
export const currentInstallation = cache(async (): Promise<Pick<BoInstanceReading, "installation" | "failedExperts"> | null> => {
  const reading = await currentReading();
  return reading ? { installation: reading.installation, failedExperts: reading.failedExperts } : null;
});

/** The one workspace of a user signed in through the back office, in this app's shape. */
export function workspaceOfMe(me: BoMe): WorkspaceWithRole {
  return { id: me.workspace.id, name: me.workspace.name, owner_id: "", created_at: "", role: me.user.role, logo_url: me.workspace.logoUrl, brand_color: me.workspace.brandColor ?? null, access: me.access ?? "instance" };
}
