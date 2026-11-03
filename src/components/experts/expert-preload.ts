"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { cachedFetch } from "@/lib/client-cache";
import { profileQuery } from "@/lib/profile-id";
import type { ModelsResponse } from "@/lib/types";
import type { ChatSession } from "@/components/chat/types";

// An Expert's page opens on two reads: its conversations and its models. The menu reads them ahead,
// so the page paints them at once; the same call starts the Expert's process on the instance (its
// first call boots it), which is the wait a member otherwise meets on their first message.
export const sessionsKey = (agentId: string, profile: string | null) => `sessions:${agentId}${profileQuery(profile)}`;
export const modelsKey = (agentId: string, profile: string | null) => `models:${agentId}${profileQuery(profile)}`;

// Read again at most this often: a menu hovered back and forth asks nothing more.
const FRESH_MS = 60_000;
const last = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

export function preloadExpert(agentId: string, profile: string | null): Promise<void> {
  const key = sessionsKey(agentId, profile);
  const running = inFlight.get(key);
  if (running) return running;
  if (Date.now() - (last.get(key) ?? 0) < FRESH_MS) return Promise.resolve();
  const q = profileQuery(profile);
  // Shared with the page's own reads: what it read in the last minute is not asked again.
  const p = Promise.allSettled([
    cachedFetch(key, () => apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions${q}`).then((r) => r.sessions), FRESH_MS),
    cachedFetch(modelsKey(agentId, profile), () => apiFetch<ModelsResponse>(`/api/agents/${agentId}/chat/models${q}`), FRESH_MS),
  ]).then(() => {
    last.set(key, Date.now());
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

/** Whether the browser asked to spare data, or the network is too slow to read ahead. */
export function sparingData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData) || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g";
}

// How many Experts, from the top of the menu, are read ahead once the page is idle: one at a time,
// behind what the page itself loads. A dozen at once would take a slow line from the page itself;
// the others are read when a pointer or a finger reaches their row (ExpertItem).
export const READ_AHEAD = 4;
const STAGGER_MS = 1_500;

export function useReadAhead(experts: { agentId: string; profileId: string }[]): void {
  const list = experts
    .slice(0, READ_AHEAD)
    .map((e) => `${e.agentId}\n${e.profileId}`)
    .join("|");
  useEffect(() => {
    if (!list || sparingData()) return;
    let stop = false;
    const todo = list.split("|").map((s) => s.split("\n") as [string, string]);
    const next = () => {
      // A hidden tab reads nothing ahead; the Expert opened later reads for itself.
      if (stop || document.visibilityState !== "visible") return;
      const item = todo.shift();
      if (!item) return;
      void preloadExpert(item[0], item[1]).then(() => {
        if (!stop) setTimeout(() => idle(next), STAGGER_MS);
      });
    };
    const t = setTimeout(() => idle(next), STAGGER_MS);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [list]);
}

function idle(fn: () => void) {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 5_000 });
  else setTimeout(fn, 200);
}
