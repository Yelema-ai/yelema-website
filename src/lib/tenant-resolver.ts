import "server-only";
import { backofficeUrl, resolverToken } from "@/lib/runtime-config";

// Which client a host name belongs to, asked of the back office (`GET /api/v1/app/tenant`). One
// deployment serves every client: the request's host is the only thing that says whose it is.
// No request-scoped API here, so the proxy can use it too; route code goes through src/lib/tenant.ts.

export interface ResolvedTenant {
  workspaceId: string;
  name: string | null;
  logoUrl: string | null;
  status: "active" | "suspended";
}

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
// A client's name, logo or suspension is felt within this delay.
const TTL_MS = 60_000;
// When the back office does not answer, the last known answer keeps a host served this long.
const STALE_MS = 10 * 60_000;
const MAX_ENTRIES = 1000;
const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

/** The host a request was made to, lowercased and without its port; null when it is not a host name. */
export function hostOf(headers: { get(name: string): string | null }): string | null {
  const raw = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return HOST_RE.test(raw) ? raw : null;
}

const store = new Map<string, { at: number; value: ResolvedTenant | null }>();

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
  const hit = store.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await ask(host);
    // Unknown hosts are remembered too, so the map is bounded: anyone can ask for any sub-domain.
    if (store.size >= MAX_ENTRIES) store.clear();
    store.set(host, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (e instanceof TenantError) throw e;
    if (hit && Date.now() - hit.at < STALE_MS) return hit.value;
    console.error(`[tenant] ${host} could not be resolved:`, e instanceof Error ? e.message : e);
    throw new TenantError(503, "unavailable", "Le service est momentanément indisponible. Réessayez dans un instant.");
  }
}
