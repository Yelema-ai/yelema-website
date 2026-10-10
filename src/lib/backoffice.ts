import "server-only";
import type { ComposioCall } from "@/lib/composio-usage";
import { mailPath, type MailDetail, type MailDraft, type MailInbox, type MailRights, type MailRightsPatch, type MailSummary } from "@/lib/mail";
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
// Sending an e-mail with attachments goes on to the provider before it answers.
const MAIL_SEND_TIMEOUT_MS = 90_000;

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

/** Where the installation of a member's team stands. */
export type BoInstallation = "running" | "ready" | "failed";

/** What the back office says of the signed-in user's instance. */
export interface BoInstanceReading {
  /** Null while the instance itself is still being created. */
  instance: BoInstance | null;
  /**
   * `running`: the instance is being created, or an expert is queued or being installed.
   * `failed`: nothing is under way any more, and the instance or at least one expert failed.
   */
  installation: BoInstallation;
  /** Catalogue keys of the experts whose installation failed. */
  failedExperts: string[];
}

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

// A catalogue key or an invoice id goes into the back office's URL: only its plain form is let
// through.
const EXPERT_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const INVOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function invoicePath(id: string, rest: string): string {
  if (!INVOICE_ID.test(id)) throw new BackofficeError(404, "not_found", "Facture introuvable.");
  return `/app/billing/invoices/${id}${rest}`;
}

