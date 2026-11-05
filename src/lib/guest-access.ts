// An external guest of one salon (plan yelema-platform docs/plans/salons-invites-externes.md): its session
// cookie, the checks of its POST routes and what its screens read. Pure: tested.
import { createHash } from "node:crypto";
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

/** The cookie holds the back office's session and which invitation it was opened from (a digest, never the link). */
export const encodeGuestCookie = (session: string, token: string): string =>
  Buffer.from(JSON.stringify({ s: session, t: tokenTag(token) }), "utf8").toString("base64url");

/** The session, when the cookie is well formed and, if `token` is given, was opened from that invitation. */
export function guestSessionOf(raw: string | undefined, token?: string): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { s?: unknown; t?: unknown };
    if (typeof v.s !== "string" || !/^[\x21-\x7e]{16,4096}$/.test(v.s)) return null;
    if (token !== undefined && v.t !== tokenTag(token)) return null;
    return v.s;
  } catch {
    return null;
  }
}

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

export interface GuestSalon { id: string; nom: string; channel: string }
export interface GuestView { expiresAt: string; guest: { id: string; email: string; nom: string }; salon: GuestSalon; relay: { url: string } }

/** What a guest's screen may hold: the view without anything else the back office sent. */
export function guestView(v: GuestView): GuestView {
  return {
    expiresAt: v.expiresAt,
    guest: { id: v.guest.id, email: v.guest.email, nom: v.guest.nom },
    salon: { id: v.salon.id, nom: v.salon.nom, channel: v.salon.channel },
    relay: { url: v.relay.url },
  };
}

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
