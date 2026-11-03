import assert from "node:assert/strict";
import { test } from "node:test";
import { finishTiming, isTimingRecord, keepLast, mark, startTiming } from "./chat-timing.ts";

const meta = { at: new Date("2026-10-27T17:00:00Z"), profile: "unifood__djeneba", model: "claude-sonnet", outcome: "completed" as const };

test("each mark is counted from the press of Envoyer, the first time only", () => {
  const t = startTiming(1_000);
  mark(t, "accepted", 1_400.4);
  mark(t, "created", 1_900);
  mark(t, "first", 3_000);
  mark(t, "first", 5_000);
  t.tools = 2;
  assert.deepEqual(finishTiming(t, 9_000, meta), {
    at: "2026-10-27T17:00:00.000Z",
    profile: "unifood__djeneba",
    model: "claude-sonnet",
    acceptedMs: 400,
    createdMs: 900,
    firstMs: 2_000,
    doneMs: 8_000,
    tools: 2,
    outcome: "completed",
  });
});

test("a turn that failed before any word keeps its missing marks empty", () => {
  const r = finishTiming(startTiming(0), 1_200, { ...meta, outcome: "failed" });
  assert.equal(r.firstMs, null);
  assert.equal(r.acceptedMs, null);
  assert.equal(r.doneMs, 1_200);
});

test("the browser keeps the last 50", () => {
  let list: number[] = [];
  for (let i = 0; i < 60; i++) list = keepLast(list, i);
  assert.equal(list.length, 50);
  assert.equal(list[0], 10);
  assert.equal(list.at(-1), 59);
});

test("the server logs a well-formed record only", () => {
  const ok = finishTiming(startTiming(0), 500, meta);
  assert.equal(isTimingRecord(ok), true);
  assert.equal(isTimingRecord({ ...ok, text: "bonjour" }), false);
  assert.equal(isTimingRecord({ ...ok, doneMs: -1 }), false);
  assert.equal(isTimingRecord({ ...ok, model: "x".repeat(200) }), false);
  assert.equal(isTimingRecord({ ...ok, outcome: "maybe" }), false);
  assert.equal(isTimingRecord(null), false);
});
