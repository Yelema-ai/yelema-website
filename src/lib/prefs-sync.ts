// Pinned/archived conversations and notification kinds: the browser keeps a copy for instant reads,
// the back office keeps the truth so they follow the member to another computer or the mobile app.
import { apiFetch } from "@/lib/api";
import { bootstrap } from "@/lib/bootstrap-client";
import { parseMarks, type ChatMarks } from "@/lib/chat-marks";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, storeNotifyPrefs, type NotifyPrefs } from "@/lib/notify-prefs";

export const MARKS_KEY = "yelema.chat-marks";
export const MARKS_EVENT = "yelema:chat-marks";
const URL = "/api/account/preferences";

type Prefs = { chatMarks: ChatMarks; notify: Partial<NotifyPrefs> };
let synced: Promise<void> | null = null;

export function readLocalMarks(): ChatMarks {
  try {
    return parseMarks(localStorage.getItem(MARKS_KEY));
  } catch {
    return parseMarks(null);
  }
}

export function storeLocalMarks(marks: ChatMarks): void {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    // No storage: the mark lasts for this page.
  }
  window.dispatchEvent(new Event(MARKS_EVENT));
}

const isEmpty = (m: ChatMarks) => !m.pinned.length && !m.archived.length;
const sameNotify = (a: NotifyPrefs, b: NotifyPrefs) => (Object.keys(a) as (keyof NotifyPrefs)[]).every((k) => a[k] === b[k]);

/** Once per page: the back office's choices replace the local copy; marks made before it kept them are sent up. */
export function syncPrefs(): Promise<void> {
  synced ??= (async () => {
    // The tab's bootstrap carries them; without it, their own route.
    const server = ((await bootstrap())?.preferences as Prefs | null | undefined) ?? (await apiFetch<Prefs>(URL).catch(() => null));
    if (!server) return;
    const local = readLocalMarks();
    if (isEmpty(server.chatMarks) && !isEmpty(local)) pushPrefs({ chatMarks: local });
    else storeLocalMarks(parseMarks(JSON.stringify(server.chatMarks)));
    const notify = { ...DEFAULT_NOTIFY_PREFS, ...server.notify };
    const localNotify = readNotifyPrefs();
    if (sameNotify(notify, DEFAULT_NOTIFY_PREFS) && !sameNotify(localNotify, DEFAULT_NOTIFY_PREFS)) pushPrefs({ notify: localNotify });
    else storeNotifyPrefs(notify);
  })();
  return synced;
}

/** Sends one section; a failure leaves the local copy, sent again with the next change. */
export function pushPrefs(part: Partial<Prefs>): void {
  void apiFetch(URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(part) }).catch(() => undefined);
}
