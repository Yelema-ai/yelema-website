// The wake turn Hermes posts in a coordinator's conversation when a task she handed over changes state
// (gateway/kanban_watchers_notifier.py, locale key gateway.kanban.wake.message — English in every locale).
// It is stored as a user message: shown here as a status line, in French, never as the user's words.

const WAKE_RE = /^\[kanban\] Task (t_[0-9a-z]+) ([^\n]*?)\.\nTitle: ([^\n]*)\nAssignee: @([^\n]*)/;

const VERBS: [RegExp, string][] = [
  [/^completed/, "a terminé"],
  [/^handed off for review/, "a rendu pour relecture"],
  [/^blocked|^review requested changes|^routed to triage/, "est bloqué sur"],
  [/^gave up/, "n’a pas pu terminer"],
  [/^crashed|^timed out/, "a été interrompu sur (nouvel essai en cours)"],
];

export interface KanbanNotice {
  taskId: string;
  title: string;
  /** The assignee's display name (profile id, first letter up). */
  who: string;
  /** French verb phrase for the state. */
  verb: string;
}

export function kanbanNotice(content: string): KanbanNotice | null {
  const m = WAKE_RE.exec(content);
  if (!m) return null;
  const [, taskId, status, title, assignee] = m;
  const verb = VERBS.find(([re]) => re.test(status))?.[1] ?? "a fait avancer";
  const who = assignee.trim().replace(/^./, (c) => c.toUpperCase());
  return { taskId, title: title.trim().slice(0, 160), who, verb };
}

// The turn Hermes's dispatcher opens on the worker's side to run a task (« work kanban task t_f98bdda9 »): stored as
// the member's message, it showed as a technical bubble at the top of the task's conversation (Leslie, 23/11).
const WORK_RE = /^\s*work kanban task (t_[0-9a-z]+)\b/i;

/** The task id of the dispatcher's opening turn, or null. */
export function kanbanWork(content: string): string | null {
  return WORK_RE.exec(content)?.[1] ?? null;
}
