import { instanceFetch } from "@/lib/agent37";
import { inlineDashboard } from "@/lib/dashboard-inline";
import { inDashboardFolderOf, sharedHtmlKey } from "@/lib/dashboard-files";
import { getDashboardStateCandidatePaths, namesFile, type StoredDashboardState } from "@/lib/dashboards";
import { withTimeout } from "@/lib/fetch-timeout";
import { memo } from "@/lib/memo";

// A dashboard's state file (30 s) and its page (a few minutes), one read in flight per key.
// A state naming no page yet (generation still running) is not kept, so the next poll sees it land.
const TTL_MS = 30_000;
const PAGE_TTL_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 20_000;
const FRAME_TIMEOUT_MS = 15_000;

const located = (s: StoredDashboardState | null) => Boolean(s && (namesFile(s) || (typeof s.lien === "string" && s.lien)));
const states = memo<StoredDashboardState | null>({ ttlMs: TTL_MS, ttlOf: (v) => (located(v) ? TTL_MS : 0), maxEntries: 500, maxFlightMs: READ_TIMEOUT_MS + 2_000 });
const frames = memo<string>({ ttlMs: TTL_MS, maxEntries: 200, maxFlightMs: FRAME_TIMEOUT_MS + 2_000 });
// A missing page is kept 30 s: repeated openings of a dashboard not made yet do not wake the instance.
const pages = memo<{ path: string; html: string } | null>({ ttlMs: PAGE_TTL_MS, ttlOf: (v) => (v ? PAGE_TTL_MS : TTL_MS), maxEntries: 40, maxFlightMs: 2 * READ_TIMEOUT_MS });

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

/** The dashboard state of an expert: the first candidate naming a page, else a link, else the first found. */
export function fetchCachedDashboardState(agentId: string, profile: string, folders: readonly string[] = []): Promise<StoredDashboardState | null> {
  return states.get(`${agentId}:${profile.toLowerCase()}`, async () => {
    const found = await Promise.all(getDashboardStateCandidatePaths(profile, folders).map((p) => readState(agentId, p)));
    return found.find((s) => namesFile(s)) ?? found.find((s) => located(s)) ?? found.find((s) => s !== null) ?? null;
  });
}

/** The frame's HTML, fetched from the legacy dashboard host (checked by the caller). */
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

async function readBytes(agentId: string, path: string, timeoutMs: number): Promise<Uint8Array | null> {
  const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(path)}`, withTimeout(undefined, timeoutMs));
  if (res.ok) return new Uint8Array(await res.arrayBuffer());
  await res.body?.cancel().catch(() => undefined);
  return null;
}

/**
 * A shared dashboard's page: the first of `candidates` (checked by the caller) found on the instance, its
 * stylesheets, pictures and fonts put inside from its own dashboard folder only. Null when none exists.
 */
export function fetchCachedSharedPage(agentId: string, candidates: readonly string[], maj: string | null | undefined): Promise<{ path: string; html: string } | null> {
  return pages.get(sharedHtmlKey(agentId, candidates, maj), async () => {
    for (const path of candidates) {
      const bytes = await readBytes(agentId, path, READ_TIMEOUT_MS);
      if (!bytes) continue;
      const read = (file: string) => (inDashboardFolderOf(path, file) ? readBytes(agentId, file, FRAME_TIMEOUT_MS) : Promise.resolve(null));
      return { path, html: await inlineDashboard(new TextDecoder().decode(bytes), path, read) };
    }
    return null;
  });
}

/** After a write that changes the state (a new generation), the next read goes to the instance. */
export function forgetDashboardState(agentId: string, profile: string): void {
  states.drop(`${agentId}:${profile.toLowerCase()}`);
}
