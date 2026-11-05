"use client";

import { useEffect, type MutableRefObject } from "react";
import { convKey, detectRoutineRuns, expertKey, toMs, type ActivityState, type RoutineSession } from "@/lib/activity";
import { instanceEvents, streamGate } from "@/lib/instance-events";
import { browserPollEnv, startPoll } from "@/lib/poll";
import { sessionsStore } from "@/lib/sessions-client";
import type { SpaceData } from "@/lib/sessions-store";
import type { Expert } from "@/lib/types";
import type { ActivityActions } from "./ActivityProvider";

// While the stream is down, a look every 60 s at most (visible tab only); with it, none: a routine's
// or a turn's end re-reads the spaces through the sessions store, and this hears it.
const NET_MS = 60_000;
// Runs finished while the app was closed come back as badges; only the latest few also toast.
const MAX_TOASTS = 3;

// The routine runs of every expert, from the tab's sessions store (one grouped call per instance):
// runs finished since the last look become unread conversations and a toast.
export function useRoutinePoll(
  experts: Expert[],
  routinesRef: MutableRefObject<Record<string, number>>,
  load: (agentId: string) => void,
  actions: ActivityActions,
  persist: (s: ActivityState) => void,
  stateRef: MutableRefObject<ActivityState>
) {
  // Stable across re-renders that do not change who is watched.
  const signature = JSON.stringify(experts.map((e) => [e.agentId, e.profileId]).sort());

  useEffect(() => {
    const watched: [string, string][] = JSON.parse(signature);
    if (!watched.length) return;
    let fresh: { key: string; run: RoutineSession }[] = [];
    let queued = false;
    // Every space heard in one burst is announced together, newest last.
    const flush = () => {
      queued = false;
      const all = fresh.sort((a, b) => toMs(a.run.last_active) - toMs(b.run.last_active));
      fresh = [];
      all.forEach(({ key, run }, i) => actions.routineDone(key, run.routine, run.session_id, run.last_active, i >= all.length - MAX_TOASTS, run.silent));
      persist(stateRef.current);
    };
    const heard = (agentId: string, profile: string, d: SpaceData) => {
      if (!d.runs) return;
      load(agentId);
      const ek = expertKey(agentId, profile);
      const found = detectRoutineRuns(routinesRef.current[ek], d.runs);
      routinesRef.current = { ...routinesRef.current, [ek]: found.since };
      for (const run of found.fresh) fresh.push({ key: convKey(agentId, profile, run.session_id), run });
      if (!queued) {
        queued = true;
        queueMicrotask(flush);
      }
    };
    const offs = watched.map(([a, p]) => sessionsStore.subscribe(a, p, (d) => heard(a, p, d)));
    // First look from what the tab already holds (a space read without its runs is asked for them);
    // then the net, off while the stream is up. A network read reaches `heard` through the store.
    const first = (): Promise<unknown> => Promise.all(watched.map(([a, p]) => sessionsStore.read(a, p, 30_000, true).then((d) => heard(a, p, d), () => undefined)));
    const net = (): Promise<unknown> => Promise.all(watched.map(([a, p]) => sessionsStore.read(a, p, 0).catch(() => undefined)));
    void first();
    const poll = startPoll(net, { everyMs: NET_MS, immediate: false, gate: streamGate(instanceEvents, NET_MS) }, browserPollEnv());
    return () => {
      offs.forEach((off) => off());
      poll.stop();
    };
  }, [signature, routinesRef, load, actions, persist, stateRef]);
}
