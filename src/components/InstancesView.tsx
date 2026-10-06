"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { WorkspaceInstance } from "@/lib/types";

// Read-only, for admins: the workspace's instances by name, and the member each belongs to. Nothing
// here opens an instance: each member reaches only their own, and Yelema runs them from the back
// office.
export function InstancesView() {
  const { current } = useWorkspace();
  const [instances, setInstances] = useState<WorkspaceInstance[] | null>(null);

  useEffect(() => {
    if (!current || current.role !== "admin") return;
    let alive = true;
    setInstances(null);
    apiFetch<{ instances: WorkspaceInstance[] }>(`/api/workspaces/${current.id}/instances`)
      .then((d) => alive && setInstances(d.instances))
      .catch((e) => {
        if (!alive) return;
        setInstances([]);
        toast.error((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [current]);

  if (!current) return <p className="text-sm text-muted-foreground">Aucun espace sélectionné.</p>;
  if (current.role !== "admin") {
    return <p className="text-sm text-muted-foreground">Cette liste est réservée aux administrateurs de l’espace.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Instances</h1>
        <p className="text-sm text-muted-foreground">
          {current.name} · une instance par membre, créée et gérée par votre administrateur Yelema.
        </p>
      </div>

      {instances === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune instance pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="px-4 py-2.5 font-medium">Membre</th>
                <th className="px-4 py-2.5 font-medium">Créée par</th>
                <th className="px-4 py-2.5 font-medium">Créée le</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((i, k) => (
                <tr key={k} className="border-t">
                  <td className="px-4 py-3 font-medium">{i.name?.trim() || "Sans nom"}</td>
                  <td className="px-4 py-3">{i.member_email ?? "Non attribuée"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{i.created_by_email ?? "Yelema"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(i.created_at).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
