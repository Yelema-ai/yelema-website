import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Composio } from "@composio/core";
import { ApiError } from "@/lib/http";
import { composioApiKey } from "@/lib/runtime-config";
import type {
  AgentRow,
  IntegrationConnection,
  IntegrationConnectionsResult,
  IntegrationConnectResult,
  IntegrationToolkit,
  IntegrationToolkitsResult,
} from "@/lib/types";

// Yelema's own Composio project, reached with Yelema's key (COMPOSIO_API_KEY, read at runtime). The
// key lives only on this server: the Connecteurs routes manage toolkits and connections with it,
// and the MCP proxy (src/app/api/composio-mcp/route.ts) opens the experts' tool sessions with it.
// Agent37's managed Composio is switched off in the yelema-hermes image, and the key never reaches
// an instance.
// Adapted from agent37-platform/hermes-openclaw-composio.
const COMPOSIO_API_BASE = "https://backend.composio.dev";

let cached: Composio | null = null;

function apiKey(): string {
  const key = composioApiKey();
  if (!key) throw new ApiError(503, "composio_not_configured", "Les connecteurs ne sont pas encore activés.");
  return key;
}

function client(): Composio {
  if (!cached) cached = new Composio({ apiKey: apiKey() });
  return cached;
}

// The Composio user a connection and a tool session belong to: the MEMBER who owns the instance.
// A connected Gmail is that person's, used by the experts on their own instance and by nobody
// else in the company. An instance without an owner (older rows) is its own identity. Derived
// server-side from the agents row, never from the caller.
export function composioUserId(row: Pick<AgentRow, "agent37_id" | "owner_user_id">): string {
  return row.owner_user_id ? `user:${row.owner_user_id}` : `agent:${row.agent37_id}`;
}

// The instance's MCP token is stored only as this hash (agents.apps_token_hash).
export function hashAppsToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ---- Catalog ---------------------------------------------------------------------------------

// Composio's Unipile only lists accounts: the member links Unipile on its own card (src/lib/unipile.ts).
export const HIDDEN_TOOLKITS: ReadonlySet<string> = new Set(["unipile"]);

