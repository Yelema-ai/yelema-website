// « Nouveau » on a deliverable: changed in the last three days and not opened from this browser since.
// What was opened is kept per path; a mark older than the window can no longer matter and is dropped,
// so the list stays bounded however long the browser is used. No imports: tested.

export const FRESH_MS = 3 * 24 * 3600 * 1000;
const MAX_MARKS = 2000;

export type SeenMarks = Record<string, number>;

/** The stored marks, pruned of those past the window (and of anything malformed). */
export function parseSeen(raw: string | null, now: number): SeenMarks {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  return data && typeof data === "object" && !Array.isArray(data) ? prune(data as Record<string, unknown>, now) : {};
}

function prune(marks: Record<string, unknown>, now: number): SeenMarks {
  const kept = Object.entries(marks).filter((e): e is [string, number] => typeof e[1] === "number" && now - e[1] < FRESH_MS);
  return Object.fromEntries(kept.length > MAX_MARKS ? kept.sort((a, b) => b[1] - a[1]).slice(0, MAX_MARKS) : kept);
}

export function isNewAt(seen: SeenMarks, d: { path: string; modified: number }, now: number): boolean {
  if (!d.modified || now - d.modified > FRESH_MS) return false;
  const at = seen[d.path];
  return !at || at < d.modified;
}

export const markSeenAt = (seen: SeenMarks, path: string, now: number): SeenMarks => prune({ ...seen, [path]: now }, now);
