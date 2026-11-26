import "server-only";
import { Agent37Error, instanceFetch } from "@/lib/agent37";
import { boundedText } from "@/lib/bounded-body";
import { assertInDrive, DRIVE_ROOT } from "@/lib/drive";
import { expertDriveFolders } from "@/lib/expert-folders";
import { JSON_TIMEOUT_MS, withTimeout } from "@/lib/fetch-timeout";
import { ApiError } from "@/lib/http";
import { memo } from "@/lib/memo";
import type { FileEntry, FileListResponse } from "@/lib/types";

export interface MeetingScope {
  agentId: string;
  profile: string;
  userId: string | null;
  workspace: string | null;
}

export interface Versioned {
  text: string;
  modified: number;
}

export interface JsonFile<T> {
  name: string;
  maxBytes: number;
  parse: (text: string | null) => T | null;
  serialize: (value: T) => string;
  busy: string;
}

export interface Updated<T> {
  value: T;
  changed: boolean;
}

export const CONTENT_TYPES = {
  json: "application/json; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
} as const;

export class WriteConflict extends Error {
  constructor(path: string) {
    super(`write conflict on ${path}`);
    this.name = "WriteConflict";
  }
}

export const READ_CONCURRENCY = 8;

const MEETINGS_DIR = "Réunions";
const UPDATE_ATTEMPTS = 4;
const FOLDER_TTL_MS = 10 * 60_000;
const TEXT_TTL_MS = 60 * 60_000;
const TEXT_ENTRIES = 200;
const roots = memo<string>({ ttlMs: FOLDER_TTL_MS });
const texts = memo<Versioned>({ ttlMs: TEXT_TTL_MS, maxEntries: TEXT_ENTRIES });
const textKey = (scope: MeetingScope, path: string) => [scope.agentId, scope.userId ?? "", path].join("\n");

function headersFor(scope: MeetingScope, extra: Record<string, string> = {}): Record<string, string> {
  return scope.userId ? { "X-Yelema-User": scope.userId, ...extra } : extra;
}

async function upstreamFailure(res: Response, what: string): Promise<never> {
  const detail = await res.text().catch(() => "");
  throw new Agent37Error(res.status, "drive_error", `${what}: ${res.status} ${detail.slice(0, 300)}`);
}

export async function listEntries(scope: MeetingScope, path: string): Promise<FileEntry[] | null> {
  const res = await instanceFetch(scope.agentId, `/v1/files?path=${encodeURIComponent(assertInDrive(path))}`, withTimeout({ headers: headersFor(scope) }, JSON_TIMEOUT_MS));
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.ok) return upstreamFailure(res, `list ${path}`);
  const listing = (await res.json()) as FileListResponse;
  return Array.isArray(listing.entries) ? listing.entries : [];
}

export async function readText(scope: MeetingScope, path: string, maxBytes: number): Promise<string | null> {
  const res = await instanceFetch(scope.agentId, `/v1/files/content?path=${encodeURIComponent(assertInDrive(path))}`, withTimeout({ headers: headersFor(scope) }, JSON_TIMEOUT_MS));
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.ok) return upstreamFailure(res, `read ${path}`);
  const text = await boundedText(res, maxBytes);
  if (text === null) console.error(`[meetings] oversized file ${path} on ${scope.agentId}`);
  return text;
}

async function readAt(scope: MeetingScope, path: string, modified: number, maxBytes: number): Promise<Versioned | null> {
  const key = textKey(scope, assertInDrive(path));
  const kept = texts.peek(key);
  if (kept?.modified === modified) return kept;
  const text = await readText(scope, path, maxBytes);
  if (text === null) {
    texts.drop(key);
    return null;
  }
  const read = { text, modified };
  texts.put(key, read);
  return read;
}

export async function readListed(scope: MeetingScope, folder: string, entries: FileEntry[], name: string, maxBytes: number): Promise<Versioned | null> {
  const entry = entries.find((e) => e.name === name && e.type === "file");
  return entry ? readAt(scope, `${folder}/${name}`, entry.modified, maxBytes) : null;
}

export async function readVersioned(scope: MeetingScope, folder: string, name: string, maxBytes: number): Promise<Versioned | null> {
  const entries = await listEntries(scope, folder);
  return entries ? readListed(scope, folder, entries, name, maxBytes) : null;
}

async function writtenModified(res: Response): Promise<number | null> {
  const entry = (await res.json().catch(() => null)) as { modified?: unknown } | null;
  return typeof entry?.modified === "number" && Number.isFinite(entry.modified) ? entry.modified : null;
}

export type WriteMode = { create: true } | { expectedModified: number } | { replace: true };

export async function writeText(scope: MeetingScope, path: string, body: string, contentType: string, mode: WriteMode): Promise<void> {
  const qs = new URLSearchParams({ path: assertInDrive(path), overwrite: "create" in mode ? "false" : "true" });
  const headers = headersFor(scope, {
    "Content-Type": contentType,
    ...("expectedModified" in mode ? { "X-Expected-Mtime": String(mode.expectedModified) } : {}),
  });
  const key = textKey(scope, assertInDrive(path));
  const res = await instanceFetch(scope.agentId, `/v1/files/content?${qs.toString()}`, withTimeout({ method: "PUT", headers, body }, JSON_TIMEOUT_MS));
  if (res.status === 409 || res.status === 412) {
    texts.drop(key);
    await res.body?.cancel().catch(() => undefined);
    throw new WriteConflict(path);
  }
  if (!res.ok) {
    texts.drop(key);
    return upstreamFailure(res, `write ${path}`);
  }
  const modified = await writtenModified(res);
  if (modified === null) texts.drop(key);
  else texts.put(key, { text: body, modified });
}

export async function updateJson<T>(
  scope: MeetingScope,
  folder: string,
  file: JsonFile<T>,
  change: (current: T) => T | null,
  read?: Versioned | null
): Promise<Updated<T> | null> {
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const stored = attempt === 0 && read !== undefined ? read : await readVersioned(scope, folder, file.name, file.maxBytes);
    const current = file.parse(stored?.text ?? null);
    if (current === null) return null;
    const next = change(current);
    if (!next) return { value: current, changed: false };
    try {
      await writeText(scope, `${folder}/${file.name}`, file.serialize(next), CONTENT_TYPES.json, stored ? { expectedModified: stored.modified } : { create: true });
      return { value: next, changed: true };
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
    }
  }
  throw new ApiError(409, "busy", file.busy);
}

export async function removePath(scope: MeetingScope, path: string): Promise<void> {
  texts.drop(textKey(scope, assertInDrive(path)));
  const res = await instanceFetch(scope.agentId, `/v1/files?path=${encodeURIComponent(assertInDrive(path))}`, withTimeout({ method: "DELETE", headers: headersFor(scope) }, JSON_TIMEOUT_MS));
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return;
  }
  if (!res.ok) return upstreamFailure(res, `remove ${path}`);
  await res.body?.cancel().catch(() => undefined);
}

export function meetingsRoot(scope: MeetingScope): Promise<string> {
  return roots.get([scope.agentId, scope.userId ?? "", scope.profile].join("\n"), async () => {
    const candidates = await expertDriveFolders(scope.profile);
    if (!candidates.length) throw new Agent37Error(404, "not_found", `No drive folder for ${scope.profile}`);
    const present = new Set(((await listEntries(scope, DRIVE_ROOT)) ?? []).filter((e) => e.type === "directory").map((e) => e.name));
    const folder = candidates.find((c) => present.has(c)) ?? candidates[0];
    return `${DRIVE_ROOT}/${folder}/${MEETINGS_DIR}`;
  });
}
