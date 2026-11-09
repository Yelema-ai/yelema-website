// Ce que la page Salons affiche quand elle ne peut pas s'ouvrir, d'après la raison donnée par le back-office.
// « Pas encore ouvert » n'est pas une panne : on le dit simplement, sans bouton. Le reste peut se réessayer.

/** The back office's refusal when the Salons are not open for the company (feature off, or no active relay). */
export const SALONS_CLOSED = "salons_closed";

// What an older back office says instead of the code: kept only as a fallback.
const NOT_OPEN = /pas encore ouvert/i;

/** The back office's refusal says the Salons are not open for this company (not a failure): the menu hides them. */
export function salonsNotOpen(message: string | null | undefined, code?: string | null): boolean {
  if (code === SALONS_CLOSED) return true;
  return NOT_OPEN.test(message ?? "");
}

/**
 * Whether `/app/me` (or `/app/bootstrap`'s `me`) says the Salons are open: `access.salons`, else a top-level
 * `salons`. Null when the back office does not say (older one): the caller keeps what it knew.
 */
export function salonsOfMe(me: unknown): boolean | null {
  if (!me || typeof me !== "object") return null;
  const { access, salons } = me as { access?: unknown; salons?: unknown };
  if (access && typeof access === "object" && typeof (access as { salons?: unknown }).salons === "boolean") {
    return (access as { salons: boolean }).salons;
  }
  return typeof salons === "boolean" ? salons : null;
}

export function closedSalons(reason: string, code?: string | null): { title: string; text: string; retry: boolean } {
  if (salonsNotOpen(reason, code)) {
    return { title: "Les Salons arrivent bientôt", text: "Ils ne sont pas encore ouverts pour votre entreprise.", retry: false };
  }
  if (/en cours d.activation/i.test(reason)) {
    return { title: "Les Salons s’ouvrent", text: "Votre accès est en cours d’activation. Réessayez dans une minute.", retry: true };
  }
  return { title: "Les Salons ne répondent pas", text: reason || "Réessayez dans un instant.", retry: true };
}
