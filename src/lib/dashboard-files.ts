// Which instance files a dashboard may be served from, and how the frame is locked. Pure: tested.
// Contract of the expert: `Livrables/<prénom>/tableau-de-bord/tableau-de-bord.{html,pdf}`, named in
// its state file as `fichier` / `pdf`. Nothing outside that folder is ever read for a shared reader.
import { DRIVE_ROOT } from "./drive-paths.ts";
import { rateWindow } from "./guest-access.ts";

export const DASHBOARD_DIR = "tableau-de-bord";
const BASENAME = "tableau-de-bord";

/** The frame of a page read from the instance: nothing loads from or leaves for the outside. */
export const FRAME_CSP = [
  "sandbox allow-scripts allow-popups;",
  "default-src 'none';",
  "script-src 'unsafe-inline';",
  "style-src 'unsafe-inline';",
  "img-src data: blob:;",
  "font-src data:;",
  "connect-src 'none';",
  "form-action 'none';",
  "base-uri 'none';",
  "frame-ancestors 'self'",
].join(" ");

/** A legacy page fetched from the Render host, which still loads its fonts and libraries over https. */
export const LEGACY_FRAME_CSP = [
  "sandbox allow-scripts allow-popups;",
  "default-src 'none';",
  "script-src 'unsafe-inline' 'unsafe-eval';",
  "style-src 'unsafe-inline' https://fonts.googleapis.com;",
  "font-src https://fonts.gstatic.com data:;",
  "img-src data: https: blob:;",
  "connect-src https:;",
  "form-action 'none';",
  "frame-ancestors 'self'",
].join(" ");

const nfc = (s: string) => s.normalize("NFC");

/** `Livrables/…` from a drive path in any of its spellings; null when it is not one. */
function driveRelative(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  const p = nfc(raw.trim()).replace(/^(?:~\/|\/home\/node\/)/, "");
  return p.startsWith("Livrables/") ? p : null;
}

/**
 * `raw` as a drive path (`~/Livrables/…`) when it lies in `Livrables/<folder>/tableau-de-bord/` of one
 * of `folders`, with extension `ext`, without traversal; null otherwise.
 */
export function dashboardFileIn(raw: unknown, folders: readonly string[], ext: ".html" | ".pdf"): string | null {
  const rel = driveRelative(raw);
  if (!rel || !rel.toLowerCase().endsWith(ext) || /[\\\0-\x1f?#%]/.test(rel)) return null;
  const parts = rel.split("/");
  if (parts.some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  const inside = folders.some((f) => parts.length >= 4 && parts[1] === nfc(f) && parts[2] === DASHBOARD_DIR);
  return inside ? `${DRIVE_ROOT}/${parts.slice(1).join("/")}` : null;
}

/** The fixed file of each folder, the folder the state names first; then the state's own path if allowed. */
export function dashboardCandidates(folders: readonly string[], named: unknown, ext: ".html" | ".pdf"): string[] {
  const own = dashboardFileIn(named, folders, ext);
  const ownFolder = own?.split("/")[2];
  const ordered = ownFolder ? [ownFolder, ...folders.map(nfc).filter((f) => f !== ownFolder)] : folders.map(nfc);
  const out = ordered.map((f) => `${DRIVE_ROOT}/${f}/${DASHBOARD_DIR}/${BASENAME}${ext}`);
  if (own) out.push(own);
  return [...new Set(out)];
}

/** Only these files may be read while inlining a page of `htmlPath`: its own dashboard folder. */
export function inDashboardFolderOf(htmlPath: string, path: string): boolean {
  const dir = htmlPath.split("/").slice(0, 4).join("/");
  return dir.endsWith(`/${DASHBOARD_DIR}`) && path.startsWith(`${dir}/`) && !path.split("/").includes("..");
}

/** The server copy of a page: a new `maj` from the expert is a new page. */
export const sharedHtmlKey = (instance: string, paths: readonly string[], maj: string | null | undefined): string =>
  [instance, paths.join("|"), maj ?? ""].join("\n");

export type SharedRoute = "page" | "frame" | "file";

/** Per server instance: 60 openings a minute per link, 30 per address, for each shared route. */
export function sharedLimits() {
  const perLink = rateWindow(60, 60_000);
  const perIp = rateWindow(30, 60_000);
  return (route: SharedRoute, link: string | null, ip: string, nowMs: number): { ok: true } | { ok: false; retryAfter: number } => {
    const byIp = perIp(`${route}:${ip || "?"}`, nowMs);
    if (!byIp.ok) return byIp;
    return link ? perLink(`${route}:${link}`, nowMs) : { ok: true };
  };
}
