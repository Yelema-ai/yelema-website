import assert from "node:assert/strict";
import { test } from "node:test";
import { latestOnly, MAX_FRAME_CHARS, parseFrame } from "./screencast-frames.ts";

test("parseFrame : seules les formes attendues passent, jamais d'exception", () => {
  assert.deepEqual(parseFrame(JSON.stringify({ t: "frame", data: "AAAA", w: 1280, h: 720 })), { t: "frame", data: "AAAA", w: 1280, h: 720 });
  assert.deepEqual(parseFrame('{"t":"empty","x":1}'), { t: "empty" });
  assert.deepEqual(parseFrame(JSON.stringify({ t: "frame", data: "AAAA", w: -5, h: "x" })), { t: "frame", data: "AAAA", w: undefined, h: undefined });
  const bad = ["pas du json", "null", "[]", "{}", '{"t":"autre"}', '{"t":"frame"}', '{"t":"frame","data":""}', '{"t":"frame","data":"a\\" onerror=\\"x"}', JSON.stringify({ t: "frame", data: "A".repeat(MAX_FRAME_CHARS + 1) })];
  for (const raw of bad) assert.equal(parseFrame(raw), null, raw.slice(0, 40));
});

test("latestOnly : une image à la fois, seule la dernière reçue attend", () => {
  const started: number[] = [];
  const finish: (() => void)[] = [];
  const push = latestOnly<number>((n, done) => {
    started.push(n);
    finish.push(done);
  });
  for (const n of [1, 2, 3, 4]) push(n);
  assert.deepEqual(started, [1]);
  finish[0]();
  finish[0]();
  assert.deepEqual(started, [1, 4], "2 et 3 sont abandonnées ; finir deux fois ne lance rien de plus");
  finish[1]();
  assert.deepEqual(started, [1, 4]);
  push(5);
  assert.deepEqual(started, [1, 4, 5]);
});
