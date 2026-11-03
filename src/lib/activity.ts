// Turns in flight and unread conversations, across experts: the pure state behind the in-app
// notifications (components/activity). No imports, so `node --test` runs it as is.

export type Outcome = "completed" | "failed";

/** A turn the app started or reattached. `local` = a mounted chat streams it; `watch` = nobody
 *  does any more (the user left the expert), the activity provider follows it itself. */
export interface Turn {
  id: string;
  agentId: string;
  profile: string | null;
  sessionId: string | null;
  responseId: string | null;
  startedAt: number;
  mode: "local" | "watch";
}

export interface Unread {
  at: number;
  kind: "reply" | "failed" | "routine";
}

/** What the bell lists for a conversation: its last event, with the words the toast showed. */
export interface Note extends Unread {
  /** The answer's first line (`excerpt`), empty for a routine or a failure. */
  text: string;
  /** The routine's name, for a routine run. */
  routine: string | null;
  /** A run with nothing to report. */
  silent?: boolean;
}

export interface ActivityState {
  turns: Record<string, Turn>;
  unread: Record<string, Unread>;
  /** The last event of each conversation, by convKey, for the notification centre. */
  notes: Record<string, Note>;
  /** The conversation on screen (convKey), or null. */
  viewing: string | null;
}

export const EMPTY_ACTIVITY: ActivityState = { turns: {}, unread: {}, notes: {}, viewing: null };

const normProfile = (p: string | null | undefined) => (!p || p === "default" ? "" : p);

export function expertKey(agentId: string, profile: string | null | undefined): string {
  return `${agentId}|${normProfile(profile)}`;
}

export function convKey(agentId: string, profile: string | null | undefined, sessionId: string): string {
  return `${expertKey(agentId, profile)}|${sessionId}`;
}

export function parseConvKey(key: string): { agentId: string; profile: string | null; sessionId: string } | null {
  const [agentId, profile, ...rest] = key.split("|");
  const sessionId = rest.join("|");
  return agentId && sessionId ? { agentId, profile: profile || null, sessionId } : null;
}

function without<T>(rec: Record<string, T>, drop: (v: T, k: string) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) if (!drop(v, k)) out[k] = v;
  return out;
}

// A reattached chat takes over a turn this provider was watching (same response).
export function startTurn(s: ActivityState, turn: Turn): ActivityState {
  const turns = turn.responseId ? without(s.turns, (t) => t.mode === "watch" && t.responseId === turn.responseId) : s.turns;
  return { ...s, turns: { ...turns, [turn.id]: turn } };
}

export function bindTurn(s: ActivityState, id: string, sessionId: string | null, responseId: string | null): ActivityState {
  const t = s.turns[id];
  if (!t) return s;
  const turns = responseId ? without(s.turns, (o, k) => k !== id && o.mode === "watch" && o.responseId === responseId) : s.turns;
  return { ...s, turns: { ...turns, [id]: { ...t, sessionId: sessionId ?? t.sessionId, responseId: responseId ?? t.responseId } } };
}

// The chat that streamed it is gone: watch it if it can be found again, else forget it.
export function detachTurn(s: ActivityState, id: string): ActivityState {
  const t = s.turns[id];
  if (!t || t.mode === "watch") return s;
  if (!t.sessionId || !t.responseId) return dropTurn(s, id);
  return { ...s, turns: { ...s.turns, [id]: { ...t, mode: "watch" } } };
}

export function dropTurn(s: ActivityState, id: string): ActivityState {
  return s.turns[id] ? { ...s, turns: without(s.turns, (_, k) => k === id) } : s;
}

export interface Notice {
  key: string;
  agentId: string;
  profile: string | null;
  sessionId: string;
  kind: Unread["kind"];
  /** In-app toast (conversation not on screen) and/or system notification (tab hidden). */
  toast: boolean;
  system: boolean;
}

// What a finished event in `key` amounts to, given what is on screen.
function notice(s: ActivityState, key: string, kind: Unread["kind"], visible: boolean, at: number): { state: ActivityState; notice: Notice | null } {
  const ref = parseConvKey(key)!;
  const viewed = s.viewing === key;
  if (viewed && visible) return { state: s, notice: null };
  const state = viewed ? s : { ...s, unread: { ...s.unread, [key]: { at, kind } } };
  return { state, notice: { key, ...ref, kind, toast: !viewed, system: !visible } };
}

// A turn ended. `source` says who saw it end: a local end of a turn already being watched is
// ignored (its stream died; the watcher reads the real outcome).
export function finishTurn(
  s: ActivityState,
  id: string,
  outcome: Outcome,
  source: Turn["mode"],
  visible: boolean,
  now: number
): { state: ActivityState; notice: Notice | null } {
  const t = s.turns[id];
  if (!t || t.mode !== source) return { state: s, notice: null };
  const dropped = dropTurn(s, id);
  if (!t.sessionId) return { state: dropped, notice: null };
  return notice(dropped, convKey(t.agentId, t.profile, t.sessionId), outcome === "failed" ? "failed" : "reply", visible, now);
}

