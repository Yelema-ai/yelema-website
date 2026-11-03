// Messagerie Unipile (WhatsApp…) de sa propre instance : le DSN et la clé saisis ici partent au
// back-office, qui les pose sur l'instance sans les garder. Pur : `node --test` le lit tel quel.

export interface UnipileAccount {
  id: string;
  type: string;
  name: string;
  status: string | null;
}

export interface UnipileStatus {
  connected: boolean;
  accounts: UnipileAccount[];
  accountsError: string | null;
  experts: string[];
  available: string[];
}

export interface UnipileDraft {
  dsn: string;
  apiKey: string;
  experts: string[];
}

const DSN_RE = /^[a-z0-9-]{1,40}\.unipile\.com(:\d{2,5})?$/;
const KEY_RE = /^[A-Za-z0-9._~+/=-]{16,512}$/;
const PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** « https://api8.unipile.com:13851/ » → « api8.unipile.com:13851 » ; null hors *.unipile.com. */
export function normalizeDsn(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return DSN_RE.test(v) ? v : null;
}

export function parseUnipileDraft(body: unknown): UnipileDraft | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const dsn = typeof o.dsn === "string" ? normalizeDsn(o.dsn) : null;
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  const experts = Array.isArray(o.experts) ? [...new Set(o.experts.filter((p): p is string => typeof p === "string" && PROFILE_RE.test(p)))].slice(0, 50) : [];
  return dsn && KEY_RE.test(apiKey) && experts.length ? { dsn, apiKey, experts } : null;
}

/** The Experts alone, for a change of access that keeps the key already on the instance (Leslie, 01/11). */
export function parseUnipileExperts(body: unknown): string[] | null {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>).experts : null;
  const experts = Array.isArray(v) ? [...new Set(v.filter((p): p is string => typeof p === "string" && PROFILE_RE.test(p)))].slice(0, 50) : [];
  return experts.length ? experts : null;
}

const MESSAGES: Record<string, string> = {
  bad_dsn: "Ce DSN n’est pas une adresse Unipile (exemple : api8.unipile.com:13851).",
  bad_key: "Cette clé d’API Unipile n’a pas le bon format.",
  bad_experts: "Choisissez au moins un Expert.",
  unipile_key_refused: "Unipile refuse cette clé ou ce DSN : vérifiez-les dans votre tableau de bord Unipile.",
  unipile_forbidden: "Unipile refuse l’accès avec cette clé.",
  unipile_unreachable: "Unipile ne répond pas à cette adresse. Vérifiez le DSN.",
  unipile_unavailable: "La messagerie n’est pas encore disponible sur votre instance : elle arrive avec sa prochaine mise à jour.",
  instance_error: "Votre instance n’a pas pu traiter la demande. Réessayez dans un instant.",
  bad_account: "Ce compte de messagerie n’est pas valide.",
  unipile_not_found: "Unipile ne connaît plus ce compte : reliez-le de nouveau depuis votre tableau de bord Unipile.",
  unipile_not_configured: "La messagerie n’est pas branchée sur votre instance.",
  not_found: "Ce réglage arrive avec la prochaine mise à jour de votre espace.",
};

export const unipileRefusalMessage = (code: string): string | null => MESSAGES[code] ?? null;

const ACCOUNT_ID = /^[A-Za-z0-9_-]{2,128}$/;
/** The account id a reconnection asks for, from a request body; null when it is not one. */
export function parseAccountId(body: unknown): string | null {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>).accountId : null;
  return typeof v === "string" && ACCOUNT_ID.test(v.trim()) ? v.trim() : null;
}

/** A link Unipile hosts (`account.unipile.com/…`); null for anything else, so nothing else is ever opened. */
export function hostedLink(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048 || !URL.canParse(v)) return null;
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password && (u.hostname === "unipile.com" || u.hostname.endsWith(".unipile.com")) ? u.href : null;
}

/** Where an account that lost its session is linked again when no reconnection link can be had: the person's own Unipile dashboard. */
export const UNIPILE_DASHBOARD = "https://dashboard.unipile.com";

// Unipile's own states for an account that no longer works: its owner must link it again.
const BROKEN = new Set(["CREDENTIALS", "ERROR", "STOPPED", "DISCONNECTED"]);

/** True when Unipile says the account must be linked again (« CREDENTIALS »…); unknown states pass. */
export const accountBroken = (a: Pick<UnipileAccount, "status">): boolean => BROKEN.has((a.status ?? "").toUpperCase());

const TYPES: Record<string, string> = { WHATSAPP: "WhatsApp", LINKEDIN: "LinkedIn", INSTAGRAM: "Instagram", MESSENGER: "Messenger", TELEGRAM: "Telegram", GOOGLE: "Gmail", GOOGLE_OAUTH: "Gmail", OUTLOOK: "Outlook", MAIL: "E-mail", IMAP: "E-mail", TWITTER: "X" };
/** « WHATSAPP » → « WhatsApp »; an unknown type keeps its name, capitalised. */
export function accountType(type: string): string {
  const t = type.trim().toUpperCase();
  return TYPES[t] ?? (t ? t.charAt(0) + t.slice(1).toLowerCase() : "Compte");
}

/** The domain whose logo stands for the account's service. */
export function accountDomain(type: string): string {
  const t = accountType(type);
  return ({ WhatsApp: "whatsapp.com", LinkedIn: "linkedin.com", Instagram: "instagram.com", Messenger: "messenger.com", Telegram: "telegram.org", Gmail: "gmail.com", Outlook: "outlook.com", X: "x.com" } as Record<string, string>)[t] ?? "unipile.com";
}

/** A WhatsApp number as people write it: « 22597714432 » → « +225 97 71 44 32 »; anything else as is. */
export function accountName(a: Pick<UnipileAccount, "type" | "name">): string {
  const digits = a.name.replace(/\D/g, "");
  if (accountType(a.type) !== "WhatsApp" || digits.length < 8 || digits.length !== a.name.replace(/[\s+]/g, "").length) return a.name;
  const cc = digits.startsWith("225") ? "225" : null;
  if (!cc) return `+${digits}`;
  return `+225 ${digits.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}
