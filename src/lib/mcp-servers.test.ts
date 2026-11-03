import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isServerId, mcpPending, mcpRefusalMessage, mcpScopePath, mcpServerPath, parseOauthQuery, parseServerDraft, type McpOverview, type McpServer } from "./mcp-servers.ts";

describe("mcpRefusalMessage", () => {
  it("each refusal code of the contract has its own French sentence", () => {
    const codes = ["bad_name", "reserved_name", "duplicate_name", "bad_url", "bad_token", "too_many_servers", "forbidden", "not_found", "too_many_attempts", "unavailable", "bad_request", "conflict", "bad_callback", "oauth_unavailable", "instance_error", "bad_stdio"];
    const sentences = codes.map((c) => mcpRefusalMessage(c));
    for (const s of sentences) assert.ok(typeof s === "string" && /[.!]$/.test(s) && !/[a-z]_[a-z]/.test(s));
    assert.equal(new Set(sentences).size, codes.length);
  });

  it("a code that is not one of these gets no sentence here", () => {
    for (const code of ["internal_error", "unauthorized", "", "toString", "constructor"]) assert.equal(mcpRefusalMessage(code), null, code);
  });
});

describe("parseServerDraft", () => {
  it("keeps a named header for the key, with bearer only, and refuses one out of shape", () => {
    const b = { name: "unipile", url: "https://developer.unipile.com/mcp?branch=v2.0", auth: "bearer", token: "k3y" };
    assert.deepEqual(parseServerDraft({ ...b, header: " X-API-KEY " }), { ...b, header: "X-API-KEY" });
    assert.deepEqual(parseServerDraft({ ...b, header: "" }), b);
    for (const header of ["X API", "X-Key:", "-x", "$(id)", 42]) assert.equal(parseServerDraft({ ...b, header }), null, String(header));
    assert.equal(parseServerDraft({ name: "docs", url: "https://docs.exemple.com/mcp", auth: "none", header: "X-API-KEY" }), null);
  });

  const ok = { name: "crm", url: "https://mcp.exemple.com/sse", auth: "bearer", token: "tok_abc.123" };

  it("keeps the four fields of a server, trimmed, and nothing else", () => {
    assert.deepEqual(parseServerDraft({ ...ok, name: " crm ", token: " tok_abc.123 ", role: "admin", scope: "client" }), ok);
    assert.deepEqual(parseServerDraft({ name: "docs", url: "https://docs.exemple.com/mcp", auth: "none" }), { name: "docs", url: "https://docs.exemple.com/mcp", auth: "none" });
  });

  it("a token goes with bearer, and only with bearer", () => {
    assert.equal(parseServerDraft({ ...ok, token: undefined }), null);
    assert.equal(parseServerDraft({ ...ok, token: "  " }), null);
    assert.equal(parseServerDraft({ ...ok, auth: "none" }), null);
    assert.equal(parseServerDraft({ ...ok, auth: "oauth" }), null);
  });

  it("Stdio: a catalogue key only, never an address, a token or a command", () => {
    assert.deepEqual(parseServerDraft({ name: "partage", auth: "stdio", stdio: "fichiers" }), { name: "partage", url: "", auth: "stdio", stdio: "fichiers" });
    for (const body of [{ stdio: "npx -y evil" }, { stdio: "fichiers", url: "https://x.co" }, { stdio: "fichiers", token: "t" }, {}]) assert.equal(parseServerDraft({ name: "partage", auth: "stdio", ...body }), null, JSON.stringify(body));
  });

  it("OAuth: nothing typed, each member authorizes later", () => {
    assert.deepEqual(parseServerDraft({ name: "notion", url: "https://mcp.notion.com/mcp", auth: "oauth" }), { name: "notion", url: "https://mcp.notion.com/mcp", auth: "oauth" });
    assert.equal(parseServerDraft({ name: "notion", url: "https://mcp.notion.com/mcp", auth: "basic" }), null);
  });

  it("refuses what is not a draft, or is oversized", () => {
    for (const body of [null, "x", 42, [], {}, { ...ok, name: "" }, { ...ok, name: 7 }, { ...ok, url: "" }, { ...ok, name: "x".repeat(61) }, { ...ok, url: `https://a.co/${"x".repeat(2000)}` }, { ...ok, token: "x".repeat(4201) }]) assert.equal(parseServerDraft(body), null);
  });
});

describe("the back office's paths", () => {
  it("names the route of each scope, and of one server in it", () => {
    assert.equal(mcpScopePath({ kind: "client" }), "/app/mcp/client");
    assert.equal(mcpScopePath({ kind: "own" }), "/app/mcp/own");
    assert.equal(mcpScopePath({ kind: "member", id: "42" }), "/app/mcp/members/42");
    assert.equal(mcpServerPath({ kind: "client" }, "7"), "/app/mcp/client/7");
    assert.equal(mcpServerPath({ kind: "member", id: "42" }, "7"), "/app/mcp/members/42/7");
  });

  it("an id that is not a plain number never reaches a URL", () => {
    for (const id of ["../client", "7/..", "7?x=1", "", "abc", " 7", "7 ", "1234567890123", 7, null, undefined]) {
      assert.equal(isServerId(id), false, String(id));
      assert.equal(mcpServerPath({ kind: "own" }, id), null, String(id));
    }
    assert.equal(mcpScopePath({ kind: "member", id: "../client" }), null);
    assert.equal(mcpServerPath({ kind: "member", id: "4/.." }, "7"), null);
  });
});

describe("mcpPending", () => {
  const server = (state: McpServer["state"]): McpServer => ({ id: "1", name: "crm", url: "https://mcp.exemple.com/sse", auth: "none", stdio: null, hint: null, header: null, state, updatedAt: null });
  const base: McpOverview = { own: [], stdioCatalogue: [] };

  it("is true while a server is still being written anywhere the caller can see", () => {
    assert.equal(mcpPending(base), false);
    assert.equal(mcpPending({ ...base, own: [server("applied")], client: [server("failed")] }), false);
    assert.equal(mcpPending({ ...base, own: [server("pending")] }), true);
    assert.equal(mcpPending({ ...base, client: [server("pending")] }), true);
    assert.equal(mcpPending({ ...base, members: [{ id: "4", name: null, email: "k@acme.ci", servers: [server("pending")] }] }), true);
  });
});

describe("parseOauthQuery", () => {
  it("keeps the provider's four parameters, nothing else", () => {
    assert.deepEqual(parseOauthQuery({ code: "c0de", state: "S1", iss: "https://mcp.notion.com", other: "x" }), { code: "c0de", state: "S1", iss: "https://mcp.notion.com" });
    assert.deepEqual(parseOauthQuery({ error: "access_denied", state: "S1" }), { error: "access_denied", state: "S1" });
  });

  it("refuses a return without state, without code nor error, or with a non-printable value", () => {
    for (const body of [null, {}, { code: "c" }, { state: "s" }, { code: "a b", state: "s" }, { code: "c\n", state: "s" }, { code: "x".repeat(4097), state: "s" }, { code: 7, state: "s" }]) assert.equal(parseOauthQuery(body), null, JSON.stringify(body));
  });
});
