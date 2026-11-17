import "server-only";
import { backoffice, BackofficeError, type DashboardShareMode } from "@/lib/backoffice";
import { fetchCachedDashboardState } from "@/lib/dashboard-cache";
import { dashboardCandidates, sharedLimits, type SharedRoute } from "@/lib/dashboard-files";
import { openShare } from "@/lib/dashboard-token";
import { getDashboardMeta, legacyLink, type ExpertDashboardMeta, type StoredDashboardState } from "@/lib/dashboards";
import { expertDriveFolders } from "@/lib/expert-folders";
import { clientIp } from "@/lib/guest-access";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import { pinnedWorkspaceId } from "@/lib/tenant";

/** Where a shared dashboard is read: the fixed files of the expert's folder; its page on Render while the state is legacy. */
export interface SharedTarget {
  legacyUrl: string | null;
  html: string[];
  pdf: string[];
}

export type ResolvedDashboardAccess =
  | { ok: true; agentId: string; profile: string; shareId: string; mode: DashboardShareMode; state: StoredDashboardState | null; meta: ExpertDashboardMeta; target: SharedTarget }
  | { ok: false; status: number; error: string; reason?: "login_required" | "forbidden" | "not_found" | "expired" };

const NOT_FOUND = { ok: false, status: 404, error: "Tableau de bord introuvable.", reason: "not_found" } as const;
const EXPIRED = { ok: false, status: 410, error: "Ce lien a expiré. Demandez-en un nouveau à la personne qui l’a partagé.", reason: "expired" } as const;

/**
 * A shared reader's access, from the sealed `s` token only. The token's client must be this domain's;
 * the back office then says, for this reader, whether the share is open to them and which instance and
 * expert to read. Only then is the instance read, and only the expert's fixed dashboard files.
 */
export async function resolveDashboardAccess(token: string | null): Promise<ResolvedDashboardAccess> {
  const claims = openShare(token);
  if (claims === "expired") return EXPIRED;
  if (!claims || !authViaBackoffice()) return NOT_FOUND;
  const pinned = await pinnedWorkspaceId().catch(() => undefined);
  if (!pinned || pinned !== claims.w) return NOT_FOUND;

  let granted: { instance: string; profile: string; mode: DashboardShareMode };
  try {
    granted = await backoffice.dashboardAccess(claims.w, claims.s, claims.n, (await readSession())?.accessToken ?? null);
  } catch (e) {
    if (!(e instanceof BackofficeError) || e.status >= 500) throw e;
    if (e.code === "login_required") return { ok: false, status: 401, error: "Connectez-vous pour ouvrir ce tableau de bord.", reason: "login_required" };
    if (e.code === "forbidden") return { ok: false, status: 403, error: "Ce tableau de bord n’est pas partagé avec vous.", reason: "forbidden" };
    return NOT_FOUND;
  }

  const meta = getDashboardMeta(granted.profile);
  if (!meta || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(granted.instance)) return NOT_FOUND;
  const folders = await expertDriveFolders(granted.profile);
  const state = await fetchCachedDashboardState(granted.instance, granted.profile, folders);
  const target: SharedTarget = {
    legacyUrl: legacyLink(state),
    html: dashboardCandidates(folders, state?.fichier ?? state?.htmlPath, ".html"),
    pdf: dashboardCandidates(folders, state?.pdf ?? state?.pdfPath, ".pdf"),
  };
  if (!target.legacyUrl && !target.html.length) return NOT_FOUND;
  return { ok: true, agentId: granted.instance, profile: granted.profile, shareId: claims.s, mode: granted.mode, state, meta, target };
}

const limits = sharedLimits();

/** null to go on; otherwise the seconds to wait. Counted per address, and per link once the token opens. */
export function sharedRateLimit(request: Request, route: SharedRoute, token: string | null): number | null {
  const claims = openShare(token);
  const verdict = limits(route, claims && claims !== "expired" ? claims.s : null, clientIp(request.headers, Boolean(process.env.VERCEL)), Date.now());
  return verdict.ok ? null : verdict.retryAfter;
}

export const TOO_MANY = "Trop d’ouvertures de ce tableau de bord. Réessayez dans une minute.";

/** One line per shared opening, for the audit: the share and what was served, never who or from where. */
export function logSharedOpen(route: SharedRoute, access: Extract<ResolvedDashboardAccess, { ok: true }>, detail?: string): void {
  console.info(`[DashboardShare] ${route} share=${access.shareId} mode=${access.mode} source=${access.target.legacyUrl ? "render" : "instance"}${detail ? ` ${detail}` : ""}`);
}
