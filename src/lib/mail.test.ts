import assert from "node:assert/strict";
import { test } from "node:test";
import { bareAddress, isSent, mailPath, parseRecipients, sandboxedMail } from "./mail.ts";

test("a back-office path is only built from plain segments", () => {
  assert.equal(mailPath("djeneba"), "/app/mail/inboxes/djeneba/messages");
  assert.equal(mailPath("djeneba", "PDAxQG0-"), "/app/mail/inboxes/djeneba/messages/PDAxQG0-");
  assert.equal(mailPath("djeneba", "PDAxQG0-", "YTE"), "/app/mail/inboxes/djeneba/messages/PDAxQG0-/attachments/YTE");
  for (const [expert, message, attachment] of [
    ["../rights", undefined, undefined],
    ["Djeneba", undefined, undefined],
    ["djeneba", "<m1@x>", undefined],
    ["djeneba", "a/../../rights", undefined],
    ["djeneba", "PDAx", "a?x=1"],
    ["djeneba", "", undefined],
  ] as const) {
    assert.equal(mailPath(expert, message, attachment), null);
  }
});

test("recipients typed in one field are split, lowercased and deduplicated", () => {
  assert.deepEqual(parseRecipients(" Awa@Acme.ci, koffi@acme.ci;awa@acme.ci "), ["awa@acme.ci", "koffi@acme.ci"]);
  assert.equal(parseRecipients(""), null);
  assert.equal(parseRecipients("awa@acme"), null);
  assert.equal(parseRecipients("Awa <awa@acme.ci>"), null);
  assert.equal(parseRecipients(Array.from({ length: 21 }, (_, i) => `a${i}@acme.ci`).join(",")), null);
});

test("the sender's address is read out of its display form", () => {
  assert.equal(bareAddress("Koffi Yao <koffi@exemple.ci>"), "koffi@exemple.ci");
  assert.equal(bareAddress("koffi@exemple.ci"), "koffi@exemple.ci");
});

test("a message is sent or received by its label", () => {
  assert.equal(isSent(["sent", "m-3"]), true);
  assert.equal(isSent(["received"]), false);
});

test("a received e-mail is wrapped in a document that fetches nothing but images and opens links elsewhere", () => {
  const doc = sandboxedMail("<script>alert(1)</script><img src=x onerror=alert(2)>");
  assert.match(doc, /Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:"/);
  assert.match(doc, /<base target="_blank">/);
  // The markup is passed through untouched: it is the iframe's empty sandbox that keeps it inert.
  assert.match(doc, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(doc, /script-src|connect-src|form-action/);
});
