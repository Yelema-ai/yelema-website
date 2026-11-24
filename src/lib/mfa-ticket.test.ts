import assert from "node:assert/strict";
import { test } from "node:test";
import { mfaCookieKey, openMfaTicket, sealMfaTicket } from "./mfa-ticket.ts";

const TICKET = "Ab_-".repeat(10) + "xyz";
const key = mfaCookieKey("a-resolver-token-long-enough");

test("the sealed ticket opens on its host before its end, and shows nothing of itself", () => {
  const sealed = sealMfaTicket(key, TICKET, "acme.app.yelema.ai", 10_000);
  assert.equal(sealed.includes(TICKET), false);
  assert.equal(openMfaTicket(key, sealed, "acme.app.yelema.ai", 9_999), TICKET);
});

test("another host, past its end, another key, a changed byte or garbage: nothing", () => {
  const sealed = sealMfaTicket(key, TICKET, "acme.app.yelema.ai", 10_000);
  assert.equal(openMfaTicket(key, sealed, "other.app.yelema.ai", 0), null);
  assert.equal(openMfaTicket(key, sealed, "acme.app.yelema.ai", 10_000), null);
  assert.equal(openMfaTicket(mfaCookieKey("another-resolver-token-xx"), sealed, "acme.app.yelema.ai", 0), null);
  const bytes = Buffer.from(sealed, "base64url");
  bytes[bytes.length - 1] ^= 1;
  assert.equal(openMfaTicket(key, bytes.toString("base64url"), "acme.app.yelema.ai", 0), null);
  assert.equal(openMfaTicket(key, "not-a-cookie", "acme.app.yelema.ai", 0), null);
  assert.equal(openMfaTicket(key, undefined, "acme.app.yelema.ai", 0), null);
});

test("without a resolver token, one key for the whole process", () => {
  assert.equal(mfaCookieKey(undefined).equals(mfaCookieKey("short")), true);
  assert.equal(mfaCookieKey(undefined).equals(key), false);
});
