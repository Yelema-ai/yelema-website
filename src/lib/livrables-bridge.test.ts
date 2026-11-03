import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addBridgeTool,
  BRIDGE_TOOL,
  bridgeAnswer,
  bridgeCall,
  bridgePath,
  bridgeToolSlug,
  isToolsList,
  mimeOf,
  toolkitOf,
} from "./livrables-bridge.ts";

test("a path in the drive is accepted, however the expert writes it", () => {
  const want = "~/Livrables/Kouassi/Devis_templates/261101_proline_devis-simple_v1.pdf";
  assert.equal(bridgePath(want), want);
  assert.equal(bridgePath("Livrables/Kouassi/Devis_templates/261101_proline_devis-simple_v1.pdf"), want);
  assert.equal(bridgePath("/home/node/Livrables/Kouassi/Devis_templates/261101_proline_devis-simple_v1.pdf"), want);
});

test("a path out of the drive, climbing, or naming a folder is refused", () => {
  assert.equal(bridgePath("~/.hermes/config.yaml"), null);
  assert.equal(bridgePath("/home/node/.yelema/apps-mcp.json"), null);
  assert.equal(bridgePath("~/Livrables/../.yelema/apps-mcp.json"), null);
  assert.equal(bridgePath("~/Livrables/Kouassi/"), null);
  assert.equal(bridgePath("~/Livrables"), null);
  assert.equal(bridgePath(42), null);
});

test("the tool slug names the toolkit", () => {
  assert.equal(bridgeToolSlug(" googledrive_upload_file "), "GOOGLEDRIVE_UPLOAD_FILE");
  assert.equal(bridgeToolSlug("drive"), null);
  assert.equal(toolkitOf("GOOGLEDRIVE_UPLOAD_FILE"), "googledrive");
  assert.equal(toolkitOf("GMAIL_SEND_EMAIL"), "gmail");
});

test("the type comes from the extension first", () => {
  assert.equal(mimeOf("devis.pdf", "application/octet-stream"), "application/pdf");
  assert.equal(mimeOf("devis", "image/png; charset=binary"), "image/png");
  assert.equal(mimeOf("devis", null), "application/octet-stream");
});

test("only a single call of the bridge tool is caught", () => {
  const call = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: BRIDGE_TOOL, arguments: { chemin: "a", outil: "b" } } };
  assert.deepEqual(bridgeCall(JSON.stringify(call)), { id: 7, args: { chemin: "a", outil: "b" } });
  assert.equal(bridgeCall(JSON.stringify({ ...call, params: { name: "GMAIL_SEND_EMAIL" } })), null);
  assert.equal(bridgeCall(JSON.stringify([call])), null);
  assert.equal(bridgeCall("not json"), null);
  assert.equal(isToolsList(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })), true);
  assert.equal(isToolsList(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" })), false);
});

test("the answer carries the descriptor, or a readable error", () => {
  const file = { name: "devis.pdf", mimetype: "application/pdf", s3key: "k/1" };
  const ok = bridgeAnswer(3, { ok: true, file });
  assert.equal(ok.result.isError, false);
  assert.deepEqual(JSON.parse(ok.result.content[0].text), file);
  const ko = bridgeAnswer(3, { ok: false, message: "Fichier introuvable" });
  assert.equal(ko.result.isError, true);
  assert.equal(ko.result.content[0].text, "Fichier introuvable");
});

test("the tool is added to tools/list, in JSON and in a stream, once", () => {
  const list = { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "COMPOSIO_SEARCH_TOOLS" }] } };
  const json = JSON.parse(addBridgeTool(JSON.stringify(list), "application/json"));
  assert.deepEqual(json.result.tools.map((t: { name: string }) => t.name), ["COMPOSIO_SEARCH_TOOLS", BRIDGE_TOOL]);
  assert.equal(JSON.parse(addBridgeTool(JSON.stringify(json), "application/json")).result.tools.length, 2);

  const sse = `event: message\ndata: ${JSON.stringify(list)}\n\n`;
  const out = addBridgeTool(sse, "text/event-stream");
  const data = out.split("\n").find((l) => l.startsWith("data:"))!;
  assert.equal(JSON.parse(data.slice(5)).result.tools.length, 2);
  assert.ok(out.startsWith("event: message\n") && out.endsWith("\n\n"));

  assert.equal(addBridgeTool("garbage", "application/json"), "garbage");
});
