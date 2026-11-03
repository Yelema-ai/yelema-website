import { instanceFetch } from "@/lib/agent37";
import { getDashboardStateCandidatePaths, type StoredDashboardState } from "@/lib/dashboards";
import { withTimeout } from "@/lib/fetch-timeout";
import { memo } from "@/lib/memo";

// A dashboard's state file and its rendered frame, each kept 30 s, one read in flight per key.
// A state without a link (generation still running) is not kept, so the next poll sees it land.
const TTL_MS = 30_000;
const READ_TIMEOUT_MS = 20_000;
const FRAME_TIMEOUT_MS = 15_000;

const states = memo<StoredDashboardState | null>({ ttlMs: TTL_MS, ttlOf: (v) => (v?.lien ? TTL_MS : 0), maxEntries: 500, maxFlightMs: READ_TIMEOUT_MS + 2_000 });
const frames = memo<string>({ ttlMs: TTL_MS, maxEntries: 200, maxFlightMs: FRAME_TIMEOUT_MS + 2_000 });

async function readState(agentId: string, path: string): Promise<StoredDashboardState | null> {
  try {
    const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(path)}`, withTimeout(undefined, READ_TIMEOUT_MS));
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const parsed = (await res.json()) as StoredDashboardState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** The dashboard state of an expert: the first candidate file with a link (else the first found), all read at once. */
export function fetchCachedDashboardState(agentId: string, profile: string, folders: readonly string[] = []): Promise<StoredDashboardState | null> {
  return states.get(`${agentId}:${profile.toLowerCase()}`, async () => {
    const found = await Promise.all(getDashboardStateCandidatePaths(profile, folders).map((p) => readState(agentId, p)));
    return found.find((s) => typeof s?.lien === "string" && s.lien) ?? found.find((s) => s !== null) ?? null;
  });
}

/** The frame's HTML, fetched from the dashboard host (checked by the caller). */
export function fetchCachedFrameHtml(targetUrl: string): Promise<string> {
  return frames.get(targetUrl, async () => {
    const res = await fetch(targetUrl, {
      redirect: "error",
      headers: {
        "User-Agent": "Mstudio-Dashboard/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FRAME_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Impossible de charger le tableau de bord (${res.status})`);
    return res.text();
  });
}

/** After a write that changes the state (a new generation), the next read goes to the instance. */
export function forgetDashboardState(agentId: string, profile: string): void {
  states.drop(`${agentId}:${profile.toLowerCase()}`);
}
