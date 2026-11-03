// A long conversation is compacted by its runtime: the summary it writes for itself is never a message, and
// each compaction shows as one marker line. No imports, for `node --test`.

const SUMMARY = /^\s*(\[(CONTEXT COMPACTION|PRIOR CONTEXT|CONTEXT SUMMARY)\b|This session is being continued from a previous conversation)/i;

export const isCompactionSummary = (content: string): boolean => SUMMARY.test(content);

// A reply the runtime replays after a compaction comes back word for word (Djénéba's audit, 29/10: the
// same answers two to four times further down the thread). Short ones (« C'est noté. ») may honestly recur.
const REPLAY_MIN = 40;

/** The rows a thread shows: summaries out, back-to-back markers folded into one, a long reply never twice. */
export function visibleHistory<T extends { role: string; content: string }>(rows: readonly T[]): T[] {
  const out: T[] = [];
  const said = new Set<string>();
  for (const row of rows) {
    if (isCompactionSummary(row.content ?? "")) continue;
    if (row.role === "system" && out.at(-1)?.role === "system") continue;
    if (row.role === "assistant") {
      const text = (row.content ?? "").trim();
      if (text.length >= REPLAY_MIN) {
        if (said.has(text)) continue;
        said.add(text);
      }
    }
    out.push(row);
  }
  return out;
}
