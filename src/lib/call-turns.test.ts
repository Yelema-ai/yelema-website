import { test } from "node:test";
import assert from "node:assert/strict";
import { firstTurn, haloOf, rms, stepTurn, THINKING_LONGER_MAX_MS, THINKING_MAX_MS, type TurnReading, type TurnState } from "./call-turns.ts";

// Feeds readings every 80 ms from `t0` for `ms`, with fixed levels.
function run(s: TurnState, t0: number, ms: number, levels: Partial<TurnReading>): [TurnState, number] {
  let t = t0;
  for (; t <= t0 + ms; t += 80) s = stepTurn(s, { now: t, voice: 0, mic: 0, holding: false, longer: false, ...levels });
  return [s, t];
}

test("halo: same order as the mobile app", () => {
  assert.equal(haloOf("connecting", true), "connexion");
  assert.equal(haloOf("reconnecting", false), "reco");
  assert.equal(haloOf("thinking", true), "muet");
  assert.equal(haloOf("thinking", false), "reflechit");
  assert.equal(haloOf("thinking", false, true), "cherche");
  assert.equal(haloOf("speaking", false, true), "parle");
  assert.equal(haloOf("speaking", true), "muet");
  assert.equal(haloOf("speaking", false), "parle");
  assert.equal(haloOf("listening", false), "ecoute");
  assert.equal(haloOf("ended", false), null);
  assert.equal(haloOf("idle", false), null);
});

test("member speaks, falls silent: the expert thinks, then speaks", () => {
  let [s, t] = run(firstTurn(), 1000, 1000, { mic: 0.2 });
  assert.equal(s.phase, "listening");
  assert.equal(s.memberSpoke, true);
  [s, t] = run(s, t, 1000, {});
  assert.equal(s.phase, "thinking");
  [s, t] = run(s, t, 300, { voice: 0.1 });
  assert.equal(s.phase, "speaking");
  [s] = run(s, t, 1000, {});
  assert.equal(s.phase, "listening");
  assert.equal(s.memberSpoke, false);
});

test("silence alone never makes the expert think", () => {
  const [s] = run(firstTurn(), 0, 5000, {});
  assert.equal(s.phase, "listening");
});

test("a short noise is not a sentence", () => {
  let [s, t] = run(firstTurn(), 0, 100, { mic: 0.2 });
  [s] = run(s, t, 2000, {});
  assert.equal(s.phase, "listening");
});

test("« Laisse-moi finir »: a pause does not end the member's turn", () => {
  let [s, t] = run(firstTurn(), 0, 800, { mic: 0.2 });
  [s, t] = run(s, t, 3000, { holding: true });
  assert.equal(s.phase, "listening");
  [s] = run(s, t, 1000, { holding: false });
  assert.equal(s.phase, "thinking");
});

test("thinking ends after 15 s, 45 s with « Réfléchis plus longtemps »", () => {
  let [s, t] = run(firstTurn(), 0, 800, { mic: 0.2 });
  [s, t] = run(s, t, 1000, {});
  assert.equal(s.phase, "thinking");
  const [short] = run(s, t, THINKING_MAX_MS, {});
  assert.equal(short.phase, "listening");
  let [long, t2] = run(s, t, THINKING_MAX_MS, { longer: true });
  assert.equal(long.phase, "thinking");
  [long] = run(long, t2, THINKING_LONGER_MAX_MS - THINKING_MAX_MS, { longer: true });
  assert.equal(long.phase, "listening");
});

test("the member speaks again while the expert thinks: back to listening", () => {
  let [s, t] = run(firstTurn(), 0, 800, { mic: 0.2 });
  [s, t] = run(s, t, 1000, {});
  assert.equal(s.phase, "thinking");
  [s] = run(s, t, 400, { mic: 0.2 });
  assert.equal(s.phase, "listening");
});

test("rms", () => {
  assert.equal(rms([]), 0);
  assert.equal(rms([0.5, -0.5, 0.5, -0.5]), 0.5);
});
