import "server-only";
import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { optionalRoute } from "@/lib/optional-route";
import { profileQuery, resolveProfile } from "@/lib/profiles";
import { DIRECT_READS } from "@/lib/run-outcomes";
import { parseByProfile, railOf, runsOf, spaceProfile, type ProfileListing } from "@/lib/session-rows";
import { runOutcomeOf } from "@/lib/silent-runs";
import type { RoutineSession } from "@/lib/activity";
import type { ChatSession } from "@/components/chat/types";

export type Space = { sessions: ChatSession[]; runs: RoutineSession[] };

// A gateway without the grouped read is not asked again for a while.
const byProfile = optionalRoute((agentId: string, profiles: string[]) => agent37.sessionsByProfile(agentId, profiles));

async function grouped(agentId: string, profiles: string[]): Promise<Map<string, ProfileListing> | null> {
  const body = await byProfile(agentId, profiles).catch(() => undefined);
  return body ? parseByProfile(body) : null;
}

/**
 * Several spaces of one instance (`""` its home), each its rail and its routine runs: one call to the
 * gateway's `sessions/by-profile`, else one listing per space. A space that cannot be read is left out.
 */
export async function spacesOf(agentId: string, asked: string[]): Promise<Record<string, Space>> {
  const { row } = await requireAgentAccess(agentId);
  const resolved = (await Promise.all(asked.map((raw) => resolveProfile(row, raw || null).then((p) => [spaceProfile(raw), p] as const, () => null)))).filter((x) => x !== null);
  const fromGateway = await grouped(agentId, resolved.map(([, p]) => p));
  const budget = { left: DIRECT_READS };
  const entries = await Promise.all(
    resolved.map(async ([key, profile]): Promise<[string, Space] | null> => {
      try {
        const got = fromGateway?.get(profile);
        if (got) return [key, { sessions: railOf(got.sessions, got.outcomes), runs: runsOf(got.sessions, got.outcomes) }];
        const query = profileQuery(profile);
        const { data } = await agent37.listSessions(agentId, query);
        const outcomes = await runOutcomeOf(agentId, query, data, budget);
        return [key, { sessions: railOf(data, outcomes), runs: runsOf(data, outcomes) }];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}
