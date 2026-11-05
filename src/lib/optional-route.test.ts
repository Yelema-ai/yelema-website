import assert from "node:assert/strict";
import { test } from "node:test";
import { optionalRoute } from "./optional-route.ts";

test("an absent route is not asked again before its TTL; another failure is thrown and not remembered", async () => {
  let t = 0;
  let calls = 0;
  let answer: "absent" | "null" | "boom" | "ok" = "absent";
  const route = optionalRoute(
    async () => {
      calls++;
      if (answer === "absent") throw Object.assign(new Error("404"), { status: 404 });
      if (answer === "boom") throw new Error("500");
      return answer === "null" ? null : "body";
    },
    { absent: (e) => (e as { status?: number }).status === 404, ttlMs: 1_000, now: () => t }
  );
  assert.equal(await route(), null);
  assert.equal(await route(), null);
  assert.equal(calls, 1);
  t = 1_000;
  answer = "boom";
  await assert.rejects(route());
  await assert.rejects(route());
  assert.equal(calls, 3);
  answer = "null";
  assert.equal(await route(), null);
  answer = "ok";
  assert.equal(await route(), null, "a null answer counts as absent too");
  t = 2_000;
  assert.equal(await route(), "body");
});

test("keyed by peer: one peer without the route does not stop the others asking", async () => {
  const asked: string[] = [];
  const route = optionalRoute(async (peer: string) => (asked.push(peer), peer === "old" ? null : peer), { key: (peer) => peer, ttlMs: 1_000, now: () => 0 });
  assert.equal(await route("old"), null);
  assert.equal(await route("new"), "new");
  assert.equal(await route("old"), null);
  assert.equal(await route("new"), "new");
  assert.deepEqual(asked, ["old", "new", "new"]);
});
