import { instanceEvents, matches, type EventFilter } from "@/lib/instance-events";

/** A wait on someone else (a sign-in tab, a phone): this many ms apart at least, never while hidden. */
export const WAIT_POLL_MS = 15_000;

/** Calls `fn` on a matching event of the tab's stream, or when the tab shows again; returns the unsubscribe. */
export function listenWake(filter: EventFilter, fn: () => void): () => void {
  const off = instanceEvents.on(null, (e) => matches(e, filter) && fn());
  const onShow = () => document.visibilityState === "visible" && fn();
  document.addEventListener("visibilitychange", onShow);
  return () => {
    off();
    document.removeEventListener("visibilitychange", onShow);
  };
}
