// A member's guided tour, as the back office keeps it: the `tour` section of the member's preferences
// (`/app/me/preferences`). The back office takes these functions as they are (docs/plans/visite-guidee.md).

export type TourPrefs = { seenAt: string | null };
export type TourUpdate = { done: boolean };

export const NO_TOUR: TourPrefs = { seenAt: null };

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Tolerant read: anything but a well-formed UTC date reads as not seen. */
export function parseTourPrefs(raw: unknown): TourPrefs {
  const seenAt = raw && typeof raw === "object" ? (raw as { seenAt?: unknown }).seenAt : undefined;
  return typeof seenAt === "string" && ISO_UTC.test(seenAt) && !Number.isNaN(Date.parse(seenAt)) ? { seenAt } : NO_TOUR;
}

/** The `tour` section of a `PUT`: exactly `{ done: boolean }`, else null. */
export function parseTourUpdate(raw: unknown): TourUpdate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const done = (raw as { done?: unknown }).done;
  return Object.keys(raw).length === 1 && typeof done === "boolean" ? { done } : null;
}

/** Done keeps the date of the first time; not done makes the tour start again. */
export function applyTourUpdate(current: TourPrefs, update: TourUpdate, now: Date): TourPrefs {
  return update.done ? { seenAt: current.seenAt ?? now.toISOString() } : NO_TOUR;
}
