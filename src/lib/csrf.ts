// A browser's mutating request is accepted only from this site's own pages (or a listed origin). Pure: tested.
// A caller with no browser (mobile app with its Bearer, a server) sends neither `Sec-Fetch-Site` nor `Origin`.
import { normalizeOrigin } from "./site-url.ts";

type Headers = { get(name: string): string | null };

export type CsrfMode = "enforce" | "report" | "off";
export const csrfMode = (raw: string | undefined): CsrfMode => (raw === "off" || raw === "report" ? raw : "enforce");

/** `CSRF_ALLOWED_ORIGINS`: other origins whose pages may write here, comma-separated. */
export function allowedOrigins(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? "").split(",").flatMap((o) => normalizeOrigin(o) ?? []));
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "null";
  } catch {
    return "null";
  }
}

/** True when a write comes from another site's page: to refuse. `host` is the request's own (lib/tenant-resolver hostOf). */
export function crossSiteWrite(method: string, h: Headers, host: string | null, allowed: ReadonlySet<string> = new Set()): boolean {
  if (SAFE.has(method.toUpperCase())) return false;
  // A page cannot add this header to another site's request without a preflight this app never grants.
  if (/^bearer \S/i.test(h.get("authorization") ?? "")) return false;
  const site = h.get("sec-fetch-site")?.toLowerCase();
  if (site === "same-origin" || site === "none") return false;
  const origin = originOf(h.get("origin"));
  if (!site && !origin) return false;
  if (!origin) return true;
  if (allowed.has(origin)) return false;
  // Browsers too old for Sec-Fetch-Site: the Origin against the host.
  return Boolean(site) || !host || origin === "null" || new URL(origin).host.toLowerCase() !== host.toLowerCase();
}

/** Whether a body's declared type is JSON, or none at all (no browser sends a typeless body across sites). */
export function jsonTyped(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return !type || type === "application/json" || type.endsWith("+json");
}
