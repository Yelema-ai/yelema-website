import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { allowedOrigins, crossSiteWrite, csrfMode, jsonTyped } from "./csrf.ts";

const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null });
const HOST = "acme.app.yelema.ai";

describe("crossSiteWrite", () => {
  it("laisse passer les lectures, quelle que soit leur origine", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) assert.equal(crossSiteWrite(m, h({ "sec-fetch-site": "cross-site", origin: "https://evil.com" }), HOST), false);
  });

  it("laisse passer une écriture de nos propres pages", () => {
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "same-origin", origin: `https://${HOST}` }), HOST), false);
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "none" }), HOST), false);
    assert.equal(crossSiteWrite("DELETE", h({ origin: `https://${HOST}` }), HOST), false);
    assert.equal(crossSiteWrite("PUT", h({ origin: "https://ACME.app.yelema.ai" }), HOST), false);
  });

  it("refuse un autre site, y compris un sous-domaine frère", () => {
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "same-site", origin: "https://video.yelema.ai" }), HOST), true);
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "cross-site", origin: "https://evil.com" }), HOST), true);
    assert.equal(crossSiteWrite("PUT", h({ "sec-fetch-site": "cross-site" }), HOST), true);
    assert.equal(crossSiteWrite("PATCH", h({ origin: "https://evil.com" }), HOST), true);
    assert.equal(crossSiteWrite("POST", h({ origin: "null" }), HOST), true);
    assert.equal(crossSiteWrite("POST", h({ origin: "pas une origine" }), HOST), true);
    assert.equal(crossSiteWrite("POST", h({ origin: `https://${HOST}.evil.com` }), HOST), true);
    assert.equal(crossSiteWrite("POST", h({ origin: `https://${HOST}` }), null), true);
  });

  it("laisse passer un appelant sans navigateur", () => {
    assert.equal(crossSiteWrite("POST", h({}), HOST), false);
    assert.equal(crossSiteWrite("POST", h({ authorization: "Bearer abc.def", "sec-fetch-site": "cross-site", origin: "https://evil.com" }), HOST), false);
    assert.equal(crossSiteWrite("POST", h({ authorization: "Bearer ", "sec-fetch-site": "cross-site" }), HOST), true);
  });

  it("laisse passer une origine listée", () => {
    const allowed = allowedOrigins(" https://admin.yelema.ai/ , nimporte quoi,");
    assert.deepEqual([...allowed], ["https://admin.yelema.ai"]);
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "same-site", origin: "https://admin.yelema.ai" }), HOST, allowed), false);
    assert.equal(crossSiteWrite("POST", h({ "sec-fetch-site": "same-site", origin: "https://cdn.yelema.ai" }), HOST, allowed), true);
  });
});

describe("csrfMode, jsonTyped", () => {
  it("observe par défaut, applique sur demande", () => {
    assert.equal(csrfMode(undefined), "report");
    assert.equal(csrfMode("n'importe"), "report");
    assert.equal(csrfMode("enforce"), "enforce");
    assert.equal(csrfMode("off"), "off");
  });

  it("ne reconnaît que JSON, ou pas de type", () => {
    for (const ok of [null, "", "application/json", "Application/JSON; charset=utf-8", "application/csp-report+json"]) assert.equal(jsonTyped(ok), true, String(ok));
    for (const bad of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) assert.equal(jsonTyped(bad), false, bad);
  });
});
