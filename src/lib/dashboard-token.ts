import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Shared-dashboard links carry this sealed token: unreadable, unforgeable without the server key. It
// names the back office's share, its current number and the link's end; who may open it is decided
// there on each opening. The back office keeps no end date, so the end lives in the token.

export interface ShareClaims {
  /** Workspace the share belongs to. */
  w: string;
  /** The back office's share id (`shr_…`). */
  s: string;
  /** Share number; regenerating or stopping the share changes it, so the old link dies. */
  n: string;
  /** End of the link (ms since epoch); null: no end. */
  e: number | null;
}

/** Links sealed before ends existed (v2) open until this date, then fall. */
export const LEGACY_LINKS_END = Date.parse("2026-12-06T00:00:00Z");

const MAX_TOKEN = 512;

/** Key derived from DASHBOARD_SHARE_SECRET; null ⇒ sharing is off (never a fallback secret). */
export function shareKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.DASHBOARD_SHARE_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return Buffer.from(hkdfSync("sha256", secret, "yelema", "dashboard-share-v2", 32));
}

export function sealShare(claims: ShareClaims, key: Buffer | null = shareKey()): string | null {
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify({ v: 3, w: claims.w, s: claims.s, n: claims.n, e: claims.e });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The claims, `"expired"` for a genuine link past its end, null for anything else. */
export function openShare(token: unknown, key: Buffer | null = shareKey(), nowMs = Date.now()): ShareClaims | "expired" | null {
  if (!key || typeof token !== "string" || token.length > MAX_TOKEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length < 29) return null;
  let c: Record<string, unknown>;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    c = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (![c.w, c.s, c.n].every((x) => typeof x === "string" && x.length > 0 && x.length <= 128)) return null;
  const e = c.v === 2 ? LEGACY_LINKS_END : c.v === 3 && (c.e === null || (typeof c.e === "number" && Number.isFinite(c.e))) ? (c.e as number | null) : undefined;
  if (e === undefined) return null;
  if (e !== null && nowMs >= e) return "expired";
  return { w: c.w as string, s: c.s as string, n: c.n as string, e };
}
