"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { Role, WorkspaceMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

// Read-only: members (and their agent) are added and removed from the Yelema back-office.

function roleLabel(role: Role) {
  return role === "admin" ? "Admin" : "Membre";
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

// The back office's word for a member's state, in French; anything else is shown as it comes.
const STATUS: Record<string, string> = { active: "Actif", suspended: "Suspendu", pending: "En attente", provisioning: "En installation" };

export function MembersView() {
  const { current } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const data = await apiFetch<{ members: WorkspaceMember[] }>(`/api/workspaces/${current.id}/members`);
      setMembers(data.members);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (!current) return <p className="text-sm text-muted-foreground">Aucun espace sélectionné.</p>;
  // State and instance columns appear when the source gives them (the back office's list).
  const detailed = members.some((m) => m.status != null || m.instance_name != null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
        <p className="text-sm text-muted-foreground">
          {current.name} · les membres sont ajoutés et retirés par votre administrateur Yelema.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Membre</th>
                <th className="px-4 py-2.5 font-medium">Rôle</th>
                {detailed && <th className="px-4 py-2.5 font-medium">État</th>}
                {detailed && <th className="px-4 py-2.5 font-medium">Instance</th>}
                <th className="px-4 py-2.5 font-medium">Ajouté le</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="block font-medium">{m.name?.trim() || m.email}</span>
                    {m.name?.trim() && <span className="block text-xs text-muted-foreground">{m.email}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.role === "admin" ? "default" : "outline"}>{roleLabel(m.role)}</Badge>
                  </td>
                  {detailed && <td className="px-4 py-3">{m.status ? (STATUS[m.status] ?? m.status) : "—"}</td>}
                  {detailed && <td className="px-4 py-3">{m.instance_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
