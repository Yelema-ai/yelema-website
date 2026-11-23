import { capitalized } from "./labels.ts";
import type { MeetingMinutes, MeetingPerson } from "./minutes.ts";
import type { Byline, MeetingRecord } from "./record.ts";

export type FrameMeeting = Pick<MeetingRecord, "platform" | "createdAt" | "joinedAt" | "endedAt" | "participants" | "byline">;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

const NOTETAKERS = /notetaker|note taker|fireflies|otter|read\.?ai|tl;?dv|fathom|meetstream|\bbot\b/i;

export const GREETING = { opening: "Bonjour à tous,", line: "J’ai participé à la réunion : voici ce qu’il faut en retenir." } as const;

export const meetingDate = (iso: string, timeZone: string): string =>
  capitalized(new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone }));

export const meetingTime = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function attendees(minutes: MeetingMinutes, meeting: FrameMeeting): MeetingPerson[] {
  const own = meeting.byline?.expert.toLocaleLowerCase("fr");
  const listed = minutes.people.length ? minutes.people : meeting.participants.map((name) => ({ name, role: null }));
  return listed.filter((p) => !NOTETAKERS.test(p.name) && p.name.toLocaleLowerCase("fr") !== own);
}

export function expertRole(byline: Pick<Byline, "pronoun">): string {
  return byline.pronoun === "il" ? "Expert IA" : "Experte IA";
}

export function roleLine(byline: Byline): string {
  const company = byline.company?.trim();
  const of = company ? (/^[aeiouyàâäéèêëîïôöùûüœ]/i.test(company) ? ` d’${company}` : ` de ${company}`) : "";
  return byline.title ? `${expertRole(byline)}, ${byline.title}${of}` : `${expertRole(byline)}${of}`;
}
