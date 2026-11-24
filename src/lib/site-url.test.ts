import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "./site-url.ts";

describe("safeNextPath", () => {
  it("garde un chemin interne, avec sa requête et son ancre", () => {
    for (const ok of ["/", "/experts/abc", "/conversations/partagee?c=a%2Fb&x=1#h", "/dashboards/view?s=abc.def"]) assert.equal(safeNextPath(ok), ok);
  });

  it("refuse tout ce qui mène vers un autre site", () => {
    const bad = ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/a\\b", "/%2Fevil.com", "/%2f%2fevil.com", "/%5Cevil.com", "/%5cevil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", "/\u0000x"];
    for (const raw of bad) assert.equal(safeNextPath(raw), "/", JSON.stringify(raw));
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(undefined), "/");
  });

  it("ce qui est gardé reste sur l'origine", () => {
    for (const raw of ["/x", "/a/b?next=//evil.com", "/a%2F%2Fevil.com"]) assert.equal(new URL(safeNextPath(raw), "https://app.example").origin, "https://app.example");
  });
});
