"use client";

import { Loader2 } from "lucide-react";
import type { MergedAgent } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";

// What is set once for a member's instance and serves all of their experts (connectors, channels):
// waits for the signed-in user's own instance, then hands it to `children`.
export function MyInstance({ children }: { children: (agent: MergedAgent) => React.ReactNode }) {
  const { current } = useWorkspace();
  const { agents, loaded } = useMyAgents(current?.id);
  const agent = agents[0] ?? null;

  if (agent) return <>{children(agent)}</>;
  if (!loaded) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </p>
    );
  }
  return (
    <p className="max-w-xl text-sm text-ink-2">
      Votre instance n’est pas encore prête. Vos connecteurs et vos canaux apparaîtront ici dès qu’elle le sera.
    </p>
  );
}
