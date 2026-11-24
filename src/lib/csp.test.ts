import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCsp, cspApplies, cspHeaderName, cspMode } from "./csp.ts";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("csp", () => {
  it("observe par défaut", () => {
    assert.equal(cspMode(undefined), "report");
    assert.equal(cspMode("nimporte"), "report");
    assert.equal(cspMode("enforce"), "enforce");
    assert.equal(cspMode("off"), "off");
    assert.equal(cspHeaderName("report"), "Content-Security-Policy-Report-Only");
    assert.equal(cspHeaderName("enforce"), "Content-Security-Policy");
  });

  it("ne laisse charger une image que de nos hôtes", () => {
    const img = directive(buildCsp({ own: ["https://back-office.exemple.com/", undefined, "pas une url"] }), "img-src");
    assert.ok(img.includes("'self'") && img.includes("data:") && img.includes("blob:") && img.includes("https://*.yelema.ai"));
    assert.ok(img.includes("https://back-office.exemple.com"));
    assert.ok(!img.includes("https:") && !img.includes("*") && !img.includes("http:"));
  });

  it("ferme ce qui n'a pas à sortir", () => {
    const csp = buildCsp();
    assert.deepEqual(directive(csp, "object-src"), ["'none'"]);
    assert.deepEqual(directive(csp, "base-uri"), ["'self'"]);
    assert.deepEqual(directive(csp, "form-action"), ["'self'"]);
    assert.deepEqual(directive(csp, "frame-ancestors"), ["'self'"]);
    assert.ok(!directive(csp, "script-src").includes("'unsafe-eval'"));
    assert.ok(!directive(csp, "script-src").some((s) => s.startsWith("http")));
    assert.ok(directive(buildCsp({ dev: true }), "script-src").includes("'unsafe-eval'"));
  });

  it("prend les sources ajoutées par l'exploitant, jamais de quoi fermer la directive", () => {
    const csp = buildCsp({ img: "https://cdn.exemple.com https:;script-src * ", connect: "wss://relais.exemple.com", frame: "https://cadres.exemple.com" });
    assert.ok(directive(csp, "img-src").includes("https://cdn.exemple.com"));
    assert.equal(csp.split("script-src").length, 2);
    assert.deepEqual(directive(csp, "connect-src"), ["'self'", "wss://relais.exemple.com"]);
    assert.ok(directive(csp, "frame-src").includes("https://cadres.exemple.com"));
  });

  it("ne s'applique qu'aux pages", () => {
    assert.equal(cspApplies("/experts/abc"), true);
    assert.equal(cspApplies("/"), true);
    assert.equal(cspApplies("/api/agents/x/files/content"), false);
  });
});
