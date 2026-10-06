import "server-only";
import { backofficeUrl, deploymentWorkspaceId } from "@/lib/runtime-config";

// The Yelema back office's API for this app (`/api/v1/app/*`, guide: yelema-platform
// docs/specs/client-api-v1/app.md). It signs users in and says what they may see: their account,
// their workspace, THEIR instance and its installed experts, and for admins the workspace's members
// and instances. It applies its own rules on every call (suspended account, member or client).
//
// Every call names the workspace this deployment serves (X-Workspace-Id); the user's session rides
// as a Bearer token. This module is the only one that speaks that API.

const TIMEOUT_MS = 15_000;

export class BackofficeError extends Error {
  status: number;
  code: string;
  /** Seconds to wait before trying again (rate limit), when the back office says so. */
  retryAfter: number | null;
  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "BackofficeError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface BoSession {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in epoch seconds. */
  expiresAt: number;
}

export interface BoMe {
  /** `id` is the account's stable id: the user's connected apps (Composio) hang off it. */
  user: { id: string; email: string; name: string | null; role: "admin" | "member" };
  workspace: { id: string; name: string; logoUrl: string | null };
  instance: { id: string } | null;
}

export interface BoInstanceView {
  name: string;
  /** State at Agent37 (`running`, `sleeping`…); `unknown` when it could not be read. */
  state: string;
  createdAt: string | null;
  image: { template: string | null; revision: number | null };
  /** False while a profile is being installed. */
  ready: boolean;
  /** Which Composio the instance's experts use. */
  tools: "yelema" | "agent37";
  /** `profile` is the name to send to the instance; `key` joins the public catalogue. */
  experts: { profile: string; key: string; version: string | null }[];
}

export type BoInstance = BoInstanceView & { id: string };

export interface BoMember {
  name: string | null;
  email: string;
  role: "admin" | "member";
  status: string;
  instance: { name: string; createdAt: string | null } | null;
}

export type BoOpenedSession = { session: BoSession } & BoMe;

async function call<T>(path: string, init: { method?: string; token?: string | null; body?: unknown } = {}): Promise<T> {
  const base = backofficeUrl();
  const workspace = deploymentWorkspaceId();
  if (!base || !workspace) throw new BackofficeError(500, "config_error", "BACKOFFICE_URL and WORKSPACE_ID are required");

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Workspace-Id": workspace,
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[backoffice] ${path} unreachable:`, e instanceof Error ? e.message : e);
    throw new BackofficeError(503, "unavailable", "Le service est momentanément indisponible. Réessayez dans un instant.");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A gateway page instead of JSON: treated as an outage below.
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    const retry = Number(res.headers.get("retry-after"));
    if (!err) console.error(`[backoffice] ${path}: ${res.status}`, text.slice(0, 300));
    throw new BackofficeError(
      res.status,
      err?.code ?? (res.status >= 500 ? "unavailable" : "error"),
      err?.message ?? "Le service est momentanément indisponible. Réessayez dans un instant.",
      Number.isFinite(retry) && retry > 0 ? retry : null
    );
  }
  return data as T;
}

export const backoffice = {
  login: (email: string, password: string) =>
    call<BoOpenedSession>("/app/auth/login", { method: "POST", body: { email, password } }),
  refresh: (refreshToken: string) =>
    call<BoOpenedSession>("/app/auth/refresh", { method: "POST", body: { refreshToken } }),
  // First access or a new password: consumes the link the back office sent.
  accept: (tokenHash: string, type: string, password: string) =>
    call<BoOpenedSession>("/app/auth/accept", { method: "POST", body: { tokenHash, type, password } }),
  // Always answers ok, whether or not the account exists.
  forgot: (email: string) => call<{ ok: true }>("/app/auth/forgot", { method: "POST", body: { email } }),
  logout: (token: string) => call<{ ok: true }>("/app/auth/logout", { method: "POST", token }),

  me: (token: string) => call<BoMe>("/app/me", { token }),
  instance: async (token: string) => (await call<{ instance: BoInstance | null }>("/app/instance", { token })).instance,
  // Admins only, and without instance ids: lists to read, not ways in.
  instances: async (token: string) =>
    (await call<{ items: { member: { name: string | null; email: string }; instance: BoInstanceView }[] }>("/app/instances", { token })).items,
  members: async (token: string) => (await call<{ items: BoMember[] }>("/app/members", { token })).items,
};
