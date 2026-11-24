import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boundedBytes, tokenLimit } from "./instance-limits.ts";

const req = (body: string, headers: Record<string, string> = {}) => new Request("https://x.test/", { method: "POST", body, headers });

describe("routes à jeton d'instance", () => {
  it("un jeton est freiné passé son plafond, pas les autres ; la minute suivante repart", () => {
    const limit = tokenLimit(2);
    assert.equal(limit("a", 0), null);
    assert.equal(limit("a", 1), null);
    assert.equal(limit("a", 2), 60);
    assert.equal(limit("b", 2), null);
    assert.equal(limit("a", 60_001), null);
  });

  it("lit un corps jusqu'à sa borne, pas au-delà", async () => {
    assert.equal(new TextDecoder().decode((await boundedBytes(req("bonjour"), 16))!), "bonjour");
    assert.equal(await boundedBytes(req("x".repeat(17)), 16), null);
    assert.equal(await boundedBytes(req("court", { "content-length": "999" }), 16), null);
    assert.equal((await boundedBytes(new Request("https://x.test/"), 16))!.byteLength, 0);
  });
});
