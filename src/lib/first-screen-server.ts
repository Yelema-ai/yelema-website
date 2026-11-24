import "server-only";
import { appContext } from "@/lib/app-context";
import type { DriveTree } from "@/lib/drive-paths";
import { instanceDriveTree } from "@/lib/drive-tree-server";
import { FIRST_SCREEN_BUDGET_MS, settledByKey, spaceKey, within } from "@/lib/first-screen";
import { spaceProfile } from "@/lib/session-rows";
import { spacesOf, type Space } from "@/lib/sessions-by-profile";
import { MAX_SPACES } from "@/lib/sessions-store";
import { workspaceMembers, type WorkspaceMembers } from "@/lib/workspace-members";
import type { ChatSession } from "@/components/chat/types";


// The member's spaces as the shell knows them (its first data, read by the layout in the same request).
async function spaces() {
  const { initial } = await appContext();
  const experts = initial?.experts?.experts;
  const own = initial?.agents?.[0]?.agent37_id ?? experts?.[0]?.agentId;
  return experts && own ? { own, experts } : null;
}

/** Each space's conversations, by `spaceKey`; null when the browser should read them itself. */
export async function initialConversations(): Promise<Record<string, ChatSession[]> | null> {
  const s = await spaces();
  if (!s) return null;
  // One grouped read per instance (lib/sessions-by-profile), not one listing per space.
  const byAgent = new Map<string, (string | null)[]>([[s.own, [null]]]);
  for (const e of s.experts) byAgent.set(e.agentId, [...(byAgent.get(e.agentId) ?? []), e.profileId]);
  const read = Promise.all(
    [...byAgent].map(async ([agentId, profiles]) => {
      const found = await spacesOf(agentId, [...new Set(profiles.map(spaceProfile))].slice(0, MAX_SPACES)).catch(() => ({}) as Record<string, Space>);
      return Object.entries(found).map(([profile, space]) => [spaceKey(agentId, profile || null), space.sessions] as const);
    })
  ).then((parts) => Object.fromEntries(parts.flat()));
  return within(read, FIRST_SCREEN_BUDGET_MS);
}

/** Each instance's drive, by agent id; null when the browser should read them itself. */
export async function initialDrives(): Promise<Record<string, DriveTree> | null> {
  const s = await spaces();
  if (!s) return null;
  return within(settledByKey([...new Set([s.own, ...s.experts.map((e) => e.agentId)])], instanceDriveTree), FIRST_SCREEN_BUDGET_MS);
}

/** The members list for an admin; null otherwise (the page sends a member elsewhere). */
export async function initialMembers(): Promise<WorkspaceMembers | null> {
  const ws = (await appContext()).workspaces[0];
  return ws?.role === "admin" ? within(workspaceMembers(ws.id), FIRST_SCREEN_BUDGET_MS) : null;
}
