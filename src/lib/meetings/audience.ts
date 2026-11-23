import { isObject } from "./json.ts";
import { MAX_RECIPIENTS, isEmail } from "./record.ts";
import { isTimeZone } from "./minutes-parts.ts";

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type SenderChoice = { kind: "expert" } | { kind: "connected"; account: string };

export interface AudienceChoice {
  me: boolean;
  company: boolean;
  participants: boolean;
  emails: string[];
}

export interface SendRequest {
  sender: SenderChoice;
  audience: AudienceChoice;
  timeZone: string;
}

export interface AudienceSources {
  me: string | null;
  company: readonly string[];
  participants: readonly string[];
}

export interface CompanyDirectory {
  domains: readonly string[];
  emails: readonly string[];
}

export interface SendOptions {
  expert: { address: string; canSend: boolean; externalAllowed: boolean } | null;
  connected: { id: string; label: string; email: string }[];
  me: string | null;
  company: string[];
}

const PUBLIC_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.fr",
  "mail.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "zoho.com",
]);

export const domainOf = (email: string): string | null => /@([^@\s]+)$/.exec(email.trim().toLowerCase())?.[1] ?? null;

export function companyDomains(candidates: readonly (string | null | undefined)[]): string[] {
  const domains = candidates.flatMap((raw) => {
    const domain = raw?.trim().toLowerCase().replace(/^@/, "") ?? "";
    return domain && domain.includes(".") && !PUBLIC_MAIL_DOMAINS.has(domain) ? [domain] : [];
  });
  return [...new Set(domains)];
}

export function companyContacts(emails: readonly string[], directory: CompanyDirectory): string[] {
  const domains = new Set(directory.domains);
  const members = new Set(directory.emails.map((e) => e.toLowerCase()));
  return emails.filter((email) => {
    const domain = domainOf(email);
    return members.has(email.toLowerCase()) || (domain !== null && domains.has(domain));
  });
}

export type Recipients = { ok: true; to: string[] } | { ok: false; reason: "none" | "too_many" };


function sender(v: unknown): SenderChoice | null {
  if (!isObject(v)) return null;
  if (v.kind === "expert") return { kind: "expert" };
  if (v.kind === "connected" && typeof v.account === "string" && ACCOUNT_ID.test(v.account)) return { kind: "connected", account: v.account };
  return null;
}

export function parseSendRequest(raw: unknown): SendRequest | null {
  if (!isObject(raw) || !isObject(raw.audience)) return null;
  const choice = sender(raw.sender);
  const a = raw.audience;
  if (!choice || typeof a.me !== "boolean" || typeof a.company !== "boolean" || typeof a.participants !== "boolean") return null;
  const emails = a.emails === undefined ? [] : a.emails;
  if (!Array.isArray(emails) || emails.length > MAX_RECIPIENTS) return null;
  const trimmed = emails.map((e) => (typeof e === "string" ? e.trim() : e));
  if (!trimmed.every(isEmail)) return null;
  return {
    sender: choice,
    audience: { me: a.me, company: a.company, participants: a.participants, emails: trimmed as string[] },
    timeZone: isTimeZone(raw.timeZone) ? raw.timeZone : "UTC",
  };
}

export function recipientsOf(audience: AudienceChoice, sources: AudienceSources): Recipients {
  const wanted = [
    ...(audience.me && sources.me ? [sources.me] : []),
    ...(audience.company ? sources.company : []),
    ...(audience.participants ? sources.participants : []),
    ...audience.emails,
  ];
  const seen = new Set<string>();
  const to = wanted.filter((email) => {
    const key = email.toLowerCase();
    if (!isEmail(email) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!to.length) return { ok: false, reason: "none" };
  if (to.length > MAX_RECIPIENTS) return { ok: false, reason: "too_many" };
  return { ok: true, to };
}
