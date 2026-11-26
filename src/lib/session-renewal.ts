// How long before its end the proxy renews the session's token. Pure: tested.
// A page being opened renews early, so the wait for the back office falls there and not on a message being sent
// or a stream being opened a few minutes later; any other request renews only when the token is about to die.
export const RENEW_BEFORE_S = 120;
export const RENEW_EARLY_S = 600;

/** Seconds between a token's issue and its end, read from its own claims (not checked here); null when it does not say. */
export function tokenLifetime(accessToken: string): number | null {
  try {
    const { iat, exp } = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { iat?: unknown; exp?: unknown };
    return typeof iat === "number" && typeof exp === "number" && exp > iat ? exp - iat : null;
  } catch {
    return null;
  }
}

/** Early never means "at every page": at most a quarter of the token's life, and only when that life is known. */
export function renewBefore(method: string, pathname: string, lifetimeS: number | null): number {
  if (method !== "GET" || pathname.startsWith("/api/") || !lifetimeS) return RENEW_BEFORE_S;
  return Math.max(RENEW_BEFORE_S, Math.min(RENEW_EARLY_S, Math.floor(lifetimeS / 4)));
}
