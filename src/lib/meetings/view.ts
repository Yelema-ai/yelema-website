import type { MeetingPlatform } from "./link.ts";
import type { MeetingMinutes } from "./minutes.ts";
import type { Byline, Delivery, DeliveryFailure, MeetingRecord, ScheduledEvent } from "./record.ts";

export const MEETING_STATUSES = [
  "scheduled",
  "joining",
  "waiting",
  "in_meeting",
  "processing",
  "writing",
  "stalled",
  "to_send",
  "sending",
  "sent",
  "not_admitted",
  "failed",
  "empty",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const STALL_AFTER_MS = 60 * 60 * 1000;
export const SENDING_TIMEOUT_MS = 20 * 60 * 1000;
export const JOIN_ABANDONED_AFTER_MS = 10 * 60 * 1000;

export interface MeetingView {
  id: string;
  link: string;
  platform: MeetingPlatform;
  status: MeetingStatus;
  createdAt: string;
  joinedAt: string | null;
  endedAt: string | null;
  participants: string[];
  minutes: MeetingMinutes | null;
  byline: Byline | null;
  event: ScheduledEvent | null;
  deliveries: Delivery[];
  lastFailure: DeliveryFailure | null;
  pageUrl: string | null;
}

export interface MeetingPage {
  items: MeetingView[];
  next: string | null;
}

const ONGOING: ReadonlySet<MeetingStatus> = new Set<MeetingStatus>(["joining", "waiting", "in_meeting", "processing", "writing", "sending"]);
const PRESENT: ReadonlySet<MeetingStatus> = new Set<MeetingStatus>(["joining", "waiting", "in_meeting"]);
const READY: ReadonlySet<MeetingStatus> = new Set<MeetingStatus>(["to_send", "sent"]);

export const isOngoing = (status: MeetingStatus): boolean => ONGOING.has(status);
export const isUpcoming = (status: MeetingStatus): boolean => status === "scheduled";
export const isPresent = (status: MeetingStatus): boolean => PRESENT.has(status);
export const isReady = (status: MeetingStatus): boolean => READY.has(status);

const olderThan = (iso: string | null, ms: number, now: number) => iso === null || now - Date.parse(iso) > ms;

export const pendingExpired = (record: MeetingRecord, now: number): boolean => record.pending !== null && olderThan(record.pending.at, SENDING_TIMEOUT_MS, now);

export function meetingStatus(record: MeetingRecord, minutes: MeetingMinutes | null, now: number): MeetingStatus {
  if (record.phase === "joining" && !record.botId && olderThan(record.createdAt, JOIN_ABANDONED_AFTER_MS, now)) return "failed";
  if (record.phase !== "writing") return record.phase;
  if (minutes && record.frame) {
    if (record.pending && !pendingExpired(record, now)) return "sending";
    return record.deliveries.length ? "sent" : "to_send";
  }
  if (minutes) return record.publish && (record.publish.failed || olderThan(record.publish.at, STALL_AFTER_MS, now)) ? "stalled" : "writing";
  return record.askFailed || olderThan(record.askedAt, STALL_AFTER_MS, now) ? "stalled" : "writing";
}

export function meetingView(record: MeetingRecord, minutes: MeetingMinutes | null, now: number): MeetingView {
  return {
    id: record.id,
    link: record.link,
    platform: record.platform,
    status: meetingStatus(record, minutes, now),
    createdAt: record.createdAt,
    joinedAt: record.joinedAt,
    endedAt: record.endedAt,
    participants: record.participants,
    minutes,
    byline: record.byline,
    event: record.event,
    deliveries: record.deliveries,
    lastFailure: record.lastFailure,
    pageUrl: minutes ? (record.frame?.url ?? null) : null,
  };
}
