import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { callerProfile, instanceBearer } from "./profile-token.ts";

const H = "a".repeat(64);
const SEAL = "b".repeat(64);

test("today's instance token is found by its own SHA-256, as before", () => {
  const token = "yapps_" + "0f".repeat(24);
  assert.deepEqual(instanceBearer(token), { hash: createHash("sha256").update(token).digest("hex"), profile: null });
  assert.equal(instanceBearer("anything else")?.profile, null);
});

test("a profile token names the instance by the hash it carries, and its profile", () => {
  assert.deepEqual(instanceBearer(`yprof1.${H}.acme__djeneba.${SEAL}`), { hash: H, profile: "acme__djeneba" });
  assert.deepEqual(instanceBearer(`yprof1.${H}.u-1a2b3c.${SEAL}`), { hash: H, profile: "u-1a2b3c" });
  assert.deepEqual(instanceBearer(`yprof1.${H}.u-1a2b3c__finance.${SEAL}`), { hash: H, profile: "u-1a2b3c__finance" });
});

test("a malformed profile token is refused, never read as an instance token", () => {
  for (const bad of [`yprof1.${H}.acme.`, `yprof1.${H}..${SEAL}`, `yprof1.${H.slice(1)}.acme.${SEAL}`, `yprof1.${H.toUpperCase()}.acme.${SEAL}`, `yprof1.${H}.Acme.${SEAL}`, `yprof1.${H}.a/../b.${SEAL}`, `yprof1.${H}.acme.${SEAL}.x`, `yprof1.${H}.acme.${SEAL}\n`, "yprof1.", `yprof1.${H}.${"p".repeat(65)}.${SEAL}`]) {
    assert.equal(instanceBearer(bad), null, bad);
  }
});

test("the profile of a profile token wins over what the instance announces", () => {
  const bound = instanceBearer(`yprof1.${H}.acme__djeneba.${SEAL}`)!;
  assert.equal(callerProfile(bound, "u-9z9z9z"), "acme__djeneba");
  assert.equal(callerProfile(bound, null), "acme__djeneba");
  const plain = instanceBearer("yapps_x")!;
  assert.equal(callerProfile(plain, " u-1a2b3c "), "u-1a2b3c");
  assert.equal(callerProfile(plain, ""), null);
});
