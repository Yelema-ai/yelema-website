import { publishedFrame, type PublishedFrame } from "../frames/wire.ts";
import { isObject } from "./json.ts";
import { MEETING_PLATFORMS, type MeetingLink, type MeetingPlatform } from "./link.ts";
import { isHexColor } from "./minutes-palette.ts";

export const MEETING_PHASES = ["scheduled", "joining", "waiting", "in_meeting", "processing", "writing", "not_admitted", "failed", "empty"] as const;
export type MeetingPhase = (typeof MEETING_PHASES)[number];

export const ACTIVE_PHASES: ReadonlySet<MeetingPhase> = new Set<MeetingPhase>(["scheduled", "joining", "waiting", "in_meeting", "processing"]);

export const SENDER_KINDS = ["expert", "connected"] as const;
export type SenderKind = (typeof SENDER_KINDS)[number];

export interface Requester {
  name: string | null;
  email: string | null;
}

export type Pronoun = "elle" | "il";

export interface ScheduledEvent {
  key: string;
  title: string | null;
  start: string;
  end: string | null;
}

export interface Byline {
  expert: string;
  pronoun: Pronoun | null;
  owner: string | null;
  company: string | null;
  logo: string | null;
  color: string | null;
  photo: string | null;
  title: string | null;
}

export interface Delivery {
  id: string;
  at: string;
  sender: SenderKind;
  from: string | null;
  to: string[];
}

export interface MinutesFrame extends PublishedFrame {
  hash: string;
}

export interface PublishAttempt {
  id: string;
  hash: string;
  at: string;
  failed: boolean;
}

export interface DeliveryFailure {
  at: string;
  reason: string;
}

export interface MeetingRecord {
  version: 1;
  id: string;
  link: string;
  platform: MeetingPlatform;
  botId: string | null;
  phase: MeetingPhase;
  createdAt: string;
  joinedAt: string | null;
  endedAt: string | null;
  participants: string[];
  requester: Requester;
  byline: Byline | null;
  event: ScheduledEvent | null;
  sessionId: string | null;
  askedAt: string | null;
  askFailed: boolean;
  frame: MinutesFrame | null;
  publish: PublishAttempt | null;
  pending: Delivery | null;
  deliveries: Delivery[];
  lastFailure: DeliveryFailure | null;
}

export const RECORD_FILE = ".reunion.json";
export const RECORD_MAX_BYTES = 64 * 1024;
export const MAX_PARTICIPANTS = 200;
export const MAX_RECIPIENTS = 50;
const MAX_DELIVERIES = 20;

const MEETING_ID = /^\d{6}-\d{6}$/;
const BOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OPAQUE_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,255}\.[^\s@<>()",;:]{2,63}$/;

export const isMeetingId = (value: unknown): value is string => typeof value === "string" && MEETING_ID.test(value);
export const isBotId = (value: unknown): value is string => typeof value === "string" && BOT_ID.test(value);
export const isSessionId = (value: unknown): value is string => typeof value === "string" && SESSION_ID.test(value);
export const isOpaqueKey = (value: unknown): value is string => typeof value === "string" && OPAQUE_KEY.test(value);
export const isEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 320 && EMAIL.test(value);

const two = (n: number) => String(n).padStart(2, "0");

export function meetingIdAt(at: Date): string {
  return `${two(at.getUTCFullYear() % 100)}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}-${two(at.getUTCHours())}${two(at.getUTCMinutes())}${two(at.getUTCSeconds())}`;
}

export function newMeetingRecord(id: string, link: MeetingLink, requester: Requester, byline: Byline, at: Date, event: ScheduledEvent | null = null): MeetingRecord {
  return {
    version: 1,
    id,
    link: link.url,
    platform: link.platform,
    botId: null,
    phase: event ? "scheduled" : "joining",
    createdAt: at.toISOString(),
    joinedAt: null,
    endedAt: null,
    participants: [],
    requester,
    byline,
    event,
    sessionId: null,
    askedAt: null,
    askFailed: false,
    frame: null,
    publish: null,
    pending: null,
    deliveries: [],
    lastFailure: null,
  };
}

export const serializeRecord = (record: MeetingRecord): string => `${JSON.stringify(record, null, 2)}\n`;

const date = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);
const shortText = (v: unknown, max: number): string | null | undefined => (v === null ? null : typeof v === "string" && v.length <= max ? v : undefined);
const absent = (v: unknown) => v === undefined || v === null;

export const httpsUrl = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 1000 && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;

function byline(v: unknown): Byline | null | undefined {
  if (absent(v)) return null;
  if (!isObject(v) || typeof v.expert !== "string" || !v.expert.trim() || v.expert.length > 100) return undefined;
  const owner = shortText(v.owner ?? null, 200);
  const company = shortText(v.company ?? null, 200);
  const pronoun = v.pronoun === "elle" || v.pronoun === "il" ? v.pronoun : null;
  if (owner === undefined || company === undefined) return undefined;
  return {
    expert: v.expert,
    pronoun,
    owner,
    company,
    logo: httpsUrl(v.logo),
    color: isHexColor(v.color) ? v.color : null,
    photo: httpsUrl(v.photo),
    title: shortText(v.title ?? null, 200) ?? null,
  };
}

