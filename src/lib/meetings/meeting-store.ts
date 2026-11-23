import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/http";
import { CONTENT_TYPES, listEntries, meetingsRoot, readListed, readText, updateJson, writeText, WriteConflict, type JsonFile, type MeetingScope } from "./drive";
import { MINUTES_FILE, MINUTES_MAX_BYTES, parseMinutes, type MeetingMinutes } from "./minutes";
import { RECORD_FILE, RECORD_MAX_BYTES, isMeetingId, meetingIdAt, parseMeetingRecord, serializeRecord, type MeetingRecord } from "./record";

export type Change = (record: MeetingRecord) => MeetingRecord | null;

export interface RecordUpdate {
  record: MeetingRecord;
  changed: boolean;
}

export interface StoredMeeting {
  folder: string;
  record: MeetingRecord;
  minutesText: string | null;
}

export interface WrittenMeeting {
  folder: string;
  record: MeetingRecord;
  minutes: MeetingMinutes | null;
}

const CREATE_ATTEMPTS = 3;

const RECORD_JSON: JsonFile<MeetingRecord> = {
  name: RECORD_FILE,
  maxBytes: RECORD_MAX_BYTES,
  parse: (text) => (text === null ? null : parseMeetingRecord(text)),
  serialize: serializeRecord,
  busy: "Cette réunion est en cours de mise à jour. Réessayez dans un instant.",
};

export const newId = () => randomUUID().replace(/-/g, "");

export const notFound = () => new ApiError(404, "not_found", "Cette réunion est introuvable.");

export function recordOf(scope: MeetingScope, folder: string, text: string | null): MeetingRecord | null {
  if (text === null) return null;
  const record = parseMeetingRecord(text);
  if (!record) console.error(`[meetings] unreadable record ${folder} on ${scope.agentId}`);
  return record;
}

export function minutesOf(scope: MeetingScope, folder: string, text: string | null): MeetingMinutes | null {
  if (text === null) return null;
  const minutes = parseMinutes(text);
  if (!minutes) console.error(`[meetings] unreadable minutes ${folder} on ${scope.agentId}`);
  return minutes;
}

export const readRecord = async (scope: MeetingScope, folder: string) => recordOf(scope, folder, await readText(scope, `${folder}/${RECORD_FILE}`, RECORD_MAX_BYTES));

const readMinutes = async (scope: MeetingScope, folder: string) => minutesOf(scope, folder, await readText(scope, `${folder}/${MINUTES_FILE}`, MINUTES_MAX_BYTES));

export async function updateRecord(scope: MeetingScope, folder: string, change: Change): Promise<RecordUpdate | null> {
  const updated = await updateJson(scope, folder, RECORD_JSON, change);
  return updated && { record: updated.value, changed: updated.changed };
}

export async function createRecord(scope: MeetingScope, root: string, at: Date, record: (id: string) => MeetingRecord): Promise<MeetingRecord> {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const candidate = record(meetingIdAt(new Date(at.getTime() + attempt * 1000)));
    try {
      await writeText(scope, `${root}/${candidate.id}/${RECORD_FILE}`, serializeRecord(candidate), CONTENT_TYPES.json, { create: true });
      return candidate;
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
    }
  }
  throw new ApiError(409, "busy", "Une réunion vient d’être lancée. Réessayez dans un instant.");
}

export async function storedMeeting(scope: MeetingScope, root: string, id: string): Promise<StoredMeeting | null> {
  const folder = `${root}/${id}`;
  const entries = await listEntries(scope, folder);
  if (!entries) return null;
  const [recordFile, minutesFile] = await Promise.all([
    readListed(scope, folder, entries, RECORD_FILE, RECORD_MAX_BYTES),
    readListed(scope, folder, entries, MINUTES_FILE, MINUTES_MAX_BYTES),
  ]);
  const record = recordOf(scope, folder, recordFile?.text ?? null);
  return record ? { folder, record, minutesText: minutesFile?.text ?? null } : null;
}

export async function writtenMeeting(scope: MeetingScope, id: string): Promise<WrittenMeeting> {
  if (!isMeetingId(id)) throw notFound();
  const folder = `${await meetingsRoot(scope)}/${id}`;
  const record = await readRecord(scope, folder);
  if (!record) throw notFound();
  const minutes = record.phase === "writing" ? await readMinutes(scope, folder) : null;
  return { folder, record, minutes };
}

export async function meetingIds(scope: MeetingScope, root: string): Promise<string[]> {
  const entries = (await listEntries(scope, root)) ?? [];
  return entries
    .filter((e) => e.type === "directory" && isMeetingId(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}
