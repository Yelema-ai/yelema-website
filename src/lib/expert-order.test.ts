import assert from "node:assert/strict";
import { test } from "node:test";
import { orderExperts } from "./expert-order.ts";

const e = (profileId: string, displayName: string, catalogueKey: string | null = null) => ({ profileId, displayName, catalogueKey });

test("Djénéba first, then by name", () => {
  const out = orderExperts([e("acme__comptable", "Awa"), e("acme__djeneba", "Djénéba", "chief-of-staff"), e("acme__rh", "Binta")], null);
  assert.deepEqual(out.map((x) => x.displayName), ["Djénéba", "Awa", "Binta"]);
});

test("the catalogue's default expert leads too", () => {
  const out = orderExperts([e("a", "Awa"), e("b", "Zoé", "zoe")], "zoe");
  assert.deepEqual(out.map((x) => x.displayName), ["Zoé", "Awa"]);
});
