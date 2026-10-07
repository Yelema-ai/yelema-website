import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { brandLogoUrl, deploymentWorkspaceId, multiTenant, publicConfig, type PublicConfig } from "@/lib/runtime-config";
import { hostOf, resolveHost, TenantError, type ResolvedTenant } from "@/lib/tenant-resolver";

// The client THIS request is for. Two ways, chosen by the deployment's variables (multiTenant in
// runtime-config): one deployment per client, pinned by WORKSPACE_ID; or one deployment for every
// client, where the request's host says whose it is and the back office resolves it. Every helper
// that keeps a request inside its own client goes through here; no route reads the host itself.

/** The client of the current request, read once per request; null when the host is no client's. */
export const currentTenant = cache(async (): Promise<ResolvedTenant | null> => {
  if (!multiTenant()) return null;
  const host = hostOf(await headers());
  return host ? resolveHost(host) : null;
});

/**
 * The workspace this request is confined to. Undefined only in the legacy single-client mode with
 * no WORKSPACE_ID (a database that holds one workspace). When one deployment serves every client,
 * a host that is no client's, or a suspended one, is refused: it must never read as "not confined".
 */
export async function pinnedWorkspaceId(): Promise<string | undefined> {
  if (!multiTenant()) return deploymentWorkspaceId();
  const tenant = await currentTenant();
  if (!tenant) throw new TenantError(404, "not_found", "Cet espace n’existe pas.");
  if (tenant.status === "suspended") throw new TenantError(403, "suspended", "Cet espace est suspendu.");
  return tenant.workspaceId;
}

/** What the browser needs, with this request's client in it (its logo). */
export async function requestPublicConfig(): Promise<PublicConfig> {
  const base = publicConfig();
  if (!multiTenant()) return base;
  // A host that is no client's still renders its error page: it just has no logo.
  const tenant = await currentTenant().catch(() => null);
  return { ...base, logoUrl: tenant?.logoUrl ?? brandLogoUrl() ?? null };
}
