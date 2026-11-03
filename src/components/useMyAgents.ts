"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import { isTransitional } from "@/lib/format";
import type { MergedAgent, Role } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePoll } from "@/components/usePoll";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { instanceEvents } from "@/lib/instance-events";

// The instances the signed-in user owns in a workspace, with their live state (one per member, so
// in practice one row). ONE reading for the whole shell, seeded by the server layout; read again
// every 15 s only while an instance is starting or stopping, and never while the tab is hidden.
const TRANSITION_POLL_MS = 15_000;

type AgentsState = { key: string; agents: MergedAgent[] } | null;
interface AgentsContextValue {
  workspaceId: string | null;
  agents: MergedAgent[];
  loaded: boolean;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

// `workspaceId` null reads nothing (the shared reading covers it).
function useAgentsReading(workspaceId: string | null | undefined, initial: MergedAgent[] | null) {
  const { userEmail } = useWorkspace();
  const key = `agents:${userEmail}:${workspaceId ?? ""}`;
  const [state, setState] = useState<AgentsState>(() => {
    if (initial && workspaceId) return { key, agents: remember(key, initial) };
    const kept = workspaceId ? cached<MergedAgent[]>(key) : undefined;
    return kept ? { key, agents: kept } : null;
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await apiFetch<{ agents: MergedAgent[]; role: Role }>(`/api/agents?workspace=${workspaceId}`);
      setState({ key, agents: remember(key, data.agents) });
    } catch (e) {
      toast.error((e as Error).message, { id: "agents-load" });
      // An answer, even a failed one: the page stops waiting.
      setState((prev) => (prev?.key === key ? prev : { key, agents: [] }));
    }
  }, [workspaceId, key]);

  const seeded = initial !== null && state?.key === key;
  useEffect(() => {
    if (!seeded) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // A reading kept for another workspace is not this one's.
  const current = state?.key === key ? state : null;
  const agents = current?.agents ?? EMPTY;
  usePoll(load, { everyMs: TRANSITION_POLL_MS, immediate: false, enabled: Boolean(workspaceId) && agents.some((a) => isTransitional(a.live_status)) });

  // The back office changed an instance's route (activated, suspended): read the list again (EVENT_STREAM=on).
  const { eventStream } = usePublicConfig();
  const ids = agents.map((a) => a.agent37_id).filter((id): id is string => Boolean(id)).join(",");
  useEffect(() => {
    if (!eventStream || !workspaceId || !ids) return;
    const offs = ids.split(",").map((id) => instanceEvents.on(id, (type) => type === "instance.changed" && void load()));
    return () => offs.forEach((off) => off());
  }, [eventStream, workspaceId, ids, load]);

  return { agents, loaded: current !== null };
}

/** The shell's one reading of the user's instances, seeded by the server layout. */
export function AgentsProvider({ workspaceId, initial, children }: { workspaceId: string | null; initial: MergedAgent[] | null; children: React.ReactNode }) {
  const { agents, loaded } = useAgentsReading(workspaceId, initial);
  const value = useMemo(() => ({ workspaceId, agents, loaded }), [workspaceId, agents, loaded]);
  return createElement(AgentsContext.Provider, { value }, children);
}

// `loaded` is false until a first answer (or a kept reading) is there.
export function useMyAgents(workspaceId: string | null | undefined): { agents: MergedAgent[]; loaded: boolean } {
  const shared = useContext(AgentsContext);
  const covered = shared !== null && shared.workspaceId === (workspaceId ?? null);
  // Outside the shell (or for another workspace): a reading of its own.
  const own = useAgentsReading(covered ? null : workspaceId, null);
  return covered ? { agents: shared.agents, loaded: shared.loaded } : own;
}

const EMPTY: MergedAgent[] = [];
