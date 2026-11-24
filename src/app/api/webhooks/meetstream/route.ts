import { createHash } from "node:crypto";
import { after } from "next/server";
import { boundedText } from "@/lib/bounded-body";
import { BOT_ATTRIBUTES } from "@/lib/meetings/bots";
import type { MeetingScope } from "@/lib/meetings/drive";
import { readAgenda, memberIdentityOf } from "@/lib/meetings/calendars";
import { memo } from "@/lib/memo";
import { ACTIVE_PHASES, isMeetingId } from "@/lib/meetings/record";
import { meetings, type Defer } from "@/lib/meetings/service";
import { SIGNATURE_HEADER, WEBHOOK_MAX_BYTES, parseWebhookEvent, signatureMatches } from "@/lib/meetstream/webhook";
import { asService } from "@/lib/service-call";
import { isProfileId } from "@/lib/profile-id";
import { meetstreamWebhookSecret } from "@/lib/runtime-config";
import { sharedCacheOn, sharedLayer, vercelRuntimeCache } from "@/lib/shared-cache";

const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const delivered = memo<true>({ ttlMs: 30 * 60_000, maxEntries: 5000 });
const seenElsewhere = sharedCacheOn(process.env) ? sharedLayer<true>("meetstream", 30 * 60, () => vercelRuntimeCache("webhooks")) : null;

function targetOf(attributes: Record<string, string>): { scope: MeetingScope; meetingId: string } | null {
  const agentId = attributes[BOT_ATTRIBUTES.agent];
  const profile = attributes[BOT_ATTRIBUTES.profile];
  const meetingId = attributes[BOT_ATTRIBUTES.meeting];
  const userId = attributes[BOT_ATTRIBUTES.user];
  if (!agentId || !PLAIN_ID.test(agentId) || !profile || !isProfileId(profile) || !isMeetingId(meetingId)) return null;
  if (userId !== undefined && !PLAIN_ID.test(userId)) return null;
  return { scope: { agentId, profile, userId: userId ?? null, workspace: null }, meetingId };
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const secret = meetstreamWebhookSecret();
  if (!secret) return answer(503, { error: "not configured" });
  const raw = await boundedText(request, WEBHOOK_MAX_BYTES);
  if (raw === null) return answer(413, { error: "too large" });
  if (!signatureMatches(raw, request.headers.get(SIGNATURE_HEADER), secret)) return answer(401, { error: "invalid signature" });
  const digest = createHash("sha256").update(raw).digest("hex");
  // The same delivery again (a retry, a replay): acknowledged, not processed; across functions when the shared cache is on.
  if (delivered.peek(digest) || (await seenElsewhere?.read(`meetstream:${digest}`))) return answer(200, { ok: true });
  delivered.put(digest, true);
  if (seenElsewhere) after(() => seenElsewhere.write(`meetstream:${digest}`, true));
  const event = parseWebhookEvent(raw);
  const target = event ? targetOf(event.attributes) : null;
  if (!event || !target) return answer(200, { ok: true });
  after(() => asService("meetstream-webhook", async () => {
    const tasks: Promise<void>[] = [];
    const defer: Defer = (task) => {
      tasks.push(task().catch((e) => console.error("[meetstream] deferred task:", e instanceof Error ? e.message : e)));
    };
    try {
      const record = await meetings.onBotEvent(target.scope, target.meetingId, event.botId, defer);
      const userId = target.scope.userId;
      if (record && userId && !ACTIVE_PHASES.has(record.phase)) {
        const member = memberIdentityOf(userId);
        await meetings
          .syncAfterMeeting(target.scope, { host: null, calendars: async () => [], read: (calendar, now) => readAgenda(member, calendar, now) })
          .catch((e) => console.error("[meetstream] agenda sync:", e instanceof Error ? e.message : e));
      }
    } catch (e) {
      console.error(`[meetstream] ${event.event} for ${event.botId}:`, e instanceof Error ? e.message : e);
    }
    await Promise.all(tasks);
  }));
  return answer(200, { ok: true });
}

export const maxDuration = 800;
