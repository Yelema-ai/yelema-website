// The sign-in's second step (a code from an authenticator app) and the Google return, as pure steps:
// the cookies' options, the outcome of an opening, the French sentences. No Node module: the page imports it. Tested.

export const MFA_TICKET = /^[A-Za-z0-9_-]{43}$/;
/** The ticket lives 5 minutes at the back office; its cookie never longer. */
export const MFA_MAX_S = 300;
/** Only the sign-in routes receive the ticket cookie. */
export const AUTH_PATH = "/api/auth";
export const GOOGLE_PATH = "/api/auth/google";
/** A Google return is taken only from a browser that left from this site within this delay. */
export const GOOGLE_PENDING_S = 600;

export const mfaCookieName = (production: boolean): string => (production ? "__Secure-yelema_mfa" : "yelema_mfa");
export const googleCookieName = (production: boolean): string => (production ? "__Secure-yelema_google" : "yelema_google");

export function mfaCookieOptions(expiresIn: number | undefined, production: boolean) {
  const left = Number.isFinite(expiresIn) && expiresIn! > 0 ? Math.floor(expiresIn!) : MFA_MAX_S;
  return { httpOnly: true, secure: production, sameSite: "strict" as const, path: AUTH_PATH, maxAge: Math.min(MFA_MAX_S, left) };
}

export const googleCookieOptions = (production: boolean) => ({ httpOnly: true, secure: production, sameSite: "lax" as const, path: GOOGLE_PATH, maxAge: GOOGLE_PENDING_S });

/** A refusal as the back office sends it: status, code and the rest of its `error` object. */
export interface Refusal { status: number; code: string; details?: Record<string, unknown> }

const isRefusal = (e: unknown): e is Refusal => typeof e === "object" && e !== null && typeof (e as Refusal).status === "number" && typeof (e as Refusal).code === "string";

/** The second step a refusal asks for (`403 mfa_required` with its ticket); null for any other refusal. */
export function mfaChallenge(e: unknown): { ticket: string; expiresIn: number } | null {
  if (!isRefusal(e) || e.status !== 403 || e.code !== "mfa_required") return null;
  const ticket = e.details?.ticket;
  const expiresIn = Number(e.details?.expiresIn);
  return typeof ticket === "string" && MFA_TICKET.test(ticket) ? { ticket, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : MFA_MAX_S } : null;
}

export type Opening<S> = { kind: "session"; session: S } | { kind: "mfa"; ticket: string; expiresIn: number } | { kind: "refused"; error: unknown };

/** What an opening of a session (password, Google, link, code) came to. */
export async function openingStep<S>(open: () => Promise<{ session: S }>): Promise<Opening<S>> {
  try {
    return { kind: "session", session: (await open()).session };
  } catch (e) {
    const challenge = mfaChallenge(e);
    return challenge ? { kind: "mfa", ...challenge } : { kind: "refused", error: e };
  }
}

export type GoogleReason = "account" | "suspended" | "workspace" | "limited" | "unavailable" | "cancelled";

export const GOOGLE_ERRORS: Record<GoogleReason, string> = {
  account: "Ce compte Google n’a pas accès à cet espace. Utilisez l’adresse à laquelle vous avez été invité.",
  suspended: "Votre accès est suspendu. Contactez l’administrateur de votre espace.",
  workspace: "Votre compte appartient à plusieurs espaces : connectez-vous depuis l’adresse de l’espace voulu.",
  limited: "Trop d’essais. Réessayez dans quelques minutes.",
  unavailable: "La connexion avec Google n’a pas abouti. Réessayez dans un instant.",
  cancelled: "La connexion avec Google a expiré ou a été interrompue. Recommencez.",
};

/** The reason shown on /login after a Google return was refused. */
export function googleReason(e: unknown): GoogleReason {
  if (!isRefusal(e)) return "unavailable";
  if (e.status === 401) return "account";
  if (e.status === 403) return e.code === "suspended" ? "suspended" : "account";
  if (e.status === 409) return "workspace";
  if (e.status === 429) return "limited";
  return "unavailable";
}

/** `?reason=` read back on /login: an unknown one is the generic sentence. */
export const googleErrorMessage = (reason: string | null): string => GOOGLE_ERRORS[(reason ?? "") as GoogleReason] ?? GOOGLE_ERRORS.unavailable;

/** Where the browser goes to start with Google: the back office, with this site's origin to come back to. */
export function googleStartUrl(backoffice: string, siteOrigin: string, workspace: string | undefined): string {
  const url = new URL(`${backoffice.replace(/\/+$/, "")}/api/v1/app/auth/google/start`);
  url.searchParams.set("return", siteOrigin);
  if (workspace) url.searchParams.set("workspace", workspace);
  return url.toString();
}

/** Six digits, spaces ignored; null for anything else. */
export function totpCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.replace(/\s+/g, "") : "";
  return /^\d{6}$/.test(code) ? code : null;
}

export const MFA_EXPIRED = "Le délai pour saisir le code est dépassé. Reconnectez-vous.";

/** A refused code, for the code screen: `restart` sends the member back to the first step. */
export function codeRefusal(e: unknown): { status: number; code: string; message: string; attemptsLeft?: number; restart: boolean } | null {
  if (!isRefusal(e)) return null;
  if (e.code === "mfa_ticket_invalid") return { status: 401, code: e.code, message: MFA_EXPIRED, restart: true };
  if (e.code !== "mfa_code_invalid") return null;
  const left = Number(e.details?.attemptsLeft);
  if (Number.isFinite(left) && left <= 0) return { status: 401, code: "mfa_ticket_invalid", message: "Trop de codes incorrects. Reconnectez-vous.", restart: true };
  const tail = Number.isFinite(left) ? ` Il vous reste ${left} essai${left > 1 ? "s" : ""}.` : "";
  return { status: 401, code: e.code, message: `Code incorrect.${tail}`, ...(Number.isFinite(left) ? { attemptsLeft: left } : {}), restart: false };
}
