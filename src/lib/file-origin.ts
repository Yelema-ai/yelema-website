// The conversation that wrote a deliverable, so « Modifier avec <Expert> » reopens it instead of a new one.
// Pure: the route reads the sessions, this picks which to read and which one wrote the file.
import { drivePathsIn, normDrivePath } from "./drive-links.ts";
import type { ChatHistoryMessage, SessionSummary } from "./types.ts";

export const MAX_READS = 12;
// A file is written during its turn, the session's last activity comes at the turn's end or later.
const SLACK_S = 120;

// Hermes gives `last_active` in milliseconds, other harnesses in seconds.
const seconds = (t: number | string | null | undefined) => {
  const n = Number(t) || 0;
  return n > 1e12 ? n / 1000 : n;
};

/** Sessions worth reading, most likely first: active since the file was written, the earliest first. */
export function candidateSessions(sessions: readonly SessionSummary[], modifiedMs: number | null): string[] {
  const at = (s: SessionSummary) => seconds(s.last_active ?? s.started_at);
  if (!modifiedMs) return [...sessions].sort((a, b) => at(b) - at(a)).slice(0, MAX_READS).map((s) => s.id);
  const since = modifiedMs / 1000 - SLACK_S;
  return sessions
    .filter((s) => at(s) >= since && seconds(s.started_at) <= modifiedMs / 1000 + SLACK_S)
    .sort((a, b) => at(a) - at(b))
    .slice(0, MAX_READS)
    .map((s) => s.id);
}

/** Whether a reply of this history wrote the file, or names it. */
export function wroteFile(history: readonly ChatHistoryMessage[], path: string): boolean {
  const want = normDrivePath(path);
  return history.some(
    (m) => m.role === "assistant" && ((m.files ?? []).some((f) => normDrivePath(f) === want) || drivePathsIn(m.content ?? "").includes(want))
  );
}
