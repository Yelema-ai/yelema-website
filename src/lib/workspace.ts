import "server-only";
import { cookies } from "next/headers";
import type { DB } from "@/lib/auth";
import type { AgentRow, Role, Workspace, WorkspaceWithRole } from "@/lib/types";

// The workspace the user is looking at, when they belong to several ("Changer d'espace").
export const WORKSPACE_COOKIE = "yelema_ws";

// Read the user's workspaces with two plain table queries joined in JS, NOT a PostgREST relationship
// embed: right after a migration PostgREST's schema cache can lag and the embed comes back empty.
export async function loadWorkspaces(db: DB, userId: string): Promise<WorkspaceWithRole[]> {
  const { data: memberships, error: memErr } = await db
    .from("memberships")
    .select("workspace_id, role")
    .eq("user_id", userId);
  if (memErr) throw new Error(`Impossible de charger vos espaces : ${memErr.message}`);
  if (!memberships?.length) return [];

  const roleByWorkspace = new Map<string, Role>(memberships.map((m) => [m.workspace_id as string, m.role as Role]));
  const { data: workspaces, error: wsErr } = await db
    .from("workspaces")
    .select("*")
    .in("id", [...roleByWorkspace.keys()]);
  if (wsErr) throw new Error(`Impossible de charger vos espaces : ${wsErr.message}`);

  return (workspaces ?? [])
    .map((ws) => ({ ...(ws as Workspace), role: roleByWorkspace.get((ws as Workspace).id)! }))
    .filter((w): w is WorkspaceWithRole => Boolean(w.role))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function pickWorkspace(workspaces: WorkspaceWithRole[]): Promise<WorkspaceWithRole | null> {
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
}

// The workspace's one Agent37 instance: the agents row with no owner.
export async function getWorkspaceAgent(db: DB, workspaceId: string): Promise<AgentRow | null> {
  const { data } = await db
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("owner_user_id", null)
    .maybeSingle();
  return (data as AgentRow | null) ?? null;
}
