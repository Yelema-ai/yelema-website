// Ce que la page Salons affiche quand elle ne peut pas s'ouvrir, d'après la raison donnée par le back-office.
// « Pas encore ouvert » n'est pas une panne : on le dit simplement, sans bouton. Le reste peut se réessayer.
const NOT_OPEN = /pas encore ouvert/i;

/** The back office's refusal says the Salons are not open for this company (not a failure): the menu hides them. */
export function salonsNotOpen(message: string | null | undefined): boolean {
  return NOT_OPEN.test(message ?? "");
}

export function closedSalons(reason: string): { title: string; text: string; retry: boolean } {
  if (salonsNotOpen(reason)) {
    return { title: "Les Salons arrivent bientôt", text: "Ils ne sont pas encore ouverts pour votre entreprise.", retry: false };
  }
  if (/en cours d.activation/i.test(reason)) {
    return { title: "Les Salons s’ouvrent", text: "Votre accès est en cours d’activation. Réessayez dans une minute.", retry: true };
  }
  return { title: "Les Salons ne répondent pas", text: reason || "Réessayez dans un instant.", retry: true };
}
