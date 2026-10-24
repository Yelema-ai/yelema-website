// Which kinds of notice pop up (toast and system notification). The bell keeps every notice either way.
// Stored in the browser until the back office keeps the user's preferences (then the mobile app shares them).

export type NoticeKind = "reply" | "routine" | "deliverable" | "failed";
export type NotifyPrefs = Record<NoticeKind, boolean>;

const KEY = "yelema.notify-prefs";
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { reply: true, routine: true, deliverable: true, failed: true };

export function readNotifyPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<NotifyPrefs>;
    return { ...DEFAULT_NOTIFY_PREFS, ...raw };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private window or blocked storage: the choice lasts for this page only.
  }
}
