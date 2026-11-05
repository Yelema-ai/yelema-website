import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGroupedToolsFiles, parseToolsFile, toolStatus, toolsOverview, TOOLS_FILE_MAX_BYTES, type ExpertTool } from "./expert-tools.ts";

const tool = (over: Partial<ExpertTool>): ExpertTool => ({
  nom: "Figma",
  usage: "Lire les fichiers de conception",
  type: "application",
  composio: "figma",
  priorite: "essentiel",
  ...over,
});
const file = (outils: unknown[], extra: object = {}) => JSON.stringify({ version: 1, expert: "koffi", outils, ...extra });

test("a version-1 file gives its tools; anything else is not a list", () => {
  assert.deepEqual(parseToolsFile(file([tool({ composio: "Figma" })])), [tool({})]);
  assert.equal(parseToolsFile(file([], { version: 2 })), null);
  assert.equal(parseToolsFile(JSON.stringify({ version: 1 })), null);
  assert.equal(parseToolsFile("{ pas du json"), null);
  assert.equal(parseToolsFile("null"), null);
  assert.equal(parseToolsFile(" ".repeat(TOOLS_FILE_MAX_BYTES + 1)), null);
});

test("a bad entry is dropped, the rest kept", () => {
  const bad = [
    { ...tool({}), type: "plugin" },
    { ...tool({}), priorite: "urgent" },
    { ...tool({}), nom: "" },
    { ...tool({}), nom: "x".repeat(81) },
    { ...tool({}), composio: "../figma" },
    { ...tool({}), composio: 3 },
    { ...tool({}), usage: 42 },
    "Figma",
    null,
  ];
  const ok = tool({ nom: "Annuaire public", type: "source-publique", composio: null, usage: undefined as unknown as string });
  assert.deepEqual(parseToolsFile(file([...bad, ok])), [{ ...ok, usage: "" }]);
});

test("a name listed twice counts once, and the list is capped", () => {
  assert.equal(parseToolsFile(file([tool({}), tool({ nom: "figma " })]))?.length, 1);
  const many = Array.from({ length: 80 }, (_, i) => tool({ nom: `Outil ${i}` }));
  assert.equal(parseToolsFile(file(many))?.length, 50);
});

const conn = (toolkitSlug: string, status = "ACTIVE", isDisabled = false) => ({ id: toolkitSlug, status, toolkitSlug, isDisabled });

test("an application is ready once an active account matches its slug or its name", () => {
  assert.equal(toolStatus(tool({}), [conn("FIGMA")], []), "ready");
  assert.equal(toolStatus(tool({ nom: "Google Drive", composio: null }), [conn("google_drive")], []), "ready");
  assert.equal(toolStatus(tool({}), [conn("figma", "INITIATED")], []), "todo");
  assert.equal(toolStatus(tool({}), [conn("figma", "ACTIVE", true)], []), "todo");
  assert.equal(toolStatus(tool({}), [conn("notion")], []), "todo");
});

test("a tool server is ready when one of that name is plugged in; the base and public data are included", () => {
  const sage = tool({ nom: "ERP Sage", type: "mcp", composio: null });
  assert.equal(toolStatus(sage, [], ["erp_sage"]), "ready");
  assert.equal(toolStatus(sage, [], ["crm"]), "todo");
  assert.equal(toolStatus(tool({ type: "socle", composio: null }), [], []), "included");
  assert.equal(toolStatus(tool({ type: "source-publique", composio: null }), [], []), "included");
});

test("the overview lists what is left to connect, essential first, and counts what is usable", () => {
  const tools = [
    tool({ nom: "Notion", composio: "notion", priorite: "utile" }),
    tool({}),
    tool({ nom: "Slack", composio: "slack" }),
    tool({ nom: "Recherche web", type: "socle", composio: null }),
  ];
  const o = toolsOverview(tools, [conn("slack")], []);
  assert.deepEqual(o.todo.map((t) => t.nom), ["Figma", "Notion"]);
  assert.deepEqual(o.ready.map((t) => t.nom), ["Slack"]);
  assert.deepEqual(o.included.map((t) => t.nom), ["Recherche web"]);
  assert.equal(o.usable, 2);
  assert.equal(o.total, 4);
});

test("the grouped read: each asked profile its list, a 404 empty, another error left out for a single read", () => {
  const body = {
    data: {
      a: file([tool({})]),
      b: null,
      c: { error: { status: 404 } },
      d: { error: { status: 502 } },
      e: { content: file([tool({ nom: "Notion", composio: "notion" })]) },
      f: JSON.parse(file([tool({ nom: "Slack", composio: "slack" })])),
      g: "not json",
      h: "x".repeat(TOOLS_FILE_MAX_BYTES + 1),
      stranger: file([tool({})]),
    },
  };
  const got = parseGroupedToolsFiles(body, ["a", "b", "c", "d", "e", "f", "g", "h", "missing"]);
  assert.deepEqual(got.get("a"), [tool({})]);
  assert.deepEqual(got.get("b"), []);
  assert.deepEqual(got.get("c"), []);
  assert.equal(got.has("d"), false);
  assert.deepEqual(got.get("e")?.map((t) => t.nom), ["Notion"]);
  assert.deepEqual(got.get("f")?.map((t) => t.nom), ["Slack"]);
  assert.deepEqual(got.get("g"), []);
  assert.deepEqual(got.get("h"), []);
  assert.equal(got.has("missing"), false);
  assert.equal(got.has("stranger"), false);
  assert.equal(parseGroupedToolsFiles({ data: [] }, ["a"]).size, 0);
  assert.equal(parseGroupedToolsFiles(null, ["a"]).size, 0);
});
