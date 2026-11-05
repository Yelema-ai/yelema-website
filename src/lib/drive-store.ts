import { afterBurst } from "@/lib/after-burst";
import { apiFetch } from "@/lib/api";
import { bootstrapped, onBootstrap } from "@/lib/bootstrap-client";
import { cachedFetch, forget, fresh, loading, seed } from "@/lib/client-cache";
import type { DriveTree } from "@/lib/drive-paths";

// One reading of the drive tree per tab, shared by the deliverable watcher, Livrables, the home's recent
// files and the search. Read again once a burst of writes is over (the stream's `files.changed`).
const key = (agentId: string) => `drive-tree:${agentId}`;
const listeners = new Map<string, Set<() => void>>();

/** The tree, at most `maxAgeMs` old (a read in flight is shared; the tab's bootstrap may hold it). */
export async function driveTree(agentId: string, maxAgeMs = 60_000): Promise<DriveTree> {
  // A fresh copy answers at once; only a miss waits for the bootstrap, which may hold it.
  if (!fresh(key(agentId), maxAgeMs)) await bootstrapped(agentId);
  return cachedFetch(key(agentId), () => apiFetch<DriveTree>(`/api/agents/${agentId}/files/tree`), maxAgeMs);
}

/** True when the tree was answered within `ms` (not merely asked). */
export const driveAnswered = (agentId: string, ms: number): boolean => fresh(key(agentId), ms) && !loading(key(agentId));

/** A tree the server already read (the page, the bootstrap): the next reading is not asked again. */
export const seedDriveTree = (agentId: string, tree: DriveTree): void => seed(key(agentId), tree);

onBootstrap((b) => b.agentId && b.tree && seedDriveTree(b.agentId, b.tree));

// The expert writes its files as the turn ends: a burst is given 4 s to settle, a long one is read every 15 s.
/** Something may have written in the drive: once it settles, the next reading goes out and watchers hear it. */
export const driveChanged = afterBurst(
  (agentId) => {
    forget(key(agentId));
    for (const fn of [...(listeners.get(agentId) ?? [])]) fn();
  },
  4_000,
  15_000
);

export function onDriveChanged(agentId: string, fn: () => void): () => void {
  const set = listeners.get(agentId) ?? new Set();
  listeners.set(agentId, set);
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size && listeners.get(agentId) === set) listeners.delete(agentId);
  };
}
