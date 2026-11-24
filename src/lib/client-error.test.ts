import assert from "node:assert/strict";
import { test } from "node:test";

import { clientErrorLine } from "./client-error.ts";

test("one line per error: its fields, each cut to its bound", () => {
  const line = clientErrorLine(JSON.stringify({ where: "chat", path: "/experts/a", message: "boom", stack: "x".repeat(9000), digest: "d1" }));
  assert.ok(line?.startsWith("[client-error] chat /experts/a :: boom :: xxx"));
  assert.ok(line!.endsWith(" :: digest=d1"));
  assert.ok(line!.length < 4900);
});

test("a hostile body cannot forge a log line nor drive a terminal", () => {
  const line = clientErrorLine(JSON.stringify({ where: "a\nb", message: "ok\r\n[auth] admin signed in\u2028x", stack: "\u001b[2J\u001b]0;t\u0007 \u009b31m fin" }))!;
  assert.ok(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(line));
  assert.equal(line.split("\n").length, 1);
  assert.ok(line.includes("ok ⏎ [auth] admin signed in ⏎ x"));
});

test("nothing is written for no body, a body over the bound (null), or anything but a JSON object", () => {
  for (const body of [null, "", "not json", "[1]", "42", "null"]) assert.equal(clientErrorLine(body), null);
});
