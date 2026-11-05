import type { BuzzEntry } from "@/lib/buzz";

// Mentions d'un échange : qui « @ » propose, et quelles clés partent avec le message.

export interface Candidate { entry: BuzzEntry; mine: boolean; handle: string }

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
