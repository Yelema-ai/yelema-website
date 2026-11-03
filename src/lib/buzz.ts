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

/** Buzz names every direct conversation « DM »; any other named channel is a salon (unit or opened in the app). */
export const isSalonName = (name: string): boolean => name !== "DM" && name !== "Conversation";

/** Who is in a conversation, as people read it: one « vous » for all one's devices, unknown keys (the relay) left out. */
export function participants(members: string[], mine: string[], labels: Map<string, string>): string[] {
  return [...new Set(members.map((k) => (mine.includes(k) ? "vous" : labels.get(k))).filter((v): v is string => Boolean(v)))];
}

export interface DirectoryPerson { membre: string; nom: string; self: boolean; person: BuzzEntry | null; experts: BuzzEntry[] }

/** The directory by member: the person (when reachable) and their experts; oneself first, for one's own experts. */
export function peopleOf(directory: BuzzEntry[], mine: string[]): DirectoryPerson[] {
  const byMember = new Map<string, DirectoryPerson>();
  for (const e of directory) {
    const self = e.type === "personne" && e.cles.length > 0 && e.cles.every((k) => mine.includes(k));
    const row = byMember.get(e.membre) ?? { membre: e.membre, nom: e.nom, self: false, person: null, experts: [] };
    if (e.type === "personne") Object.assign(row, { nom: e.nom, self, person: e.cles.length && !self ? e : null });
    else row.experts.push(e);
    byMember.set(e.membre, row);
  }
  return [...byMember.values()].filter((p) => p.person || p.experts.length).sort((a, b) => Number(b.self) - Number(a.self) || a.nom.localeCompare(b.nom, "fr"));
}
