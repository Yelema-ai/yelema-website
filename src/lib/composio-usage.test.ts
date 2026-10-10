import assert from "node:assert/strict";
import { test } from "node:test";
import { extractComposioCalls, MAX_CALLS } from "./composio-usage.ts";

const call = (name: unknown, args?: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const extract = (body: unknown) => extractComposioCalls(JSON.stringify(body));

test("a direct tool call is one execution", () => {
  assert.deepEqual(extract(call("GMAIL_SEND_EMAIL", { to: "a@b.c" })), [{ tool: "GMAIL_SEND_EMAIL", via: "direct" }]);
});

test("the executed tool's name is preferred over the tool that carried it", () => {
  assert.deepEqual(extract(call("COMPOSIO_EXECUTE_TOOL", { tool_slug: "NOTION_CREATE_PAGE" })), [
    { tool: "NOTION_CREATE_PAGE", via: "direct" },
  ]);
});

test("a JSON-RPC batch gives one execution per tool call, and nothing for other methods", () => {
  const body = [call("GMAIL_SEND_EMAIL"), { jsonrpc: "2.0", id: 2, method: "tools/list" }, call("SLACK_SEND_MESSAGE")];
  assert.deepEqual(extract(body), [
    { tool: "GMAIL_SEND_EMAIL", via: "direct" },
    { tool: "SLACK_SEND_MESSAGE", via: "direct" },
  ]);
});

test("a multi-execution is one execution per tool", () => {
  const body = call("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS" }, { tool_slug: "GOOGLECALENDAR_EVENTS_LIST" }] });
  assert.deepEqual(extract(body), [
    { tool: "GMAIL_FETCH_EMAILS", via: "multi_execute" },
    { tool: "GOOGLECALENDAR_EVENTS_LIST", via: "multi_execute" },
  ]);
});

test("an empty multi-execution still counts once", () => {
  assert.deepEqual(extract(call("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [] })), [
    { tool: "COMPOSIO_MULTI_EXECUTE_TOOL", via: "multi_execute" },
  ]);
  assert.deepEqual(extract(call("COMPOSIO_MULTI_EXECUTE_TOOL")), [{ tool: "COMPOSIO_MULTI_EXECUTE_TOOL", via: "multi_execute" }]);
});

test("a multi-execution is capped at 50 tools", () => {
  const tools = Array.from({ length: 80 }, () => ({ tool_slug: "GMAIL_SEND_EMAIL" }));
  assert.equal(extract(call("COMPOSIO_MULTI_EXECUTE_TOOL", { tools })).length, 50);
});

test("discovery tools are declared as meta", () => {
  assert.deepEqual(extract([call("COMPOSIO_SEARCH_TOOLS"), call("COMPOSIO_GET_TOOL_SCHEMAS")]), [
    { tool: "COMPOSIO_SEARCH_TOOLS", via: "meta" },
    { tool: "COMPOSIO_GET_TOOL_SCHEMAS", via: "meta" },
  ]);
});

test("a call whose name is out of bounds is dropped, the others are kept", () => {
  const body = [call("GMAIL SEND; drop table"), call("x".repeat(129)), call(42), call("SLACK_SEND_MESSAGE")];
  assert.deepEqual(extract(body), [{ tool: "SLACK_SEND_MESSAGE", via: "direct" }]);
});

test("an executed tool's name out of bounds falls back to the tool that carried it", () => {
  assert.deepEqual(extract(call("COMPOSIO_EXECUTE_TOOL", { tool_slug: "not a name" })), [{ tool: "COMPOSIO_EXECUTE_TOOL", via: "direct" }]);
  assert.deepEqual(extract(call("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{ tool_slug: "" }, null, { tool_slug: "GMAIL_SEND_EMAIL" }] })), [
    { tool: "COMPOSIO_MULTI_EXECUTE_TOOL", via: "multi_execute" },
    { tool: "COMPOSIO_MULTI_EXECUTE_TOOL", via: "multi_execute" },
    { tool: "GMAIL_SEND_EMAIL", via: "multi_execute" },
  ]);
});

test("one request never declares more than the back office accepts", () => {
  const tools = Array.from({ length: 50 }, () => ({ tool_slug: "GMAIL_SEND_EMAIL" }));
  const body = Array.from({ length: 7 }, () => call("COMPOSIO_MULTI_EXECUTE_TOOL", { tools }));
  assert.equal(extract(body).length, MAX_CALLS);
  assert.equal(extract(Array.from({ length: 500 }, () => call("GMAIL_SEND_EMAIL"))).length, MAX_CALLS);
});

test("a body that is not a tool call gives nothing", () => {
  assert.deepEqual(extractComposioCalls("not json"), []);
  assert.deepEqual(extractComposioCalls(""), []);
  assert.deepEqual(extractComposioCalls("null"), []);
  assert.deepEqual(extractComposioCalls("[null, 3, \"x\"]"), []);
  assert.deepEqual(extract({ jsonrpc: "2.0", id: 1, method: "initialize" }), []);
});
