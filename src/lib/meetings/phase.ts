import { BOT_ATTRIBUTES, type BotSnapshot } from "./bots.ts";
import type { MeetingPhase } from "./record.ts";

const SCHEDULED = new Set(["scheduled"]);
const JOINING = new Set(["joining"]);
const WAITING = new Set(["inwaitingroom"]);
const IN_MEETING = new Set(["inmeeting", "recording", "recordingpermissionallowed", "recordingpermissiondenied"]);
const REFUSED = new Set(["denied", "notallowed", "cancelled"]);
const BROKEN = new Set(["failed", "error"]);
const ENDED = new Set(["leaving", "stopped", "kicked", "mediaprocessing", "audioprocessing", "videoprocessing", "uploading", "transcriptionready", "done", "mediaexpired"]);
const SETTLED = new Set(["done", "mediaexpired", "failed", "error", "denied", "notallowed", "cancelled"]);

const statusOf = (bot: BotSnapshot) => bot.status.toLowerCase();

export function phaseOf(bot: BotSnapshot): MeetingPhase | null {
  const status = statusOf(bot);
  const admitted = bot.joinedAt !== null;
  if (SCHEDULED.has(status)) return "scheduled";
  if (JOINING.has(status)) return "joining";
  if (WAITING.has(status)) return "waiting";
  if (IN_MEETING.has(status)) return "in_meeting";
  if (REFUSED.has(status)) return admitted ? "processing" : "not_admitted";
  if (BROKEN.has(status)) return admitted ? "processing" : "failed";
  if (ENDED.has(status)) return admitted ? "processing" : "not_admitted";
  return null;
}

export const processingSettled = (bot: BotSnapshot): boolean => SETTLED.has(statusOf(bot));

export interface BotOwner {
  agentId: string;
  profile: string;
  meetingId: string;
}

export const ownsBot = (bot: BotSnapshot, owner: BotOwner): boolean =>
  bot.attributes[BOT_ATTRIBUTES.agent] === owner.agentId &&
  bot.attributes[BOT_ATTRIBUTES.profile] === owner.profile &&
  bot.attributes[BOT_ATTRIBUTES.meeting] === owner.meetingId;
