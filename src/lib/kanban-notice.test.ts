import assert from "node:assert/strict";
import { test } from "node:test";
import { kanbanNotice } from "./kanban-notice.ts";

const wake = (status: string) =>
  `[kanban] Task t_dd342ee5 ${status}.\nTitle: Rédiger un modèle de contrat\nAssignee: @ibrahim\nBoard: default\n\nCheck the result or decide the next step.\nResult: Modèle rédigé.`;

test("a wake turn reads as a status line: who, what, which task", () => {
  assert.deepEqual(kanbanNotice(wake("completed")), { taskId: "t_dd342ee5", title: "Rédiger un modèle de contrat", who: "Ibrahim", verb: "a terminé" });
  assert.equal(kanbanNotice(wake("blocked; needs attention"))?.verb, "est bloqué sur");
  assert.equal(kanbanNotice(wake("gave up (retries exhausted)"))?.verb, "n’a pas pu terminer");
  assert.equal(kanbanNotice(wake("crashed (worker exited); dispatcher will retry"))?.verb, "a été interrompu sur (nouvel essai en cours)");
  assert.equal(kanbanNotice(wake("status changed"))?.verb, "a fait avancer");
});

test("anything else stays the user's message", () => {
  assert.equal(kanbanNotice("Où en est le contrat confié à Ibrahim ?"), null);
  assert.equal(kanbanNotice("[kanban] parle-moi du tableau"), null);
});

test("the dispatcher's opening turn of a task is recognised, a member's sentence is not", async () => {
  const { kanbanWork } = await import("./kanban-notice.ts");
  assert.equal(kanbanWork("work kanban task t_f98bdda9"), "t_f98bdda9");
  assert.equal(kanbanWork("Work kanban task t_ab12\nTitle: x"), "t_ab12");
  assert.equal(kanbanWork("peux-tu travailler la tâche kanban ?"), null);
});
