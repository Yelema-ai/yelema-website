import type { MemberRoom } from "./types";

// Places shown to a client admin: the subscription's users and the enterprise chat's seats. Pure, so
// `node --test` runs it as is.

/** « 6 / 10 utilisateurs », or the count alone when the subscription has no cap. */
export function quotaLabel(q: MemberRoom["quota"]): string {
  const unit = (n: number) => (n > 1 ? "utilisateurs" : "utilisateur");
  return q.allowed == null ? `${q.used} ${unit(q.used)}` : `${q.used} / ${q.allowed} ${unit(q.allowed)}`;
}

/** Why an admin cannot invite right now, or null when they can. */
export function inviteBlocked(room: MemberRoom): string | null {
  if (!room.enterpriseOpen) return "L’espace entreprise n’est pas encore ouvert : contactez Yelema.";
  if (room.quota.allowed != null && room.quota.used >= room.quota.allowed) return "Tous les utilisateurs de votre abonnement sont pris : contactez Yelema pour en ajouter.";
  if (room.seats && room.seats.used >= room.seats.cap) return "Le chat d’entreprise est complet : contactez Yelema pour l’agrandir.";
  return null;
}

/** The domain of an address, lower case, or null when it has none. */
export const domainOf = (email: string): string | null => /@([^@\s]+)$/.exec(email.trim().toLowerCase())?.[1] ?? null;

/**
 * Why this address may not be invited (Leslie, 07/11: only the company's own domains, for every client), or
 * null. No list to check against: the back office decides alone.
 */
export function domainRefusal(email: string, domains: readonly string[]): string | null {
  const allowed = domains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const domain = domainOf(email);
  if (!allowed.length || !domain) return null;
  if (allowed.includes(domain)) return null;
  const list = allowed.map((d) => `@${d}`);
  return `Seules les adresses ${list.length > 1 ? `${list.slice(0, -1).join(", ")} ou ${list.at(-1)}` : list[0]} peuvent être invitées.`;
}
