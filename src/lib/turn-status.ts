// What the runtime says of a turn that waits (contract of 09/11, `response.status` on /v1/responses): the model
// quota is spent (`rate_limit`), the servers are overloaded and it tries again (`retry`), or nothing has come
// for a minute (`waiting`). Its `message` is a French sentence ready to show; it stands under the expert's
// bubble until the next state replaces it, and goes at the first text, the first tool, or the end of the turn.

export type TurnStatusKind = "rate_limit" | "retry" | "waiting";

export interface TurnStatus {
  kind: TurnStatusKind;
  message: string;
  /** When the quota frees up (ISO 8601), when known: the message already says it. */
  resetsAt: string | null;
}

const KINDS: readonly string[] = ["rate_limit", "retry", "waiting"];

/** The state a `response.status` event carries; null when it is not one this app knows how to say. */
export function parseTurnStatus(data: unknown): TurnStatus | null {
  if (!data || typeof data !== "object") return null;
  const { kind, message, resets_at } = data as { kind?: unknown; message?: unknown; resets_at?: unknown };
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (typeof message !== "string" || !message.trim()) return null;
  return { kind: kind as TurnStatusKind, message: message.trim(), resetsAt: typeof resets_at === "string" && resets_at ? resets_at : null };
}

/**
 * The generic sentence for a failed turn, unless the last state said the quota was spent: the member then
 * reads why (and until when), not « réessayez dans un instant ».
 */
export function failureFallback(last: TurnStatus | null | undefined, generic: string): string {
  return last?.kind === "rate_limit" ? last.message : generic;
}
