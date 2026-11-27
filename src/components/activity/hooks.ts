"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { conversationStatus, convKey, expertActivity, type ConversationStatus, type Outcome } from "@/lib/activity";
import type { ChatSession } from "@/components/chat/types";
import { useActivityActions, useActivityState } from "./ActivityProvider";

/** What the tracker reads off a chat run; matches useChat's LiveRun without importing it. */
export interface ReportedRun {
  sessionId: string | null;
  responseId: string | null;
  assistant: { content: string };
}

let seq = 0;

// useChat's side of the tracker: each call names the run object, ids are kept here. A no-op
// outside the ActivityProvider.
export function useTurnReporter(agentId: string, profile: string | null) {
  const actions = useActivityActions();
  const ids = useRef(new WeakMap<object, string>());
  const where = useRef({ agentId, profile });
  where.current = { agentId, profile };

  return useMemo(() => {
    const idOf = (run: ReportedRun) => ids.current.get(run);
    return {
      start(run: ReportedRun) {
        if (!actions) return;
        const id = `t${++seq}`;
        ids.current.set(run, id);
        actions.start({ id, ...where.current, sessionId: run.sessionId, responseId: run.responseId });
      },
      bind(run: ReportedRun) {
        const id = idOf(run);
        if (id) actions?.bind(id, run.sessionId, run.responseId);
      },
      // A failure carries its French sentence, so the bell can say why (an account to top up).
      end(run: ReportedRun, outcome: Outcome, reason?: string) {
        const id = idOf(run);
        if (id) actions?.finish(id, outcome, outcome === "failed" && reason ? reason : run.assistant.content);
      },
      detach(run: ReportedRun) {
        const id = idOf(run);
        if (id) actions?.detach(id);
      },
      // An agreement the expert waits for, for the bell; `shown` when its card is on screen where it was asked.
      asked(run: ReportedRun, a: { requestId: string; message: string; expiresAt: number }, shown: boolean) {
        if (!actions || !run.responseId) return;
        actions.asked({ ...a, agentId: where.current.agentId, profile: where.current.profile, sessionId: run.sessionId, responseId: run.responseId, askedAt: Date.now() }, shown);
      },
      settled(requestId: string) {
        actions?.settled(requestId);
      },
      cancel(run: ReportedRun) {
        const id = idOf(run);
        if (id) actions?.drop(id);
      },
    };
  }, [actions]);
}

// The chat of one expert tells the tracker which thread is on screen (null off the Chat tab), how
// to open one of its threads, and how to add a routine run to its rail.
export function useChatPresence(
  agentId: string,
  profile: string | null,
  viewedSessionId: string | null,
  open: (sessionId: string) => void,
  addSession: (row: ChatSession) => void,
  rail: ChatSession[] | null
) {
  const actions = useActivityActions();
  const key = viewedSessionId ? convKey(agentId, profile, viewedSessionId) : null;

  useEffect(() => {
    if (!actions) return;
    actions.view(key);
    return () => actions.view(null, key);
  }, [actions, key]);

  useEffect(() => {
    if (rail) actions?.prune(agentId, profile, rail.map((s) => s.session_id));
  }, [actions, agentId, profile, rail]);

  useEffect(() => actions?.present(agentId, profile, { open, addSession }), [actions, agentId, profile, open, addSession]);
}

export function useConversationStatus(agentId: string, profile: string | null): (sessionId: string) => ConversationStatus {
  const state = useActivityState();
  return useCallback((sessionId: string) => conversationStatus(state, convKey(agentId, profile, sessionId)), [state, agentId, profile]);
}

export function useExpertActivity(agentId: string, profile: string | null) {
  const state = useActivityState();
  return useMemo(() => expertActivity(state, agentId, profile), [state, agentId, profile]);
}
