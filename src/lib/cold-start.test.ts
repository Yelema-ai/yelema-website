import assert from "node:assert/strict";
import { test } from "node:test";

import { coldStartWait } from "./cold-start.ts";

test("a read that meets a booting expert is asked again twice, then the error stands", () => {
  assert.equal(coldStartWait(undefined, 502, 0), 2_000);
  assert.equal(coldStartWait("GET", 504, 1), 4_000);
  assert.equal(coldStartWait("GET", 502, 2), null);
});

test("never a write, never another error", () => {
  assert.equal(coldStartWait("POST", 502, 0), null);
  assert.equal(coldStartWait("DELETE", 503, 0), null);
  assert.equal(coldStartWait("GET", 500, 0), null);
  assert.equal(coldStartWait("GET", 404, 0), null);
});

test("the whole wait is capped: a usual cold start keeps its three tries, slow answers stop early", () => {
  assert.equal(coldStartWait("GET", 502, 0, 9_000), 2_000);
  assert.equal(coldStartWait("GET", 502, 1, 20_000), 4_000);
  assert.equal(coldStartWait("GET", 502, 1, 21_001), null);
  assert.equal(coldStartWait("GET", 503, 0, 30_000), null);
});
