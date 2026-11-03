import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_ACTIVITY,
  bindTurn,
  conversationStatus,
  convKey,
  detachTurn,
  detectRoutineRuns,
  routineDoneTitle,
  excerpt,
  expertActivity,
  finishTurn,
  markRead,
  notifications,
  remember,
  parsePersisted,
  persistedFor,
  pruneUnread,
  routineFinished,
  splitSSE,
  startTurn,
  view,
  type ActivityState,
  type Turn,
} from "./activity.ts";

const turn = (over: Partial<Turn> = {}): Turn => ({
  id: "t1",
  agentId: "a1",
  profile: "acme__awa",
  sessionId: "s1",
  responseId: "r1",
  startedAt: 0,
  mode: "local",
  ...over,
});
const K = convKey("a1", "acme__awa", "s1");

test("a turn ending in another conversation leaves it unread and toasts", () => {
  let s = view(startTurn(EMPTY_ACTIVITY, turn()), convKey("a1", "acme__awa", "s2"));
  assert.equal(conversationStatus(s, K), "running");
  const r = finishTurn(s, "t1", "completed", "local", true, 5);
  s = r.state;
  assert.deepEqual(r.notice && { toast: r.notice.toast, system: r.notice.system, kind: r.notice.kind }, { toast: true, system: false, kind: "reply" });
  assert.equal(conversationStatus(s, K), "unread");
  assert.deepEqual(expertActivity(s, "a1", "acme__awa"), { running: false, unread: 1 });
  assert.equal(conversationStatus(view(s, K), K), null);
});

test("a turn ending on screen says nothing, unless the tab is hidden", () => {
  const s = view(startTurn(EMPTY_ACTIVITY, turn()), K);
  assert.equal(finishTurn(s, "t1", "completed", "local", true, 1).notice, null);
  const hidden = finishTurn(s, "t1", "failed", "local", false, 1);
  assert.equal(hidden.notice?.toast, false);
  assert.equal(hidden.notice?.system, true);
  assert.equal(conversationStatus(hidden.state, K), null);
});

test("a new chat's turn is filed under its minted session", () => {
  let s = startTurn(EMPTY_ACTIVITY, turn({ sessionId: null, responseId: null }));
  s = bindTurn(s, "t1", "s9", "r9");
  const r = finishTurn(s, "t1", "failed", "local", true, 1);
  assert.equal(conversationStatus(r.state, convKey("a1", "acme__awa", "s9")), "failed");
});

test("a detached turn is watched; the dying stream's local end is ignored", () => {
  let s = detachTurn(startTurn(EMPTY_ACTIVITY, turn()), "t1");
  assert.equal(s.turns.t1.mode, "watch");
  assert.equal(finishTurn(s, "t1", "failed", "local", true, 1).notice, null);
  s = finishTurn(s, "t1", "completed", "watch", true, 1).state;
  assert.equal(conversationStatus(s, K), "unread");
});

test("a turn that cannot be found again is dropped on detach", () => {
  const s = detachTurn(startTurn(EMPTY_ACTIVITY, turn({ sessionId: null, responseId: null })), "t1");
  assert.deepEqual(s.turns, {});
});

test("reattaching a watched response replaces the watch", () => {
  let s = detachTurn(startTurn(EMPTY_ACTIVITY, turn()), "t1");
  s = startTurn(s, turn({ id: "t2" }));
  assert.deepEqual(Object.keys(s.turns), ["t2"]);
  s = startTurn(detachTurn(s, "t2"), turn({ id: "t3", responseId: null }));
  s = bindTurn(s, "t3", "s1", "r1");
  assert.deepEqual(Object.keys(s.turns), ["t3"]);
});

