import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_DIRECTORY, MCP_FEATURED, sameTool, searchDirectory, serverName, serverSlug } from "./mcp-directory.ts";

test("every entry is an https address under a unique key", () => {
  const keys = new Set<string>();
  for (const e of MCP_DIRECTORY) {
    assert.match(e.url, /^https:\/\//, e.key);
    assert.ok(!keys.has(e.key), e.key);
    keys.add(e.key);
    assert.equal(e.auth === "header", Boolean(e.header), e.key);
  }
  for (const k of MCP_FEATURED) assert.ok(keys.has(k), k);
});

test("nothing typed: the featured tools, in order", () => {
  assert.deepEqual(searchDirectory("").map((e) => e.key), MCP_FEATURED);
});

test("a few letters find the tool, accents and case aside", () => {
  assert.equal(searchDirectory("Unip")[0].key, "unipile");
  assert.equal(searchDirectory("NOTI")[0].key, "notion");
  assert.equal(searchDirectory("jira")[0]?.key, "atlassian");
  assert.ok(searchDirectory("paiements").some((e) => e.key === "stripe"));
  assert.deepEqual(searchDirectory("zzzz"), []);
});

test("the same tool whatever the spelling", () => {
  assert.equal(sameTool("notion", "Notion"), true);
  assert.equal(sameTool("Google Drive", "googledrive"), true);
  assert.equal(sameTool("", "Notion"), false);
});

test("the server name follows the back office's rule", () => {
  for (const e of MCP_DIRECTORY) assert.match(serverName(e), /^[a-z0-9_]+$/, e.key);
});

test("serverSlug: a typed tool becomes a server name", () => {
  assert.equal(serverSlug("Magnific AI"), "magnific_ai");
  assert.equal(serverSlug("  Élan-CRM! "), "elan_crm");
});
