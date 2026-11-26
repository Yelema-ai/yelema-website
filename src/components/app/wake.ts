import { oncePer } from "@/lib/once-per";
import { sessionsStore } from "@/lib/sessions-client";

// One light read wakes a sleeping instance (it sleeps after 30 idle minutes), at most once per 5 minutes
// whatever asks: an expert's chat opened, its composer focused. It is the home's conversations, kept
// by the sessions store for the menu, not a listing thrown away. `force`: ReadAhead's own schedule.
const due = oncePer(5 * 60_000);

export function wakeInstance(agentId: string, force = false): void {
  if (!due(agentId) && !force) return;
  // A reading of the last minute (the tab's bootstrap) already woke it; the keep-awake always asks.
  sessionsStore.read(agentId, null, force ? 0 : 60_000).catch(() => {});
}
