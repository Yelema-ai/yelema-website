import { agent37 } from "@/lib/agent37";
import { runOutcome } from "@/lib/routines";
import { runOutcomes } from "@/lib/run-outcomes";

// A routine run with nothing to report is a notification, not a conversation. The gateway knows each
// run's outcome; direct to Agent37, a few runs are read per request (lib/run-outcomes).
const outcomes = runOutcomes({
  batch: (agentId, profileQuery, ids) => agent37.routineOutcomes(agentId, ids, profileQuery),
  one: async (agentId, sessionId, profileQuery) => {
    const { history, active_response_id } = await agent37.getSession(agentId, sessionId, profileQuery);
    if (active_response_id) return null;
    return runOutcome(history.findLast((m) => m.role === "assistant")?.content ?? null);
  },
});

export const silentRunIds = outcomes.silent;
/** The routine runs that are no conversation yet: only a run that delivered is one. */
export const undeliveredRunIds = outcomes.undelivered;
/** What the routine runs are known to have come to; a run missing is not read yet. */
export const runOutcomeOf = outcomes.outcomes;
