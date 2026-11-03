import assert from "node:assert/strict";
import { test } from "node:test";
import { isMemoryRoutine, runOpens } from "./routines.ts";

test("a past run opens only when it delivered, and never for a memory routine", () => {
  const work = { name: "Point du matin", task: "Prépare le point du matin." };
  const memory = { name: "Mémoire : regrouper les conversations", task: "Routine de mémoire, silencieuse : personne n'attend de réponse." };
  assert.equal(isMemoryRoutine(memory), true);
  assert.equal(isMemoryRoutine({ name: "Tri", task: "Routine de mémoire, silencieuse." }), true);
  assert.equal(isMemoryRoutine(work), false);
  assert.equal(runOpens({ outcome: "sent" }, work), true);
  assert.equal(runOpens({ outcome: "silent" }, work), false);
  assert.equal(runOpens({ outcome: "failed" }, work), false);
  assert.equal(runOpens({ outcome: null }, work), false);
  assert.equal(runOpens({ outcome: "sent" }, memory), false);
});
