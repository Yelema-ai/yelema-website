import assert from "node:assert/strict";
import { test } from "node:test";

import { FRESH_MS, isNewAt, markSeenAt, parseSeen } from "./seen-deliverables.ts";

const NOW = 10 * FRESH_MS;

test("new: changed within three days and not opened since", () => {
  assert.equal(isNewAt({}, { path: "a", modified: NOW - 1000 }, NOW), true);
  assert.equal(isNewAt({ a: NOW - 500 }, { path: "a", modified: NOW - 1000 }, NOW), false);
  assert.equal(isNewAt({ a: NOW - 2000 }, { path: "a", modified: NOW - 1000 }, NOW), true);
  assert.equal(isNewAt({}, { path: "a", modified: NOW - FRESH_MS - 1 }, NOW), false);
  assert.equal(isNewAt({}, { path: "a", modified: 0 }, NOW), false);
});

test("marks past the window are dropped, so the stored list stays bounded", () => {
  const raw = JSON.stringify({ old: NOW - FRESH_MS - 1, recent: NOW - 10, bad: "x" });
  assert.deepEqual(parseSeen(raw, NOW), { recent: NOW - 10 });
  assert.deepEqual(parseSeen("not json", NOW), {});
  assert.deepEqual(parseSeen("[1]", NOW), {});
  let marks = {};
  for (let i = 0; i < 5000; i++) marks = markSeenAt(marks, `p${i}`, NOW + i);
  assert.equal(Object.keys(marks).length, 2000);
  assert.ok("p4999" in marks);
});
