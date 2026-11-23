import { isCalendarToolkit, type AgendaEvent, type CalendarToolkit } from "./calendar.ts";
import { isObject } from "./json.ts";
import type { MeetingPlatform } from "./link.ts";
import { isHexColor } from "./minutes-palette.ts";
import { httpsUrl, isEmail, isEventKey } from "./record.ts";
import type { MeetingStatus } from "./view.ts";

export const AGENDA_FILE = ".agenda.json";
export const AGENDA_MAX_BYTES = 64 * 1024;
export const SCHEDULE_LEAD_MS = 3 * 60_000;

export const AGENDA_MODES = ["all", "chosen"] as const;
export type AgendaMode = (typeof AGENDA_MODES)[number];

const MAX_KEYS = 300;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface AgendaCalendar {
  toolkit: CalendarToolkit;
  account: string;
}

export interface AgendaHost {
  name: string | null;
  email: string | null;
  company: string | null;
  logo: string | null;
  color: string | null;
}

export interface AgendaSettings {
  mode: AgendaMode;
  chosen: string[];
  skipped: string[];
  calendar: AgendaCalendar | null;
  host: AgendaHost | null;
}

export type AgendaEventChange = { event: string; on: boolean };
export type AgendaChange = { mode: AgendaMode } | AgendaEventChange | { calendar: string };

export interface AgendaItem {
  key: string;
  title: string | null;
  start: string;
  end: string | null;
  platform: MeetingPlatform;
  pending: boolean;
  status: MeetingStatus | null;
}

export interface AgendaView {
  calendars: { account: string; label: string; email: string | null }[];
  calendar: string | null;
  mode: AgendaMode;
  chosen: string[];
  skipped: string[];
  events: AgendaItem[];
  unavailable: boolean;
  changed: boolean;
}

export interface AgendaToggle {
  item: AgendaItem;
  changed: boolean;
}

export const DEFAULT_AGENDA: AgendaSettings = { mode: "chosen", chosen: [], skipped: [], calendar: null, host: null };

const isMode = (v: unknown): v is AgendaMode => AGENDA_MODES.includes(v as AgendaMode);
const keys = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isEventKey))].slice(-MAX_KEYS) : []);
const shortText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function calendarOf(v: unknown): AgendaCalendar | null {
  return isObject(v) && isCalendarToolkit(v.toolkit) && typeof v.account === "string" && ACCOUNT_ID.test(v.account) ? { toolkit: v.toolkit, account: v.account } : null;
}

function hostOf(v: unknown): AgendaHost | null {
  if (!isObject(v)) return null;
  return { name: shortText(v.name, 200), email: isEmail(v.email) ? v.email : null, company: shortText(v.company, 200), logo: httpsUrl(v.logo), color: isHexColor(v.color) ? v.color : null };
}

export const sameHost = (a: AgendaHost | null, b: AgendaHost | null): boolean =>
  a?.name === b?.name && a?.email === b?.email && a?.company === b?.company && a?.logo === b?.logo && a?.color === b?.color;

export function parseAgendaSettings(body: string | null): AgendaSettings {
  if (!body || body.length > AGENDA_MAX_BYTES) return DEFAULT_AGENDA;
  try {
    const d: unknown = JSON.parse(body);
    if (!isObject(d) || d.version !== 1) return DEFAULT_AGENDA;
    return { mode: isMode(d.mode) ? d.mode : "chosen", chosen: keys(d.chosen), skipped: keys(d.skipped), calendar: calendarOf(d.calendar), host: hostOf(d.host) };
  } catch {
    return DEFAULT_AGENDA;
  }
}

export const serializeAgendaSettings = (s: AgendaSettings): string => `${JSON.stringify({ version: 1, ...s }, null, 2)}\n`;

export function parseAgendaChange(raw: unknown): AgendaChange | null {
  if (!isObject(raw)) return null;
  if (isMode(raw.mode)) return { mode: raw.mode };
  if (isEventKey(raw.event) && typeof raw.on === "boolean") return { event: raw.event, on: raw.on };
  if (typeof raw.calendar === "string" && ACCOUNT_ID.test(raw.calendar)) return { calendar: raw.calendar };
  return null;
}

const without = (list: string[], key: string) => list.filter((k) => k !== key);
const withKey = (list: string[], key: string) => [...without(list, key), key].slice(-MAX_KEYS);

export function applyAgendaChange(settings: AgendaSettings, change: AgendaChange, calendars: readonly AgendaCalendar[], listed: readonly string[] = []): AgendaSettings | null {
  if ("mode" in change) return { ...settings, mode: change.mode, chosen: [], skipped: [] };
  if ("calendar" in change) {
    const calendar = calendars.find((c) => c.account === change.calendar);
    return calendar ? { ...settings, calendar, chosen: [], skipped: [] } : null;
  }
  if (settings.mode === "all") {
    if (change.on) return { ...settings, skipped: without(settings.skipped, change.event), chosen: withKey(settings.chosen, change.event) };
    const kept = [...new Set([...settings.chosen, ...listed.filter((key) => !settings.skipped.includes(key))])].filter((key) => key !== change.event).slice(-MAX_KEYS);
    return { ...settings, mode: "chosen", chosen: kept, skipped: [] };
  }
  return { ...settings, chosen: change.on ? withKey(settings.chosen, change.event) : without(settings.chosen, change.event) };
}

export function isWanted(settings: AgendaSettings, key: string, pending = false): boolean {
  if (settings.chosen.includes(key)) return true;
  return settings.mode === "all" && !pending && !settings.skipped.includes(key);
}

export const autoKeys = (events: readonly Pick<AgendaEvent, "key" | "pending">[]): string[] => events.filter((e) => !e.pending).map((e) => e.key);

export const schedulable = (event: AgendaEvent, now: number): boolean => Date.parse(event.start) > now + SCHEDULE_LEAD_MS;
