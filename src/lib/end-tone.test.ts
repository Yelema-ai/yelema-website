import assert from "node:assert/strict";
import { test } from "node:test";

import { beepTimes } from "./connection-tone.ts";
import { END_BEEP_S, END_GAP_S, endBeeps, sound } from "./end-tone.ts";

const played = () => {
  const calls: number[] = [];
  return { calls, play: (n: number) => void calls.push(n) };
};

test("the other side ends an answered call: three beeps", () => {
  const p = played();
  sound(p.play, "ended", "remote", true);
  sound(p.play, "unreachable", "remote", true);
  assert.deepEqual(p.calls, [3, 3]);
});

test("Raccrocher: one beep", () => {
  const p = played();
  sound(p.play, "ended", "member", true);
  assert.deepEqual(p.calls, [1]);
});

test("no tone when the call never connected, nor on a phase that is not an end", () => {
  const p = played();
  sound(p.play, "ended", "member", false);
  sound(p.play, "ended", "remote", false);
  sound(p.play, "unreachable", "remote", false);
  for (const ph of ["connecting", "listening", "thinking", "speaking", "reconnecting"] as const) sound(p.play, ph, "remote", true);
  assert.deepEqual(p.calls, []);
  assert.equal(endBeeps("idle", "member", true), 0);
});

test("a failing player never throws into the hang-up", () => {
  assert.doesNotThrow(() =>
    sound(() => {
      throw new Error("closed context");
    }, "ended", "member", true)
  );
});

test("150 ms on, 150 ms off", () => {
  const [a, b, c] = beepTimes(0, 3, END_BEEP_S, END_GAP_S);
  assert.deepEqual(a, [0, 0.15]);
  assert.ok(Math.abs(b[0] - 0.3) < 1e-9 && Math.abs(c[1] - 0.75) < 1e-9);
});
