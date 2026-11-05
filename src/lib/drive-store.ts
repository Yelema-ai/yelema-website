import { apiFetch } from "@/lib/api";
import { bootstrapped, onBootstrap } from "@/lib/bootstrap-client";
import { cached, cachedFetch, forget, keptOnly, remember } from "@/lib/client-cache";
import type { DriveTree } from "@/lib/drive-paths";

// One reading of the drive tree per tab, shared by the deliverable watcher, Livrables, the home's recent
// files and the search. Read again once a burst of writes is over (the stream's `files.changed`).
const key = (agentId: string) => `drive-tree:${agentId}`;
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
// The expert writes its files as the turn ends: the burst is given this long to settle.
const SETTLE_MS = 4_000;

/** The tree, at most `maxAgeMs` old (a read in flight is shared; the tab's bootstrap may hold it). */
export async function driveTree(agentId: string, maxAgeMs = 60_000): Promise<DriveTree> {
  await bootstrapped();
  return cachedFetch(key(agentId), () => apiFetch<DriveTree>(`/api/agents/${agentId}/files/tree`), maxAgeMs);
}

/** A tree the server already read (the page, the bootstrap): the next reading is not asked again. */
export function seedDriveTree(agentId: string, tree: DriveTree): void {
  if (cached(key(agentId)) === undefined || keptOnly(key(agentId))) remember(key(agentId), tree);
}

onBootstrap((b) => b.agentId && b.tree && seedDriveTree(b.agentId, b.tree));

/** Something may have written in the drive: once it settles, the next reading goes out and watchers hear it. */
export function driveChanged(agentId: string): void {
  clearTimeout(timers.get(agentId));
  timers.set(
    agentId,
    setTimeout(() => {
      timers.delete(agentId);
      forget(key(agentId));
      for (const fn of [...(listeners.get(agentId) ?? [])]) fn();
    }, SETTLE_MS)
  );
}

export function onDriveChanged(agentId: string, fn: () => void): () => void {
  const set = listeners.get(agentId) ?? new Set();
  listeners.set(agentId, set);
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size && listeners.get(agentId) === set) listeners.delete(agentId);
  };
}
