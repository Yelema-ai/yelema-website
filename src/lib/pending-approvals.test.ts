import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addPending, dropPending, openPending, pendingLine, type PendingApproval } from "./pending-approvals.ts";

const p = (requestId: string, askedAt: number, expiresAt = 10_000): PendingApproval => ({
  requestId, agentId: "a", profile: "unifood__fatima", sessionId: "s", responseId: "r", message: "m", expiresAt, askedAt,
});

describe("pending-approvals", () => {
  it("garde une demande une fois, la plus récente en tête ; retire celle qui est répondue", () => {
    let l = addPending([], p("x", 1));
    l = addPending(l, p("y", 2));
    l = addPending(l, { ...p("x", 3), message: "nouvelle copie" });
    assert.deepEqual(l.map((x) => x.requestId), ["x", "y"]);
    assert.equal(l[0].message, "nouvelle copie");
    assert.deepEqual(dropPending(l, "x").map((x) => x.requestId), ["y"]);
    assert.equal(dropPending(l, "z"), l);
  });

  it("n'affiche que les demandes encore ouvertes, de la plus récente à la plus ancienne", () => {
    const l = [p("vieille", 1, 500), p("a", 2), p("b", 5)];
    assert.deepEqual(openPending(l, 1000).map((x) => x.requestId), ["b", "a"]);
  });

  it("la ligne de la cloche est la première ligne, sans le corps du message", () => {
    assert.equal(pendingLine("Envoyer un message avec Gmail : a@b.ci\nObjet : X\n\nBonjour"), "Envoyer un message avec Gmail : a@b.ci");
    assert.match(pendingLine(""), /accord/);
    assert.equal(pendingLine("x".repeat(200)).length, 140);
  });
});
