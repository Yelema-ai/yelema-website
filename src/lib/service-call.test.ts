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

test("report mode (default) lets the unnamed call through; only `enforce` refuses", () => {
  assert.deepEqual(gatewayUser(null, null, null, gatewayUserMode("report")), { send: null });
  assert.equal(gatewayUserMode(" ENFORCE "), "enforce");
  for (const raw of [undefined, "", "off", "report", "0"]) assert.equal(gatewayUserMode(raw), "report");
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
