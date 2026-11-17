// An external guest of one salon (plan yelema-platform docs/plans/salons-invites-externes.md): its session
// cookie, the checks of its POST routes and what its screens read. Pure: tested.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import type { BuzzEntry } from "./buzz.ts";
import { normDrivePath } from "./drive-links.ts";
import type { SalonDeliverable } from "./salon-deliverables.ts";

/** Only the guest routes receive it: the browser never sends it to a member page or `/api/*`. */
export const GUEST_PATH = "/invite";
export const guestCookieName = (production: boolean): string => (production ? "__Secure-yelema_guest" : "yelema_guest");
const SLIDE_S = 30 * 24 * 60 * 60;

export const INVITE_TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

/** Whether the browser sends the guest cookie with a request for `pathname` (cookie path rules). */
export const guestCookieApplies = (pathname: string): boolean => pathname === GUEST_PATH || pathname.startsWith(`${GUEST_PATH}/`);

/** 30 days from now, never past the end of the access; null once it has ended. */
export function guestCookieOptions(expiresAt: string, nowMs: number, production: boolean) {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const maxAge = Math.min(SLIDE_S, Math.floor((end - nowMs) / 1000));
  if (maxAge <= 0) return null;
  return { httpOnly: true, secure: production, sameSite: "lax" as const, path: GUEST_PATH, maxAge };
}

const tokenTag = (token: string): string => createHash("sha256").update(token).digest("base64url").slice(0, 22);

/** The session the back office opened and the guest's relay key (hex), made and kept by this server only. */
export interface GuestCookie { session: string; secret: string }
const AAD = Buffer.from("yelema-guest-cookie-v1");
const SESSION_RE = /^[\x21-\x7e]{16,4096}$/;
const SECRET_RE = /^[0-9a-f]{64}$/;

/** AES-256-GCM key of the guest cookie, derived from the resolver token (already required by every guest call). */
export function guestCookieKey(secret: string | undefined): Buffer | null {
  const s = secret?.trim();
  if (!s || s.length < 16) return null;
  return Buffer.from(hkdfSync("sha256", s, "yelema", "guest-cookie-v1", 32));
}

/** Sealed: the browser holds it but can neither read nor change it. Bound to the invitation it was opened from. */
export function sealGuestCookie(key: Buffer, c: GuestCookie, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify({ s: c.session, t: tokenTag(token), k: c.secret }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The cookie's content when it is intact and, if `token` is given, was opened from that invitation; else null. */
export function openGuestCookie(key: Buffer, raw: string | undefined, token?: string): GuestCookie | null {
  if (!raw || raw.length > 8192) return null;
  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12)).setAAD(AAD);
    decipher.setAuthTag(buf.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as { s?: unknown; t?: unknown; k?: unknown };
    if (typeof v.s !== "string" || !SESSION_RE.test(v.s) || typeof v.k !== "string" || !SECRET_RE.test(v.k)) return null;
    if (token !== undefined && v.t !== tokenTag(token)) return null;
    return { session: v.s, secret: v.k };
  } catch {
    return null;
  }
}

/** A key for in-memory maps (limits, cache) that is not the session itself. */
export const sessionTag = (session: string): string => createHash("sha256").update(session).digest("base64url");

type Headers = { get(name: string): string | null };

/**
 * A guest POST is refused unless it comes from this site's own page: the browser's `Sec-Fetch-Site`, else
 * `Origin` against the host, and a JSON body (a cross-site form cannot send one without a preflight).
 */
