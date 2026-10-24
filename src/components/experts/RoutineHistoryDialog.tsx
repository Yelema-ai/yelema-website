"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { agentTabPath } from "@/lib/expert-tabs";
import { absoluteFr, relativeFr } from "@/lib/fr-dates";
import type { Routine, RoutineRun, RunOutcome } from "@/lib/routines";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const OUTCOME: Record<RunOutcome, { label: string; variant: "success" | "muted" | "destructive" }> = {
  sent: { label: "Résultat envoyé", variant: "success" },
  silent: { label: "Rien à signaler", variant: "muted" },
  failed: { label: "Échec", variant: "destructive" },
};

// A routine's past runs, newest first, each opening its conversation.
export function RoutineHistoryDialog({
  agentId,
  profileId,
  routine,
  onClose,
}: {
  agentId: string;
  profileId: string;
  routine: Routine;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ runs: RoutineRun[] }>(`/api/agents/${agentId}/routines/${routine.id}/runs?expert=${encodeURIComponent(profileId)}`)
      .then((res) => setRuns(res.runs))
      .catch((e: Error) => setError(e.message));
  }, [agentId, profileId, routine.id]);

  const chat = agentTabPath(agentId, "chat", profileId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique : {routine.name}</DialogTitle>
          <DialogDescription>Ses dernières exécutions. Chacune ouvre la conversation où l’Expert a travaillé.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-ko">{error}</p>
        ) : !runs ? (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-ink-3">Cette routine n’a pas encore été exécutée.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.sessionId}>
                <Link href={`${chat}?session=${encodeURIComponent(run.sessionId)}`} onClick={onClose} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-soft">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{absoluteFr(run.at)}</span>
                    <span className="block text-xs text-ink-3">{relativeFr(run.at)}</span>
                  </span>
                  {run.outcome && <Badge variant={OUTCOME[run.outcome].variant}>{OUTCOME[run.outcome].label}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
