import { isObject } from "./json.ts";
import { parseMeetingLink, type MeetingLink } from "./link.ts";
import { isEventKey } from "./record.ts";

export const CALENDAR_TOOLKITS = { googlecalendar: "Google Agenda", outlook: "Outlook" } as const;
export type CalendarToolkit = keyof typeof CALENDAR_TOOLKITS;

export const AGENDA_HORIZON_DAYS = 14;
export const MAX_EVENTS = 100;
const URL_IN_TEXT = /https:\/\/[^\s<>"'()[\]]+/g;

export interface AgendaEvent {
  key: string;
  title: string | null;
  start: string;
  end: string | null;
  link: MeetingLink;
  pending: boolean;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export const isCalendarToolkit = (v: unknown): v is CalendarToolkit => v === "googlecalendar" || v === "outlook";

function linkIn(...candidates: unknown[]): MeetingLink | null {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (!value) continue;
    const direct = parseMeetingLink(value);
    if (direct) return direct;
    for (const match of value.match(URL_IN_TEXT) ?? []) {
      const found = parseMeetingLink(match.replace(/&amp;/g, "&").replace(/[.,;]+$/, ""));
      if (found) return found;
    }
  }
  return null;
}

function iso(value: unknown, utc = false): string | null {
  const raw = text(value);
  if (!raw) return null;
  const withZone = utc && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? `${raw}Z` : raw;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

interface RawEvent {
  id: unknown;
  title: unknown;
  start: string | null;
  end: string | null;
  link: MeetingLink | null;
  accepted: boolean;
}

function eventOf(provider: "google" | "outlook", raw: RawEvent): AgendaEvent | null {
  const key = `${provider}:${typeof raw.id === "string" ? raw.id : ""}`;
  if (!isEventKey(key) || !raw.start || !raw.link) return null;
  return { key, title: text(raw.title)?.slice(0, 300) ?? null, start: raw.start, end: raw.end, link: raw.link, pending: !raw.accepted };
}

function googleEvent(raw: unknown): AgendaEvent | null {
  if (!isObject(raw) || raw.status === "cancelled") return null;
  const start = isObject(raw.start) ? iso(raw.start.dateTime) : null;
  const end = isObject(raw.end) ? iso(raw.end.dateTime) : null;
  const self = Array.isArray(raw.attendees) ? raw.attendees.find((a) => isObject(a) && a.self === true) : undefined;
  const response = isObject(self) ? self.responseStatus : null;
  if (response === "declined") return null;
  const accepted = (isObject(raw.organizer) && raw.organizer.self === true) || response === "accepted" || response === "tentative";
  const entryPoints = isObject(raw.conferenceData) && Array.isArray(raw.conferenceData.entryPoints) ? raw.conferenceData.entryPoints : [];
  const video = entryPoints.find((e) => isObject(e) && e.entryPointType === "video");
  const link = linkIn(raw.hangoutLink, isObject(video) ? video.uri : null, raw.location, raw.description);
  return eventOf("google", { id: raw.id, title: raw.summary, start, end, link, accepted });
}

function outlookEvent(raw: unknown): AgendaEvent | null {
  if (!isObject(raw) || raw.isCancelled === true || raw.isAllDay === true) return null;
  const response = isObject(raw.responseStatus) ? raw.responseStatus.response : null;
  if (response === "declined") return null;
  const accepted = raw.isOrganizer === true || response === "organizer" || response === "accepted" || response === "tentativelyAccepted";
  const utc = (v: unknown) => (isObject(v) ? iso(v.dateTime, !text(v.timeZone) || /^(utc|gmt)$/i.test(String(v.timeZone))) : null);
  const online = isObject(raw.onlineMeeting) ? raw.onlineMeeting.joinUrl : null;
  const location = isObject(raw.location) ? raw.location.displayName : null;
  const body = isObject(raw.body) ? raw.body.content : null;
  const link = linkIn(online, raw.onlineMeetingUrl, location, raw.bodyPreview, body);
  return eventOf("outlook", { id: raw.id, title: raw.subject, start: utc(raw.start), end: utc(raw.end), link, accepted });
}

export function agendaEvents(toolkit: CalendarToolkit, data: unknown, now: number): AgendaEvent[] {
  const items = toolkit === "googlecalendar" ? (isObject(data) ? data.items : null) : isObject(data) && isObject(data.response_data) ? data.response_data.value : null;
  if (!Array.isArray(items)) return [];
  const parse = toolkit === "googlecalendar" ? googleEvent : outlookEvent;
  const seen = new Set<string>();
  return items
    .slice(0, MAX_EVENTS * 2)
    .map(parse)
    .filter((e): e is AgendaEvent => {
      if (!e || seen.has(e.key) || Date.parse(e.end ?? e.start) <= now) return false;
      seen.add(e.key);
      return true;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, MAX_EVENTS);
}

const graphTime = (ms: number) => new Date(ms).toISOString().slice(0, 19);

export function agendaRequest(toolkit: CalendarToolkit, now: number): { slug: string; args: Record<string, unknown> } {
  const until = now + AGENDA_HORIZON_DAYS * 86_400_000;
  if (toolkit === "googlecalendar") {
    return {
      slug: "GOOGLECALENDAR_EVENTS_LIST",
      args: { calendarId: "primary", timeMin: new Date(now).toISOString(), timeMax: new Date(until).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: MAX_EVENTS },
    };
  }
  return {
    slug: "OUTLOOK_OUTLOOK_LIST_EVENTS",
    args: {
      user_id: "me",
      filter: `start/dateTime ge '${graphTime(now - 86_400_000)}' and start/dateTime le '${graphTime(until)}'`,
      orderby: ["start/dateTime asc"],
      top: MAX_EVENTS,
      timezone: "UTC",
      expand_recurring_events: true,
    },
  };
}
