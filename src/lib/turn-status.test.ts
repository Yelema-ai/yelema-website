import assert from "node:assert/strict";
import test from "node:test";
import { chatFailureMessage, BUDGET_EXCEEDED } from "./chat-errors.ts";
import { failureFallback, parseTurnStatus } from "./turn-status.ts";

const QUOTA = "⏱️ Le quota d'utilisation est atteint sur tous les comptes. Il se libère vers 14:30. Je reprends dès que possible.";
const GENERIC = "Votre expert n’a pas pu répondre. Réessayez dans un instant.";

test("response.status : les trois états du contrat, message tel quel", () => {
  assert.deepEqual(parseTurnStatus({ response_id: "r1", kind: "rate_limit", message: QUOTA, resets_at: "2026-11-09T14:30:00Z" }), {
    kind: "rate_limit",
    message: QUOTA,
    resetsAt: "2026-11-09T14:30:00Z",
  });
  assert.deepEqual(parseTurnStatus({ kind: "retry", message: "Les serveurs sont surchargés… Je réessaie dans 20 s.", resets_at: null }), {
    kind: "retry",
    message: "Les serveurs sont surchargés… Je réessaie dans 20 s.",
    resetsAt: null,
  });
  assert.equal(parseTurnStatus({ kind: "waiting", message: "Toujours en cours… votre expert n'a encore rien renvoyé." })?.kind, "waiting");
});

test("response.status : un état inconnu ou sans phrase n'affiche rien", () => {
  assert.equal(parseTurnStatus({ kind: "autre", message: "x" }), null);
  assert.equal(parseTurnStatus({ kind: "waiting", message: "  " }), null);
  assert.equal(parseTurnStatus({ kind: "waiting" }), null);
  assert.equal(parseTurnStatus(null), null);
  assert.equal(parseTurnStatus("waiting"), null);
});

test("response.failed après un quota atteint : la phrase du quota, pas la phrase générique", () => {
  const last = parseTurnStatus({ kind: "rate_limit", message: QUOTA, resets_at: null });
  assert.equal(chatFailureMessage("RateLimitError: 429", failureFallback(last, GENERIC)), QUOTA);
  assert.equal(chatFailureMessage(undefined, failureFallback(last, GENERIC)), QUOTA);
});

test("response.failed après un autre état, ou une cause connue : inchangé", () => {
  assert.equal(failureFallback(parseTurnStatus({ kind: "retry", message: "Je réessaie dans 5 s." }), GENERIC), GENERIC);
  assert.equal(failureFallback(null, GENERIC), GENERIC);
  const last = parseTurnStatus({ kind: "rate_limit", message: QUOTA });
  assert.equal(chatFailureMessage("Budget has been exceeded! Current cost: 200.1", failureFallback(last, GENERIC)), BUDGET_EXCEEDED);
});
