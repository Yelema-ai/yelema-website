import "server-only";
import type { DB } from "@/lib/auth";
import { listInstanceProfiles } from "@/lib/hermes-profiles";
import { ApiError } from "@/lib/http";
import type { AgentRow, Role } from "@/lib/types";

// The profiles installed on the instances a user can see: every instance of the workspace for an
// admin, their own for a member. Shared by the experts list and the catalogue, so both screens
// agree on what "installed" means.

export interface InstalledProfile {
  agent: AgentRow;
  profileId: string;
  /** Known only when the instance was asked directly; null when read from the database. */
  gateway: string | null;
  distribution: string | null;
}

export interface InstalledProfiles {
  profiles: InstalledProfile[];
  /** Instances that could not be read — to be shown, never hidden. */
  unreadable: AgentRow[];
}

export async function visibleAgents(db: DB, workspaceId: string, userId: string, role: Role): Promise<AgentRow[]> {
  let query = db.from("agents").select("*").eq("workspace_id", workspaceId);
  if (role !== "admin") query = query.eq("owner_user_id", userId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new ApiError(500, "db_error", error.message);
  return (data ?? []) as AgentRow[];
}

// The back office mirrors each instance's installed profiles on its agents row (agents.profiles).
// That is one query and wakes nothing. A row it has not filled yet falls back to asking the
// instance (an exec: seconds, and it wakes a sleeping instance).
export async function installedProfiles(agents: AgentRow[]): Promise<InstalledProfiles> {
  const profiles: InstalledProfile[] = [];
  const unreadable: AgentRow[] = [];

  const results = await Promise.allSettled(
    agents.map(async (agent): Promise<InstalledProfile[]> => {
      if (Array.isArray(agent.profiles) && agent.profiles.length > 0) {
        return agent.profiles.map((profileId) => ({ agent, profileId, gateway: null, distribution: null }));
      }
      const live = await listInstanceProfiles(agent.agent37_id);
      return live.profiles.map((p) => ({ agent, profileId: p.id, gateway: p.gateway, distribution: p.distribution }));
    })
  );
  results.forEach((res, i) => {
    if (res.status === "fulfilled") profiles.push(...res.value);
    else unreadable.push(agents[i]);
  });
  return { profiles, unreadable };
}
