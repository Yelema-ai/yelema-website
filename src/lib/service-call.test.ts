import assert from "node:assert/strict";
import { test } from "node:test";

import { asService, gatewayUser, gatewayUserMode, serviceCaller } from "./service-call.ts";

test("a call names the account given, else the session's", () => {
  assert.deepEqual(gatewayUser("owner", "reader", null, "enforce"), { send: "owner" });
  assert.deepEqual(gatewayUser(null, "reader", null, "enforce"), { send: "reader" });
  assert.deepEqual(gatewayUser(null, "reader", "shared-dashboard", "enforce"), { send: "reader" });
});

test("without an account, only a named service leaves; anything else is refused", () => {
  assert.deepEqual(gatewayUser(null, null, "yele-mcp", "enforce"), { send: null });
  assert.deepEqual(gatewayUser(null, null, null, "enforce"), { refuse: true });
  assert.deepEqual(gatewayUser("", "", null, "enforce"), { refuse: true });
});

test("report mode lets the unnamed call through; any other value enforces", () => {
  assert.deepEqual(gatewayUser(null, null, null, gatewayUserMode("report")), { send: null });
  assert.equal(gatewayUserMode(" REPORT "), "report");
  for (const raw of [undefined, "", "off", "enforce", "0"]) assert.equal(gatewayUserMode(raw), "enforce");
});

test("the service name follows the work it wraps, awaits included, and nothing outside it", async () => {
  assert.equal(serviceCaller(), null);
  const inside = await asService("composio-mcp", async () => {
    await new Promise((r) => setTimeout(r, 1));
    return serviceCaller();
  });
  assert.equal(inside, "composio-mcp");
  assert.equal(serviceCaller(), null);
  const [a, b] = await Promise.all([asService("yele-mcp", async () => serviceCaller()), (async () => serviceCaller())()]);
  assert.deepEqual([a, b], ["yele-mcp", null]);
});
