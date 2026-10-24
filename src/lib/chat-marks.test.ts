import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_MARKS, arrange, parseMarks, setMark } from "./chat-marks.ts";

test("pinning and archiving exclude each other", () => {
  let m = setMark(NO_MARKS, "a", "pinned", true);
  m = setMark(m, "a", "archived", true);
  assert.deepEqual(m, { pinned: [], archived: ["a"] });
  m = setMark(m, "a", "pinned", true);
  assert.deepEqual(m, { pinned: ["a"], archived: [] });
});

test("archived rows leave the list, pinned ones head it, last pinned first", () => {
  let m = setMark(NO_MARKS, "b", "pinned", true);
  m = setMark(m, "c", "pinned", true);
  m = setMark(m, "d", "archived", true);
  const { pinned, rest } = arrange(["a", "b", "c", "d"], (k) => k, m);
  assert.deepEqual(pinned, ["c", "b"]);
  assert.deepEqual(rest, ["a"]);
});

test("a broken storage reads as no marks", () => {
  assert.deepEqual(parseMarks("{"), NO_MARKS);
  assert.deepEqual(parseMarks(null), NO_MARKS);
  assert.deepEqual(parseMarks('{"pinned":["x",3]}'), { pinned: ["x"], archived: [] });
});