// `workspace` is given by the proxy, which runs before a request has a scope to read it from.
async function call<T>(path: string, init: { method?: string; token?: string | null; body?: unknown; workspace?: string; timeoutMs?: number } = {}): Promise<T> {
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
      signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
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

/** The tool executions of one request through the Composio proxy, as the back office records them. */
export interface ComposioCallsDeclaration {
  /** Drawn once per proxied request: the back office ignores one it has already seen. */
  requestId: string;
  /** When Composio answered. */
  occurredAt: string;
  httpStatus: number;
  calls: ComposioCall[];
}

/** Tool executions and what they cost. Amounts are in thousandths of a CFA franc. */
export interface BoUsageCount {
  executions: number;
  amountMilliXof: number;
}

/** What the workspace's experts spent on tools over a period (days are UTC, both ends included). */
export interface BoComposioUsage extends BoUsageCount {
  from: string;
  to: string;
  /** One point per day of the period, at zero when nothing was declared. */
  byDay: ({ day: string } & BoUsageCount)[];
  /** `toolkit` is null when the application is unknown. */
  byToolkit: ({ toolkit: string | null } & BoUsageCount)[];
  /** `email` is null for calls of an instance without a member. */
  byMember: ({ email: string | null; name: string | null } & BoUsageCount)[];
}

export interface BoComposioCall {
  occurredAt: string;
  email: string | null;
  name: string | null;
  toolkit: string | null;
  tool: string;
  /** `meta`: a discovery tool, listed at price 0 and left out of `executions`. */
  via: "direct" | "multi_execute" | "meta";
  httpStatus: number;
  priceMilliXof: number;
}

/** A period (`YYYY-MM-DD`, 92 days at most) and optionally one member, by e-mail. */
export interface BoUsageFilter {
  from?: string;
  to?: string;
  member?: string;
}

// A path of the experts' e-mail, or a 404: an expert key or a message id that is not in its plain
// form never reaches the back office's URL.
function mailRoute(expert: string, messageId?: string, attachmentId?: string): string {
  const path = mailPath(expert, messageId, attachmentId);
  if (!path) throw new BackofficeError(404, "not_found", "Ce message est introuvable.");
  return path;
}

function usageQuery(filter: BoUsageFilter, page?: number): string {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.member) params.set("member", filter.member);
  if (page) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
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
  instance: async (token: string): Promise<BoInstanceReading> => {
    const d = await call<{ instance: BoInstance | null; installation?: string; failedExperts?: unknown }>("/app/instance", { token });
    const known = d.installation === "running" || d.installation === "ready" || d.installation === "failed";
    return {
      instance: d.instance,
      // A back office older than this field only says `ready`: not ready is "running" then.
      installation: known ? (d.installation as BoInstallation) : d.instance?.ready === false ? "running" : "ready",
      failedExperts: Array.isArray(d.failedExperts) ? d.failedExperts.filter((k): k is string => typeof k === "string") : [],
    };
  },
  // A member asks for an expert they do not have. The back office records it and tells Yelema's
  // team; nothing is installed or charged. Asking twice is the same as asking once.
  requestExpert: (token: string, key: string) => {
    if (!EXPERT_KEY.test(key)) throw new BackofficeError(404, "not_found", "Expert introuvable.");
    return call<{ ok: true }>(`/app/experts/${key}/request`, { method: "POST", token });
  },
  // The one call made in an instance's name rather than a user's: the Bearer is the instance's own
  // tool-proxy token, which the back office knows by its hash, and the workspace is the one of the
  // instance's row, not of the address that was called. The back office prices and stores each
  // execution; the app keeps nothing.
  reportComposioCalls: (instanceToken: string, workspace: string, declaration: ComposioCallsDeclaration) =>
    call<null>("/app/composio-calls", { method: "POST", token: instanceToken, workspace, body: declaration }),
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
  // What the experts' tools cost, for the workspace's admins (403 for a member; 404 for an e-mail
  // that is no member's). Calls come newest first, 100 a page.
  composioUsage: (token: string, filter: BoUsageFilter) =>
    call<BoComposioUsage>(`/app/composio-usage${usageQuery(filter)}`, { token }),
  composioUsageCalls: (token: string, filter: BoUsageFilter, page: number) =>
    call<{ page: number; hasMore: boolean; items: BoComposioCall[] }>(`/app/composio-usage/calls${usageQuery(filter, page)}`, { token }),
  // The invoice's PDF, as a stream for the route to pipe.
  invoicePdf: (token: string, invoiceId: string) => stream(invoicePath(invoiceId, "/pdf"), token),

  // The experts' e-mail. One inbox per expert for the whole workspace; the back office holds the
  // provider's key and decides on every call who may read and who may send. A refusal to send is a
  // 403 whose sentence is shown as it is; 404 everywhere when the feature is off.
  mailInboxes: async (token: string) => (await call<{ items: MailInbox[] }>("/app/mail/inboxes", { token })).items,
  // Newest first, 25 a page; `page` is the previous answer's `nextPageToken`.
  mailMessages: (token: string, expert: string, page?: string) =>
    call<{ items: MailSummary[]; nextPageToken: string | null }>(`${mailRoute(expert)}${page ? `?page=${encodeURIComponent(page)}` : ""}`, { token }),
  mailMessage: (token: string, expert: string, messageId: string) => call<MailDetail>(mailRoute(expert, messageId), { token }),
  mailSend: (token: string, expert: string, draft: MailDraft) =>
    call<{ messageId: string; threadId: string; from: string }>(mailRoute(expert), { method: "POST", token, body: draft, timeoutMs: MAIL_SEND_TIMEOUT_MS }),
  // Goes to the sender of the message, in its thread: no recipient and no subject to give.
  mailReply: (token: string, expert: string, messageId: string, draft: Pick<MailDraft, "text" | "attachments">) =>
    call<{ messageId: string; threadId: string; from: string }>(`${mailRoute(expert, messageId)}/reply`, { method: "POST", token, body: draft, timeoutMs: MAIL_SEND_TIMEOUT_MS }),
  mailAttachment: (token: string, expert: string, messageId: string, attachmentId: string) => stream(mailRoute(expert, messageId, attachmentId), token),
  // Admins only: every inbox of the workspace and its three settings.
  mailRights: async (token: string) => (await call<{ items: MailRights[] }>("/app/mail/rights", { token })).items,
  setMailRights: (token: string, expert: string, patch: MailRightsPatch) => {
    if (!mailPath(expert)) throw new BackofficeError(404, "not_found", "Cette boîte est introuvable.");
    return call<MailRights>(`/app/mail/rights/${expert}`, { method: "PUT", token, body: patch });
  },
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
