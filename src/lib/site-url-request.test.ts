import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestSiteOrigin } from "./site-url.ts";

describe("origine des liens d'une requête", () => {
  it("multi-client : l'hôte du client, même si SITE_URL est posé", () => {
    assert.equal(requestSiteOrigin(true, "https://app.yelema.ai", "acme.app.yelema.ai", "http://10.0.0.1:3000"), "https://acme.app.yelema.ai");
  });

  it("multi-client sans hôte lisible : l'origine de la requête", () => {
    assert.equal(requestSiteOrigin(true, "https://app.yelema.ai", null, "http://localhost:3000"), "http://localhost:3000");
  });

  it("mono-client : SITE_URL l'emporte", () => {
    assert.equal(requestSiteOrigin(false, "https://acme.yelema.ai", "other.example", "http://x"), "https://acme.yelema.ai");
  });
});
