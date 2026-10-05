// An expert's routines: tasks it runs on its own on a schedule, kept by Hermes's own scheduler in the
// expert's profile (lib/hermes-cron reaches it). Shared by the BFF and the Routines tab: no imports.

export interface Routine {
  id: string;
  name: string;
  // What the expert is asked to do, as written (without the skills and file lines below).
  task: string;
  // One line for the list.
  summary: string;
  skills: string[];
  attachment: string | null;
  // Hermes's schedule: a five-field cron expression, or an ISO date-time for a one-off.
  schedule: string;
  enabled: boolean;
  // Shipped with the expert and never turned on: shown under "Proposées par …".
  suggested: boolean;
}

// The time zone schedules are read in. The instances run on UTC, which is Abidjan's time all year.
export const ROUTINE_TIMEZONE = "Africa/Abidjan";

// The skills and the attached file ride at the end of the prompt, in lines the form can read back.
const SKILLS_HEADER = "Compétences à mobiliser :";
const FILE_PREFIX = "Fichier joint : ";

export function composePrompt(task: string, skills: string[], attachment: string | null): string {
  return [
    task.trim(),
    skills.length ? [SKILLS_HEADER, ...skills.map((s) => `- ${s}`)].join("\n") : "",
    attachment ? `${FILE_PREFIX}${attachment}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function splitPrompt(prompt: string): { task: string; skills: string[]; attachment: string | null } {
  const blocks = prompt.trim().split(/\n{2,}/);
  let attachment: string | null = null;
  let skills: string[] = [];
  if (blocks.length > 1 && blocks[blocks.length - 1].startsWith(FILE_PREFIX)) {
    attachment = blocks.pop()!.slice(FILE_PREFIX.length).trim() || null;
  }
  if (blocks.length > 1 && blocks[blocks.length - 1].startsWith(SKILLS_HEADER)) {
    skills = blocks
      .pop()!
      .split("\n")
      .slice(1)
      .map((line) => line.replace(/^- /, "").trim())
      .filter(Boolean);
  }
  return { task: blocks.join("\n\n"), skills, attachment };
}

// The list's line: the first sentence of the task, without the "Tu es Mamadou." the experts' own
// routines open with (their text is wrapped, so a paragraph's lines are joined first).
export function summarize(task: string): string {
  const text = task.replace(/^Tu es [^.\n]+\.\s*/, "").trim();
  const paragraph = text.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, " ");
  const line = paragraph.replace(/^[-*\d.\s]+/, "").replace(/\*\*/g, "");
  const sentence = line.match(/^.+?[.!?](\s|$)/)?.[0].trim() ?? line;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

// A name from the task when none is given: its first clause, cut at a word.
export function nameFrom(task: string): string {
  const clause = task.trim().split(/[.,;:\n]/)[0].trim();
  if (clause.length <= 50) return clause;
  const cut = clause.slice(0, 50);
  return cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 50);
}

// The run of a routine opens with Hermes's own instructions to the expert ("[IMPORTANT: You are
// running as a scheduled cron job. …]") before the routine's text: the transcript shows the text.
const RUN_PREAMBLE = "[IMPORTANT: You are running as a scheduled cron job.";

export function routineRunText(content: string): string {
  if (!content.startsWith(RUN_PREAMBLE)) return content;
  const end = content.indexOf("]\n\n");
  return end < 0 ? content : content.slice(end + 3);
}

// What a routine run answers when there is nothing to report.
export const SILENT_RUN = "[SILENT]";

// ---- Schedules ----

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const pad = (n: string | number) => String(n).padStart(2, "0");

export function isOneOff(schedule: string): boolean {
  return schedule.includes("T");
}

export interface Recurrence {
  label: string;
  dom: string; // day of the month
  dow: string; // day of the week
}

// The choices of the form's "Récurrent" list.
export const RECURRENCES: Recurrence[] = [
  { label: "Chaque jour", dom: "*", dow: "*" },
  { label: "Chaque jour ouvré", dom: "*", dow: "1-5" },
  ...[1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: `Chaque ${DAYS[d]}`, dom: "*", dow: String(d) })),
  { label: "Le 1er du mois", dom: "1", dow: "*" },
];

// Days part of a cron expression in words ("Chaque lundi et jeudi"), or null when it has none.
function recurrenceLabel(dom: string, dow: string): string | null {
  const preset = RECURRENCES.find((r) => r.dom === dom && r.dow === dow);
  if (preset) return preset.label;
  if (dom === "*" && dow === "1-6") return "Du lundi au samedi";
  if (dom === "*" && /^[0-7](,[0-7])+$/.test(dow)) {
    const names = dow.split(",").map((d) => DAYS[Number(d) % 7]);
    return `Chaque ${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  }
  if (/^\d{1,2}$/.test(dom) && dow === "*") return `Le ${dom} du mois`;
  return null;
}

export interface CronParts {
  dom: string;
  dow: string;
  time: string; // "09:30"
}

// The parts the form edits, or null for an expression it can't show (steps, months, ranges of hours).
export function cronParts(schedule: string): CronParts | null {
  const f = schedule.trim().split(/\s+/);
  if (f.length !== 5 || !/^\d{1,2}$/.test(f[0]) || !/^\d{1,2}$/.test(f[1]) || f[3] !== "*") return null;
  if (!recurrenceLabel(f[2], f[4])) return null;
  return { dom: f[2], dow: f[4], time: `${pad(f[1])}:${pad(f[0])}` };
}

export function cronFor({ dom, dow, time }: CronParts): string {
  const [h, m] = time.split(":").map(Number);
  return `${m} ${h} ${dom} * ${dow}`;
}

// "2026-10-06" + "09:00" → the one-off's ISO date-time, in the routines' time zone (UTC).
export function oneOffFor(date: string, time: string): string {
  return `${date}T${time}:00+00:00`;
}

export function recurrenceOf(parts: CronParts): string {
  return recurrenceLabel(parts.dom, parts.dow) ?? "";
}

// "Chaque lundi à 07:30", "Le 6 octobre à 09:00, une fois".
export function scheduleLabel(schedule: string): string {
  if (isOneOff(schedule)) {
    const d = new Date(schedule);
    if (Number.isNaN(d.getTime())) return schedule;
    const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
    return `Le ${day} à ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}, une fois`;
  }
  const parts = cronParts(schedule);
  return parts ? `${recurrenceOf(parts)} à ${parts.time}` : `Horaire : ${schedule}`;
}

// ---- The form's assistant: a sentence in, the fields out ----

export interface ParsedRoutine {
  task: string;
  name: string;
  recurring: boolean;
  parts: CronParts;
  date: string | null; // one-off day, "YYYY-MM-DD"
}

export function todayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// "Chaque lundi à 9 h, prépare le point de la semaine" → recurring every Monday at 09:00, with the
// task "Prépare le point de la semaine". Plain patterns, no model: it fills the form, the user checks.
export function parseRoutineSentence(sentence: string): ParsedRoutine {
  const text = sentence.trim();
  const hour = text.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  const time = hour ? `${pad(Math.min(23, Number(hour[1])))}:${hour[2] ?? "00"}` : "09:00";
  const recurring = /\b(chaque|tous les|toutes les)\b/i.test(text);
  const day = DAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b`, "i").test(text));
  let dom = "*";
  let dow = "*";
  if (/ouvr|en semaine/i.test(text)) dow = "1-5";
  else if (day >= 0) dow = String(day);
  else if (/\bmois\b/i.test(text)) dom = "1";
  const task = text
    .replace(/^(chaque|tous les|toutes les|demain|aujourd[’']hui|le)\b[^,]*,\s*/i, "")
    .replace(/^./, (c) => c.toUpperCase());
  return {
    task,
    name: nameFrom(task),
    recurring,
    parts: { dom, dow, time },
    date: recurring ? null : /aujourd/i.test(text) ? todayIso() : todayIso(1),
  };
}
