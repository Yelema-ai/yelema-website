import "server-only";
import { backofficeUrl } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";

// The Yelema back office's API for this app (`/api/v1/app/*`, guide: yelema-platform
// docs/specs/client-api-v1/app.md). It signs users in and says what they may see: their account,
// their workspace, THEIR instance and its installed experts, and for admins the workspace's members
// and instances. It applies its own rules on every call (suspended account, member or client).
//
// Every call names the workspace the request is for (X-Workspace-Id): the deployment's own, or the
// one its host belongs to (src/lib/tenant.ts). The user's session rides as a Bearer token. This
// module is the only one that speaks that API.

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

/** One invoice of the workspace. Amounts are in major units (XOF has no decimals); dates are ISO. */
export interface BoInvoice {
  /** Public id, the one the PDF and payment-link routes take. */
  id: string;
  reference: string;
  /** The month invoiced, "YYYY-MM". */
  period: string;
  status: "issued" | "overdue" | "paid";
  amountTTC: number;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  /** True while the invoice can be paid online (issued, overdue). */
  payable: boolean;
}

export interface BoBilling {
  plan: { key: string; name: string } | null;
  status: "active" | "suspended" | null;
  nextDueDate: string | null;
  /** The subscription's monthly amount. */
  amount: number | null;
  currency: string;
  /** The oldest invoice still to pay. */
  openInvoice: BoInvoice | null;
}

// An invoice id goes into the back office's URL: only its plain form is let through.
const INVOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function invoicePath(id: string, rest: string): string {
  if (!INVOICE_ID.test(id)) throw new BackofficeError(404, "not_found", "Facture introuvable.");
  return `/app/billing/invoices/${id}${rest}`;
}

// `workspace` is given by the proxy, which runs before a request has a scope to read it from.
async function call<T>(path: string, init: { method?: string; token?: string | null; body?: unknown; workspace?: string } = {}): Promise<T> {
  const base = backofficeUrl();
  const workspace = init.workspace ?? (await pinnedWorkspaceId());
  if (!base || !workspace) throw new BackofficeError(500, "config_error", "BACKOFFICE_URL and a workspace are required");

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
  refresh: (refreshToken: string, workspace?: string) =>
    call<BoOpenedSession>("/app/auth/refresh", { method: "POST", body: { refreshToken }, workspace }),
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

  // Billing, for the workspace's admins (a member is refused, 403). The app reads and hands out the
  // back office's own payment link; it never creates a payment.
  billing: (token: string) => call<BoBilling>("/app/billing", { token }),
  // Newest first, never a draft.
  invoices: async (token: string) => (await call<{ items: BoInvoice[] }>("/app/billing/invoices", { token })).items,
  // The page where the invoice is paid, the same as in the back office's e-mail.
  paymentLink: (token: string, invoiceId: string) =>
    call<{ url: string }>(invoicePath(invoiceId, "/payment-link"), { method: "POST", token }),
  // The invoice's PDF, as a stream for the route to pipe.
  invoicePdf: (token: string, invoiceId: string) => stream(invoicePath(invoiceId, "/pdf"), token),
};

// A file from the back office, handed back unread so the caller can pipe it.
async function stream(path: string, token: string): Promise<Response> {
  const base = backofficeUrl();
  const workspace = await pinnedWorkspaceId();
  if (!base || !workspace) throw new BackofficeError(500, "config_error", "BACKOFFICE_URL and a workspace are required");
  const unavailable = () =>
    new BackofficeError(503, "unavailable", "Le service est momentanément indisponible. Réessayez dans un instant.");
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      headers: { "X-Workspace-Id": workspace, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[backoffice] ${path} unreachable:`, e instanceof Error ? e.message : e);
    throw unavailable();
  }
  if (res.ok && res.body) return res;
  const text = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) throw new BackofficeError(res.status, "forbidden", "Cette action n’est pas autorisée.");
  if (res.status === 404) throw new BackofficeError(404, "not_found", "Ce document n’est pas disponible.");
  console.error(`[backoffice] ${path}: ${res.status}`, text.slice(0, 300));
  throw unavailable();
}
