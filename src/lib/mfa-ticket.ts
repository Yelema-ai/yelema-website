// The ticket cookie of a sign-in waiting for its code: sealed and bound to its host. Pure: tested.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { MFA_TICKET } from "./signin-steps.ts";

const AAD = Buffer.from("yelema-mfa-ticket-v1");
// Without the resolver token (single-client deployment), a key of this process: a code step then
// has to land on the server that opened it, else the member signs in again. On globalThis: the proxy
// and the routes are separate bundles of one process.
const shared = globalThis as { __yelemaMfaKey?: Buffer };
const processKey = (shared.__yelemaMfaKey ??= randomBytes(32));

/** AES-256-GCM key of the ticket cookie, derived from the resolver token when there is one. */
export function mfaCookieKey(secret: string | undefined): Buffer {
  const s = secret?.trim();
  return s && s.length >= 16 ? Buffer.from(hkdfSync("sha256", s, "yelema", "mfa-ticket-v1", 32)) : processKey;
}

/** Sealed and bound to the host it was opened on: the browser can neither read it nor carry it to another client. */
export function sealMfaTicket(key: Buffer, ticket: string, host: string, expiresAtMs: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify({ t: ticket, h: host, e: expiresAtMs }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The ticket when the cookie is intact, for this host and not past its end; else null. */
export function openMfaTicket(key: Buffer, raw: string | undefined, host: string, nowMs: number): string | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12)).setAAD(AAD);
    decipher.setAuthTag(buf.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as { t?: unknown; h?: unknown; e?: unknown };
    if (typeof v.t !== "string" || !MFA_TICKET.test(v.t) || v.h !== host || typeof v.e !== "number" || v.e <= nowMs) return null;
    return v.t;
  } catch {
    return null;
  }
}
