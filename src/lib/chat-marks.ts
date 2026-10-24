// Pinned and archived conversations, by convKey (instance | profile | session). Pinned ones head the
// lists; archived ones leave them and are found again in « Toutes les conversations ». Pure, so
// `node --test` runs it as is; the browser storage lives in components/conversations/useChatMarks.

export interface ChatMarks {
  pinned: string[];
  archived: string[];
}

export const NO_MARKS: ChatMarks = { pinned: [], archived: [] };

export function parseMarks(raw: string | null): ChatMarks {
  try {
    const v = JSON.parse(raw ?? "") as Partial<ChatMarks>;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((k): k is string => typeof k === "string") : []);
    return { pinned: list(v.pinned), archived: list(v.archived) };
  } catch {
    return NO_MARKS;
  }
}

/** Pinning brings a conversation back from the archive; archiving unpins it. */
export function setMark(marks: ChatMarks, key: string, mark: "pinned" | "archived", on: boolean): ChatMarks {
  const other = mark === "pinned" ? "archived" : "pinned";
  const without = (l: string[]) => l.filter((k) => k !== key);
  return {
    [mark]: on ? [key, ...without(marks[mark])] : without(marks[mark]),
    [other]: on ? without(marks[other]) : marks[other],
  } as unknown as ChatMarks;
}

/** The rows that stay in a list (archived ones out), the pinned first in the order they were pinned. */
export function arrange<T>(rows: readonly T[], keyOf: (r: T) => string, marks: ChatMarks): { pinned: T[]; rest: T[] } {
  const archived = new Set(marks.archived);
  const kept = rows.filter((r) => !archived.has(keyOf(r)));
  const rank = new Map(marks.pinned.map((k, i) => [k, i]));
  const pinned = kept.filter((r) => rank.has(keyOf(r))).sort((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!);
  return { pinned, rest: kept.filter((r) => !rank.has(keyOf(r))) };
}
