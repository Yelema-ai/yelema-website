// The agreements experts wait for, across the app (Leslie, 26/11: « dès que tu changes de conversation, tu
// ne le vois plus »). Fed by every place that reads a turn's stream (a chat, a deliverable's « Envoyer », the
// activity provider following a turn nobody shows); listed in the bell until answered or past their time.
// No imports, so `node --test` runs it as is.

export interface PendingApproval {
  requestId: string;
  agentId: string;
  profile: string | null;
  sessionId: string | null;
  responseId: string;
  message: string;
  /** ms since the epoch; past it the instance has refused by itself. */
  expiresAt: number;
  askedAt: number;
}

/** One more request; the same one heard twice (chat and provider) is kept once, its newest copy. */
export function addPending(list: readonly PendingApproval[], p: PendingApproval): PendingApproval[] {
  return [p, ...list.filter((x) => x.requestId !== p.requestId)];
}

export function dropPending(list: readonly PendingApproval[], requestId: string): PendingApproval[] {
  return list.some((x) => x.requestId === requestId) ? list.filter((x) => x.requestId !== requestId) : (list as PendingApproval[]);
}

/** Those still open, newest first. */
export function openPending(list: readonly PendingApproval[], now = Date.now()): PendingApproval[] {
  return list.filter((x) => x.expiresAt > now).sort((a, b) => b.askedAt - a.askedAt);
}

/** The bell's line: the action the guard names, recipient included, without the e-mail's body. */
export function pendingLine(message: string): string {
  const first = message.trim().split("\n")[0]?.trim() ?? "";
  const line = first || "Une action attend votre accord.";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}
