"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import { isTransitional } from "@/lib/format";
import type { MergedAgent, Role } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";

// The instances the signed-in user owns in a workspace, with their live state (one per member, so
// in practice one row). A page starts from the last reading rather than from nothing, then renews
// it; while an instance is starting or stopping it is read again every 5 seconds.
// `loaded` is false until a first answer (or a kept reading) is there.
export function useMyAgents(workspaceId: string | null | undefined): { agents: MergedAgent[]; loaded: boolean } {
  const { userEmail } = useWorkspace();
  const key = `agents:${userEmail}:${workspaceId ?? ""}`;
  const [state, setState] = useState<{ key: string; agents: MergedAgent[] } | null>(() => {
    const kept = workspaceId ? cached<MergedAgent[]>(key) : undefined;
    return kept ? { key, agents: kept } : null;
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await apiFetch<{ agents: MergedAgent[]; role: Role }>(`/api/agents?workspace=${workspaceId}`);
      setState({ key, agents: remember(key, data.agents) });
    } catch (e) {
      toast.error((e as Error).message);
      // An answer, even a failed one: the page stops waiting.
      setState((prev) => (prev?.key === key ? prev : { key, agents: [] }));
    }
  }, [workspaceId, key]);

  useEffect(() => {
    void load();
  }, [load]);

  // A reading kept for another workspace is not this one's.
  const current = state?.key === key ? state : null;
  const agents = current?.agents ?? EMPTY;

  useEffect(() => {
    if (!agents.some((a) => isTransitional(a.live_status))) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [agents, load]);

  return { agents, loaded: current !== null };
}

const EMPTY: MergedAgent[] = [];
