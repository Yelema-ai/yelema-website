import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { profileQuery, resolveProfile } from "@/lib/profiles";
import { isMemoryRun, routineOfSession } from "@/lib/routines";
import { isSystemSession } from "@/lib/system-sessions";
import type { RoutineSession } from "@/lib/activity";
import type { RunOutcome } from "@/lib/routines";
import { DIRECT_READS } from "@/lib/run-outcomes";
import { runOutcomeOf } from "@/lib/silent-runs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_PROFILES = 30;
const PER_PROFILE = 20;

// The latest routine runs of several experts of one instance (?profiles=a,b), in one call: the
// app polls it to announce finished runs. A profile that cannot be read is left out, not fatal.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const asked = [...new Set((new URL(request.url).searchParams.get("profiles") ?? "").split(",").filter(Boolean))];
    if (asked.length > MAX_PROFILES) throw new ApiError(400, "invalid_request", "Trop d’experts demandés.");

    // Without a gateway, the few direct reads allowed are shared by every profile asked.
    const budget = { left: DIRECT_READS };
    const entries = await Promise.all(
      asked.map(async (raw): Promise<[string, RoutineSession[]] | null> => {
        try {
          const profile = await resolveProfile(row, raw);
          const query = profileQuery(profile);
          const { data } = await agent37.listSessions(id, query);
          const known = await runOutcomeOf(id, query, data, budget);
          const runs = data
            // A memory routine is announced nowhere, not even in the bell.
            .filter((s) => !isMemoryRun(s) && !isSystemSession(s))
            .map((s) => ({ s, routine: routineOfSession(s) }))
            .filter((x): x is { s: (typeof data)[number]; routine: string } => x.routine !== null)
            .map(({ s, routine }) => ({ session_id: s.id, routine, last_active: s.last_active ?? s.started_at ?? 0, message_count: s.message_count ?? null, ...outcomeFields(known.get(s.id)) }))
            .sort((a, b) => b.last_active - a.last_active)
            .slice(0, PER_PROFILE);
          return [raw, runs];
        } catch {
          return null;
        }
      })
    );
    return json({ profiles: Object.fromEntries(entries.filter((e) => e !== null)) });
  } catch (e) {
    return handleError(e);
  }
}

// Only a run known to have sent something is announced as one (Leslie, 29/10: « si y'a rien, pas
// d'updates dans les conversations »): nothing to report or failed is a line in the bell, and a run
// not read yet waits for the next look instead of passing for a delivered one.
function outcomeFields(o: RunOutcome | undefined): { silent: boolean; pending?: true } {
  return o ? { silent: o !== "sent" } : { silent: false, pending: true };
}
