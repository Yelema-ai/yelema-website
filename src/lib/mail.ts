// The experts' e-mail, as the app sees it. The back office owns the inboxes, the provider's key and
// every decision (who may read, who may send, to whom): this module only shapes what goes to it and
// what comes back. Contract: yelema-platform docs/specs/client-api-v1/app.md, "E-mails des experts".

export interface MailInbox {
  /** Catalogue key of the expert the inbox belongs to. */
  expert: string;
  address: string;
  /** The expert is allowed to send at all. */
  sendEnabled: boolean;
  /** This member may have the expert send; recipients and the daily cap are checked on sending. */
  canSend: boolean;
  /** Recipients outside the company are allowed. */
  externalAllowed: boolean;
}

export interface MailSummary {
  /** Opaque, URL-safe: the provider's own id never rides a path. */
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  preview: string;
  at: string;
  labels: string[];
  attachments: number;
}

export interface MailAttachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

export interface MailDetail extends Omit<MailSummary, "preview" | "attachments"> {
  cc: string[];
  text: string;
  /** As the sender wrote it, NOT sanitised: only ever shown through `sandboxedMail`. */
  html: string;
  attachments: MailAttachment[];
}

export interface MailRights {
  expert: string;
  address: string | null;
  status: "pending" | "active" | "suspended";
  sendEnabled: boolean;
  /** Members the inbox is restricted to, by e-mail; none means every member who has the expert. */
  senders: string[];
  externalAllowed: boolean;
  /** Active members who have this expert: the only ones that can be named. */
  eligible: string[];
}

export interface MailOutgoingAttachment {
  filename: string;
  contentType: string;
  /** Base64, no data: prefix. */
  content: string;
}

export interface MailDraft {
  to: string[];
  subject: string;
  text: string;
  attachments?: MailOutgoingAttachment[];
}

export type MailRightsPatch = Partial<Pick<MailRights, "sendEnabled" | "senders" | "externalAllowed">>;

const EXPERT_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,600}$/;
const ADDRESS = /^[^\s@<>"',;:\\]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,24}$/i;

/**
 * The back office's path for an inbox, a message or an attachment, or null when a segment is not in
 * its plain form: nothing a browser sent goes into that URL unchecked.
 */
export function mailPath(expert: string, messageId?: string, attachmentId?: string): string | null {
  if (!EXPERT_KEY.test(expert)) return null;
  const base = `/app/mail/inboxes/${expert}/messages`;
  if (messageId === undefined) return base;
  if (!OPAQUE_ID.test(messageId)) return null;
  if (attachmentId === undefined) return `${base}/${messageId}`;
  return OPAQUE_ID.test(attachmentId) ? `${base}/${messageId}/attachments/${attachmentId}` : null;
}

export const isExpertKey = (value: string): boolean => EXPERT_KEY.test(value);

/** Addresses typed in one field, split on commas, semicolons and spaces. Null when one is not an address. */
export function parseRecipients(input: string): string[] | null {
  const parts = input.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 20) return null;
  const out: string[] = [];
  for (const part of parts) {
    const address = part.toLowerCase();
    if (address.length > 254 || !ADDRESS.test(address)) return null;
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

/** "Koffi Yao <koffi@exemple.ci>" -> "koffi@exemple.ci". */
export function bareAddress(from: string): string {
  return (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
}

/** Sent by the expert's inbox rather than received in it. */
export const isSent = (labels: readonly string[]): boolean => labels.includes("sent");

// A received e-mail is written by anyone on the internet. It is shown in an iframe with an empty
// `sandbox` (no script, no form, no same-origin, no navigation of this page), and this policy shuts
// the rest: nothing is fetched but inline styles and images, so opening a message cannot call home
// with anything but an image request.
const MAIL_CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:";

/** The document to give the sandboxed iframe's `srcDoc`. */
export function sandboxedMail(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MAIL_CSP}"><base target="_blank"><style>body{margin:0;padding:12px;font:14px/1.6 system-ui,sans-serif;color:#1b1b1f;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
