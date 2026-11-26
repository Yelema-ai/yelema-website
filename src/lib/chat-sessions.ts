import "server-only";
import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { profileQuery, resolveProfile } from "@/lib/profiles";
import { railOf } from "@/lib/session-rows";
import { runOutcomeOf } from "@/lib/silent-runs";
import type { ChatSession } from "@/components/chat/types";

// The thread rail of one expert (`profile`), or of the instance's default home without it, from
// GET /v1/sessions (every channel alike; no local index). Each label is `title || preview`, most
// recently active first, so the client needs no per-session fetch. Checks the caller's access.
export async function chatSessions(agentId: string, profileParam: string | null): Promise<ChatSession[]> {
  const { row } = await requireAgentAccess(agentId);
  const query = profileQuery(await resolveProfile(row, profileParam));
  const { data } = await agent37.listSessions(agentId, query);
  // A routine run is a conversation only once it has delivered: running, nothing to report, failed
  // or not read yet, the bell has it.
  return railOf(data, await runOutcomeOf(agentId, query, data));
}