test("loading a rail drops unread marks of conversations it no longer lists", () => {
  const r = { at: 1, kind: "reply" } as const;
  let s: ActivityState = { ...EMPTY_ACTIVITY, unread: { [K]: r, [convKey("a1", "acme__awa", "gone")]: r, [convKey("a1", "other", "x")]: r } };
  s = pruneUnread(s, "a1", "acme__awa", ["s1"]);
  assert.deepEqual(Object.keys(s.unread).sort(), [K, convKey("a1", "other", "x")].sort());
  assert.equal(pruneUnread(s, "a1", "acme__awa", ["s1"]), s);
});

test("default profile and null share one key", () => {
  assert.equal(convKey("a", null, "s"), convKey("a", "default", "s"));
});

test("routine runs: first look sets the mark, later finished runs are new", () => {
  const first = detectRoutineRuns(undefined, [{ session_id: "c1", routine: "Veille", last_active: 100, message_count: 2 }]);
  assert.deepEqual(first, { since: 100_000, fresh: [] });
  const next = detectRoutineRuns(first.since, [
    { session_id: "c2", routine: "Veille", last_active: 200, message_count: 2 },
    { session_id: "c3", routine: "Point", last_active: 300, message_count: 1 },
    { session_id: "c1", routine: "Veille", last_active: 100, message_count: 2 },
  ]);
  assert.deepEqual(next.fresh.map((r) => r.session_id), ["c2"]);
  assert.equal(next.since, 200_000);
  const later = detectRoutineRuns(next.since, [{ session_id: "c3", routine: "Point", last_active: 360, message_count: 2 }]);
  assert.deepEqual(later.fresh.map((r) => r.session_id), ["c3"]);
  assert.deepEqual(detectRoutineRuns(later.since, [{ session_id: "c3", routine: "Point", last_active: 360 }]).fresh, []);
});

test("routine runs: a run whose outcome is not read yet waits for the next look", () => {
  const next = detectRoutineRuns(100_000, [
    { session_id: "c2", routine: "Mémoire", last_active: 200, message_count: 2, silent: false, pending: true },
  ]);
  assert.deepEqual(next, { since: 100_000, fresh: [] });
  const later = detectRoutineRuns(next.since, [{ session_id: "c2", routine: "Mémoire", last_active: 200, message_count: 2, silent: true }]);
  assert.deepEqual(later.fresh.map((r) => [r.session_id, r.silent]), [["c2", true]]);
});

test("a routine run marks its conversation unless it is on screen", () => {
  const key = convKey("a1", "p", "cron_x");
  assert.equal(conversationStatus(routineFinished(EMPTY_ACTIVITY, key, true, 1).state, key), "unread");
  assert.equal(routineFinished(view(EMPTY_ACTIVITY, key), key, true, 1).notice, null);
  // Nothing to report: a line in the bell, no unread mark (no dot on the expert).
  const quiet = routineFinished(EMPTY_ACTIVITY, key, true, 1, true);
  assert.equal(conversationStatus(quiet.state, key), null);
  assert.notEqual(quiet.notice, null);
});

test("persistence round-trips one instance and rejects junk", () => {
  let s = startTurn(EMPTY_ACTIVITY, turn({ startedAt: 1000 }));
  s = finishTurn(startTurn(s, turn({ id: "t2", sessionId: "s2", responseId: "r2" })), "t2", "completed", "local", true, 9).state;
  s = { ...s, unread: { ...s.unread, [convKey("other", null, "x")]: { at: 1, kind: "reply" } } };
  const saved = persistedFor(s, { "a1|acme__awa": 5, "other|": 3 }, "a1");
  const back = parsePersisted(JSON.stringify(saved), "a1", 2000);
  assert.deepEqual(Object.keys(back.unread), [convKey("a1", "acme__awa", "s2")]);
  assert.deepEqual(back.routines, { "a1|acme__awa": 5 });
  assert.equal(back.watching[0].mode, "watch");
  assert.equal(parsePersisted(JSON.stringify(saved), "a1", 1000 + 3 * 60 * 60_000).watching.length, 0);
  assert.deepEqual(parsePersisted("{oops", "a1", 0), { unread: {}, notes: {}, routines: {}, watching: [] });
  assert.deepEqual(parsePersisted(JSON.stringify({ unread: { "a1|p|s": { at: "x", kind: "reply" } } }), "a1", 0).unread, {});
});