// A run with nothing to report (`silent`) is a line in the bell only: no unread mark, so no dot on its
// expert in the menu nor in « Non lues », as it has no conversation to open (Leslie, 31/10).
export function routineFinished(s: ActivityState, key: string, visible: boolean, now: number, silent = false): { state: ActivityState; notice: Notice | null } {
  const r = notice(s, key, "routine", visible, now);
  return silent && r.state.unread[key] && !s.unread[key] ? { ...r, state: { ...r.state, unread: without(r.state.unread, (_, k) => k === key) } } : r;
}

// The conversation on screen changes; opening one reads it.
export function view(s: ActivityState, key: string | null): ActivityState {
  if (s.viewing === key && (!key || !s.unread[key])) return s;
  return { ...s, viewing: key, unread: key && s.unread[key] ? without(s.unread, (_, k) => k === key) : s.unread };
}

// An expert's rail is loaded: unread marks on conversations it no longer lists (deleted, or past
// the 100 the instance keeps) go.
export function pruneUnread(s: ActivityState, agentId: string, profile: string | null, sessionIds: string[]): ActivityState {
  const prefix = `${expertKey(agentId, profile)}|`;
  const keep = new Set(sessionIds.map((id) => convKey(agentId, profile, id)));
  const stale = Object.keys(s.unread).some((k) => k.startsWith(prefix) && !keep.has(k));
  return stale ? { ...s, unread: without(s.unread, (_, k) => k.startsWith(prefix) && !keep.has(k)) } : s;
}

// ---- Notification centre ----

const MAX_NOTES = 30;

/** Keeps what a notice said, for the bell: the newest event of each conversation, 30 at most. */
export function remember(s: ActivityState, n: Pick<Notice, "key" | "kind">, text: string, routine: string | null, at: number, silent = false): ActivityState {
  const notes = { ...s.notes, [n.key]: { at, kind: n.kind, text: n.kind === "routine" ? "" : excerpt(text), routine, ...(silent ? { silent } : {}) } };
  const kept = Object.entries(notes)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_NOTES);
  return { ...s, notes: Object.fromEntries(kept) };
}

/** Marks these conversations read (all of them with `null`). */
export function markRead(s: ActivityState, keys: string[] | null): ActivityState {
  if (keys === null) return Object.keys(s.unread).length ? { ...s, unread: {} } : s;
  const drop = new Set(keys);
  return Object.keys(s.unread).some((k) => drop.has(k)) ? { ...s, unread: without(s.unread, (_, k) => drop.has(k)) } : s;
}

export interface NotificationItem extends Note {
  key: string;
  agentId: string;
  profile: string | null;
  sessionId: string;
  unread: boolean;
}

/** What the bell lists, newest first: every note, and every unread mark (one kept from before a reload has no words). */
export function notifications(s: ActivityState): NotificationItem[] {
  const keys = new Set([...Object.keys(s.notes), ...Object.keys(s.unread)]);
  const out: NotificationItem[] = [];
  for (const key of keys) {
    const ref = parseConvKey(key);
    if (!ref) continue;
    const note: Note = s.notes[key] ?? { ...s.unread[key], text: "", routine: null };
    const mark = s.unread[key];
    out.push({ ...note, ...(mark && mark.at > note.at ? { at: mark.at, kind: mark.kind } : {}), key, ...ref, unread: Boolean(mark) });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_NOTES);
}

export type ConversationStatus = "running" | "unread" | "failed" | null;

export function conversationStatus(s: ActivityState, key: string): ConversationStatus {
  for (const t of Object.values(s.turns)) {
    if (t.sessionId && convKey(t.agentId, t.profile, t.sessionId) === key) return "running";
  }
  const u = s.unread[key];
  return u ? (u.kind === "failed" ? "failed" : "unread") : null;
}

export function expertActivity(s: ActivityState, agentId: string, profile: string | null): { running: boolean; unread: number } {
  const prefix = `${expertKey(agentId, profile)}|`;
  const running = Object.values(s.turns).some((t) => expertKey(t.agentId, t.profile) === expertKey(agentId, profile));
  // A run with nothing to report is in the bell only: no conversation to point the Expert's badge at.
  const unread = Object.keys(s.unread).filter((k) => k.startsWith(prefix) && !s.notes[k]?.silent).length;
  return { running, unread };
}

// ---- Routines ----

export interface RoutineSession {
  session_id: string;
  routine: string;
  last_active: number;
  message_count?: number | null;
  /** Nothing to report: a line in the bell, no conversation. */
  silent?: boolean;
  /** Its outcome is not read yet: neither announced nor passed over, asked again next look. */
  pending?: boolean;
}

/** Hermes reports seconds or milliseconds depending on the build. */
export const toMs = (t: number) => (t < 1e12 ? t * 1000 : t);

// A run's conversation is written as it goes: it is over once it holds the answer and what it came
// to is read.
const finished = (r: RoutineSession) => !r.pending && (r.message_count == null || r.message_count >= 2);

