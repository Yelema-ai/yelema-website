import { apiFetch } from "@/lib/api";
import { bootstrapped, onBootstrap } from "@/lib/bootstrap-client";
import { deviceKeep, onDeviceOpen } from "@/lib/device-cache-client";
import { DEFAULT_PROFILE } from "@/lib/profile-id";
import { spaceProfile } from "@/lib/session-rows";
import { createSessionsStore, type SpaceData } from "@/lib/sessions-store";

// The browser's one sessions store (lib/sessions-store), read through `chat/by-profile`. Every list of
// conversations (menu, chat rail, Conversations, the bell, Yélé, the wake-up) goes through it.
const DEVICE = "sessions|";
const store = createSessionsStore({
  persist: (agentId, profile, data) => deviceKeep(`${DEVICE}${agentId}|${profile}`, data),
  readMany: (agentId, profiles) =>
    apiFetch<{ spaces: Record<string, SpaceData> }>(`/api/agents/${agentId}/chat/by-profile?profiles=${profiles.map((p) => encodeURIComponent(p || DEFAULT_PROFILE)).join(",")}`).then((r) => r.spaces),
  now: () => Date.now(),
  defer: (fn, ms = 0) => void setTimeout(fn, ms),
});

// The spaces last shown on this device paint at once; the first read still goes out.
onDeviceOpen((get, keys) => {
  for (const k of keys) {
    if (!k.startsWith(DEVICE)) continue;
    const [agentId, profile] = k.slice(DEVICE.length).split("|");
    store.hydrate(agentId, profile, get(k) as SpaceData);
  }
});

// The tab's bootstrap holds the own instance's spaces: the first reads are served from it.
onBootstrap(({ agentId, spaces }) => {
  if (!agentId || !spaces) return;
  // A space the page already seeded without its runs, or only the device's copy, takes the bootstrap's.
  for (const [profile, data] of Object.entries(spaces)) if (!store.get(agentId, profile)?.runs || store.fromDevice(agentId, profile)) store.seed(agentId, profile, data);
});

// Callers name a space by its profile (null: the instance's home); the store keys it with `spaceProfile`.
export const sessionsStore = {
  get: (agentId: string, profile: string | null) => store.get(agentId, spaceProfile(profile)),
  // `withRuns`: a space held without its routine runs (a page's first screen) is read again for them.
  read: async (agentId: string, profile: string | null, maxAgeMs?: number, withRuns = false) => {
    const p = spaceProfile(profile);
    const age = () => (withRuns && !store.get(agentId, p)?.runs ? 0 : maxAgeMs);
    // A fresh copy answers at once; only a miss waits for the bootstrap, which may hold it.
    if (!store.fresh(agentId, p, age())) await bootstrapped(agentId);
    return store.read(agentId, p, age());
  },
  fromDevice: (agentId: string, profile: string | null) => store.fromDevice(agentId, spaceProfile(profile)),
  put: (agentId: string, profile: string | null, data: SpaceData) => store.put(agentId, spaceProfile(profile), data),
  invalidate: (agentId: string, profile?: string, opts?: { answeredWithinMs?: number }) => store.invalidate(agentId, profile === undefined ? undefined : spaceProfile(profile), opts),
  subscribe: (agentId: string, profile: string | null, fn: (d: SpaceData) => void) => store.subscribe(agentId, spaceProfile(profile), fn),
};
