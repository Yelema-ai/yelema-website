import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PROXY_MATCHER } from "./proxy-matcher.ts";

const passes = (path: string) => new RegExp(`^${PROXY_MATCHER}$`).test(path);

describe("PROXY_MATCHER", () => {
  it("est la valeur écrite dans proxy.ts", () => {
    assert.ok(readFileSync(new URL("../proxy.ts", import.meta.url), "utf8").includes(JSON.stringify(PROXY_MATCHER)));
  });

  it("fait passer les pages et les routes par le proxy", () => {
    for (const p of ["/", "/login", "/experts/abc", "/api/agents/x/chat/responses", "/api/auth/login", "/api/health"]) assert.equal(passes(p), true, p);
  });

  it("un suffixe de fichier statique n'excuse jamais une route d'API", () => {
    for (const p of ["/api/agents/x/files/content.png", "/api/agents/x/channels/relay/a.svg", "/api/mcp/own.mp4", "/api/x.webp"]) assert.equal(passes(p), true, p);
  });

  it("laisse dehors les fichiers statiques et le trafic des instances", () => {
    for (const p of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/logos/yelema.svg", "/experts/pied/a.webp", "/yele/yele.mp4", "/api/yele-mcp", "/api/composio-mcp", "/api/memory-mcp", "/api/stt/v1/audio/transcriptions", "/api/webhooks/meetstream", "/api/meetings/icons/video.png"]) assert.equal(passes(p), false, p);
  });
});
