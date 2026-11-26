// Short signed links to one deliverable (`/api/agents/[id]/files/signed`): the phone opens, shares or
// downloads them without a header, like the back office's `/app/deliverables/file`. Bound to the client,
// the instance and the path; valid 15 minutes. Pure, so the rules are tested.
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const LINK_TTL_MS = 15 * 60_000;

const derive = (secret: string | undefined): Buffer | null => (secret && secret.length >= 16 ? Buffer.from(hkdfSync("sha256", secret, "yelema", "deliverable-file-link-v1", 32)) : null);

/**
 * Derived from FILE_LINK_SECRET; without it, from AGENT37_API_KEY unless FILE_LINK_FALLBACK=off (the key of every
 * instance should not also sign links); null ⇒ no links.
 */
export function fileLinkKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  return derive(env.FILE_LINK_SECRET?.trim()) ?? (env.FILE_LINK_FALLBACK?.trim() === "off" ? null : derive(env.AGENT37_API_KEY?.trim()));
}

/** The keys a link may have been signed with: the current one, and the fallback's while it is not switched off (links live 15 minutes). */
export function fileLinkVerifyKeys(env: Record<string, string | undefined> = process.env): Buffer[] {
  const legacy = env.FILE_LINK_FALLBACK?.trim() === "off" ? null : derive(env.AGENT37_API_KEY?.trim());
  return [derive(env.FILE_LINK_SECRET?.trim()), legacy].filter((k): k is Buffer => k !== null);
}

const subject = (workspace: string, instance: string, path: string, exp: number) => `${workspace}\n${instance}\n${path}\n${String(exp)}`;

export function signFileLink(key: Buffer, workspace: string, instance: string, path: string, exp: number): string {
  return createHmac("sha256", key).update(subject(workspace, instance, path, exp)).digest("base64url");
}

export function verifyFileLink(key: Buffer, workspace: string, instance: string, path: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp < now || exp > now + LINK_TTL_MS + 60_000) return false;
  const want = Buffer.from(signFileLink(key, workspace, instance, path, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The query of a link valid from `now`. */
export function fileLinkQuery(key: Buffer, workspace: string, instance: string, path: string, now = Date.now()): string {
  const exp = now + LINK_TTL_MS;
  return new URLSearchParams({ p: path, e: String(exp), s: signFileLink(key, workspace, instance, path, exp) }).toString();
}
