import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicId, orderUnits } from "./memory.ts";

test("units follow their parent, at its depth", () => {
  const u = (id: string, parent: string | null) => ({ id, name: id, parent });
  const out = orderUnits([u("rh", "dg"), u("dg", null), u("paie", "rh"), u("it", "dg")]);
  assert.deepEqual(out.map((o) => `${"-".repeat(o.depth)}${o.unit.id}`), ["dg", "-rh", "--paie", "-it"]);
  assert.equal(orderUnits([u("a", "x"), u("b", "c"), u("c", "b")]).length, 3);
});

test("only a plain public id reaches the back office's URL", () => {
  assert.equal(isPublicId("unt_1S0myuwggAVjZSUAu"), true);
  assert.equal(isPublicId("unt_1/../x"), false);
  assert.equal(isPublicId(""), false);
});
