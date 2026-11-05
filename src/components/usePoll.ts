"use client";

import { useEffect, useRef } from "react";
import { instanceEvents, matches, streamGate, type EventFilter } from "@/lib/instance-events";
import { browserPollEnv, startPoll, type Poller, type PollOptions } from "@/lib/poll";

type UsePollOptions = Omit<PollOptions, "gate"> & {
  enabled?: boolean;
  round?: number;
  /** A safety net beside the tab's event stream: off while it is up, `minMs` (≥ 15 s) apart while down. */
  live?: boolean;
  minMs?: number;
  /** Events that read at once (a `job.done` of this kind, a turn ended). */
  wake?: EventFilter;
};

// Every poll of the app: stopped while the tab is hidden, one run when it shows again, one run at
// a time. `enabled` false stops it; `fn` may change without restarting the timer; a new `round`
// starts it afresh (a write that puts something back on its way).
export function usePoll(fn: () => Promise<unknown> | unknown, opts: UsePollOptions): React.RefObject<Poller | null> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const poller = useRef<Poller | null>(null);
  const { enabled = true, everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, round = 0, live = false, minMs, wake } = opts;
  const wakeKey = wake ? JSON.stringify(wake) : "";
  useEffect(() => {
    if (!enabled) return;
    const gate = live ? streamGate(instanceEvents, minMs) : undefined;
    const p = startPoll(() => fnRef.current(), { everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, gate }, browserPollEnv());
    poller.current = p;
    const filter: EventFilter | null = wakeKey ? JSON.parse(wakeKey) : null;
    const off = filter ? instanceEvents.on(null, (e) => matches(e, filter) && p.kick()) : () => undefined;
    return () => {
      off();
      p.stop();
      if (poller.current === p) poller.current = null;
    };
  }, [enabled, everyMs, factor, maxMs, deadlineMs, immediate, runOnShow, round, live, minMs, wakeKey]);
  return poller;
}