test("excerpt drops markdown and cuts at a word", () => {
  assert.equal(excerpt("**Bonjour** [lien](http://x) `code`"), "Bonjour lien code");
  const long = excerpt("mot ".repeat(60), 20);
  assert.ok(long.endsWith("…") && long.length <= 20);
});

test("splitSSE keeps an incomplete block for later", () => {
  const { events, rest } = splitSSE('event: response.completed\ndata: {"output_text":"ok"}\n\n: keepalive\n\nevent: x\ndata: {');
  assert.deepEqual(events, [{ event: "response.completed", data: { output_text: "ok" } }]);
  assert.equal(rest, "event: x\ndata: {");
});

test("the bell lists the newest event of each conversation, unread first in its own right", () => {
  const k1 = convKey("a1", "acme__awa", "s1");
  const k2 = convKey("a1", "acme__awa", "s2");
  let s = routineFinished(EMPTY_ACTIVITY, k1, true, 10).state;
  s = remember(s, { key: k1, kind: "routine" }, "", "Point du lundi", 10);
  s = remember(s, { key: k2, kind: "reply" }, "**Voici** le devis", null, 20);
  const items = notifications(s);
  assert.deepEqual(items.map((i) => [i.key, i.unread, i.text, i.routine]), [
    [k2, false, "Voici le devis", null],
    [k1, true, "", "Point du lundi"],
  ]);
  // An unread mark kept from before a reload has no words, and is listed all the same.
  const kept = { ...EMPTY_ACTIVITY, unread: { [k2]: { at: 5, kind: "reply" as const } } };
  assert.deepEqual(notifications(kept).map((i) => [i.sessionId, i.unread, i.text]), [["s2", true, ""]]);
});

test("marking read: some conversations, or all", () => {
  const k1 = convKey("a1", null, "s1");
  const k2 = convKey("a1", null, "s2");
  const s = { ...EMPTY_ACTIVITY, unread: { [k1]: { at: 1, kind: "reply" as const }, [k2]: { at: 2, kind: "failed" as const } } };
  assert.deepEqual(Object.keys(markRead(s, [k1]).unread), [k2]);
  assert.deepEqual(markRead(s, null).unread, {});
  assert.equal(markRead(EMPTY_ACTIVITY, null), EMPTY_ACTIVITY);
});

test("notes survive a reload, per instance", () => {
  const k = convKey("a1", null, "s1");
  const s = remember(EMPTY_ACTIVITY, { key: k, kind: "reply" }, "Bonjour", null, 7);
  const back = parsePersisted(JSON.stringify(persistedFor(s, {}, "a1")), "a1", 0);
  assert.deepEqual(back.notes, { [k]: { at: 7, kind: "reply", text: "Bonjour", routine: null } });
  assert.deepEqual(parsePersisted(JSON.stringify(persistedFor(s, {}, "a2")), "a2", 0).notes, {});
});

test("routineDoneTitle never says « routine » twice", () => {
  assert.equal(routineDoneTitle("Calendrier éditorial"), "Routine « Calendrier éditorial » terminée");
  assert.equal(routineDoneTitle("Routine du point de 17 h"), "« Routine du point de 17 h » terminée");
  assert.equal(routineDoneTitle(null), "Routine terminée");
});

test("a quiet run's unread mark saved before is dropped on load, its bell line kept", () => {
  const k = "a1|p1|s9";
  const raw = JSON.stringify({ unread: { [k]: { at: 5, kind: "routine" } }, notes: { [k]: { at: 5, kind: "routine", text: "", routine: "Rangement", silent: true } } });
  const p = parsePersisted(raw, "a1", 10);
  assert.deepEqual(p.unread, {});
  assert.equal(p.notes[k]?.silent, true);
});
