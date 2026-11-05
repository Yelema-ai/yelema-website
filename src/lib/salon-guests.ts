// A salon's external guests as a member manages them (`/api/buzz/salons/<id>/guests`): the invitation form's
// rules and how each guest reads. The back office checks who may invite and the client's domains. Pure: tested.

export const GUEST_DAYS = [30, 90, 180] as const;
export type GuestDays = (typeof GUEST_DAYS)[number];
export const DEFAULT_GUEST_DAYS: GuestDays = 90;
export const MAX_GUEST_EMAILS = 20;

export interface SalonGuest {
  id: string;
  email: string;
  status: "invited" | "active" | "expired" | "revoked";
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: { nom: string } | null;
  invitedAt: string;
}

const EMAIL = /^[^\s@<>(),;:"[\]\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const isGuestDays = (v: unknown): v is GuestDays => GUEST_DAYS.includes(v as GuestDays);

/** The addresses typed (commas, semicolons, spaces or lines between them), each once, in lower case. */
export function parseGuestEmails(text: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!v) continue;
    if (!EMAIL.test(v) || v.length > 254) invalid.push(raw.trim());
    else if (!emails.includes(v)) emails.push(v);
  }
  return { emails, invalid };
}

/** Why the form cannot be sent yet, in French; null when it can. */
export function guestFormError(text: string, days: unknown): string | null {
  const { emails, invalid } = parseGuestEmails(text);
  if (invalid.length) return `Adresse${invalid.length > 1 ? "s" : ""} invalide${invalid.length > 1 ? "s" : ""} : ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`;
  if (!emails.length) return "Saisissez au moins une adresse e-mail.";
  if (emails.length > MAX_GUEST_EMAILS) return `${MAX_GUEST_EMAILS} adresses au plus par envoi.`;
  if (!isGuestDays(days)) return "Choisissez une durée d’accès : 30, 90 ou 180 jours.";
  return null;
}

export const GUEST_STATUS_LABEL: Record<SalonGuest["status"], string> = {
  invited: "Invitation envoyée",
  active: "Accès actif",
  expired: "Accès terminé",
  revoked: "Accès retiré",
};

/** Guests who can still come in: those the « Personnes externes présentes » banner counts. */
export const presentGuests = (list: readonly SalonGuest[]): SalonGuest[] => list.filter((g) => g.status === "invited" || g.status === "active");
