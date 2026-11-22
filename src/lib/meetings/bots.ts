export interface BotSnapshot {
  status: string;
  joinedAt: number | null;
  endedAt: number | null;
  attributes: Record<string, string>;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number | null;
}

export type BotTranscript = { state: "ready"; segments: TranscriptSegment[] } | { state: "pending" } | { state: "none" };

export interface JoinRequest {
  link: string;
  name: string;
  imageUrl: string | null;
  message: string;
  attributes: Record<string, string>;
  joinAt?: string | null;
}

export interface MeetingBots {
  join(request: JoinRequest): Promise<string>;
  snapshot(botId: string): Promise<BotSnapshot>;
  transcript(botId: string): Promise<BotTranscript>;
  participants(botId: string): Promise<string[]>;
  forget(botId: string): Promise<void>;
  reschedule(botId: string, joinAt: string, link: string): Promise<void>;
  cancelScheduled(botId: string): Promise<void>;
}

export type MeetingBotFailure = "busy" | "refused" | "unavailable";

export class MeetingBotError extends Error {
  readonly kind: MeetingBotFailure;
  constructor(kind: MeetingBotFailure, message: string) {
    super(message);
    this.name = "MeetingBotError";
    this.kind = kind;
  }
}

export const BOT_ATTRIBUTES = { agent: "agent", profile: "profile", meeting: "meeting", user: "user" } as const;
