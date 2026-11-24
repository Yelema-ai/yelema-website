import assert from "node:assert/strict";
import { test } from "node:test";

import { RENEW_BEFORE_S, RENEW_EARLY_S, renewBefore, tokenLifetime } from "./session-renewal.ts";

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

test("une page renouvelle tôt ; un envoi, un flux ou une route seulement quand le jeton va mourir", () => {
  assert.equal(renewBefore("GET", "/experts/abc", 3600), RENEW_EARLY_S);
  assert.equal(renewBefore("GET", "/", 3600), RENEW_EARLY_S);
  assert.equal(renewBefore("GET", "/api/agents/a/events", 3600), RENEW_BEFORE_S);
  assert.equal(renewBefore("POST", "/api/agents/a/chat/responses", 3600), RENEW_BEFORE_S);
  assert.equal(renewBefore("POST", "/login", 3600), RENEW_BEFORE_S);
});

test("jamais à chaque page : un jeton court ou de durée inconnue garde le seuil d'avant", () => {
  assert.equal(renewBefore("GET", "/", null), RENEW_BEFORE_S);
  assert.equal(renewBefore("GET", "/", 300), RENEW_BEFORE_S);
  assert.equal(renewBefore("GET", "/", 1200), 300);
  assert.equal(tokenLifetime(jwt({ iat: 1000, exp: 4600 })), 3600);
  for (const bad of [jwt({ exp: 4600 }), jwt({ iat: 5000, exp: 4600 }), "pas-un-jeton", "", "a.%%%.c"]) assert.equal(tokenLifetime(bad), null, bad);
});
