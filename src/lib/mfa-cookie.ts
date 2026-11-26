import "server-only";
import { cookies } from "next/headers";
import { resolverToken } from "@/lib/runtime-config";
import { mfaCookieKey, openMfaTicket, sealMfaTicket } from "@/lib/mfa-ticket";
import { AUTH_PATH, mfaCookieName, mfaCookieOptions } from "@/lib/signin-steps";

// The ticket of a sign-in waiting for its code: sealed in an httpOnly cookie on /api/auth, never in a URL or the page.
const production = process.env.NODE_ENV === "production";
export const MFA_COOKIE = mfaCookieName(production);

/** The sealed value and its options, for a response the caller builds itself (the proxy). */
export function mfaCookie(ticket: string, expiresIn: number, host: string) {
  const options = mfaCookieOptions(expiresIn, production);
  return { name: MFA_COOKIE, value: sealMfaTicket(mfaCookieKey(resolverToken()), ticket, host, Date.now() + options.maxAge * 1000), options };
}

export async function keepMfaTicket(ticket: string, expiresIn: number, host: string): Promise<void> {
  const c = mfaCookie(ticket, expiresIn, host);
  (await cookies()).set(c.name, c.value, c.options);
}

export async function readMfaTicket(host: string): Promise<string | null> {
  return openMfaTicket(mfaCookieKey(resolverToken()), (await cookies()).get(MFA_COOKIE)?.value, host, Date.now());
}

export async function dropMfaTicket(): Promise<void> {
  (await cookies()).set(MFA_COOKIE, "", { ...mfaCookieOptions(0, production), path: AUTH_PATH, maxAge: 0 });
}
