import { apiFetch } from "@/lib/api";
import { runPool } from "@/lib/bulk";
import { cached, cachedFetch, loading, remember, servesKept } from "@/lib/client-cache";
import type { ExpertTool } from "@/lib/expert-tools";

// An expert's recommended tools (its pack's outils-recommandes.json), kept per instance and profile in the
// tab and on the device (a day, lib/device-cache): fresh for 10 minutes, shown stale while read again.
const FRESH_MS = 10 * 60_000;
// Reads of one instance at once when the gateway cannot group them: the member's thread must not queue behind.
const PARALLEL = 2;
const ABSENT_MS = 10 * 60_000;
const absentUntil = new Map<string, number>();

const keyOf = (agentId: string, profile: string) => `expert-tools:${agentId}:${profile}`;

/** The list last read for this expert, if any (shown at once). */
export const keptExpertTools = (agentId: string, profile: string): ExpertTool[] | undefined => cached(keyOf(agentId, profile));

/** One expert's list: from the tab when fresh, one read in flight per expert. Rejects on a failed read. */
export const expertTools = (agentId: string, profile: string): Promise<ExpertTool[]> =>
  cachedFetch(keyOf(agentId, profile), () => apiFetch<{ outils: ExpertTool[] }>(`/api/agents/${agentId}/experts/${encodeURIComponent(profile)}/outils`).then((r) => r.outils), FRESH_MS);

/** Several experts of one instance, in their order: one grouped call for those not fresh, else two reads at a time. A failed one is empty. */
export async function teamTools(agentId: string, profiles: string[]): Promise<ExpertTool[][]> {
  const due = profiles.filter((p) => !servesKept(keyOf(agentId, p), FRESH_MS) && !loading(keyOf(agentId, p)));
  if (due.length > 1 && Date.now() >= (absentUntil.get(agentId) ?? 0)) {
    try {
      const { tools } = await apiFetch<{ tools: Record<string, ExpertTool[]> }>(
        `/api/agents/${agentId}/experts/files/outils-recommandes.json?profiles=${due.map(encodeURIComponent).join(",")}`
      );
      for (const p of due) if (Array.isArray(tools?.[p])) remember(keyOf(agentId, p), tools[p]);
    } catch {
      absentUntil.set(agentId, Date.now() + ABSENT_MS);
    }
  }
  const all = await runPool(profiles, PARALLEL, (p) => expertTools(agentId, p));
  return all.map((r) => (r.status === "fulfilled" ? r.value : []));
}
