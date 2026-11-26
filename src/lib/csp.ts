// The Content-Security-Policy of the app's own pages. Pure: tested. No nonce (it would need every page rendered
// with one): inline scripts stay allowed, but no script, picture, frame or form leaves for a host not listed here.
import { normalizeOrigin } from "./site-url.ts";

export type CspMode = "report" | "enforce" | "off";
export const cspMode = (raw: string | undefined): CspMode => (raw === "enforce" || raw === "off" ? raw : "report");
export const cspHeaderName = (mode: Exclude<CspMode, "off">): string => (mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");

export const CSP_REPORT_PATH = "/api/csp-report";

// Toolkit logos (Composio), site icons (Google's service answers from gstatic) and the legacy dashboards' host.
const IMG_HOSTS = ["https://*.yelema.ai", "https://logos.composio.dev", "https://www.google.com", "https://*.gstatic.com"];
const FRAME_HOSTS = ["https://mstudio-frames.onrender.com", "https://yelema-dashboards.onrender.com"];

export interface CspInput {
  dev?: boolean;
  /** Origins of this deployment's own services (back office, logo): pictures and media load from them. */
  own?: (string | undefined | null)[];
  /** `CSP_IMG_SRC`, `CSP_CONNECT_SRC`, `CSP_FRAME_SRC`: more sources, space-separated. */
  img?: string;
  connect?: string;
  frame?: string;
}

// A source an operator wrote: an origin, a scheme or a wildcard host; nothing that could end the directive.
const extra = (raw: string | undefined): string[] => (raw ?? "").split(/\s+/).filter((s) => /^[A-Za-z0-9*'.:/_-]{2,200}$/.test(s));

export function buildCsp(i: CspInput = {}): string {
  const own = (i.own ?? []).flatMap((o) => normalizeOrigin(o) ?? []);
  const uniq = (list: string[]) => [...new Set(list)].join(" ");
  // The screen (noVNC), the salons' relay and the voice provider are addresses handed out at runtime: any TLS host.
  const connect = i.connect ? ["'self'", ...extra(i.connect)] : ["'self'", "https:", "wss:"];
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${i.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${uniq(["'self'", "data:", "blob:", ...IMG_HOSTS, ...own, ...extra(i.img)])}`,
    `media-src ${uniq(["'self'", "data:", "blob:", "https://*.yelema.ai", ...own])}`,
    "font-src 'self' data:",
    `connect-src ${uniq(i.dev ? [...connect, "ws:", "http:"] : connect)}`,
    `frame-src ${uniq(["'self'", "blob:", ...FRAME_HOSTS, ...extra(i.frame)])}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

/** Pages only: a route under /api answers data, and some set their own, stricter policy. */
export const cspApplies = (pathname: string): boolean => !pathname.startsWith("/api/");
