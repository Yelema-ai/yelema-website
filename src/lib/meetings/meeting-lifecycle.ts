import "server-only";
import { ApiError } from "@/lib/http";
import { BOT_ATTRIBUTES, MeetingBotError, type MeetingBots } from "./bots";
import type { Defer } from "./defer";
import { CONTENT_TYPES, meetingsRoot, writeText, type MeetingScope } from "./drive";
import { bylineOf, consentMessage, identityOf, runTurn, type MeetingRequester } from "./expert-turns";
import { parseMeetingLink } from "./link";
import { logFailure } from "./log";
import { preparePage, singlePublish } from "./meeting-page";
import { createRecord, newId, readRecord, updateRecord, writtenMeeting } from "./meeting-store";
import { ownsBot, phaseOf, processingSettled } from "./phase";
import { minutesInstruction } from "./prompt";
import { ACTIVE_PHASES, isBotId, isMeetingId, newMeetingRecord, type MeetingPhase, type MeetingRecord } from "./record";
import { TRANSCRIPT_FILE, transcriptMarkdown } from "./transcript";
import { isPresent, meetingStatus, meetingView, type MeetingView } from "./view";

export type Advance = (scope: MeetingScope, root: string, record: MeetingRecord, defer: Defer) => Promise<MeetingRecord>;

export type CurrentMeetings = () => Promise<MeetingView[]>;

export const SCHEDULED_QUIET_MS = 5 * 60_000;

const MAX_PRESENT = 3;

const isoOf = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export const botAttributes = (scope: MeetingScope, meetingId: string): Record<string, string> => ({
  [BOT_ATTRIBUTES.agent]: scope.agentId,
  [BOT_ATTRIBUTES.profile]: scope.profile,
  [BOT_ATTRIBUTES.meeting]: meetingId,
  ...(scope.userId ? { [BOT_ATTRIBUTES.user]: scope.userId } : {}),
});

export const ownedBy = (scope: MeetingScope, meetingId: string) => ({ agentId: scope.agentId, profile: scope.profile, meetingId });

function joinRefusal(e: unknown, name: string): unknown {
  if (!(e instanceof MeetingBotError)) return e;
  logFailure("join", e);
  if (e.kind === "busy") return new ApiError(429, "busy", "Trop de demandes à la fois. Réessayez dans une minute.");
  if (e.kind === "refused") return new ApiError(422, "refused", `${name} ne peut pas rejoindre cette réunion. Vérifiez le lien.`);
  return new ApiError(503, "unavailable", `${name} ne peut pas rejoindre de réunion pour le moment. Réessayez dans un instant.`);
}

function askMinutesLater(defer: Defer, scope: MeetingScope, folder: string, record: MeetingRecord): void {
  const sessionId = record.sessionId;
  if (!sessionId) return;
  defer(async () => {
    if (await runTurn(scope, sessionId, minutesInstruction(folder, record))) return;
    await updateRecord(scope, folder, (r) => (r.phase === "writing" ? { ...r, askFailed: true } : null)).catch((e) => logFailure("mark ask failed", e));
  });
}

async function setPhase(scope: MeetingScope, folder: string, phase: MeetingPhase, times: Pick<MeetingRecord, "joinedAt" | "endedAt">, fallback: MeetingRecord): Promise<MeetingRecord> {
  const result = await updateRecord(scope, folder, (r) =>
    ACTIVE_PHASES.has(r.phase) && (r.phase !== phase || r.joinedAt !== times.joinedAt || r.endedAt !== times.endedAt) ? { ...r, phase, ...times } : null
  );
  return result?.record ?? fallback;
}