export function sameOriginPost(h: Headers): boolean {
  if (!(h.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = h.get("origin");
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The visitor's address from the trusted hop, for rate limits; never logged. On Vercel, `x-real-ip` set by its proxy
 * (`IP_HEADER_NAME` of @vercel/functions; a client's own value is overwritten); elsewhere, the entry the nearest
 * proxy appended (rightmost of `X-Forwarded-For`). Never a left-hand entry, which the client writes.
 */
export function clientIp(h: Headers, onVercel: boolean): string {
  const ip = onVercel ? (h.get("x-real-ip") ?? "").trim() : ((h.get("x-forwarded-for") ?? "").split(",").pop() ?? "").trim();
  return IP_RE.test(ip) ? ip : "";
}

/** At most `limit` hits per key per window, in this server instance (the back office keeps its own limits). */
export function rateWindow(limit: number, windowMs: number, maxKeys = 5000) {
  const hits = new Map<string, { n: number; until: number }>();
  return (key: string, nowMs: number): { ok: true } | { ok: false; retryAfter: number } => {
    let w = hits.get(key);
    if (!w || w.until <= nowMs) {
      if (hits.size >= maxKeys) for (const [k, v] of hits) if (v.until <= nowMs || hits.size >= maxKeys) hits.delete(k);
      w = { n: 0, until: nowMs + windowMs };
      hits.set(key, w);
    }
    w.n++;
    return w.n <= limit ? { ok: true } : { ok: false, retryAfter: Math.ceil((w.until - nowMs) / 1000) };
  };
}

/** Per server instance, in front of the back office's own: per address (code, verify), per session (salon). */
export const guestLimits = () => ({
  code: rateWindow(5, 10 * 60_000),
  verify: rateWindow(10, 10 * 60_000),
  post: rateWindow(20, 60_000),
  read: rateWindow(60, 60_000),
  stream: rateWindow(20, 10 * 60_000),
});

export interface GuestSalon { id: string; nom: string; channel: string }
export interface GuestView { expiresAt: string; guest: { id: string; email: string; nom: string }; salon: GuestSalon }
/** The back office's answer: the relay's address stays on this server, which alone talks to the relay. */
export type GuestSessionView = GuestView & { relay: { url: string } };

/** What a guest's screen may hold: the view without anything else the back office sent (no relay). */
export function guestView(v: GuestView): GuestView {
  return {
    expiresAt: v.expiresAt,
    guest: { id: v.guest.id, email: v.guest.email, nom: v.guest.nom },
    salon: { id: v.salon.id, nom: v.salon.nom, channel: v.salon.channel },
  };
}

export const DEVICE_LIMIT = "Vous êtes déjà connecté sur 2 appareils. Demandez à la personne qui vous a invité de déconnecter vos appareils.";

/** How a back-office answer to a guest route reads: the session is dropped on 401 and 410. */
export function guestRefusal(status: number, code: string): "ended" | "signed_out" | null {
  if (status === 410 || code === "access_ended") return "ended";
  if (status === 401) return "signed_out";
  return null;
}

export interface GuestParticipant { nom: string; type: "personne" | "expert" | "invite"; cles: string[] }
/** `path` is relative to the salon's folder; `drivePath` is the full one on the Expert's drive. */
export interface GuestFile { name: string; path: string; drivePath: string; expert: string; size: number | null; modifiedAt: string }

/** The salon's participants as the thread reads a directory; an expert hangs off its owner « X (de Owner) ». */
export const guestDirectory = (list: readonly GuestParticipant[]): BuzzEntry[] =>
  list.map((p) => ({ nom: p.nom, type: p.type, membre: p.type === "expert" ? (/ \(de (.*)\)$/.exec(p.nom)?.[1] ?? p.nom) : p.nom, cles: p.cles }));

/** A guest's file link: its own route, which re-checks the session on each open; never a signed address. */
export const guestFileHref = (drivePath: string): string => `${GUEST_PATH}/salon/fichier?${new URLSearchParams({ p: drivePath }).toString()}`;

/** The guest's files as the salon's deliverables. */
export function guestDeliverables(list: readonly GuestFile[]): SalonDeliverable[] {
  return list.map((f) => {
    const full = normDrivePath(f.drivePath);
    return { id: full, expertId: "", title: f.name, kind: "", updatedAt: f.modifiedAt, url: guestFileHref(f.drivePath), folder: full.split("/").slice(0, -1).join("/"), auteur: f.expert };
  });
}
