import "server-only";
import { backofficeAgentRow, type DB } from "@/lib/auth";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { expertDisplayName } from "@/lib/experts";
import { authViaBackoffice } from "@/lib/runtime-config";
import { currentInstance } from "@/lib/session";
import { listInstanceProfiles } from "@/lib/hermes-profiles";
import { ApiError } from "@/lib/http";
import type { AgentRow, Expert } from "@/lib/types";

// The profiles installed on the instance a user owns (admins included: nobody sees a colleague's).
// Shared by the experts list and the catalogue, so both screens agree on what "installed" means.

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

export async function visibleAgents(db: DB, workspaceId: string, userId: string): Promise<AgentRow[]> {
  if (authViaBackoffice()) {
    // The back office says which instance is the caller's, with the experts installed on it.
    const row = await backofficeAgentRow();
    return row && row.workspace_id === workspaceId && row.owner_user_id === userId ? [row] : [];
  }
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
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

/** True when listing these instances' profiles asks nothing of the instances themselves. */
export function profilesMirrored(agents: AgentRow[]): boolean {
  return agents.every((a) => Array.isArray(a.profiles) && a.profiles.length > 0);
}

export interface UserExperts {
  experts: Expert[];
  unreadable: { agentId: string; agentName: string | null }[];
  /** True while the back office is still installing profiles on the caller's instance. */
  installing: boolean;
}

// The back office says so itself (`ready`); without it nothing here can tell.
async function isInstalling(): Promise<boolean> {
  if (!authViaBackoffice()) return false;
  const instance = await currentInstance().catch(() => null);
  return instance?.ready === false;
}

// The experts of these instances as the screens show them: each installed profile dressed by the
// back office's catalogue (name, role, portrait), or named after its profile id without one. An
// instance that cannot be read does not take the others down: it is reported in `unreadable`.
// Shared by the experts route and the shell's first render, so both say the same thing.
export async function userExperts(agents: AgentRow[]): Promise<UserExperts> {
  const installing = await isInstalling();
  // An instance being set up is not asked for its profiles: the experts are the ones the back
  // office reports installed, and the rest arrive when it is done.
  const readable = installing ? agents.filter((a) => Array.isArray(a.profiles) && a.profiles.length > 0) : agents;
  const [{ profiles, unreadable }, catalogue] = await Promise.all([installedProfiles(readable), loadCatalogue()]);

  const experts: Expert[] = profiles.map((p) => {
    const entry = matchCatalogue(catalogue.experts, p.profileId);
    return {
      profileId: p.profileId,
      displayName: entry?.name ?? expertDisplayName(p.profileId),
      agentId: p.agent.agent37_id,
      agentName: p.agent.name,
      gateway: p.gateway,
      distribution: p.distribution,
      catalogueKey: entry?.key ?? null,
      role: entry?.role ?? null,
      title: entry?.title ?? null,
      tagline: entry?.tagline ?? null,
      photoUrl: entry?.avatarUrl ?? null,
      driveFolder: entry?.driveFolder ?? entry?.name ?? null,
    };
  });

  experts.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
  return { experts, unreadable: unreadable.map((a) => ({ agentId: a.agent37_id, agentName: a.name })), installing };
}
