"use client";

import { useEffect, useRef } from "react";
import { catchUp, instanceEvents, matches, streamGate, type EventFilter } from "@/lib/instance-events";
import { browserPollEnv, startPoll, type Poller, type PollOptions } from "@/lib/poll";

/** A wait on someone else (a sign-in tab, a phone): this many ms apart at least, never while hidden. */
export const WAIT_POLL_MS = 15_000;

type UsePollOptions = Omit<PollOptions, "gate"> & {
  enabled?: boolean;
  round?: number;
  /** A safety net beside the tab's event stream: slow while it is up, `minMs` (≥ 15 s) apart while down. */
  live?: boolean;
  minMs?: number;
  /** The instance(s) the poll reads: their own stream gates it (default: the tab's). */
  agentId?: string | readonly string[] | null;
  /** Events that read at once (a `job.done` of this kind, a turn ended); a catch-up always does. */
  wake?: EventFilter;
};

// Every poll of the app: stopped while the tab is hidden, one run when it shows again, one run at
// a time. `enabled` false stops it; `fn` may change without restarting the timer; a new `round`
// starts it afresh (a write that puts something back on its way).
export function usePoll(fn: () => Promise<unknown> | unknown, opts: UsePollOptions): React.RefObject<Poller | null> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const poller = useRef<Poller | null>(null);
  const { enabled = true, everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, round = 0, live = false, minMs, agentId = null, wake } = opts;
  const wakeKey = wake ? JSON.stringify(wake) : "";
  const agentKey = agentId === null ? "" : JSON.stringify(agentId);
  useEffect(() => {
    if (!enabled) return;
    const gate = live ? streamGate(instanceEvents, minMs, agentKey ? (JSON.parse(agentKey) as string | string[]) : null) : undefined;
    const p = startPoll(() => fnRef.current(), { everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, gate }, browserPollEnv());
    poller.current = p;
    const filter: EventFilter | null = wakeKey ? JSON.parse(wakeKey) : null;
    const off = filter ? instanceEvents.on(null, (e) => (matches(e, filter) || catchUp(e)) && p.kick()) : () => undefined;
    return () => {
      off();
      p.stop();
      if (poller.current === p) poller.current = null;
    };
  }, [enabled, everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, round, live, minMs, agentKey, wakeKey]);
  return poller;
}
