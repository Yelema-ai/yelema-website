import { apiFetch } from "@/lib/api";
import { bootstrapped, onBootstrap } from "@/lib/bootstrap-client";
import { DEFAULT_PROFILE } from "@/lib/profile-id";
import { spaceProfile } from "@/lib/session-rows";
import { createSessionsStore, type SpaceData } from "@/lib/sessions-store";

// The browser's one sessions store (lib/sessions-store), read through `chat/by-profile`. Every list of
// conversations (menu, chat rail, Conversations, the bell, Yélé, the wake-up) goes through it.
const store = createSessionsStore({
  readMany: (agentId, profiles) =>
    apiFetch<{ spaces: Record<string, SpaceData> }>(`/api/agents/${agentId}/chat/by-profile?profiles=${profiles.map((p) => encodeURIComponent(p || DEFAULT_PROFILE)).join(",")}`).then((r) => r.spaces),
  now: () => Date.now(),
  defer: (fn) => void setTimeout(fn, 0),
});

// The tab's bootstrap holds the own instance's spaces: the first reads are served from it.
onBootstrap(({ agentId, spaces }) => {
  if (!agentId || !spaces) return;
  // A space the page already seeded without its runs takes the bootstrap's, which has them.
  for (const [profile, data] of Object.entries(spaces)) if (!store.get(agentId, profile)?.runs) store.put(agentId, profile, data);
});

// Callers name a space by its profile (null: the instance's home); the store keys it with `spaceProfile`.
export const sessionsStore = {
  get: (agentId: string, profile: string | null) => store.get(agentId, spaceProfile(profile)),
  // `withRuns`: a space held without its routine runs (a page's first screen) is read again for them.
  read: async (agentId: string, profile: string | null, maxAgeMs?: number, withRuns = false) => {
    await bootstrapped();
    const p = spaceProfile(profile);
    return store.read(agentId, p, withRuns && !store.get(agentId, p)?.runs ? 0 : maxAgeMs);
  },
  put: (agentId: string, profile: string | null, data: SpaceData, at?: number) => store.put(agentId, spaceProfile(profile), data, at),
  invalidate: (agentId: string, profile?: string) => store.invalidate(agentId, profile === undefined ? undefined : spaceProfile(profile)),
  subscribe: (agentId: string, profile: string | null, fn: (d: SpaceData) => void) => store.subscribe(agentId, spaceProfile(profile), fn),
};
