// The members' « Échanges » (internal messaging), as the back office describes it (`GET /api/v1/app/buzz`): the client's relay,
// the member's own devices, the directory (people and their experts) and the team salons. Messages
// themselves never pass through the back office: the browser reads and writes them on the relay.

export interface BuzzEntry { nom: string; type: "personne" | "expert"; membre: string; cles: string[] }
export interface BuzzOverview {
  relais: string;
  appareils: { cle: string; nom: string }[];
  annuaire: BuzzEntry[];
  salons: { id: string; nom: string }[];
}

export const PUBKEY_RE = /^[0-9a-f]{64}$/;
/** Buzz: 9 participants at most in a direct conversation, the sender included. */
export const MAX_RECIPIENTS = 8;

/** Who a key is: « Mamadou (de Leslie) », or a person's name for one of their devices. */
export function labelsOf(directory: BuzzEntry[]): Map<string, string> {
  return new Map(directory.flatMap((e) => e.cles.map((k): [string, string] => [k, e.nom])));
}

/** A direct conversation is named by the people in it other than oneself. */
export function conversationName(members: string[], mine: string[], labels: Map<string, string>, fallback: string): string {
  const others = [...new Set(members.filter((m) => !mine.includes(m)).map((m) => labels.get(m)).filter((n): n is string => Boolean(n)))];
  return others.length ? others.join(", ") : fallback;
}
