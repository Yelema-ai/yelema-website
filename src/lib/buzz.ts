// The members' « Échanges » (internal messaging), as the back office describes it (`GET /api/v1/app/buzz`): the client's relay,
// the member's own devices, the directory (people and their experts) and the team salons. Messages
// themselves never pass through the back office: the browser reads and writes them on the relay.

/**
 * `membre`: the person, or an expert's owner. `profil` (experts): their Hermes profile; `photo`: an expert's from the catalogue (added by this app), a person's profile photo
 * (served by the back office, one's own added by this app). `role` (people): admin or member of the space. `invite`: a guest from outside the client, in one salon, until `expiresAt`.
 */
export interface BuzzEntry { nom: string; type: "personne" | "expert" | "invite"; membre: string; cles: string[]; profil?: string; photo?: string | null; role?: "admin" | "membre"; expiresAt?: string; /** Experts: from the catalogue (added by this app), « Experte » or « Expert ». */ pronom?: "il" | "elle" | null }
export interface BuzzOverview {
  relais: string;
  appareils: { cle: string; nom: string }[];
  annuaire: BuzzEntry[];
  salons: { id: string; nom: string; hasGuests?: boolean; canInvite?: boolean }[];
  /** The member's salons with external guests invited or present. */
  salonsAvecInvites?: string[];
  /** Where the member may invite external guests: everywhere (admin) or in the salons they opened. */
  invitations?: { tous: boolean; salons: string[] };
  /** Free salon → the member who opened it (its owner); absent: not recorded, only admins manage its guests. */
  createurs?: Record<string, string>;
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

/** Buzz names a direct conversation « DM » or « Group DM (3) »; any other named channel is a salon. */
export const isSalonName = (name: string): boolean => !/^(group )?dm( \(\d+\))?$/i.test(name.trim()) && name !== "Conversation";

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

/** The caller's own member id in the directory (the person whose devices are all mine), or null. */
export function myMember(directory: BuzzEntry[], mine: string[]): string | null {
  return directory.find((e) => e.type === "personne" && e.cles.length > 0 && e.cles.every((k) => mine.includes(k)))?.membre ?? null;
}

/** My experts present in a salon: the only ones I can ask for work there. */
export function myExpertsIn(directory: BuzzEntry[], mine: string[], members: string[]): BuzzEntry[] {
  const me = myMember(directory, mine);
  return me ? directory.filter((e) => e.type === "expert" && e.membre === me && e.cles.some((k) => members.includes(k))) : [];
}

/** Experts still on a request: mentioned by me in a message they have not answered since. */
export function working(thread: { author: string; at: number; mentions: string[] }[], mine: string[], experts: BuzzEntry[]): BuzzEntry[] {
  return experts.filter((e) => {
    const asked = thread.filter((m) => mine.includes(m.author) && m.mentions.some((k) => e.cles.includes(k))).at(-1);
    return asked !== undefined && !thread.some((m) => m.at >= asked.at && e.cles.includes(m.author));
  });
}

/** An expert's name without its owner: « Djénéba (de Selim T) » → « Djénéba ». */
export const shortName = (nom: string): string => nom.replace(/ \(de .*\)$/, "");

/** Each entry with its portrait (experts only), from a lookup by profile. */
export function withPhotos(directory: BuzzEntry[], photoOf: (profil: string) => string | null, pronounOf?: (profil: string) => "il" | "elle" | null): BuzzEntry[] {
  return directory.map((e) => (e.type === "expert" && e.profil ? { ...e, photo: photoOf(e.profil), ...(pronounOf ? { pronom: pronounOf(e.profil) } : {}) } : e));
}

/** An expert's directory name in its two parts: « Djénéba (de Aïcha) » → Djénéba, owned by Aïcha. */
export function expertParts(nom: string): { name: string; owner: string | null } {
  const m = / \((?:de |d’|d')(.+)\)$/.exec(nom);
  return m ? { name: nom.slice(0, m.index), owner: m[1] } : { name: nom, owner: null };
}

/** « d’Aïcha », « de Selim » : the French elision before a vowel. */
export const ofOwner = (owner: string): string => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(owner) ? `d’${owner}` : `de ${owner}`);

/** The small chip after an expert's name in a thread: « Experte d’Aïcha », « Votre Expert ». */
export function expertChip(e: BuzzEntry, own: boolean): string {
  const word = e.pronom === "elle" ? "Experte" : "Expert";
  if (own) return `Votre ${word}`;
  const { owner } = expertParts(e.nom);
  return owner ? `${word} ${ofOwner(owner)}` : word;
}

const DAY = 86_400;
const midnight = (seconds: number) => {
  const d = new Date(seconds * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
};

/** The day a message belongs to, as a separator reads it: « Aujourd’hui », « Hier », « jeudi 5 novembre » (the year when not this one). */
export function dayLabel(seconds: number, now = Date.now() / 1000): string {
  const days = Math.round((midnight(now) - midnight(seconds)) / DAY);
  if (days === 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  const d = new Date(seconds * 1000);
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== new Date(now * 1000).getFullYear() ? { year: "numeric" } : {}) });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Whether two messages fall on different days (a separator goes between them). */
export const newDay = (prev: { at: number } | undefined, m: { at: number }): boolean => !prev || midnight(prev.at) !== midnight(m.at);

/** « 14:05 ». */
export const hourLabel = (seconds: number): string => new Date(seconds * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** The time on a conversation's row: the hour today, « Hier », the weekday this week, else « 5 nov. ». */
export function whenLabel(seconds: number, now = Date.now() / 1000): string {
  const days = Math.round((midnight(now) - midnight(seconds)) / DAY);
  if (days <= 0) return hourLabel(seconds);
  if (days === 1) return "Hier";
  if (days < 7) return new Date(seconds * 1000).toLocaleDateString("fr-FR", { weekday: "short" });
  return new Date(seconds * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each « @Name » of a known participant set as inline code, which the thread draws as a mention chip. Longest names first. */
export function markMentions(text: string, handles: string[]): string {
  const names = [...new Set(handles.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length || !text.includes("@")) return text;
  const re = new RegExp(`(^|[^\\w\`])@(${names.map(escapeRe).join("|")})(?![\\p{L}\\d])`, "gu");
  return text.replace(re, (_all, lead: string, name: string) => `${lead}\`@${name}\``);
}

export interface SalonGroup { membre: string; nom: string; self: boolean; person: BuzzEntry | null; experts: BuzzEntry[] }

/** Who is in a salon, by member: the person (if one of their keys is in it) and their experts there; oneself first. Guests: `guestsIn`. */
export function salonPeople(directory: BuzzEntry[], members: string[], mine: string[]): SalonGroup[] {
  const me = myMember(directory, mine);
  const inIt = (e: BuzzEntry) => e.cles.some((k) => members.includes(k));
  const groups = new Map<string, SalonGroup>();
  const group = (e: BuzzEntry) => groups.get(e.membre) ?? groups.set(e.membre, { membre: e.membre, nom: e.nom, self: e.membre === me, person: null, experts: [] }).get(e.membre)!;
  for (const e of directory) if (e.type === "personne") group(e).nom = e.nom;
  for (const e of directory.filter((d) => d.type !== "invite" && inIt(d))) {
    if (e.type === "personne") group(e).person = e;
    else group(e).experts.push(e);
  }
  if (me && mine.some((k) => members.includes(k))) groups.get(me)!.person ??= directory.find((e) => e.type === "personne" && e.membre === me) ?? null;
  return [...groups.values()].filter((g) => g.person || g.experts.length).sort((a, b) => Number(b.self) - Number(a.self) || a.nom.localeCompare(b.nom, "fr"));
}

/** Whether a message opens a run: its author differs from the previous one's, or more than 5 minutes passed. */
export function startsRun(prev: { author: string; at: number } | undefined, m: { author: string; at: number }): boolean {
  return !prev || prev.author !== m.author || m.at - prev.at > 5 * 60;
}

/** The faces of a conversation, as its row shows them: the others first (people, then experts), oneself last, each member once. */
export function facesOf(directory: BuzzEntry[], members: string[], mine: string[]): BuzzEntry[] {
  const seen = new Set<BuzzEntry>();
  for (const k of members) {
    const e = directory.find((d) => d.cles.includes(k));
    if (e) seen.add(e);
  }
  const own = (e: BuzzEntry) => e.type === "personne" && e.cles.some((k) => mine.includes(k));
  return [...seen].sort((a, b) => Number(own(a)) - Number(own(b)) || Number(a.type === "expert") - Number(b.type === "expert"));
}

/** The salon's guests (people from outside the client), in the order the directory lists them. */
export const guestsIn = (directory: BuzzEntry[], members: string[]): BuzzEntry[] => directory.filter((e) => e.type === "invite" && e.cles.some((k) => members.includes(k)));

/** One's own profile photo on one's own entry, when the back office does not serve it in the directory. */
export function withOwnPhoto(directory: BuzzEntry[], devices: string[], photo: string | null | undefined): BuzzEntry[] {
  const me = myMember(directory, devices);
  return photo && me ? directory.map((e) => (e.type === "personne" && e.membre === me && !e.photo ? { ...e, photo } : e)) : directory;
}

export type SalonRole = "proprietaire" | "admin" | "membre" | "expert" | "invite";
export interface RosterRow { entry: BuzzEntry; role: SalonRole; self: boolean; owner: string | null }
const RANK: Record<SalonRole, number> = { proprietaire: 0, admin: 1, membre: 2, expert: 3, invite: 4 };

/** Who is in a salon and what each may do: owner, admins, members, experts (with their owner's name), guests; oneself first in each. */
export function salonRoster(directory: BuzzEntry[], members: string[], mine: string[], createur: string | null): RosterRow[] {
  const me = myMember(directory, mine);
  const nameOf = (membre: string) => directory.find((e) => e.type === "personne" && e.membre === membre)?.nom ?? null;
  const rows = salonPeople(directory, members, mine).flatMap((g): RosterRow[] => [
    ...(g.person ? [{ entry: g.person, role: g.membre === createur ? "proprietaire" : g.person.role === "admin" ? "admin" : "membre", self: g.self, owner: null } satisfies RosterRow] : []),
    ...g.experts.map((e): RosterRow => ({ entry: e, role: "expert", self: false, owner: nameOf(e.membre) ?? (e.membre === me ? "vous" : null) })),
  ]);
  const guests = guestsIn(directory, members).map((e): RosterRow => ({ entry: e, role: "invite", self: e.cles.some((k) => mine.includes(k)), owner: null }));
  return [...rows, ...guests].sort((a, b) => RANK[a.role] - RANK[b.role] || Number(b.self) - Number(a.self) || a.entry.nom.localeCompare(b.entry.nom, "fr"));
}
