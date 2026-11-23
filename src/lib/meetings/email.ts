import { counted } from "./labels.ts";
import type { MeetingMinutes } from "./minutes.ts";
import { roleLine } from "./minutes-parts.ts";
import type { Byline } from "./record.ts";

export interface MinutesText {
  subject: string;
  text: string;
}

export interface MinutesEmail extends MinutesText {
  html: string;
}

export function signature(byline: Byline | null): string[] {
  return byline ? [byline.expert, roleLine(byline)] : [];
}

export function contentLine(minutes: Pick<MeetingMinutes, "decisions" | "tasks" | "questions">): string {
  return [
    minutes.decisions.length ? counted(minutes.decisions.length, "décision", "décisions") : null,
    minutes.tasks.length ? counted(minutes.tasks.length, "tâche", "tâches") : null,
    minutes.questions.length ? counted(minutes.questions.length, "question ouverte", "questions ouvertes") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function minutesEmail(minutes: MeetingMinutes, byline: Byline | null, link: string): MinutesText {
  const content = contentLine(minutes);
  const lines = [
    "Bonjour,",
    "",
    minutes.summary ?? `Voici le compte rendu de la réunion « ${minutes.title} ».`,
    ...(content ? ["", content] : []),
    "",
    "Lire le compte rendu complet :",
    link,
    ...(byline ? ["", ...signature(byline)] : []),
  ];
  return { subject: `Compte rendu : ${minutes.title}`, text: lines.join("\n") };
}
