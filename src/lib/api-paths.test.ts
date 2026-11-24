import assert from "node:assert/strict";
import { test } from "node:test";
import { mailMessagePath, responsePath, routinePath, salonPath, sessionPath } from "./api-paths.ts";

const resolved = (path: string) => new URL(path, "https://app.invalid").pathname;

test("🔒 un identifiant venu de l'instance reste un seul segment de son adresse", () => {
  const evil = "../../../../buzz/salons/0b7c?x=";
  assert.equal(resolved(routinePath("a1", evil)), "/api/agents/a1/routines/..%2F..%2F..%2F..%2Fbuzz%2Fsalons%2F0b7c%3Fx%3D");
  assert.ok(resolved(routinePath("a1", evil, "run")).startsWith("/api/agents/a1/routines/"));
  assert.ok(resolved(responsePath("a1", "../../auth/logout?", "cancel")).startsWith("/api/agents/a1/chat/responses/"));
  assert.ok(resolved(sessionPath("a1", "..", "?profile=awa")).startsWith("/api/agents/a1/chat/sessions/"));
  assert.ok(resolved(mailMessagePath("djeneba", "../../inboxes", "attachments", "../x")).startsWith("/api/mail/djeneba/messages/"));
  assert.equal(resolved(salonPath("../../mail/inboxes?")), "/api/buzz/salons/..%2F..%2Fmail%2Finboxes%3F");
  for (const id of ["", ".", ".."]) {
    assert.equal(resolved(sessionPath("a1", id, "?profile=awa")), "/api/agents/a1/chat/sessions/_");
    assert.equal(resolved(routinePath("a1", id, "run")), "/api/agents/a1/routines/_/run");
  }
});

test("les identifiants ordinaires gardent l'adresse d'avant", () => {
  assert.equal(sessionPath("a1", "20251124_101010_ab12", "?profile=awa"), "/api/agents/a1/chat/sessions/20251124_101010_ab12?profile=awa");
  assert.equal(sessionPath("a1", "s1", "", "share"), "/api/agents/a1/chat/sessions/s1/share");
  assert.equal(responsePath("a1", "resp_1", "steer"), "/api/agents/a1/chat/responses/resp_1/steer");
  assert.equal(routinePath("a1", "job-1"), "/api/agents/a1/routines/job-1");
  assert.equal(routinePath("a1", "job-1", "runs"), "/api/agents/a1/routines/job-1/runs");
  assert.equal(mailMessagePath("djeneba", "m_1", "attachments", "a_1"), "/api/mail/djeneba/messages/m_1/attachments/a_1");
  assert.equal(salonPath("0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", "guests"), "/api/buzz/salons/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f/guests");
});
