"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { Role, WorkspaceMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

// Read-only: members (and their agent) are added and removed from the Yelema back-office.

function roleLabel(role: Role) {
  return role === "admin" ? "Admin" : "Member";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

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

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {current.name} · members are added and removed by your Yelema administrator.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="px-4 py-3 font-medium">{m.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={m.role === "admin" ? "default" : "outline"}>{roleLabel(m.role)}</Badge>
                  </td>
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