export async function listToolkits(search?: string): Promise<IntegrationToolkitsResult> {
  const params = new URLSearchParams({ limit: "24" });
  if (search) params.set("search", search);
  const res = await fetch(`${COMPOSIO_API_BASE}/api/v3/toolkits?${params}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ApiError(502, "composio_error", "Le catalogue des outils est indisponible. Réessayez dans un instant.");
  const data = (await res.json()) as { items?: unknown[] };
  return { items: (data.items ?? []).map(normalizeToolkit).filter((t) => !HIDDEN_TOOLKITS.has(t.slug.toLowerCase())) };
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

const ALIAS = /^[\p{L}\p{N} ._@-]{1,40}$/u;
/** An account name the member chose: short and plain, since an expert repeats it to pick the account. */
export const isAccountAlias = (alias: string): boolean => ALIAS.test(alias);

// A toolkit with no auth config in Yelema's Composio project fails with 4308 "NoManagedAuth". Several accounts
// of one tool are allowed; the alias (unique per member and tool) is what an expert names to pick one, drawn
// when the member chose none.
export async function connectToolkit(userId: string, toolkit: string, alias?: string): Promise<IntegrationConnectResult> {
  if (HIDDEN_TOOLKITS.has(toolkit.toLowerCase())) throw new ApiError(422, "use_unipile_card", "Unipile se relie avec sa carte « WhatsApp et messageries », en haut de cette page.");
  const chosen = alias?.trim();
  try {
    const session = await client().toolRouter.create(userId, { manageConnections: true, multiAccount: { enable: true } });
    const request = await session.authorize(toolkit, { alias: chosen || `${toolkit.toLowerCase()}-${randomBytes(3).toString("hex")}` });
    return { toolkit, connectedAccountId: request.id, redirectUrl: request.redirectUrl ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("4308") || message.includes("NoManagedAuth")) {
      throw new ApiError(422, "custom_auth_required", "Cet outil ne se connecte pas encore depuis Yelema. Écrivez-nous pour l’activer.");
    }
    console.error(`[composio] connect ${toolkit} failed for ${userId}:`, message);
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
  state?: { authScheme?: string; val?: Record<string, unknown> };
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
  alias?: string | null;
  isDisabled?: boolean;
  is_disabled?: boolean;
  createdAt?: string | number;
  created_at?: string | number;
  updatedAt?: string | number;
  updated_at?: string | number;
}

const EMAIL = /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i;
const NAME_KEYS = ["displayName", "display_name", "name", "username", "login", "workspace_name", "workspaceName", "subdomain"];
// A credential is never read for an identity, even when it happens to contain an "@".
const SECRET_KEY = /token|secret|key|url|scope|password/i;

function findEmail(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return EMAIL.exec(value)?.[0] ?? null;
  if (!value || typeof value !== "object" || depth > 3) return null;
  for (const [k, v] of Object.entries(value)) {
    const found = SECRET_KEY.test(k) ? null : findEmail(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function findName(record: Record<string, unknown>): string | null {
  const name = NAME_KEYS.map((k) => record[k]).find((v): v is string => typeof v === "string" && !!v.trim() && !v.includes("http"));
  return name?.trim().slice(0, 120) ?? null;
}

// Who the account is, as Composio saw it at sign-in: what the screen shows when the back office has nothing.
function accountIdentity(c: RawConnectedAccount): { email: string | null; accountName: string | null } {
  const sources = [c.data, c.state?.val, c.params].filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  return {
    email: sources.map((r) => findEmail(r)).find(Boolean) ?? null,
    accountName: sources.map(findName).find(Boolean) ?? null,
  };
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
    alias: c.alias ?? null,
    ...accountIdentity(c),
  };
}

export async function listConnections(userId: string): Promise<IntegrationConnectionsResult> {
  const seen = new Map<string, IntegrationConnection>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await client().connectedAccounts.list({
      userIds: [userId],
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

// Composio does not check ownership on delete: the account must belong to this member.
export async function deleteConnection(userId: string, connectedAccountId: string): Promise<{ id: string; deleted: boolean }> {
  const { connections } = await listConnections(userId);
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

// `pins`: the member's default account per tool (exact: Composio uses that one, and no other, for the tool).
export async function mintMcpSession(userId: string, pins: Record<string, string[]> = {}): Promise<McpSession> {
  const session = await client().create(userId, {
    ...(Object.keys(pins).length ? { connectedAccounts: pins } : {}),
    // Keep the manage-connections tool so an expert can hand out a sign-in link in chat, allow
    // several accounts per toolkit, and drop Composio's remote sandbox.
    manageConnections: { waitForConnections: true },
    multiAccount: { enable: true },
    sandbox: { enable: false },
    toolkits: { disable: [...HIDDEN_TOOLKITS] },
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

// ---- Files for the tools (the Livrables bridge, src/lib/livrables-bridge.ts) ----------------

export interface StagedFile {
  name: string;
  mimetype: string;
  s3key: string;
}

// Puts a file in Composio's storage for one tool, as its SDK does (files.upload): ask a presigned
// address for that tool, then PUT the bytes there. The answer is what the tool's file input takes.
export async function stageFile(bytes: Uint8Array<ArrayBuffer>, name: string, mimetype: string, toolSlug: string, toolkitSlug: string): Promise<StagedFile> {
  const res = await fetch(`${COMPOSIO_API_BASE}/api/v3.1/files/upload/request`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify({
      filename: name,
      mimetype,
      md5: createHash("md5").update(bytes).digest("hex"),
      tool_slug: toolSlug,
      toolkit_slug: toolkitSlug,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`upload request ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { key?: unknown; new_presigned_url?: unknown };
  if (typeof data.key !== "string" || typeof data.new_presigned_url !== "string") throw new Error("upload request: no key or address");
  // The storage address is signed: no key of ours goes with the bytes.
  const put = await fetch(data.new_presigned_url, {
    method: "PUT",
    headers: { "content-type": mimetype },
    body: bytes,
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new Error(`upload ${put.status}`);
  return { name, mimetype, s3key: data.key };
}
