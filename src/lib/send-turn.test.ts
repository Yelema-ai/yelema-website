import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { answered, askApproval, SEND_START, sendEvent } from "./send-turn.ts";

describe("send-turn", () => {
  it("suit un envoi : créé, accord demandé, accord donné, envoyé", () => {
    let s = sendEvent(SEND_START, "response.created", { id: "resp_1", session_id: "s1" });
    assert.deepEqual([s.phase, s.responseId, s.sessionId], ["working", "resp_1", "s1"]);
    s = sendEvent(s, "response.output_text.delta", { text: "Je prépare " });
    s = sendEvent(s, "response.tool_call.started", { tool: "send" });
    assert.equal(s.text, "");
    s = askApproval(s, { request_id: "r1", message: "Envoyer un message avec Gmail : a@b.ci", expires_at: "2026-11-26T14:00:00Z" });
    assert.equal(s.phase, "waiting");
    assert.equal(s.approval?.expiresAt, Date.parse("2026-11-26T14:00:00Z"));
    s = answered(s);
    assert.deepEqual([s.phase, s.approval], ["working", null]);
    s = sendEvent(s, "response.completed", { output_text: "C'est parti à a@b.ci." });
    assert.deepEqual([s.phase, s.text], ["sent", "C'est parti à a@b.ci."]);
  });

  it("un accord résolu ailleurs retire la carte ; un échec la retire aussi", () => {
    let s = askApproval(sendEvent(SEND_START, "response.created", { id: "r" }), { request_id: "x", message: "" });
    assert.match(s.approval!.message, /accord/);
    assert.equal(sendEvent(s, "response.approval_resolved", { request_id: "autre" }).approval?.requestId, "x");
    assert.equal(sendEvent(s, "response.approval_resolved", { request_id: "x" }).approval, null);
    s = sendEvent(s, "response.failed", {});
    assert.deepEqual([s.phase, s.approval], ["failed", null]);
  });

  it("sans identifiant, la demande d'accord est ignorée", () => {
    assert.equal(askApproval(SEND_START, { message: "?" }), SEND_START);
  });
});
