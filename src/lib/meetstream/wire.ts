import type { BotSnapshot, JoinRequest, TranscriptSegment } from "../meetings/bots.ts";

export const RETENTION_HOURS = 24;
export const EVERYONE_LEFT_TIMEOUT_S = 60;
export const WAITING_ROOM_TIMEOUT_S = 600;

const MAX_BOT_NAME = 100;
const MAX_MESSAGE = 2000;
const MAX_ATTRIBUTE = 200;
const MAX_SEGMENTS = 20_000;
const MAX_PARTICIPANTS = 200;

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const seconds = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export const botName = (name: string): string =>
  name
    .replace(/[^\p{L}\p{N} '._@-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BOT_NAME);

export function createBotBody(request: JoinRequest): Record<string, unknown> {
  const attributes = Object.fromEntries(Object.entries(request.attributes).map(([k, v]) => [k, v.slice(0, MAX_ATTRIBUTE)]));
  return {
    meeting_link: request.link,
    bot_name: botName(request.name),
    bot_message: request.message.slice(0, MAX_MESSAGE),
    ...(request.imageUrl ? { bot_image_url: request.imageUrl } : {}),
    audio_required: true,
    video_required: false,
    custom_attributes: attributes,
    ...(request.joinAt ? { join_at: request.joinAt } : {}),
    automatic_leave: { waiting_room_timeout: WAITING_ROOM_TIMEOUT_S, everyone_left_timeout: EVERYONE_LEFT_TIMEOUT_S },
    recording_config: {
      transcript: { provider: { meetstream: { language: "auto" } } },
      retention: { type: "timed", hours: RETENTION_HOURS },
    },
  };
}

export function parseCreatedBot(body: unknown): string | null {
  return isObject(body) ? text(body.bot_id) : null;
}

function attributesOf(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
}

function timelineAt(timeline: unknown, keys: readonly string[]): number | null {
  if (!isObject(timeline)) return null;
  for (const key of keys) {
    const step = timeline[key];
    if (isObject(step) && step.status === true) {
      const at = seconds(step.timestamp);
      if (at !== null) return at * 1000;
    }
  }
  return null;
}

export function parseBotDetail(body: unknown): BotSnapshot | null {
  const detail = isObject(body) && isObject(body.bot_details) ? body.bot_details : null;
  const status = detail ? text(detail.Status) : null;
  if (!detail || !status) return null;
  return {
    status,
    joinedAt: timelineAt(detail.StatusTimeline, ["InMeeting", "Recording"]),
    endedAt: timelineAt(detail.StatusTimeline, ["Leaving", "Stopped"]),
    attributes: attributesOf(detail.custom_attributes),
  };
}

function v2Segment(raw: Raw): TranscriptSegment | null {
  if (!Array.isArray(raw.words)) return null;
  const words = raw.words.filter(isObject);
  const spoken = words.map((w) => text(w.text)).filter((w): w is string => w !== null);
  if (!spoken.length) return null;
  const first = words[0];
  const start = isObject(first?.start_timestamp) ? seconds(first.start_timestamp.relative) : null;
  const speaker = (isObject(raw.participant) ? text(raw.participant.name) : null) ?? "Participant";
  return { speaker, text: spoken.join(" "), start };
}

function formattedSegment(raw: Raw): TranscriptSegment | null {
  const said = text(raw.transcript);
  if (!said) return null;
  const speaker = text(raw.speaker) ?? (typeof raw.speaker === "number" ? `Intervenant ${raw.speaker + 1}` : "Participant");
  return { speaker, text: said, start: seconds(raw.start_time) };
}

export function parseTranscript(body: unknown): TranscriptSegment[] | null {
  const items = Array.isArray(body) ? body : isObject(body) && Array.isArray(body.transcript) ? body.transcript : null;
  if (!items) return null;
  return items
    .slice(0, MAX_SEGMENTS)
    .filter(isObject)
    .map((raw) => ("words" in raw && "participant" in raw ? v2Segment(raw) : formattedSegment(raw)))
    .filter((s): s is TranscriptSegment => s !== null);
}

export function parseParticipants(body: unknown): string[] {
  if (!Array.isArray(body)) return [];
  const names = new Set<string>();
  for (const raw of body.slice(0, MAX_PARTICIPANTS)) {
    if (!isObject(raw)) continue;
    const name = text(raw.fullName) ?? text(raw.displayName) ?? text(raw.name);
    if (name && name.length <= 200) names.add(name);
  }
  return [...names];
}
