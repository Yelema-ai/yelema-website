import "server-only";
import { createHash } from "node:crypto";
import { runPool } from "@/lib/bulk";
import { ApiError } from "@/lib/http";
import {
  AGENDA_FILE,
  AGENDA_MAX_BYTES,
  applyAgendaChange,
  autoKeys,
  isWanted,
  parseAgendaSettings,
  sameHost,
  schedulable,
  serializeAgendaSettings,
  type AgendaCalendar,
  type AgendaChange,
  type AgendaEventChange,
  type AgendaItem,
  type AgendaSettings,
  type AgendaToggle,
  type AgendaView,
} from "./agenda";
import type { MeetingBots } from "./bots";
import { AGENDA_HORIZON_DAYS, MAX_EVENTS, type AgendaEvent } from "./calendar";
import type { ConnectedCalendar } from "./calendars";
import {
  CONTENT_TYPES,
  READ_CONCURRENCY,
  listEntries,
  meetingsRoot,
  readListed,
  readText,
  readVersioned,
  removePath,
  updateJson,
  writeText,
  WriteConflict,
  type JsonFile,
  type MeetingScope,
  type Versioned,
} from "./drive";
import { bylineOf, consentMessage, identityOf, type ExpertIdentity, type MeetingRequester } from "./expert-turns";
import { isObject } from "./json";
import { logFailure } from "./log";
import { botAttributes, ownedBy } from "./meeting-lifecycle";
import { createRecord, readRecord, updateRecord } from "./meeting-store";
import { ownsBot } from "./phase";
import { isMeetingId, newMeetingRecord, type MeetingRecord } from "./record";
import { meetingStatus } from "./view";

export interface AgendaPorts {
  host: MeetingRequester | null;
  calendars: () => Promise<ConnectedCalendar[]>;
  read: (calendar: AgendaCalendar, now: number, maxAgeMs: number) => Promise<AgendaEvent[]>;
}

export type AgendaSettingChange = Exclude<AgendaChange, AgendaEventChange>;

interface AgendaLock {
  key: string;
  meetingId: string | null;
}

interface HeldLock {
  name: string;
  lock: AgendaLock;
  stale: boolean;
}

interface Synced {
  record: MeetingRecord | null;
  changed: boolean;
}

const SCHEDULE_CONCURRENCY = 4;
const SYNC_BUDGET_MS = 120_000;
const LOCK_MAX_BYTES = 4096;
const RETRY_FAILED_AFTER_MS = 15 * 60_000;
const LOCK_PREFIX = ".agenda-";
const LOCK_STALE_MS = 10 * 60_000;
const KEEP_LOCK_AFTER_MS = 2 * 86_400_000;
const AGENDA_FRESH_MS = 60_000;
const AGENDA_REUSE_MS = 15 * 60_000;
const UNCHANGED: Synced = { record: null, changed: false };

const AGENDA_JSON: JsonFile<AgendaSettings> = {
  name: AGENDA_FILE,
  maxBytes: AGENDA_MAX_BYTES,
  parse: parseAgendaSettings,
  serialize: serializeAgendaSettings,
  busy: "L’agenda est en cours de mise à jour. Réessayez dans un instant.",
};

const lockName = (key: string) => `${LOCK_PREFIX}${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json`;

function parseLock(text: string | null): AgendaLock | null {
  if (!text || text.length > LOCK_MAX_BYTES) return null;
  try {
    const d: unknown = JSON.parse(text);
    if (!isObject(d) || typeof d.key !== "string") return null;
    const meetingId = d.meetingId;
    if (meetingId === null) return { key: d.key, meetingId: null };
    return isMeetingId(meetingId) ? { key: d.key, meetingId } : null;
  } catch {
    return null;
  }
}

const coveredUntilOf = (events: AgendaEvent[], now: number): number =>
  events.length >= MAX_EVENTS ? Date.parse(events[events.length - 1].start) : now + AGENDA_HORIZON_DAYS * 86_400_000;

const itemOf = (event: AgendaEvent, record: MeetingRecord | null, now: number): AgendaItem => ({
  key: event.key,
  title: event.title,
  start: event.start,
  end: event.end,
  platform: event.link.platform,
  pending: event.pending,
  status: record ? meetingStatus(record, null, now) : null,
});

async function saveAgenda(scope: MeetingScope, root: string, change: (s: AgendaSettings) => AgendaSettings | null, read?: Versioned | null): Promise<AgendaSettings> {
  const saved = await updateJson(scope, root, AGENDA_JSON, change, read);
  return saved?.value ?? parseAgendaSettings(null);
}

