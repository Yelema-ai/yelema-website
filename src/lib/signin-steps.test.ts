import assert from "node:assert/strict";
import { test } from "node:test";
import { codeRefusal, googleErrorMessage, googleReason, GOOGLE_ERRORS, googleStartUrl, mfaChallenge, mfaCookieOptions, openingStep, totpCode } from "./signin-steps.ts";

const TICKET = "A".repeat(43);
const refusal = (status: number, code: string, details: Record<string, unknown> = {}) => Object.assign(new Error(code), { status, code, details });

test("an opening that succeeds gives its session (the route sets the cookie)", async () => {
  const step = await openingStep(async () => ({ session: { accessToken: "a" } }));
  assert.deepEqual(step, { kind: "session", session: { accessToken: "a" } });
});

test("403 mfa_required with its ticket opens the code step, without the session", async () => {
  const step = await openingStep(() => Promise.reject(refusal(403, "mfa_required", { ticket: TICKET, expiresIn: 300 })));
  assert.deepEqual(step, { kind: "mfa", ticket: TICKET, expiresIn: 300 });
});

test("mfa_required without a well-formed ticket, suspended, 409 and outages stay refusals", async () => {
  for (const e of [refusal(403, "mfa_required", { ticket: "short" }), refusal(403, "suspended"), refusal(409, "workspace_required", { workspaces: [] }), new Error("boom")]) {
    const step = await openingStep(() => Promise.reject(e));
    assert.equal(step.kind, "refused");
  }
  assert.equal(mfaChallenge(refusal(403, "mfa_required", { ticket: TICKET }))?.expiresIn, 300, "no expiresIn: 5 minutes");
});

test("a refused Google return reads as a reason the login page puts in words", () => {
  assert.equal(googleReason(refusal(401, "unauthorized")), "account");
  assert.equal(googleReason(refusal(403, "suspended")), "suspended");
  assert.equal(googleReason(refusal(409, "workspace_required")), "workspace");
  assert.equal(googleReason(refusal(429, "rate_limited")), "limited");
  assert.equal(googleReason(refusal(503, "unavailable")), "unavailable");
  assert.equal(googleReason(new TypeError("fetch failed")), "unavailable");
  assert.equal(googleErrorMessage("workspace"), GOOGLE_ERRORS.workspace);
  assert.equal(googleErrorMessage("<script>"), GOOGLE_ERRORS.unavailable);
  assert.equal(googleErrorMessage(null), GOOGLE_ERRORS.unavailable);
});

test("the start goes to the back office with this site's origin and workspace", () => {
  const url = new URL(googleStartUrl("https://bo.example/", "https://acme.app.yelema.ai", "11111111-1111-1111-1111-111111111111"));
  assert.equal(url.origin + url.pathname, "https://bo.example/api/v1/app/auth/google/start");
  assert.equal(url.searchParams.get("return"), "https://acme.app.yelema.ai");
  assert.equal(url.searchParams.get("workspace"), "11111111-1111-1111-1111-111111111111");
  assert.equal(new URL(googleStartUrl("https://bo.example", "https://x.test", undefined)).searchParams.has("workspace"), false);
});

test("a code is six digits, spaces ignored", () => {
  assert.equal(totpCode("123 456"), "123456");
  assert.equal(totpCode(" 654321 "), "654321");
  for (const bad of ["12345", "1234567", "12a456", 123456, null]) assert.equal(totpCode(bad), null);
});

test("a wrong code says how many tries are left; the last one or a dead ticket restarts the sign-in", () => {
  assert.deepEqual(codeRefusal(refusal(401, "mfa_code_invalid", { attemptsLeft: 2 })), { status: 401, code: "mfa_code_invalid", message: "Code incorrect. Il vous reste 2 essais.", attemptsLeft: 2, restart: false });
  assert.equal(codeRefusal(refusal(401, "mfa_code_invalid", { attemptsLeft: 1 }))?.message, "Code incorrect. Il vous reste 1 essai.");
  assert.deepEqual(codeRefusal(refusal(401, "mfa_code_invalid", { attemptsLeft: 0 }))?.restart, true);
  assert.equal(codeRefusal(refusal(401, "mfa_ticket_invalid"))?.restart, true);
  assert.equal(codeRefusal(refusal(429, "rate_limited")), null);
});

test("the ticket cookie never outlives the ticket, and only the sign-in routes get it", () => {
  assert.deepEqual(mfaCookieOptions(120, true), { httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 120 });
  assert.equal(mfaCookieOptions(3600, false).maxAge, 300);
  assert.equal(mfaCookieOptions(undefined, false).maxAge, 300);
});
