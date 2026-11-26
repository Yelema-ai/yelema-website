import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_TOUR, applyTourUpdate, parseTourPrefs, parseTourUpdate } from "./tour-state.ts";

test("a stored date is read back", () => {
  assert.deepEqual(parseTourPrefs({ seenAt: "2026-11-24T10:00:00.000Z" }), { seenAt: "2026-11-24T10:00:00.000Z" });
  assert.deepEqual(parseTourPrefs({ seenAt: "2026-11-24T10:00:00Z" }), { seenAt: "2026-11-24T10:00:00Z" });
});

test("a missing or damaged value reads as not seen", () => {
  for (const raw of [undefined, null, "x", 3, [], {}, { seenAt: null }, { seenAt: 12 }, { seenAt: "hier" }, { seenAt: "2026-13-40T99:99:99Z" }, { seenAt: "2026-11-24" }, { seenAt: "2026-11-24T10:00:00+01:00" }]) {
    assert.deepEqual(parseTourPrefs(raw), NO_TOUR, JSON.stringify(raw));
  }
});

test("an update is exactly { done: boolean }", () => {
  assert.deepEqual(parseTourUpdate({ done: true }), { done: true });
  assert.deepEqual(parseTourUpdate({ done: false }), { done: false });
  for (const raw of [undefined, null, true, "done", [], {}, { done: "true" }, { done: 1 }, { done: true, seenAt: "2026-11-24T10:00:00Z" }]) {
    assert.equal(parseTourUpdate(raw), null, JSON.stringify(raw));
  }
});

test("done keeps the first date, not done starts again", () => {
  const now = new Date("2026-11-24T10:00:00.000Z");
  const later = new Date("2026-12-01T08:00:00.000Z");
  const seen = applyTourUpdate(NO_TOUR, { done: true }, now);
  assert.deepEqual(seen, { seenAt: "2026-11-24T10:00:00.000Z" });
  assert.deepEqual(applyTourUpdate(seen, { done: true }, later), seen);
  assert.deepEqual(applyTourUpdate(seen, { done: false }, later), NO_TOUR);
});
