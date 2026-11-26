import "server-only";
import { withTimeout } from "@/lib/fetch-timeout";
import { isBotId } from "@/lib/meetings/record";
import { MeetingBotError, type BotSnapshot, type BotTranscript, type JoinRequest, type MeetingBots, type MeetingBotFailure } from "@/lib/meetings/bots";
import { meetstreamApiKey } from "@/lib/runtime-config";
import { createBotBody, parseBotDetail, parseCreatedBot, parseParticipants, parseTranscript } from "./wire";

const BASE = "https://api.meetstream.ai/api/v1";
const TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const failureOf = (status: number): MeetingBotFailure => (status === 429 ? "busy" : status === 400 || status === 404 || status === 409 || status === 422 ? "refused" : "unavailable");

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const key = meetstreamApiKey();
  if (!key) throw new MeetingBotError("unavailable", "MEETSTREAM_API_KEY is not set");
  try {
    return await fetch(
      `${BASE}${path}`,
      withTimeout(
        {
          ...init,
          headers: { Authorization: `Token ${key}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
          cache: "no-store",
        },
        TIMEOUT_MS
      )
    );
  } catch (e) {
    throw new MeetingBotError("unavailable", `MeetStream ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function bodyOf(res: Response, path: string): Promise<unknown> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new MeetingBotError("unavailable", `MeetStream ${path}: oversized answer`);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new MeetingBotError("unavailable", `MeetStream ${path}: oversized answer`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new MeetingBotError("unavailable", `MeetStream ${path}: unreadable answer (${res.status})`);
  }
}

async function failed(res: Response, path: string): Promise<never> {
  const detail = await res.text().catch(() => "");
  throw new MeetingBotError(failureOf(res.status), `MeetStream ${path}: ${res.status} ${detail.slice(0, 500)}`);
}

function scheduledPath(botId: string): string {
  if (!isBotId(botId)) throw new MeetingBotError("refused", "Invalid bot id");
  return `/calendar/scheduled_bots/${botId}`;
}

function botPath(botId: string, action: string): string {
  if (!isBotId(botId)) throw new MeetingBotError("refused", "Invalid bot id");
  return `/bots/${botId}/${action}`;
}

export const meetstreamBots: MeetingBots = {
  async join(join: JoinRequest): Promise<string> {
    const path = "/bots/create_bot";
    const res = await request(path, { method: "POST", body: JSON.stringify(createBotBody(join)) });
    if (!res.ok) return failed(res, path);
    const botId = parseCreatedBot(await bodyOf(res, path));
    if (!botId || !isBotId(botId)) throw new MeetingBotError("unavailable", `MeetStream ${path}: no bot id`);
    return botId;
  },

  async snapshot(botId: string): Promise<BotSnapshot> {
    const path = botPath(botId, "detail");
    const res = await request(path);
    if (!res.ok) return failed(res, path);
    const snapshot = parseBotDetail(await bodyOf(res, path));
    if (!snapshot) throw new MeetingBotError("unavailable", `MeetStream ${path}: unreadable detail`);
    return snapshot;
  },

  async transcript(botId: string): Promise<BotTranscript> {
    const path = botPath(botId, "get_transcript");
    const res = await request(path);
    if (res.status === 202) {
      await res.body?.cancel().catch(() => undefined);
      return { state: "pending" };
    }
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      return { state: "none" };
    }
    if (!res.ok) return failed(res, path);
    const segments = parseTranscript(await bodyOf(res, path));
    if (!segments) throw new MeetingBotError("unavailable", `MeetStream ${path}: unreadable transcript`);
    return segments.length ? { state: "ready", segments } : { state: "none" };
  },

  async participants(botId: string): Promise<string[]> {
    const path = botPath(botId, "get_participants");
    const res = await request(path);
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }
    if (!res.ok) return failed(res, path);
    return parseParticipants(await bodyOf(res, path));
  },

  async forget(botId: string): Promise<void> {
    const path = botPath(botId, "delete");
    const res = await request(path, { method: "DELETE" });
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok && res.status !== 404) throw new MeetingBotError(failureOf(res.status), `MeetStream ${path}: ${res.status}`);
  },

  async reschedule(botId: string, joinAt: string, link: string): Promise<void> {
    const path = scheduledPath(botId);
    const res = await request(path, { method: "PATCH", body: JSON.stringify({ scheduled_join_time: joinAt, meeting_link: link }) });
    if (!res.ok) return failed(res, path);
    await res.body?.cancel().catch(() => undefined);
  },

  async cancelScheduled(botId: string): Promise<void> {
    const path = scheduledPath(botId);
    const res = await request(path, { method: "DELETE" });
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok && res.status !== 404) throw new MeetingBotError(failureOf(res.status), `MeetStream ${path}: ${res.status}`);
  },
};
