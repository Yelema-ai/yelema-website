"use client";

import { useEffect, type MutableRefObject } from "react";
import { apiFetch } from "@/lib/api";
import { convKey, detectRoutineRuns, expertKey, toMs, type ActivityState, type RoutineSession } from "@/lib/activity";
import { browserPollEnv, startPoll } from "@/lib/poll";
import type { Expert } from "@/lib/types";
import type { ActivityActions } from "./ActivityProvider";

const EVERY_MS = 60_000;
// Runs finished while the app was closed come back as badges; only the latest few also toast.
const MAX_TOASTS = 3;

// Every 60 s while the tab is visible, one call per instance for all its experts: routine runs
// finished since the last look become unread conversations and a toast.
export function useRoutinePoll(
  experts: Expert[],
  routinesRef: MutableRefObject<Record<string, number>>,
  load: (agentId: string) => void,
  actions: ActivityActions,
  persist: (s: ActivityState) => void,
  stateRef: MutableRefObject<ActivityState>
) {
  // Stable across re-renders that do not change who is polled.
  const groups = new Map<string, string[]>();
  for (const e of experts) groups.set(e.agentId, [...(groups.get(e.agentId) ?? []), e.profileId]);
  const signature = JSON.stringify([...groups].sort());

  useEffect(() => {
    const byAgent = new Map<string, string[]>(JSON.parse(signature));
    if (!byAgent.size) return;
    const readAgent = async (agentId: string, profiles: string[]) => {
      load(agentId);
      let res: { profiles: Record<string, RoutineSession[]> };
      try {
        res = await apiFetch(`/api/agents/${agentId}/chat/activity?profiles=${profiles.map(encodeURIComponent).join(",")}`);
      } catch {
        return;
      }
      const fresh: { key: string; run: RoutineSession }[] = [];
      for (const [profile, runs] of Object.entries(res.profiles)) {
        const ek = expertKey(agentId, profile);
        const found = detectRoutineRuns(routinesRef.current[ek], runs);
        routinesRef.current = { ...routinesRef.current, [ek]: found.since };
        for (const run of found.fresh) fresh.push({ key: convKey(agentId, profile, run.session_id), run });
      }
      fresh.sort((a, b) => toMs(a.run.last_active) - toMs(b.run.last_active));
      fresh.forEach(({ key, run }, i) => actions.routineDone(key, run.routine, run.session_id, run.last_active, i >= fresh.length - MAX_TOASTS, run.silent));
      persist(stateRef.current);
    };
    // The instances are asked together; hidden, nothing is asked, and one look follows the return.
    const poll = startPoll(() => Promise.all([...byAgent].map(([agentId, profiles]) => readAgent(agentId, profiles))), { everyMs: EVERY_MS }, browserPollEnv());
    return () => poll.stop();
  }, [signature, routinesRef, load, actions, persist, stateRef]);
}
