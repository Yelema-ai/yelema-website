import assert from "node:assert/strict";
import { test } from "node:test";
import { BUBBLE, BUBBLE_ROW } from "./exchange-bubble.ts";

const percentWidth = (cls: string) => /max-w-\[[^\]]*%[^\]]*\]/.test(cls);

test("the percentage max width sits on the row, never on the bubble that sizes it", () => {
  assert.ok(percentWidth(BUBBLE_ROW));
  assert.ok(!percentWidth(BUBBLE));
});

test("a long unbroken word still wraps inside the row instead of widening the page", () => {
  assert.ok(BUBBLE_ROW.split(" ").includes("min-w-0"));
  for (const c of ["min-w-0", "max-w-full", "break-words"]) assert.ok(BUBBLE.split(" ").includes(c), c);
});