async function agendaSettings(scope: MeetingScope, root: string): Promise<AgendaSettings> {
  return parseAgendaSettings((await readVersioned(scope, root, AGENDA_FILE, AGENDA_MAX_BYTES))?.text ?? null);
}

async function readLocks(scope: MeetingScope, root: string): Promise<{ name: string; modified: number; lock: AgendaLock | null }[]> {
  const entries = (await listEntries(scope, root)) ?? [];
  const files = entries.filter((e) => e.type === "file" && e.name.startsWith(LOCK_PREFIX));
  const results = await runPool(files, READ_CONCURRENCY, async (f) => ({
    name: f.name,
    modified: f.modified,
    lock: parseLock((await readListed(scope, root, entries, f.name, LOCK_MAX_BYTES))?.text ?? null),
  }));
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

async function dropLock(scope: MeetingScope, root: string, name: string): Promise<void> {
  await removePath(scope, `${root}/${name}`).catch((e) => logFailure("drop lock", e));
}

async function closeMissed(scope: MeetingScope, root: string, record: MeetingRecord): Promise<Synced> {
  if (record.phase !== "scheduled" || record.botId) return { record, changed: false };
  const closed = await updateRecord(scope, `${root}/${record.id}`, (r) => (r.phase === "scheduled" && !r.botId ? { ...r, phase: "failed" } : null));
  return { record: closed?.record ?? record, changed: closed?.changed ?? false };
}

export function createAgendaSync(bots: MeetingBots) {
  async function ownedScheduledBot(scope: MeetingScope, record: MeetingRecord): Promise<string | null> {
    if (!record.botId) return null;
    const bot = await bots.snapshot(record.botId);
    if (ownsBot(bot, ownedBy(scope, record.id))) return record.botId;
    throw new Error(`bot ${record.botId} is not ${scope.agentId}/${scope.profile}/${record.id}`);
  }

  async function unschedule(scope: MeetingScope, root: string, record: MeetingRecord, lock: string): Promise<boolean> {
    try {
      const botId = await ownedScheduledBot(scope, record);
      if (botId) await bots.cancelScheduled(botId);
    } catch (e) {
      logFailure(`cancel scheduled ${record.id}`, e);
      return false;
    }
    await removePath(scope, `${root}/${record.id}`);
    await removePath(scope, `${root}/${lock}`);
    return true;
  }

  async function reschedule(scope: MeetingScope, root: string, record: MeetingRecord, event: AgendaEvent): Promise<MeetingRecord> {
    try {
      const botId = await ownedScheduledBot(scope, record);
      if (!botId) return record;
      await bots.reschedule(botId, event.start, event.link.url);
    } catch (e) {
      logFailure(`reschedule ${record.id}`, e);
      return record;
    }
    const saved = await updateRecord(scope, `${root}/${record.id}`, (r) =>
      r.phase === "scheduled" ? { ...r, link: event.link.url, platform: event.link.platform, event: { key: event.key, title: event.title, start: event.start, end: event.end } } : null
    );
    return saved?.record ?? record;
  }

  async function joinScheduled(scope: MeetingScope, folder: string, record: MeetingRecord, event: AgendaEvent, identity: ExpertIdentity, host: MeetingRequester | null): Promise<MeetingRecord> {
    let botId: string;
    try {
      botId = await bots.join({
        link: event.link.url,
        name: identity.name,
        imageUrl: identity.imageUrl,
        message: consentMessage(identity, host),
        joinAt: event.start,
        attributes: botAttributes(scope, record.id),
      });
    } catch (e) {
      logFailure(`schedule ${event.key}`, e);
      return (await updateRecord(scope, folder, (r) => (r.botId ? null : { ...r, phase: "failed" })))?.record ?? { ...record, phase: "failed" };
    }
    const cancelOrphan = () => bots.cancelScheduled(botId).catch((e) => logFailure(`cancel orphan ${botId}`, e));
    try {
      const saved = await updateRecord(scope, folder, (r) => (r.botId ? null : { ...r, botId }));
      if (saved?.record.botId === botId) return saved.record;
    } catch (e) {
      await cancelOrphan();
      throw e;
    }
    await cancelOrphan();
    return record;
  }

  async function schedule(scope: MeetingScope, root: string, event: AgendaEvent, host: MeetingRequester | null): Promise<MeetingRecord | null> {
    const lock = `${root}/${lockName(event.key)}`;
    try {
      await writeText(scope, lock, JSON.stringify({ key: event.key, meetingId: null }), CONTENT_TYPES.json, { create: true });
    } catch (e) {
      if (e instanceof WriteConflict) return null;
      throw e;
    }
    const identity = await identityOf(scope.profile);
    const scheduled = { key: event.key, title: event.title, start: event.start, end: event.end };
    const requester = { name: host?.name ?? null, email: host?.email ?? null };
    const created = await createRecord(scope, root, new Date(event.start), (id) => newMeetingRecord(id, event.link, requester, bylineOf(identity, host), new Date(), scheduled));
    await writeText(scope, lock, JSON.stringify({ key: event.key, meetingId: created.id }), CONTENT_TYPES.json, { replace: true });
    return joinScheduled(scope, `${root}/${created.id}`, created, event, identity, host);
  }

  async function scheduleNew(scope: MeetingScope, root: string, event: AgendaEvent, host: MeetingRequester | null): Promise<Synced> {
    const record = await schedule(scope, root, event, host).catch((e) => {
      logFailure(`schedule ${event.key}`, e);
      return null;
    });
    return record ? { record, changed: true } : UNCHANGED;
  }

  async function reconcile(scope: MeetingScope, root: string, settings: AgendaSettings, held: HeldLock, event: AgendaEvent | undefined, now: number, coveredUntil: number): Promise<Synced> {
    const record = held.lock.meetingId ? await readRecord(scope, `${root}/${held.lock.meetingId}`) : null;
    if (!record) {
      if (held.stale) await dropLock(scope, root, held.name);
      return UNCHANGED;
    }
    const start = Date.parse(record.event?.start ?? record.createdAt);
    const waiting = record.phase === "scheduled" || (record.phase === "failed" && !record.botId);
    if (!waiting) {
      if (start >= now - KEEP_LOCK_AFTER_MS) return { record, changed: false };
      await dropLock(scope, root, held.name);
      return UNCHANGED;
    }
    if (start <= now) return closeMissed(scope, root, record);

    const unwanted = event ? !isWanted(settings, held.lock.key, event.pending) : start <= coveredUntil;
    const brokenAfter = record.phase === "failed" ? RETRY_FAILED_AFTER_MS : LOCK_STALE_MS;
    const broken = !record.botId && now - Date.parse(record.createdAt) > brokenAfter;
    if (unwanted || (broken && event && schedulable(event, now))) {
      const removed = await unschedule(scope, root, record, held.name).catch((e) => {
        logFailure(`unschedule ${record.id}`, e);
        return false;
      });
      if (!removed) return { record, changed: false };
      if (unwanted || !event) return { record: null, changed: true };
      const again = await scheduleNew(scope, root, event, settings.host);
      return { record: again.record, changed: true };
    }
    if (record.phase !== "scheduled" || !event || (event.start === record.event?.start && event.link.url === record.link)) return { record, changed: false };
    const moved = await reschedule(scope, root, record, event);
    return { record: moved, changed: moved !== record };
  }

  async function syncAgenda(scope: MeetingScope, root: string, settings: AgendaSettings, events: AgendaEvent[]): Promise<{ records: Map<string, MeetingRecord>; changed: boolean }> {
    const now = Date.now();
    const deadline = now + SYNC_BUDGET_MS;
    const known = new Map(events.map((e) => [e.key, e]));
    const coveredUntil = coveredUntilOf(events, now);
    const held = (await readLocks(scope, root)).flatMap(({ name, modified, lock }) => (lock ? [{ name, lock, stale: now - modified > LOCK_STALE_MS }] : []));
    const outcomes = await runPool(held, READ_CONCURRENCY, (h) => reconcile(scope, root, settings, h, known.get(h.lock.key), now, coveredUntil));
    const records = new Map<string, MeetingRecord>();
    let changed = false;
    const keep = (key: string, synced: Synced) => {
      changed ||= synced.changed;
      if (synced.record) records.set(key, synced.record);
    };
    outcomes.forEach((outcome, k) => (outcome.status === "rejected" ? logFailure(`reconcile ${held[k].name}`, outcome.reason) : keep(held[k].lock.key, outcome.value)));

    const locked = new Set(held.map((h) => h.lock.key));
    const fresh = await agendaSettings(scope, root);
    const wanted = events.filter((e) => !locked.has(e.key) && isWanted(fresh, e.key, e.pending) && schedulable(e, Date.now()));
    const scheduled = await runPool(wanted, SCHEDULE_CONCURRENCY, (event) => (Date.now() > deadline ? Promise.resolve(UNCHANGED) : scheduleNew(scope, root, event, fresh.host)));
    scheduled.forEach((outcome, k) => (outcome.status === "rejected" ? logFailure(`schedule ${wanted[k].key}`, outcome.reason) : keep(wanted[k].key, outcome.value)));
    return { records, changed };
  }

  async function agenda(scope: MeetingScope, ports: AgendaPorts): Promise<AgendaView> {
    const root = await meetingsRoot(scope);
    const calendars = await ports.calendars();
    const stored = await readVersioned(scope, root, AGENDA_FILE, AGENDA_MAX_BYTES);
    let settings = parseAgendaSettings(stored?.text ?? null);
    const current = settings.calendar && calendars.find((c) => c.account === settings.calendar?.account);
    const calendar: AgendaCalendar | null = current ? settings.calendar : calendars[0] ? { toolkit: calendars[0].toolkit, account: calendars[0].account } : null;
    if (calendar?.account !== settings.calendar?.account || (ports.host && !sameHost(settings.host, ports.host))) {
      settings = await saveAgenda(scope, root, (s) => ({ ...s, calendar, ...(s.calendar?.account !== calendar?.account ? { chosen: [], skipped: [] } : {}), host: ports.host ?? s.host }), stored);
    }
    const view: AgendaView = {
      calendars: calendars.map((c) => ({ account: c.account, label: c.label, email: c.email })),
      calendar: calendar?.account ?? null,
      mode: settings.mode,
      chosen: [],
      skipped: [],
      events: [],
      unavailable: false,
      changed: false,
    };
    if (!calendar) return view;
    let events: AgendaEvent[];
    try {
      events = await ports.read(calendar, Date.now(), AGENDA_FRESH_MS);
    } catch (e) {
      logFailure(`agenda ${scope.agentId}`, e);
      return { ...view, unavailable: true };
    }
    const { records, changed } = await syncAgenda(scope, root, settings, events);
    const now = Date.now();
    const listed = new Set(events.map((e) => e.key));
    return {
      ...view,
      changed,
      chosen: settings.chosen.filter((k) => listed.has(k)),
      skipped: settings.skipped.filter((k) => listed.has(k)),
      events: events.map((e) => itemOf(e, records.get(e.key) ?? null, now)),
    };
  }

  async function changeAgenda(scope: MeetingScope, change: AgendaSettingChange, ports: AgendaPorts): Promise<AgendaView> {
    const root = await meetingsRoot(scope);
    const calendars = await ports.calendars();
    let applied = true;
    await saveAgenda(scope, root, (s) => {
      const next = applyAgendaChange(s, change, calendars);
      applied = next !== null;
      return next ? { ...next, host: ports.host ?? next.host } : null;
    });
    if (!applied) throw new ApiError(404, "not_found", "Cet agenda n’est plus connecté.");
    return agenda(scope, ports);
  }

  async function toggleEvent(scope: MeetingScope, change: AgendaEventChange, ports: AgendaPorts): Promise<AgendaToggle> {
    const root = await meetingsRoot(scope);
    const stored = await readVersioned(scope, root, AGENDA_FILE, AGENDA_MAX_BYTES);
    const calendar = parseAgendaSettings(stored?.text ?? null).calendar;
    if (!calendar) throw new ApiError(404, "not_found", "Cet agenda n’est plus connecté.");
    const events = await ports.read(calendar, Date.now(), AGENDA_REUSE_MS).catch((e) => {
      logFailure(`agenda ${scope.agentId}`, e);
      throw new ApiError(503, "unavailable", "L’agenda n’a pas pu être lu. Réessayez dans un instant.");
    });
    const event = events.find((e) => e.key === change.event);
    if (!event) throw new ApiError(404, "not_found", "Cette réunion n’est plus dans l’agenda.");
    const settings = await saveAgenda(scope, root, (s) => ({ ...(applyAgendaChange(s, change, [], autoKeys(events)) ?? s), host: ports.host ?? s.host }), stored);

    const now = Date.now();
    const name = lockName(event.key);
    const lock = await readText(scope, `${root}/${name}`, LOCK_MAX_BYTES);
    const held = parseLock(lock);
    const synced =
      lock !== null
        ? held
          ? await reconcile(scope, root, settings, { name, lock: held, stale: false }, event, now, coveredUntilOf(events, now))
          : UNCHANGED
        : isWanted(settings, event.key, event.pending) && schedulable(event, now)
          ? await scheduleNew(scope, root, event, settings.host)
          : UNCHANGED;
    return { item: itemOf(event, synced.record, now), changed: synced.changed };
  }

  async function syncAfterMeeting(scope: MeetingScope, ports: AgendaPorts): Promise<void> {
    const root = await meetingsRoot(scope);
    const settings = await agendaSettings(scope, root);
    if (settings.mode !== "all" || !settings.calendar) return;
    const events = await ports.read(settings.calendar, Date.now(), 0);
    await syncAgenda(scope, root, settings, events);
  }

  return { agenda, changeAgenda, toggleEvent, syncAfterMeeting };
}
