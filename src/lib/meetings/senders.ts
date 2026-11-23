import "server-only";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { composioUserId, runMemberTool } from "@/lib/composio";
import { accountState } from "@/lib/connection-accounts";
import { ApiError } from "@/lib/http";
import { integrations } from "@/lib/integrations";
import { inboxOf, type MailDraft } from "@/lib/mail";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import type { AgentRow } from "@/lib/types";
import { workspaceMembers } from "@/lib/workspace-members";
import { companyDomains, domainOf, type CompanyDirectory } from "./audience";
import type { MinutesEmail } from "./email";
import { isEmail } from "./record";

export const MAIL_TOOLKITS = { gmail: "Gmail", outlook: "Outlook" } as const;
export type MailToolkit = keyof typeof MAIL_TOOLKITS;

const BATCH = 20;
const INACTIVE_MEMBER = new Set(["suspended", "invited", "pending", "removed", "disabled"]);

export interface ExpertMailbox {
  expert: string;
  address: string;
  canSend: boolean;
  externalAllowed: boolean;
}

export interface ConnectedMailbox {
  id: string;
  toolkit: MailToolkit;
  email: string;
}

export interface SenderOptions {
  expert: ExpertMailbox | null;
  connected: ConnectedMailbox[];
}

const isMailToolkit = (slug: string | null | undefined): slug is MailToolkit => slug === "gmail" || slug === "outlook";

async function backofficeToken(): Promise<string | null> {
  if (!authViaBackoffice()) return null;
  return (await readSession())?.accessToken ?? null;
}

export async function expertMailbox(agentId: string, expertKey: string | null): Promise<ExpertMailbox | null> {
  const token = await backofficeToken();
  if (!token || !expertKey) return null;
  try {
    const inbox = inboxOf(await backoffice.mailInboxes(token, { agentId }), expertKey, agentId);
    return inbox && inbox.sendEnabled ? { expert: inbox.expert, address: inbox.address, canSend: inbox.canSend, externalAllowed: inbox.externalAllowed } : null;
  } catch (e) {
    if (e instanceof BackofficeError && e.status < 500) return null;
    throw e;
  }
}

export async function connectedMailboxes(row: AgentRow): Promise<ConnectedMailbox[]> {
  if (!row.apps_token_hash) return [];
  const { connections } = await integrations.connections(row);
  const seen = new Set<string>();
  return connections.flatMap((c) => {
    const toolkit = c.toolkitSlug?.toLowerCase();
    if (!isMailToolkit(toolkit) || accountState(c) !== "active" || !c.id || !isEmail(c.email)) return [];
    const key = `${toolkit}:${c.email.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: c.id, toolkit, email: c.email }];
  });
}

export async function senderOptions(row: AgentRow, expertKey: string | null): Promise<SenderOptions> {
  const [expert, connected] = await Promise.all([
    expertMailbox(row.agent37_id, expertKey),
    connectedMailboxes(row).catch((e) => {
      console.error("[meetings] connected mailboxes:", e instanceof Error ? e.message : e);
      return [];
    }),
  ]);
  return { expert, connected };
}

export async function companyDirectory(workspaceId: string, requesterEmail: string | null): Promise<CompanyDirectory> {
  const { members, allowedDomains } = await workspaceMembers(workspaceId);
  const emails = members.filter((m) => isEmail(m.email) && !INACTIVE_MEMBER.has((m.status ?? "").toLowerCase())).map((m) => m.email);
  return { domains: companyDomains([...(allowedDomains ?? []), requesterEmail ? domainOf(requesterEmail) : null, ...emails.map(domainOf)]), emails };
}

export interface SendResult {
  from: string | null;
  sent: string[];
  failure: ApiError | null;
}

function sendFailure(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof BackofficeError) return new ApiError(e.status >= 500 ? 502 : e.status, e.code, e.message);
  console.error("[meetings] expert mail:", e instanceof Error ? e.message : e);
  return new ApiError(502, "send_failed", "L’e-mail n’a pas pu partir. Réessayez dans un instant.");
}

export async function sendFromExpert(expert: string, to: string[], draft: Omit<MailDraft, "to">): Promise<SendResult> {
  const token = await backofficeToken();
  if (!token) return { from: null, sent: [], failure: new ApiError(404, "not_found", "La boîte e-mail de l’expert n’est pas disponible.") };
  let from: string | null = null;
  const sent: string[] = [];
  for (let k = 0; k < to.length; k += BATCH) {
    const batch = to.slice(k, k + BATCH);
    try {
      from = (await backoffice.mailSend(token, expert, { ...draft, to: batch })).from ?? from;
      sent.push(...batch);
    } catch (e) {
      return { from, sent, failure: sendFailure(e) };
    }
  }
  return { from, sent, failure: null };
}

const MAIL_TOOLS: Record<MailToolkit, { slug: string; args: (to: string[], email: MinutesEmail) => Record<string, unknown> }> = {
  gmail: {
    slug: "GMAIL_SEND_EMAIL",
    args: (to, email) => ({ user_id: "me", recipient_email: to[0], extra_recipients: to.slice(1), subject: email.subject, body: email.html, is_html: true }),
  },
  outlook: {
    slug: "OUTLOOK_OUTLOOK_SEND_EMAIL",
    args: (to, email) => ({ user_id: "me", to_email: to[0], cc_emails: to.slice(1), subject: email.subject, body: email.html, is_html: true, save_to_sent_items: true }),
  },
};

export async function sendFromConnected(row: AgentRow, account: ConnectedMailbox, to: string[], email: MinutesEmail): Promise<SendResult> {
  const tool = MAIL_TOOLS[account.toolkit];
  const refused = new ApiError(502, "send_failed", `${MAIL_TOOLKITS[account.toolkit]} a refusé l’envoi. Vérifiez le compte ${account.email} dans Connecteurs.`);
  try {
    const run = await runMemberTool(composioUserId(row), account.id, tool.slug, tool.args(to, email));
    if (run.ok) return { from: account.email, sent: to, failure: null };
    console.error(`[meetings] ${tool.slug} refused for ${row.agent37_id}:`, run.error?.slice(0, 300));
    return { from: account.email, sent: [], failure: refused };
  } catch (e) {
    console.error(`[meetings] ${tool.slug} failed for ${row.agent37_id}:`, e instanceof Error ? e.message : e);
    return { from: account.email, sent: [], failure: refused };
  }
}
