import "server-only";
import { waitUntil } from "@vercel/functions";
import { memo } from "@/lib/memo";
import { backofficeUrl, resolverToken } from "@/lib/runtime-config";
import type { ResolvedTenant } from "@/lib/tenant-header";

// Which client a host name belongs to, asked of the back office (`GET /api/v1/app/tenant`). One
// deployment serves every client: the request's host is the only thing that says whose it is.
// No request-scoped API here, so the proxy can use it too; route code goes through src/lib/tenant.ts.

export type { ResolvedTenant };

// A refusal to serve a host, with the status the caller should answer.
export class TenantError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TenantError";
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 10_000;
// A client's name, logo or suspension is felt within this delay (a suspension also by the back office on
// /me): past it, the kept answer is still served once while a new one is asked behind (up to STALE_MS).
const TTL_MS = 10 * 60_000;
const STALE_MS = 60 * 60_000;
// A host that is no client's yet is asked again sooner: it may be one being created.
const MISS_TTL_MS = 60_000;
// When the back office does not answer, the last known answer keeps a host served this long.
const STALE_ON_ERROR_MS = 6 * 60 * 60_000;
const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

/** The host a request was made to, lowercased and without its port; null when it is not a host name. */
export function hostOf(headers: { get(name: string): string | null }): string | null {
  const raw = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return HOST_RE.test(raw) ? raw : null;
}

// Unknown hosts are kept too (anyone can ask for any sub-domain): the oldest go first past the cap.
// Identical lookups in flight share one call; a revalidation keeps the function alive until it settles.
const hosts = memo<ResolvedTenant | null>({
  ttlMs: TTL_MS,
  ttlOf: (v) => (v ? TTL_MS : MISS_TTL_MS),
  staleMs: STALE_MS,
  staleOnErrorMs: STALE_ON_ERROR_MS,
  maxEntries: 1000,
  maxFlightMs: TIMEOUT_MS + 2_000,
  background: (settled) => waitUntil(settled),
});

async function ask(host: string): Promise<ResolvedTenant | null> {
  const base = backofficeUrl();
  const token = resolverToken();
  if (!base || !token) throw new TenantError(500, "config_error", "BACKOFFICE_URL and APP_RESOLVER_TOKEN are required");
  const res = await fetch(`${base}/api/v1/app/tenant?host=${encodeURIComponent(host)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tenant resolver answered ${res.status}`);
  const data = (await res.json()) as Partial<ResolvedTenant> | null;
  if (!data || typeof data.workspaceId !== "string" || !data.workspaceId) throw new Error("tenant resolver answered without a workspace");
  return {
    workspaceId: data.workspaceId,
    name: typeof data.name === "string" ? data.name : null,
    logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
    status: data.status === "suspended" ? "suspended" : "active",
  };
}

/** The client served on this host; null when the back office knows no such host. Throws on an outage with nothing to fall back on. */
export async function resolveHost(host: string): Promise<ResolvedTenant | null> {
  try {
    return await hosts.get(host, () => ask(host));
  } catch (e) {
    if (e instanceof TenantError) throw e;
    console.error(`[tenant] ${host} could not be resolved:`, e instanceof Error ? e.message : e);
    throw new TenantError(503, "unavailable", "Le service est momentanément indisponible. Réessayez dans un instant.");
  }
}
