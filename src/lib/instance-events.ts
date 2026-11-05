// The instance's event stream (runtime gateway `GET /v1/instances/{id}/events`, contract
// docs/plans/performance-instantanee/contrat-evenements.md §1 on the platform), heard by one EventSource
// per tab. No content, only what changed. Pure, so the rules are tested.

import { isProfileId } from "./profile-id.ts";

export const INSTANCE_EVENTS = ["turn.ended", "sessions.changed", "files.changed", "instance.changed", "routine.ended", "job.done"] as const;
export type InstanceEventType = (typeof INSTANCE_EVENTS)[number];

export const JOB_KINDS = ["mcp", "llm", "connectors", "experts", "deploy", "memory", "telegram", "channels", "voice", "deliverables", "notifications"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface InstanceEvent {
  type: InstanceEventType;
  at: number;
  profile?: string;
  session?: string;
  kind?: JobKind;
  /** Sent by the tab itself after a reconnect the gateway could not replay (never parsed from the wire). */
  resumed?: boolean;
}

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 5 * 60_000;
const SESSION_RE = /^[\w.:@~-]{1,200}$/;

/** Wait before reconnect attempt `n` (0-based): doubles up to 5 min, ±20 % so tabs do not come back together. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempt), MAX_RETRY_MS);
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** EVENT_STREAM (or NEXT_PUBLIC_EVENT_STREAM) "on", and the gateway the stream comes from. */
export function eventStreamOn(env: Record<string, string | undefined>): boolean {
  const flag = (env.EVENT_STREAM ?? env.NEXT_PUBLIC_EVENT_STREAM)?.trim().toLowerCase();
  return flag === "on" && Boolean(env.RUNTIME_GATEWAY_URL?.trim() && env.RUNTIME_GATEWAY_TOKEN?.trim());
}

const isType = (t: string): t is InstanceEventType => (INSTANCE_EVENTS as readonly string[]).includes(t);
const isKind = (k: unknown): k is JobKind => typeof k === "string" && (JOB_KINDS as readonly string[]).includes(k);
const idOf = (v: unknown, valid: (s: string) => boolean): string | undefined => (typeof v === "string" && valid(v) ? v : undefined);

/** One frame (`event:` + `data:`); null for a type this tab does not know. A bad body keeps the type. */
export function parseInstanceEvent(type: string, data: string | null | undefined, now = Date.now()): InstanceEvent | null {
  if (!isType(type)) return null;
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = data ? JSON.parse(data) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // An unreadable body still says what kind of thing changed.
  }
  const out: InstanceEvent = { type, at: typeof body.at === "number" && Number.isFinite(body.at) ? body.at : now };
  const profile = idOf(body.profile, isProfileId);
  const session = idOf(body.session, (s) => SESSION_RE.test(s));
  if (profile) out.profile = profile;
  if (session) out.session = session;
  if (isKind(body.kind)) out.kind = body.kind;
  return out;
}

/** The `Last-Event-ID` a reconnect may carry: short and printable, else nothing. */
export const resumeId = (raw: string | null | undefined): string | null => (raw && /^[\x21-\x7e]{1,128}$/.test(raw) ? raw : null);

/** What a listener waits for. An event without a profile concerns every profile. */
export interface EventFilter {
  types: readonly InstanceEventType[];
  profile?: string | null;
  kind?: JobKind;
}

export function matches(e: InstanceEvent, f: EventFilter): boolean {
  if (!f.types.includes(e.type)) return false;
  if (f.kind && e.kind !== f.kind) return false;
  return !f.profile || !e.profile || e.profile === f.profile;
}

/** Everything is read again: the gateway could not replay what this tab missed. */
export const catchUp = (e: InstanceEvent): boolean => e.type === "instance.changed";

/** The conversations of `e.profile` (all when absent) may have changed. */
export const touchesSessions = (e: InstanceEvent): boolean => e.type === "turn.ended" || e.type === "sessions.changed" || e.type === "routine.ended" || catchUp(e);

