import assert from "node:assert/strict";
import { test } from "node:test";
import { answerRpc, type MemoryBackend } from "./memory-mcp.ts";

const backend = (over: Partial<MemoryBackend> = {}): MemoryBackend => ({ ask: async () => "30 jours", search: async () => [], ...over });
const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
const textOf = (answer: unknown) => (answer as { result: { content: { text: string }[]; isError?: boolean } }).result;

test("handshake: initialize echoes the client's version, a notification takes no answer", async () => {
  const init = await answerRpc(rpc("initialize", { protocolVersion: "2025-06-18" }), backend());
  assert.equal((init?.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
  assert.equal(await answerRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, backend()), null);
});

test("two tools are listed", async () => {
  const list = await answerRpc(rpc("tools/list"), backend());
  assert.deepEqual((list?.result as { tools: { name: string }[] }).tools.map((t) => t.name), ["demander", "rechercher"]);
});

test("demander: the answer, or a plain sentence when nothing is readable", async () => {
  assert.equal(textOf(await answerRpc(rpc("tools/call", { name: "demander", arguments: { question: "Congés ?" } }), backend())).content[0].text, "30 jours");
  const empty = textOf(await answerRpc(rpc("tools/call", { name: "demander", arguments: { question: "Congés ?" } }), backend({ ask: async () => null })));
  assert.match(empty.content[0].text, /ne contient rien/);
});

test("rechercher: excerpts under their title", async () => {
  const found = backend({ search: async () => [{ title: "Règlement", excerpt: "30 jours de congés" }] });
  assert.equal(textOf(await answerRpc(rpc("tools/call", { name: "rechercher", arguments: { requete: "congés" } }), found)).content[0].text, "## Règlement\n30 jours de congés");
});

test("a refusal of the back office is a tool error; a revoked token is not swallowed", async () => {
  const refused = backend({ ask: async () => { throw Object.assign(new Error("Accès suspendu."), { status: 403 }); } });
  const out = textOf(await answerRpc(rpc("tools/call", { name: "demander", arguments: { question: "Congés ?" } }), refused));
  assert.deepEqual([out.isError, out.content[0].text], [true, "Accès suspendu."]);
  const revoked = backend({ ask: async () => { throw Object.assign(new Error("x"), { status: 401 }); } });
  await assert.rejects(answerRpc(rpc("tools/call", { name: "demander", arguments: { question: "Congés ?" } }), revoked));
});

test("unknown method or tool, missing argument", async () => {
  assert.equal((await answerRpc(rpc("resources/list"), backend()))?.error?.code, -32601);
  assert.equal(textOf(await answerRpc(rpc("tools/call", { name: "effacer", arguments: {} }), backend())).isError, true);
  assert.equal(textOf(await answerRpc(rpc("tools/call", { name: "demander", arguments: {} }), backend())).isError, true);
});
