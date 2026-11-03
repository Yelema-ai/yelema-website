"use client";

import { useEffect, useState } from "react";
import { cached, remember } from "@/lib/client-cache";
import { deliverableItems, type DeliverableItem } from "@/lib/deliverable-folders";
import { splitVersions } from "@/lib/drive-versions";
import { seatFolderOf } from "@/lib/drive-paths";
import { driveTree, onDriveChanged } from "@/lib/drive-store";
import { agentTabPath } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";

/** A deliverable with whoever made it: an Expert, or the chat d'entreprise (`expert` null). */
export interface Deliverable extends DeliverableItem {
  agentId: string;
  expert: Expert | null;
  /** Where a click leads: the folder in its Expert's Livrables. */
  href: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// The Expert whose drive folder this is: the catalogue's folder name, else its first name or key.
function ownerOf(experts: Expert[], agentId: string, folder: string): Expert | null {
  const f = fold(folder);
  return (
    experts.find((e) => e.agentId === agentId && [e.driveFolder, e.displayName, e.catalogueKey].some((n) => n && fold(n) === f)) ?? null
  );
}

// A document's older versions stay in its folder, out of the list (Leslie, 02/11): « devis_v18 » only.
function latestOnly(items: DeliverableItem[]): DeliverableItem[] {
  const byFolder = new Map<string, DeliverableItem[]>();
  for (const i of items) {
    const at = i.path.slice(0, i.path.lastIndexOf("/"));
    byFolder.set(at, [...(byFolder.get(at) ?? []), i]);
  }
  const kept = new Set<DeliverableItem>();
  for (const group of byFolder.values()) {
    for (const i of splitVersions(group.map((g) => ({ ...g, type: g.folder ? "directory" : "file", item: g }))).current) kept.add(i.item);
  }
  return items.filter((i) => kept.has(i));
}

/** Every deliverable of the member's instances, newest first; null until read. */
export function useAllDeliverables(ownAgentId: string | null, experts: Expert[]): Deliverable[] | null {
  const agentIds = [...new Set([ownAgentId, ...experts.map((e) => e.agentId)].filter((a): a is string => !!a))];
  const key = `all-deliverables:${agentIds.join(",")}`;
  const [items, setItems] = useState<Deliverable[] | null>(() => cached<Deliverable[]>(key) ?? null);
  const [tick, setTick] = useState(0);
  const expertsKey = experts.map((e) => `${e.agentId}:${e.profileId}:${e.driveFolder ?? ""}`).join(",");

  useEffect(() => {
    const offs = agentIds.map((a) => onDriveChanged(a, () => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!agentIds.length) return;
    let live = true;
    void Promise.all(
      agentIds.map((agentId) =>
        // A tree that cannot be read or walked counts as empty: never a list stuck on « Chargement ».
        driveTree(agentId)
          .then((tree) =>
            latestOnly(deliverableItems(tree.entries ?? [])).flatMap((item): Deliverable[] => {
              const seat = seatFolderOf([item.owner]);
              const expert = seat ? null : ownerOf(experts, agentId, item.owner);
              // A folder that is no Expert's and not the chat d'entreprise's is the member's own.
              if (!seat && !expert) return [];
              const tab = agentTabPath(agentId, "files", expert?.profileId);
              const at = item.folder ? item.path : item.path.slice(0, item.path.lastIndexOf("/"));
              return [{ ...item, agentId, expert, href: `${tab}?dossier=${encodeURIComponent(at)}` }];
            })
          )
          .catch(() => [] as Deliverable[])
      )
    ).then((all) => {
      const sorted = all.flat().sort((a, b) => b.modified - a.modified);
      remember(key, sorted);
      if (live) setItems(sorted);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expertsKey, tick]);

  return items;
}

// « Nouveau »: changed in the last three days and not opened from this browser since.
const SEEN_KEY = "yelema.livrables-vus";
const FRESH_MS = 3 * 24 * 3600 * 1000;

function seenMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function isNew(d: Pick<Deliverable, "path" | "modified">): boolean {
  if (!d.modified || Date.now() - d.modified > FRESH_MS) return false;
  const seen = seenMap()[d.path];
  return !seen || seen < d.modified;
}

export function markSeen(d: Pick<Deliverable, "path">): void {
  try {
    const all = seenMap();
    all[d.path] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {}
}
