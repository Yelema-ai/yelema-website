import "server-only";
import { createHash } from "node:crypto";
import { branding } from "@/config/branding";
import type { Defer } from "./defer";
import { CONTENT_TYPES, readText, writeText, type MeetingScope } from "./drive";
import { runTurn } from "./expert-turns";
import { minutesFrameHtml } from "./frame-html";
import { logFailure } from "./log";
import { newId, updateRecord } from "./meeting-store";
import type { MeetingMinutes } from "./minutes";
import { PAGE_FILE, PAGE_RESULT_FILE, RESULT_MAX_BYTES, parsePageResult, publishInstruction } from "./prompt";
import type { MeetingRecord } from "./record";
import { STALL_AFTER_MS } from "./view";

export interface PublishBudget {
  left: number;
}

const MAX_PUBLISHES_PER_READ = 3;

export const readBudget = (): PublishBudget => ({ left: MAX_PUBLISHES_PER_READ });

export const singlePublish = (): PublishBudget => ({ left: 1 });

function frameHtml(record: MeetingRecord, minutes: MeetingMinutes): { html: string; hash: string } {
  const html = minutesFrameHtml(minutes, record, branding.appName);
  return { html, hash: createHash("sha256").update(html).digest("hex") };
}

async function settlePublish(scope: MeetingScope, folder: string, record: MeetingRecord): Promise<MeetingRecord> {
  const attempt = record.publish;
  if (!attempt || attempt.failed) return record;
  const text = await readText(scope, `${folder}/${PAGE_RESULT_FILE}`, RESULT_MAX_BYTES);
  const result = text === null ? null : parsePageResult(text);
  if (result?.attempt !== attempt.id) return record;
  const saved = await updateRecord(scope, folder, (r) => {
    if (r.publish?.id !== attempt.id || r.publish.failed) return null;
    return "frame" in result ? { ...r, frame: { ...result.frame, hash: attempt.hash }, publish: null } : { ...r, publish: { ...r.publish, failed: true } };
  });
  if (result && "error" in result) console.error(`[meetings] page not published ${scope.agentId}/${record.id}: ${result.error}`);
  return saved?.record ?? record;
}

export async function preparePage(
  scope: MeetingScope,
  folder: string,
  stored: MeetingRecord,
  minutes: MeetingMinutes,
  defer: Defer,
  budget: PublishBudget,
  retry = false
): Promise<MeetingRecord> {
  const { html, hash } = frameHtml(stored, minutes);
  if (stored.frame?.hash === hash) return stored;
  const record = await settlePublish(scope, folder, stored);
  if (record.frame?.hash === hash) return record;
  const now = Date.now();
  const inFlight = (a: MeetingRecord["publish"]) => !!a && a.hash === hash && !a.failed && now - Date.parse(a.at) < STALL_AFTER_MS;
  const blocked = (a: MeetingRecord["publish"]) => inFlight(a) || (!retry && a?.hash === hash);
  if (blocked(record.publish) || budget.left <= 0) return record;
  budget.left -= 1;

  const attempt = { id: newId(), hash, at: new Date(now).toISOString(), failed: false };
  const sessionId = record.sessionId ?? newId();
  const claim = await updateRecord(scope, folder, (r) => (r.frame?.hash === hash || blocked(r.publish) ? null : { ...r, sessionId: r.sessionId ?? sessionId, publish: attempt }));
  if (!claim?.changed) return claim?.record ?? record;
  const markFailed = () =>
    updateRecord(scope, folder, (r) => (r.publish?.id === attempt.id ? { ...r, publish: { ...attempt, failed: true } } : null)).catch((e) => logFailure("mark publish failed", e));
  try {
    await writeText(scope, `${folder}/${PAGE_FILE}`, html, CONTENT_TYPES.html, { replace: true });
  } catch (e) {
    await markFailed();
    throw e;
  }
  const turnSession = claim.record.sessionId ?? sessionId;
  defer(async () => {
    if (!(await runTurn(scope, turnSession, publishInstruction(folder, attempt.id, claim.record.frame?.id ?? null)))) await markFailed();
  });
  return claim.record;
}
