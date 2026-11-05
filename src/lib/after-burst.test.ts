import assert from "node:assert/strict";
import { test } from "node:test";
import { afterBurst } from "./after-burst.ts";

function clock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  return {
    t: {
      setTimeout: (fn: () => void, ms: number) => (timers.push({ at: now + ms, fn, id: ++id }), id),
      clearTimeout: (h: unknown) => void (timers = timers.filter((x) => x.id !== h)),
      now: () => now,
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        timers = timers.filter((x) => x !== next);
        next.fn();
      }
      now = end;
    },
  };
}

test("fires once the burst is quiet", () => {
  const c = clock();
  const fired: string[] = [];
  const hit = afterBurst((k) => fired.push(k), 4_000, 15_000, c.t);
  hit("a");
  c.advance(3_000);
  hit("a");
  c.advance(3_999);
  assert.deepEqual(fired, []);
  c.advance(1);
  assert.deepEqual(fired, ["a"]);
});

test("a burst that never stops still fires every maxMs", () => {
  const c = clock();
  const fired: number[] = [];
  const hit = afterBurst(() => fired.push(c.t.now()), 4_000, 15_000, c.t);
  for (let i = 0; i < 20; i++) {
    hit("a");
    c.advance(2_000);
  }
  assert.deepEqual(fired, [15_000, 31_000]);
});
