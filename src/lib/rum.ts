// Real-user measurement of each screen (plan « performance instantanée », lot 1). No imports: tested as is.
// A record holds times and counts only: no user, no query string, no id in the screen name.

export type Nav = "hard" | "soft";

export interface RumRecord {
  screen: string;
  nav: Nav;
  /** Ms from the click (or page start) to the route content shown without a skeleton; null past 10 s. */
  render: number | null;
  /** Longest click-to-paint of the screen (Event Timing, INP-like); null without interaction. */
  inp: number | null;
  interactions: number;
  /** Calls to `/api/*` in the first 10 s of the screen. */
  api: number;
}

export const WINDOW_MS = 10_000;
export const MAX_BATCH = 20;
const MAX_MS = 120_000;

/** `/conversations/42?c=x` → `/conversations/:id`; e-mails, numbers, uuids and long tokens become `:id`. */
export function screenOf(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? "/";
  const segs = path
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => (s.includes("@") || s.includes("%40") || /^\d+$/.test(s) || (/\d/.test(s) && s.length >= 6) || s.length > 32 ? ":id" : s.toLowerCase()));
  return `/${segs.join("/")}`.replace(/[^a-z0-9/:_-]/g, "_").slice(0, 80);
}

/** Pages measured: the signed-in app, not login or public dashboards (their beacons would be refused). */
export function measured(pathname: string): boolean {
  return !/^\/(login|auth|reset-password|invite|dashboards|api)(\/|$)/.test(pathname);
}

/** Sample rate from the env value: 0 to 1, default 10 %. */
export function sampleRateOf(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

const ms = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_MS);
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000;

function isRecord(v: unknown): v is RumRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.screen === "string" && r.screen.length <= 200 && (r.nav === "hard" || r.nav === "soft") && ms(r.render) && ms(r.inp) && count(r.interactions) && count(r.api);
}

/** The records of a beacon body, re-normalised; null when the shape is wrong. */
export function parseBatch(body: unknown): RumRecord[] | null {
  const list = (body as { records?: unknown } | null)?.records;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH || !list.every(isRecord)) return null;
  return list.map((r) => ({ screen: screenOf(r.screen), nav: r.nav, render: r.render === null ? null : Math.round(r.render), inp: r.inp === null ? null : Math.round(r.inp), interactions: r.interactions, api: r.api }));
}
