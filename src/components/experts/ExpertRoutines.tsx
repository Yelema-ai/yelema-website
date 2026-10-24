"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { routineBulkMessage, runPool } from "@/lib/bulk";
import type { Routine } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { RoutineDialog, type RoutineExpert } from "./RoutineDialog";
import { RoutineHistoryDialog } from "./RoutineHistoryDialog";
import { RoutinesList } from "./RoutinesList";

export function ExpertRoutines({ agentId, expert }: { agentId: string; expert: RoutineExpert }) {
  const expertKey = expert.profileId;
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editing, setEditing] = useState<{ routine: Routine | null; key: number } | null>(null);
  const [removing, setRemoving] = useState<Routine | null>(null);
  const [history, setHistory] = useState<Routine | null>(null);

  const base = `/api/agents/${agentId}/routines`;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch<{ routines: Routine[] }>(`${base}?expert=${expertKey}`);
      setRoutines(res.routines);
    } catch {
      setLoadError(true);
    }
  }, [base, expertKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (r: Routine) => setRoutines((list) => list && (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r]));

  async function toggle(r: Routine, enabled: boolean) {
    setBusyId(r.id);
    try {
      const res = await apiFetch<{ routine: Routine }>(`${base}/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expert: expertKey, enabled }),
      });
      replace(res.routine);
      toast.success(`${enabled ? "Routine activée" : "Routine en pause"} : ${r.name}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // The same PATCH as one switch, three at a time: the instance answers each in turn anyway.
  async function bulk(list: Routine[], enabled: boolean): Promise<boolean> {
    const todo = list.filter((r) => r.suggested || r.enabled !== enabled);
    if (!todo.length) return true;
    setBulkBusy(true);
    try {
      const results = await runPool(todo, 3, (r) =>
        apiFetch<{ routine: Routine }>(`${base}/${r.id}`, { method: "PATCH", body: JSON.stringify({ expert: expertKey, enabled }) })
      );
      for (const res of results) if (res.status === "fulfilled") replace(res.value.routine);
      const failed = results.filter((res) => res.status === "rejected").length;
      const message = routineBulkMessage(enabled ? "activate" : "pause", todo.length - failed, failed);
      if (failed) toast.error(`${message}.`);
      else toast.success(`${message}.`);
      return failed === 0;
    } finally {
      setBulkBusy(false);
    }
  }

  async function runNow(r: Routine) {
    setBusyId(r.id);
    try {
      await apiFetch(`${base}/${r.id}/run`, { method: "POST", body: JSON.stringify({ expert: expertKey }) });
      toast.success(`${expert.name} lance « ${r.name} » dans la minute. Le résultat arrive dans ses conversations et sur ses canaux.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!removing) return;
    const r = removing;
    await apiFetch(`${base}/${r.id}?expert=${expertKey}`, { method: "DELETE" });
    setRoutines((list) => list && list.filter((x) => x.id !== r.id));
    toast.success("Routine supprimée.");
  }

  const actions = {
    busyId,
    onToggle: (r: Routine, enabled: boolean) => void toggle(r, enabled),
    onRunNow: (r: Routine) => void runNow(r),
    onHistory: setHistory,
    onEdit: (r: Routine) => setEditing({ routine: r, key: Date.now() }),
    onRemove: setRemoving,
    onBulk: bulk,
    bulkBusy,
  };
  const active = routines?.filter((r) => !r.suggested) ?? [];
  const suggested = routines?.filter((r) => r.suggested) ?? [];
  const panel = "mt-5 rounded-[22px] border bg-card p-4 sm:p-5";

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="sr-only">Routines de {expert.name}</h1>
          <p className="max-w-xl text-sm text-ink-3">
            Ce que {expert.name} fait sans qu’on le demande. Le résultat arrive dans tous ses canaux.
          </p>
        </div>
        <Button onClick={() => setEditing({ routine: null, key: Date.now() })} className="self-start">
          <Plus /> Nouvelle routine
        </Button>
      </div>

      {!routines ? (
        <div className={cn(panel, "flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-3")}>
          {loadError ? (
            <>
              <p className="text-ink-2">Impossible de charger les routines.</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Réessayer
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des routines…
            </p>
          )}
        </div>
      ) : routines.length > 0 ? (
        <RoutinesList routines={[...active, ...suggested]} expertName={expert.name} {...actions} />
      ) : (
        <section className={panel}>
          <p className="text-sm text-ink-3">Aucune routine pour l’instant. Créez la première.</p>
        </section>
      )}

      {editing && (
        <RoutineDialog
          key={editing.key}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          agentId={agentId}
          expert={expert}
          routine={editing.routine}
          onSaved={(r) => {
            replace(r);
            toast.success(editing.routine ? "Routine enregistrée." : `Routine créée : ${r.name}.`);
          }}
        />
      )}

      {history && <RoutineHistoryDialog agentId={agentId} profileId={expertKey} routine={history} onClose={() => setHistory(null)} />}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Supprimer « ${removing.name} » ?` : ""}
        description={`${expert.name} ne fera plus cette tâche. Ses résultats passés restent dans ses conversations.`}
        confirmText="Supprimer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
