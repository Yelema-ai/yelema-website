// A member's own name and picture for an expert of their team. The back office keeps them and
// writes the name in the expert's SOUL.md; this module holds what the app checks before asking and
// the French sentence for each refusal. No imports: safe in client components and in `node --test`.

export const EXPERT_NAME_MAX = 40;

// The back office's rule, checked here first so the member reads why: a first name, not a prompt.
// Letters (accents included), spaces, apostrophes and hyphens; nothing that could carry an instruction.
const NAME_RE = /^\p{L}[\p{L}\p{M} '’-]*$/u;

/** The name to send (trimmed, spaces folded), or null when it does not fit the rule. */
export function expertName(raw: unknown): string | null {
  // A line break or any other control character is refused, never folded into a space.
  if (typeof raw !== "string" || /\p{Cc}/u.test(raw)) return null;
  const name = raw.trim().replace(/ +/g, " ");
  return name.length > 0 && name.length <= EXPERT_NAME_MAX && NAME_RE.test(name) ? name : null;
}

export const EXPERT_NAME_RULE = `Un prénom de ${EXPERT_NAME_MAX} caractères au plus : des lettres, des espaces, l’apostrophe et le trait d’union.`;

const REFUSALS: Record<string, string> = {
  bad_request: `Ce nom ne convient pas. ${EXPERT_NAME_RULE}`,
  not_found: "Cet Expert ne fait pas partie de votre équipe.",
  unprocessable: "Cette image n’est pas lisible : envoyez un PNG, un JPEG ou un WebP de 4 Mo au plus.",
  too_many_attempts: "Trop de modifications en peu de temps. Réessayez dans une heure.",
  rate_limited: "Vous avez créé beaucoup de portraits aujourd’hui. Réessayez demain.",
  unavailable: "Le studio de portraits est indisponible pour le moment. Réessayez plus tard.",
};

/**
 * The sentence for one of the back office's refusal codes, or null for a code that is not one of
 * these (the caller then answers its usual sentence). The back office's own text is never shown.
 */
export function expertLookRefusal(code: string): string | null {
  return Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : null;
}