export function createLifecycle(bots: MeetingBots) {
  function forgetLater(defer: Defer, botId: string): void {
    defer(() => bots.forget(botId).catch((e) => logFailure(`forget ${botId}`, e)));
  }

  const advance: Advance = async (scope, root, record, defer) => {
    const botId = record.botId;
    if (!botId || !ACTIVE_PHASES.has(record.phase)) return record;
    if (record.phase === "scheduled" && record.event && Date.parse(record.event.start) - Date.now() > SCHEDULED_QUIET_MS) return record;
    const folder = `${root}/${record.id}`;
    const bot = await bots.snapshot(botId);
    if (!ownsBot(bot, ownedBy(scope, record.id))) {
      console.error(`[meetings] bot ${botId} is not ${scope.agentId}/${scope.profile}/${record.id}`);
      return record;
    }
    const times = { joinedAt: isoOf(bot.joinedAt) ?? record.joinedAt, endedAt: isoOf(bot.endedAt) ?? record.endedAt };
    const phase = phaseOf(bot) ?? record.phase;
    if (phase !== "processing") {
      if (phase !== "not_admitted" && phase !== "failed") return setPhase(scope, folder, phase, times, record);
      const ended = await setPhase(scope, folder, phase, times, record);
      forgetLater(defer, botId);
      return ended;
    }

    const transcript = await bots.transcript(botId);
    if (transcript.state === "pending" || (transcript.state === "none" && !processingSettled(bot))) return setPhase(scope, folder, "processing", times, record);
    if (transcript.state === "none") {
      const empty = await setPhase(scope, folder, "empty", times, record);
      forgetLater(defer, botId);
      return empty;
    }

    const participants = await bots.participants(botId).catch((e) => {
      logFailure(`participants ${botId}`, e);
      return record.participants;
    });
    const now = new Date().toISOString();
    const claim = await updateRecord(scope, folder, (r) =>
      ACTIVE_PHASES.has(r.phase) ? { ...r, ...times, participants, phase: "writing", sessionId: r.sessionId ?? newId(), askedAt: now, askFailed: false } : null
    );
    if (!claim?.changed) return claim?.record ?? record;

    try {
      const body = transcriptMarkdown(transcript.segments, { startedAt: claim.record.joinedAt, participants });
      await writeText(scope, `${folder}/${TRANSCRIPT_FILE}`, body, CONTENT_TYPES.markdown, { replace: true });
    } catch (e) {
      await updateRecord(scope, folder, (r) => (r.phase === "writing" ? { ...r, phase: "processing", askedAt: null } : null)).catch((err) => logFailure("release claim", err));
      throw e;
    }
    forgetLater(defer, botId);
    askMinutesLater(defer, scope, folder, claim.record);
    return claim.record;
  };

  async function start(scope: MeetingScope, rawLink: unknown, requester: MeetingRequester, current: CurrentMeetings): Promise<MeetingView> {
    const link = parseMeetingLink(rawLink);
    if (!link) throw new ApiError(400, "invalid_link", "Collez le lien d’une réunion Google Meet ou Microsoft Teams.");
    const identity = await identityOf(scope.profile);
    const present = (await current()).filter((m) => isPresent(m.status));
    if (present.some((m) => m.link === link.url)) throw new ApiError(409, "already_joined", `${identity.name} est déjà dans cette réunion.`);
    if (present.length >= MAX_PRESENT) throw new ApiError(429, "too_many_meetings", `${identity.name} est déjà dans ${present.length} réunions. Réessayez quand l’une d’elles sera terminée.`);
    const root = await meetingsRoot(scope);
    const now = new Date();
    const created = await createRecord(scope, root, now, (id) => newMeetingRecord(id, link, { name: requester.name, email: requester.email }, bylineOf(identity, requester), now));
    const folder = `${root}/${created.id}`;
    let botId: string;
    try {
      botId = await bots.join({
        link: link.url,
        name: identity.name,
        imageUrl: identity.imageUrl,
        message: consentMessage(identity, requester),
        attributes: botAttributes(scope, created.id),
      });
    } catch (e) {
      await updateRecord(scope, folder, (r) => (r.botId ? null : { ...r, phase: "failed" })).catch((err) => logFailure("mark join failed", err));
      throw joinRefusal(e, identity.name);
    }
    const saved = await updateRecord(scope, folder, (r) => (r.botId ? null : { ...r, botId }));
    return meetingView(saved?.record ?? { ...created, botId }, null, Date.now());
  }

  async function rewrite(scope: MeetingScope, id: string, defer: Defer): Promise<MeetingView> {
    const { folder, record, minutes } = await writtenMeeting(scope, id);
    if (meetingStatus(record, minutes, Date.now()) !== "stalled") throw new ApiError(409, "not_stalled", "Le compte rendu est déjà en cours de rédaction.");
    if (minutes) return meetingView(await preparePage(scope, folder, record, minutes, defer, singlePublish(), true), minutes, Date.now());
    const now = new Date().toISOString();
    const claim = await updateRecord(scope, folder, (r) => (r.phase === "writing" ? { ...r, sessionId: r.sessionId ?? newId(), askedAt: now, askFailed: false } : null));
    if (!claim?.changed) throw new ApiError(409, "not_stalled", "Le compte rendu est déjà en cours de rédaction.");
    askMinutesLater(defer, scope, folder, claim.record);
    return meetingView(claim.record, null, Date.now());
  }

  async function onBotEvent(scope: MeetingScope, meetingId: string, botId: string, defer: Defer): Promise<MeetingRecord | null> {
    if (!isMeetingId(meetingId) || !isBotId(botId)) return null;
    const root = await meetingsRoot(scope);
    const folder = `${root}/${meetingId}`;
    let record = await readRecord(scope, folder);
    if (!record) return null;
    if (!record.botId) {
      const bot = await bots.snapshot(botId);
      if (!ownsBot(bot, ownedBy(scope, meetingId))) return null;
      record = (await updateRecord(scope, folder, (r) => (r.botId ? null : { ...r, botId })))?.record ?? record;
    }
    if (record.botId !== botId) return null;
    return advance(scope, root, record, defer);
  }

  return { advance, start, rewrite, onBotEvent };
}
