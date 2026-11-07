import type { BuzzEntry } from "@/lib/buzz";

// Mentions d'un échange : qui « @ » propose, et quelles clés partent avec le message.

/** `group`: @tous, @experts or a department (@Finance), its keys every person or Expert it stands for; `hint` says who. */
export interface Candidate { entry: BuzzEntry; mine: boolean; handle: string; group?: { hint: string } }

const short = (nom: string) => nom.replace(/ \(de .*\)$/, "");
/** Le mot en cours de saisie qui commence par « @ », juste avant le curseur. */
export const TOKEN = /(^|\s)@([^\s@]{0,40})$/;

export function candidatesOf(directory: BuzzEntry[], members: string[], myMember: string | null, mine: string[]): Candidate[] {
  return directory
    .filter((e) => e.cles.some((k) => members.includes(k)) && !(e.type === "personne" && e.cles.every((k) => mine.includes(k))))
    .map((entry) => {
      const own = entry.type === "expert" && entry.membre === myMember;
      return { entry, mine: own, handle: own ? short(entry.nom) : entry.nom };
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.handle.localeCompare(b.handle, "fr"));
}

/** Les clés mentionnées : celles des candidats choisis dont « @nom » est encore dans le texte. */
export const mentionsIn = (text: string, picked: Candidate[]): string[] => [...new Set(picked.filter((c) => text.includes(`@${c.handle}`)).flatMap((c) => c.entry.cles))];


/** Répondre à l'un de MES Experts le mentionne, pour qu'il réponde ; l'Expert d'un autre ne m'obéirait pas. */
export const replyMention = (author: string | null | undefined, candidates: Candidate[]): string | null =>
  author && candidates.some((c) => c.mine && c.entry.cles.includes(author)) ? author : null;

/** Les mentions tapées, plus l'auteur du message répondu quand c'est l'un de mes Experts (sans doublon). */
export function withReplyMention(mentions: string[], author: string | null | undefined, candidates: Candidate[]): string[] {
  const m = replyMention(author, candidates);
  return m && !mentions.includes(m) ? [...mentions, m] : mentions;
}

/**
 * The group mentions of a salon, as in Slack (Leslie, 07/11): @tous (every person in it, warned, no Expert set to work),
 * @experts (my own Experts in it, who all set to work) and one per department of its people (@Finance), when the
 * directory says each one's. A group with nobody in it is not offered.
 */
export function groupCandidates(directory: BuzzEntry[], members: string[], myMember: string | null, mine: string[]): Candidate[] {
  const inIt = (e: BuzzEntry) => e.cles.some((k) => members.includes(k));
  const people = directory.filter((e) => e.type !== "expert" && inIt(e) && !e.cles.every((k) => mine.includes(k)));
  const experts = directory.filter((e) => e.type === "expert" && e.membre === myMember && inIt(e));
  const keysOf = (list: BuzzEntry[]) => [...new Set(list.flatMap((e) => e.cles.filter((k) => members.includes(k))))];
  const group = (handle: string, list: BuzzEntry[], hint: string, own = false): Candidate[] =>
    list.length ? [{ entry: { nom: handle, type: "personne", membre: `@${handle}`, cles: keysOf(list) }, mine: own, handle, group: { hint } }] : [];
  const units = [...new Set(people.map((e) => e.unite?.trim()).filter((u): u is string => Boolean(u)))].sort((a, b) => a.localeCompare(b, "fr"));
  return [
    ...group("tous", people, `Prévient les ${people.length} personne${people.length > 1 ? "s" : ""} du salon`),
    ...group("experts", experts, `Vos ${experts.length} Expert${experts.length > 1 ? "s" : ""} du salon`, true),
    ...units.flatMap((u) => {
      const list = people.filter((e) => e.unite?.trim() === u);
      return group(u.replace(/\s+/g, ""), list, `${u} : ${list.length} personne${list.length > 1 ? "s" : ""}`);
    }),
  ];
}
