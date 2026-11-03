import assert from "node:assert/strict";
import { test } from "node:test";

import { BEEP_GAP_S, BEEP_S, beepTimes, lostConnection, reconnected } from "./connection-tone.ts";

test("the tone loops only while the call reconnects", () => {
  assert.equal(lostConnection("reconnecting"), true);
  for (const p of ["idle", "connecting", "listening", "thinking", "speaking", "ended", "unreachable"] as const) assert.equal(lostConnection(p), false);
});

test("the chime marks a recovered line, never a hang-up or a first answer", () => {
  assert.equal(reconnected("reconnecting", "listening"), true);
  assert.equal(reconnected("reconnecting", "speaking"), true);
  assert.equal(reconnected("reconnecting", "ended"), false);
  assert.equal(reconnected("reconnecting", "unreachable"), false);
  assert.equal(reconnected("connecting", "listening"), false);
  assert.equal(reconnected("speaking", "listening"), false);
});

test("two beeps, spaced, none overlapping", () => {
  const [a, b] = beepTimes(1, 2);
  assert.deepEqual(a, [1, 1 + BEEP_S]);
  assert.ok(Math.abs(b[0] - (a[1] + BEEP_GAP_S)) < 1e-9);
  assert.equal(beepTimes(0, 0).length, 0);
});