// The routine runs that finished since `since` (ms). With no `since` yet (first look at this
// expert), nothing is new: the mark is set to now's latest so the history does not flood in.
export function detectRoutineRuns(since: number | undefined, sessions: RoutineSession[]): { since: number; fresh: RoutineSession[] } {
  const done = sessions.filter(finished);
  const latest = done.reduce((m, r) => Math.max(m, toMs(r.last_active)), since ?? 0);
  if (since === undefined) return { since: latest, fresh: [] };
  return { since: latest, fresh: done.filter((r) => toMs(r.last_active) > since) };
}

// ---- Persistence (one entry per instance) ----

export interface Persisted {
  unread: Record<string, Unread>;
  notes: Record<string, Note>;
  /** Per expertKey: the last routine run already announced (ms). */
  routines: Record<string, number>;
  watching: Turn[];
}

const MAX_UNREAD = 200;
// A turn still unresolved after this long is no longer followed.
export const WATCH_TTL_MS = 2 * 60 * 60_000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function parsePersisted(raw: string | null, agentId: string, now: number): Persisted {
  const out: Persisted = { unread: {}, notes: {}, routines: {}, watching: [] };
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!isObj(data)) return out;
  const prefix = `${agentId}|`;
  if (isObj(data.unread)) {
    for (const [k, v] of Object.entries(data.unread)) {
      if (k.startsWith(prefix) && parseConvKey(k) && isObj(v) && typeof v.at === "number" && ["reply", "failed", "routine"].includes(v.kind as string)) {
        out.unread[k] = { at: v.at, kind: v.kind as Unread["kind"] };
      }
    }
  }
  if (isObj(data.notes)) {
    for (const [k, v] of Object.entries(data.notes)) {
      if (k.startsWith(prefix) && parseConvKey(k) && isObj(v) && typeof v.at === "number" && ["reply", "failed", "routine"].includes(v.kind as string)) {
        out.notes[k] = {
          at: v.at,
          kind: v.kind as Unread["kind"],
          text: typeof v.text === "string" ? v.text.slice(0, 200) : "",
          routine: typeof v.routine === "string" ? v.routine.slice(0, 120) : null,
          ...(v.silent === true ? { silent: true } : {}),
        };
      }
    }
  }
  // An unread mark a quiet run left before 31/10: it goes, the run's line stays in the bell.
  for (const [k, n] of Object.entries(out.notes)) if (n.silent && out.unread[k]?.kind === "routine") delete out.unread[k];
  if (isObj(data.routines)) {
    for (const [k, v] of Object.entries(data.routines)) if (k.startsWith(prefix) && typeof v === "number") out.routines[k] = v;
  }
  if (Array.isArray(data.watching)) {
    for (const t of data.watching) {
      if (isObj(t) && t.agentId === agentId && isStr(t.id) && isStr(t.sessionId) && isStr(t.responseId) && typeof t.startedAt === "number" && now - t.startedAt < WATCH_TTL_MS) {
        out.watching.push({ id: t.id, agentId, profile: isStr(t.profile) ? t.profile : null, sessionId: t.sessionId, responseId: t.responseId, startedAt: t.startedAt, mode: "watch" });
      }
    }
  }
  return out;
}

// What one instance keeps across reloads. Local turns are kept as watches: after a reload no chat
// streams them any more.
export function persistedFor(s: ActivityState, routines: Record<string, number>, agentId: string): Persisted {
  const prefix = `${agentId}|`;
  const unread = Object.entries(s.unread)
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_UNREAD);
  return {
    unread: Object.fromEntries(unread),
    notes: Object.fromEntries(Object.entries(s.notes).filter(([k]) => k.startsWith(prefix))),
    routines: without(routines, (_, k) => !k.startsWith(prefix)),
    watching: Object.values(s.turns)
      .filter((t) => t.agentId === agentId && t.sessionId && t.responseId)
      .map((t) => ({ ...t, mode: "watch" as const })),
  };
}

// ---- Text ----

// One line of an answer for a toast: markdown marks dropped, cut at a word.
export function excerpt(text: string, max = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ---- SSE ----

// Complete events out of a growing SSE buffer; `rest` waits for the next chunk.
export function splitSSE(buffer: string): { events: { event: string; data: Record<string, unknown> }[]; rest: string } {
  const text = buffer.replace(/\r\n/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: { event: string; data: Record<string, unknown> }[] = [];
  for (const block of blocks) {
    let event = "message";
    const lines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) lines.push(line.slice(5).trim());
    }
    if (!lines.length) continue;
    try {
      const data = JSON.parse(lines.join("\n"));
      events.push({ event, data: isObj(data) ? data : {} });
    } catch {
      events.push({ event, data: {} });
    }
  }
  return { events, rest };
}

/** « Routine « … » terminée », without saying « routine » twice when the routine's own name starts with it. */
export function routineDoneTitle(name: string | null | undefined, silent = false): string {
  const n = name?.trim();
  const what = !n ? "Routine" : /^routines?\b/i.test(n) ? `« ${n} »` : `Routine « ${n} »`;
  return silent ? `${what} : rien à signaler` : !n ? "Routine terminée" : `${what} terminée`;
}
