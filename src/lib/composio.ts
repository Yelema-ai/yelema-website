import "server-only";
import { createHash } from "node:crypto";
import { Composio } from "@composio/core";
import { ApiError } from "@/lib/http";
import type {
  IntegrationConnection,
  IntegrationConnectionsResult,
  IntegrationConnectResult,
  IntegrationToolkit,
  IntegrationToolkitsResult,
} from "@/lib/types";

// Yelema's own Composio project, reached with Yelema's key (COMPOSIO_API_KEY). The key lives only
// on this server: the Connecteurs routes manage toolkits and connections with it, and the MCP proxy
// (src/app/api/composio-mcp/route.ts) opens the experts' tool sessions with it. Agent37's managed
// Composio is switched off in the yelema-hermes image, and the key never reaches an instance.
// Adapted from agent37-platform/hermes-openclaw-composio.
const COMPOSIO_API_BASE = "https://backend.composio.dev";

let cached: Composio | null = null;

function apiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new ApiError(503, "composio_not_configured", "Les connecteurs ne sont pas encore activés.");
  return key;
}

function client(): Composio {
  if (!cached) cached = new Composio({ apiKey: apiKey() });
  return cached;
}

// The Composio user every connection and tool session of a workspace belongs to: one per client
// company, shared by its experts and its admins. Derived server-side, never from the caller, so a
// workspace can never reach another's accounts.
export function composioUserId(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

// The instance's MCP token is stored only as this hash (agents.apps_token_hash).
export function hashAppsToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ---- Catalog ---------------------------------------------------------------------------------

export async function listToolkits(search?: string): Promise<IntegrationToolkitsResult> {
  const params = new URLSearchParams({ limit: "24" });
  if (search) params.set("search", search);
  const res = await fetch(`${COMPOSIO_API_BASE}/api/v3/toolkits?${params}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(502, "composio_error", "Le catalogue des outils est indisponible. Réessayez dans un instant.");
  const data = (await res.json()) as { items?: unknown[] };
  return { items: (data.items ?? []).map(normalizeToolkit) };
}

interface RawToolkit {
  slug?: string;
  name?: string;
  no_auth?: boolean;
  composio_managed_auth_schemes?: string[];
  auth_schemes?: string[];
  meta?: { description?: string; logo?: string };
}

function normalizeToolkit(raw: unknown): IntegrationToolkit {
  const t = (raw ?? {}) as RawToolkit;
  return {
    slug: t.slug ?? "",
    name: t.name ?? t.slug ?? "",
    description: t.meta?.description ?? null,
    logo: t.meta?.logo ?? null,
    enabled: true,
    isNoAuth: !!t.no_auth,
    authSchemes: t.composio_managed_auth_schemes ?? t.auth_schemes ?? [],
  };
}

// ---- Connect ---------------------------------------------------------------------------------

// A toolkit with no auth config in Yelema's Composio project fails with 4308 "NoManagedAuth".
export async function connectToolkit(workspaceId: string, toolkit: string): Promise<IntegrationConnectResult> {
  try {
    const session = await client().toolRouter.create(composioUserId(workspaceId), { manageConnections: true });
    const request = await session.authorize(toolkit);
    return { toolkit, connectedAccountId: request.id, redirectUrl: request.redirectUrl ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("4308") || message.includes("NoManagedAuth")) {
      throw new ApiError(422, "custom_auth_required", "Cet outil ne se connecte pas encore depuis Yelema. Écrivez-nous pour l’activer.");
    }
    console.error(`[composio] connect ${toolkit} failed for ${workspaceId}:`, message);
    throw new ApiError(502, "composio_error", "La connexion n’a pas pu démarrer. Réessayez dans un instant.");
  }
}

// ---- Connected accounts ----------------------------------------------------------------------

interface RawConnectedAccount {
  id?: string;
  status?: string;
  userId?: string;
  user_id?: string;
  toolkit?: { slug?: string; name?: string };
  authConfig?: { id?: string; authScheme?: string };
  auth_config?: { id?: string; auth_scheme?: string };
  state?: { authScheme?: string };
  isDisabled?: boolean;
  is_disabled?: boolean;
  createdAt?: string | number;
  created_at?: string | number;
  updatedAt?: string | number;
  updated_at?: string | number;
}

function toEpochMs(value: string | number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// The SDK answers in camelCase or snake_case depending on the surface.
function normalizeConnection(raw: unknown): IntegrationConnection {
  const c = (raw ?? {}) as RawConnectedAccount;
  const status = (c.status ?? "").toUpperCase();
  return {
    id: c.id ?? "",
    status,
    userId: c.userId ?? c.user_id ?? null,
    toolkitSlug: c.toolkit?.slug ?? null,
    toolkitName: c.toolkit?.name ?? null,
    authConfigId: c.authConfig?.id ?? c.auth_config?.id ?? null,
    authScheme: c.state?.authScheme ?? c.authConfig?.authScheme ?? c.auth_config?.auth_scheme ?? null,
    isDisabled: !!(c.isDisabled ?? c.is_disabled) || status === "INACTIVE" || status === "DISABLED",
    createdAt: toEpochMs(c.createdAt ?? c.created_at),
    updatedAt: toEpochMs(c.updatedAt ?? c.updated_at),
  };
}

export async function listConnections(workspaceId: string): Promise<IntegrationConnectionsResult> {
  const seen = new Map<string, IntegrationConnection>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await client().connectedAccounts.list({
      userIds: [composioUserId(workspaceId)],
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of res.items ?? []) {
      const conn = normalizeConnection(item);
      if (conn.id) seen.set(conn.id, conn);
    }
    cursor = (res as { nextCursor?: string | null }).nextCursor ?? undefined;
    if (!cursor) break;
  }
  const connections = [...seen.values()].sort(
    (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
  );
  return { connections };
}

// Composio does not check ownership on delete: the account must belong to this workspace's user.
export async function deleteConnection(workspaceId: string, connectedAccountId: string): Promise<{ id: string; deleted: boolean }> {
  const { connections } = await listConnections(workspaceId);
  if (!connections.some((c) => c.id === connectedAccountId)) {
    throw new ApiError(404, "not_found", "Ce compte n’est pas connecté à votre espace.");
  }
  const res = await client().connectedAccounts.delete(connectedAccountId);
  if (!(res as { success?: boolean }).success) {
    throw new ApiError(502, "composio_error", "La déconnexion n’a pas été confirmée. Réessayez.");
  }
  return { id: connectedAccountId, deleted: true };
}

// ---- MCP tool sessions (what the proxy forwards to) ------------------------------------------

export interface McpSession {
  url: string;
  headers: Record<string, string>;
}

export async function mintMcpSession(workspaceId: string): Promise<McpSession> {
  const session = await client().create(composioUserId(workspaceId), {
    // Keep the manage-connections tool so an expert can hand out a sign-in link in chat, allow
    // several accounts per toolkit, and drop Composio's remote sandbox.
    manageConnections: { waitForConnections: true },
    multiAccount: { enable: true },
    sandbox: { enable: false },
    mcp: true,
  });
  const url = typeof session.mcp?.url === "string" ? session.mcp.url.trim() : "";
  if (!url) throw new Error("Composio session response has no MCP URL");

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(session.mcp?.headers ?? {})) {
    if (typeof value === "string" && value) headers[key.toLowerCase()] = value;
  }
  if (Object.keys(headers).length === 0) headers["x-api-key"] = apiKey();
  return { url, headers };
}