/** The drive may have changed. Until this tab has heard one `files.changed`, a turn's end counts as one. */
export function touchesDrive(e: InstanceEvent, heardFilesChanged: boolean): boolean {
  if (e.type === "files.changed" || catchUp(e)) return true;
  return !heardFilesChanged && (e.type === "turn.ended" || e.type === "routine.ended");
}

type Listener = (e: InstanceEvent, agentId: string) => void;

export function createEventHub() {
  const listeners = new Map<string, Set<Listener>>();
  const any = new Set<Listener>();
  const live = new Set<string>();
  const heard = new Map<string, Set<InstanceEventType>>();
  const onLink = new Set<() => void>();
  const add = <T>(set: Set<T>, fn: T, empty: () => void) => {
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) empty();
    };
  };
  return {
    /** `agentId` null hears every instance of the tab. */
    on(agentId: string | null, fn: Listener): () => void {
      if (agentId === null) return add(any, fn, () => undefined);
      const set = listeners.get(agentId) ?? new Set<Listener>();
      listeners.set(agentId, set);
      return add(set, fn, () => listeners.get(agentId) === set && listeners.delete(agentId));
    },
    emit(agentId: string, e: InstanceEvent): void {
      const seen = heard.get(agentId) ?? new Set();
      seen.add(e.type);
      heard.set(agentId, seen);
      for (const fn of [...(listeners.get(agentId) ?? []), ...any]) fn(e, agentId);
    },
    heard: (agentId: string, type: InstanceEventType): boolean => heard.get(agentId)?.has(type) ?? false,
    setConnected(agentId: string, on: boolean): void {
      if (on === live.has(agentId)) return;
      if (on) live.add(agentId);
      else live.delete(agentId);
      for (const fn of [...onLink]) fn();
    },
    /** The stream is up for this instance (or, without one, for any instance of the tab). */
    connected: (agentId?: string | null): boolean => (agentId ? live.has(agentId) : live.size > 0),
    onConnection: (fn: () => void): (() => void) => add(onLink, fn, () => undefined),
  };
}

export type EventHub = ReturnType<typeof createEventHub>;

/** Resolves on the next matching event of the instance, or when `signal` aborts; leaves no listener behind. */
export function nextEvent(hub: EventHub, agentId: string, filter: EventFilter | InstanceEventType, signal: AbortSignal): Promise<void> {
  const f: EventFilter = typeof filter === "string" ? { types: [filter] } : filter;
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      off();
      signal.removeEventListener("abort", done);
      resolve();
    };
    const off = hub.on(agentId, (e) => matches(e, f) && done());
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * A poll gated on the tab's stream (lib/poll `gate`): slow while it is up, `minMs` apart at least while down.
 * `agentId`: the instance(s) the poll reads, each of which must have its stream; null: the tab's stream.
 */
export function streamGate(hub: EventHub, minMs = 15_000, agentId: string | readonly string[] | null = null, liveMs?: number) {
  const ids = agentId === null ? null : typeof agentId === "string" ? [agentId] : agentId;
  return { live: () => (ids ? ids.length > 0 && ids.every((a) => hub.connected(a)) : hub.connected()), onChange: hub.onConnection, minMs, liveMs };
}

/** Heard on the stream at least this often (the gateway beats every 25 s); past it, the stream is taken as cut. */
export const STREAM_SILENCE_MS = 90_000;
/** The same, on a connection that never pinged (a gateway without the beat): longer, so it does not flap. */
export const UNPINGED_SILENCE_MS = 180_000;
export const silenceMs = (pinged: boolean): number => (pinged ? STREAM_SILENCE_MS : UNPINGED_SILENCE_MS);

/** The gateway's `: ping` comments, which EventSource hides, as `ping` frames the tab can time. */
export function namedPings(): TransformStream<string, string> {
  let rest = "";
  return new TransformStream({
    transform(chunk, out) {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop() ?? "";
      if (lines.length) out.enqueue(lines.map((l) => (l.replace(/\r$/, "") === ": ping" ? "event: ping\ndata: {}" : l.replace(/\r$/, ""))).join("\n") + "\n");
    },
    flush(out) {
      if (rest) out.enqueue(rest);
    },
  });
}

/** The tab's one hub. */
export const instanceEvents = createEventHub();