export function parseDelivery(v: unknown): Delivery | null {
  if (!isObject(v) || !isOpaqueKey(v.id) || !date(v.at) || !SENDER_KINDS.includes(v.sender as SenderKind) || !Array.isArray(v.to)) return null;
  const from = v.from === null || v.from === undefined ? null : isEmail(v.from) ? v.from : undefined;
  const to = v.to.filter(isEmail).slice(0, MAX_RECIPIENTS);
  if (from === undefined || !to.length) return null;
  return { id: v.id, at: v.at as string, sender: v.sender as SenderKind, from, to };
}

const HASH = /^[0-9a-f]{64}$/;

export const isHash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);

function frameOf(v: unknown): MinutesFrame | null {
  if (!isObject(v)) return null;
  const frame = publishedFrame(v.id, v.url);
  return frame ? { ...frame, hash: isHash(v.hash) ? v.hash : "" } : null;
}

function publishOf(v: unknown): PublishAttempt | null {
  if (!isObject(v) || !isOpaqueKey(v.id) || !isHash(v.hash) || !date(v.at) || typeof v.failed !== "boolean") return null;
  return { id: v.id, hash: v.hash, at: v.at as string, failed: v.failed };
}

const EVENT_KEY = /^(?:google|outlook):[A-Za-z0-9_=+/@.-]{1,512}$/;

export const isEventKey = (v: unknown): v is string => typeof v === "string" && EVENT_KEY.test(v);

function eventOf(v: unknown): ScheduledEvent | null {
  if (!isObject(v) || !isEventKey(v.key) || !date(v.start)) return null;
  const title = shortText(v.title ?? null, 300);
  const end = date(v.end ?? null);
  return title === undefined || end === undefined ? null : { key: v.key, title, start: v.start as string, end };
}

function failure(v: unknown): DeliveryFailure | null {
  if (!isObject(v) || !date(v.at) || typeof v.reason !== "string" || !v.reason.trim()) return null;
  return { at: v.at as string, reason: v.reason.slice(0, 500) };
}

export function parseMeetingRecord(body: string): MeetingRecord | null {
  if (body.length > RECORD_MAX_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== 1) return null;
  const d = data;
  if (!isMeetingId(d.id) || typeof d.link !== "string" || d.link.length > 2048) return null;
  if (!MEETING_PLATFORMS.includes(d.platform as MeetingPlatform)) return null;
  if (!MEETING_PHASES.includes(d.phase as MeetingPhase)) return null;
  if (d.botId !== null && !isBotId(d.botId)) return null;
  if (d.sessionId !== null && !isSessionId(d.sessionId)) return null;
  if (typeof d.askFailed !== "boolean" || !Array.isArray(d.participants) || !isObject(d.requester)) return null;
  const createdAt = date(d.createdAt);
  const joinedAt = date(d.joinedAt);
  const endedAt = date(d.endedAt);
  const askedAt = date(d.askedAt);
  const name = shortText(d.requester.name, 200);
  const email = d.requester.email === null ? null : isEmail(d.requester.email) ? d.requester.email : undefined;
  const signature = byline(d.byline);
  if (!createdAt || joinedAt === undefined || endedAt === undefined || askedAt === undefined) return null;
  if (name === undefined || email === undefined || signature === undefined) return null;
  const participants = d.participants
    .filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 200)
    .slice(0, MAX_PARTICIPANTS);
  const deliveries = (Array.isArray(d.deliveries) ? d.deliveries : []).flatMap((x) => parseDelivery(x) ?? []).slice(-MAX_DELIVERIES);
  return {
    version: 1,
    id: d.id,
    link: d.link,
    platform: d.platform as MeetingPlatform,
    botId: d.botId as string | null,
    phase: d.phase as MeetingPhase,
    createdAt,
    joinedAt,
    endedAt,
    participants,
    requester: { name, email },
    byline: signature,
    event: absent(d.event) ? null : eventOf(d.event),
    sessionId: d.sessionId as string | null,
    askedAt,
    askFailed: d.askFailed,
    frame: absent(d.frame) ? null : frameOf(d.frame),
    publish: absent(d.publish) ? null : publishOf(d.publish),
    pending: absent(d.pending) ? null : parseDelivery(d.pending),
    deliveries,
    lastFailure: absent(d.lastFailure) ? null : failure(d.lastFailure),
  };
}

export const withDelivery = (record: MeetingRecord, delivery: Delivery): MeetingRecord => ({
  ...record,
  pending: null,
  lastFailure: null,
  deliveries: [...record.deliveries, delivery].slice(-MAX_DELIVERIES),
});
