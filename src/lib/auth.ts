import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/http";
import { deploymentWorkspaceId } from "@/lib/runtime-config";
import type { AgentRow, Role } from "@/lib/types";

// `db` is the privileged service-role client (RLS bypassed). All table access in this app goes
// through it, which makes the helpers below the authorization boundary — they replace what RLS used
// to enforce. The user's IDENTITY still comes only from their verified session cookie (the
// anon/SSR client in getSession), never from `db`; `db` is used purely to run the query once the
// session-derived user id has been checked against the memberships table.
export type DB = ReturnType<typeof createAdminClient>;

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user };
}

export async function requireUser() {
  const { user } = await getSession();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in required");
  return { db: createAdminClient(), user };
}

// Every authorization helper below goes through here, so this is where a deployment stays inside
// its own workspace: on a shared database, another client's workspace has no role at all (404).
export async function getRole(db: DB, workspaceId: string, userId: string): Promise<Role | null> {
  const pinned = deploymentWorkspaceId();
  if (pinned && workspaceId !== pinned) return null;
  const { data } = await db
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

// 404 (not 403) so we don't leak whether the workspace exists.
export async function requireMember(db: DB, workspaceId: string, userId: string): Promise<Role> {
  const role = await getRole(db, workspaceId, userId);
  if (!role) throw new ApiError(404, "not_found", "Workspace not found");
  return role;
}

export async function requireAdmin(db: DB, workspaceId: string, userId: string): Promise<void> {
  const role = await getRole(db, workspaceId, userId);
  if (role !== "admin") throw new ApiError(403, "forbidden", "Admin role required");
}

export async function getAgentRow(db: DB, agent37Id: string): Promise<AgentRow> {
  const { data } = await db.from("agents").select("*").eq("agent37_id", agent37Id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "Agent not found");
  return data as AgentRow;
}

// Who may reach an agent: its owner, and nobody else. An admin of the workspace is a user like any
// other here: they reach their own instance and its experts, never a colleague's (conversations,
// files, connected accounts and screen are personal). Everyone else gets null, which callers turn
// into a 404 (we don't leak that the agent exists). Returns the owner's workspace role otherwise.
// An agent without an owner (rows older than per-member instances) is reachable by no one.
export async function agentAccessRole(db: DB, row: AgentRow, userId: string): Promise<Role | null> {
  if (!row.owner_user_id || row.owner_user_id !== userId) return null;
  return getRole(db, row.workspace_id, userId);
}

// The auth + ownership preamble every per-agent BFF route repeats: require a signed-in user,
// resolve the agent's mirror row, then gate on access. "owner" (the default) lets the agent's
// owner in — using and configuring their own agent. "admin" is for what spends or destroys
// (resize, budget): the owner again, and only if they are a workspace admin. Returns the
// privileged client, user, and row so the handler can get on with its work.
export async function requireAgentAccess(agent37Id: string, access: "owner" | "admin" = "owner") {
  const { db, user } = await requireUser();
  const row = await getAgentRow(db, agent37Id);
  const role = await agentAccessRole(db, row, user.id);
  if (!role) throw new ApiError(404, "not_found", "Agent not found");
  if (access === "admin" && role !== "admin") {
    throw new ApiError(403, "forbidden", "Admin role required");
  }
  return { db, user, row, role };
}
