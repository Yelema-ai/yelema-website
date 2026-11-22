import { isObject } from "./json.ts";
import { MAX_RECIPIENTS, isEmail } from "./record.ts";

export const MINUTES_FILE = "compte-rendu.json";
export const MINUTES_MAX_BYTES = 256 * 1024;

const MAX_ITEMS = 100;
const MAX_ITEM_LENGTH = 1000;
const MAX_SUMMARY_LENGTH = 1500;
const MAX_ESSENTIALS = 3;
const MAX_PEOPLE = 50;

export interface MeetingTask {
  text: string;
  owner: string | null;
  due: string | null;
}

export interface MeetingContact {
  name: string | null;
  email: string;
}

export interface MeetingPerson {
  name: string;
  role: string | null;
}

export interface MeetingMinutes {
  title: string;
  summary: string | null;
  essentials: string[];
  decisions: string[];
  tasks: MeetingTask[];
  questions: string[];
  contacts: MeetingContact[];
  people: MeetingPerson[];
}

const clean = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const oneLine = (v: unknown, max: number): string | null => clean(v, max)?.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim() || null;
const optional = (v: unknown, max: number): string | null => (v === undefined || v === null ? null : oneLine(v, max));

function texts(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_ITEMS).flatMap((item) => {
    const t = clean(item, MAX_ITEM_LENGTH);
    return t ? [t] : [];
  });
}

function tasks(v: unknown): MeetingTask[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_ITEMS).flatMap((raw) => {
    if (!isObject(raw)) return [];
    const text = clean(raw.texte, MAX_ITEM_LENGTH);
    return text ? [{ text, owner: optional(raw.responsable, 200), due: optional(raw.echeance, 100) }] : [];
  });
}

function contacts(v: unknown): MeetingContact[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.slice(0, MAX_RECIPIENTS).flatMap((raw) => {
    if (!isObject(raw) || !isEmail(raw.email)) return [];
    const key = raw.email.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name: optional(raw.nom, 200), email: raw.email }];
  });
}

function people(v: unknown): MeetingPerson[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.slice(0, MAX_PEOPLE).flatMap((raw) => {
    if (!isObject(raw)) return [];
    const name = oneLine(raw.nom, 200);
    const key = name?.toLocaleLowerCase("fr");
    if (!name || !key || seen.has(key)) return [];
    seen.add(key);
    return [{ name, role: optional(raw.role, 100) }];
  });
}

export function parseMinutes(body: string): MeetingMinutes | null {
  if (body.length > MINUTES_MAX_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== 1) return null;
  const title = oneLine(data.titre, 200);
  const decisions = texts(data.decisions);
  const taskList = tasks(data.taches);
  const questions = texts(data.questions);
  if (!title || !decisions || !taskList || !questions) return null;
  const summary = optional(data.resume, MAX_SUMMARY_LENGTH);
  const essentials = texts(data.essentiel)?.slice(0, MAX_ESSENTIALS) ?? [];
  const listed = data.participants ?? data.destinataires;
  return {
    title,
    summary,
    essentials: essentials.length ? essentials : summary ? [summary] : [],
    decisions,
    tasks: taskList,
    questions,
    contacts: contacts(listed),
    people: people(listed),
  };
}
