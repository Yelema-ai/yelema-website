"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, cachedFetch, hydrate, servesKept, subscribe } from "@/lib/client-cache";
import { deviceKeep, onDeviceOpen } from "@/lib/device-cache-client";
import { instanceEvents } from "@/lib/instance-events";
import { withoutUrls, type SalonDeliverable } from "@/lib/salon-deliverables";

// One reading of a salon's deliverables per tab, shared by the Livrables tab and the thread's links. The
// device keeps the list without its signed addresses (shown at once, links once read again); the tab
// reads again before an address can expire (the back office signs them for 15 min).
const key = (salon: string) => `echanges:livrables:${salon}`;
const DEVICE = "buzz:livrables:";
const FRESH_MS = 60_000;
const URL_FRESH_MS = 10 * 60_000;
// The Expert writes several files as its turn ends: one reading once they settle.
const SETTLE_MS = 4_000;
const readAt = new Map<string, number>();

function load(salon: string): Promise<SalonDeliverable[]> {
  return apiFetch<{ items: SalonDeliverable[] }>(`/api/buzz/salons/${salon}/livrables`, undefined, "Les livrables du salon sont indisponibles").then((r) => {
    readAt.set(salon, Date.now());
    deviceKeep(`${DEVICE}${salon}`, withoutUrls(r.items));
    return r.items;
  });
}

onDeviceOpen((get, keys) => {
  for (const k of keys) {
    const items = k.startsWith(DEVICE) ? get(k) : undefined;
    if (items !== undefined) hydrate(key(k.slice(DEVICE.length)), items);
  }
});

/** The list, at most `maxAgeMs` old (a reading in flight is shared). */
export const readSalonDeliverables = (salon: string, maxAgeMs = FRESH_MS): Promise<SalonDeliverable[]> =>
  cachedFetch(key(salon), () => load(salon), maxAgeMs);

export const prefetchSalonDeliverables = (salon: string): void => void readSalonDeliverables(salon).catch(() => undefined);

/** When the list was last read from the back office (0: never in this tab). */
export const salonReadAt = (salon: string): number => readAt.get(salon) ?? 0;

/**
 * The salon's list as held, read when `wanted` (the tab open, a cited file on screen), again on the tab's
 * return, on the own instance's `files.changed` or `job.done` (deliverables), and before its addresses expire.
 */
export function useSalonDeliverables(salon: string | null, wanted: boolean) {
  const [items, setItems] = useState<SalonDeliverable[] | null>(() => (salon ? (cached<SalonDeliverable[]>(key(salon)) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!salon) return setItems(null);
    setItems(cached<SalonDeliverable[]>(key(salon)) ?? null);
    return subscribe<SalonDeliverable[]>(key(salon), setItems);
  }, [salon]);

  useEffect(() => {
    if (!salon || !wanted) return;
    let stop = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const read = (maxAgeMs: number) => {
      if (document.visibilityState === "hidden") return;
      // Served from what is held: no loading state (setLoading(false) below then bails out, no render).
      if (!servesKept(key(salon), maxAgeMs)) setLoading(true);
      readSalonDeliverables(salon, maxAgeMs)
        .then(() => !stop && setError(null), (e: unknown) => !stop && setError(e instanceof Error ? e.message : "Les livrables du salon sont indisponibles."))
        .finally(() => {
          if (stop) return;
          setLoading(false);
          clearTimeout(expiry);
          const at = salonReadAt(salon);
          if (at) expiry = setTimeout(() => read(0), Math.max(0, at + URL_FRESH_MS - Date.now()));
        });
    };
    read(round ? 0 : FRESH_MS);
    const onShow = () => document.visibilityState === "visible" && read(Date.now() - salonReadAt(salon) > URL_FRESH_MS ? 0 : FRESH_MS);
    const off = instanceEvents.on(null, (e) => {
      if (e.type !== "files.changed" && !(e.type === "job.done" && e.kind === "deliverables")) return;
      clearTimeout(settle);
      settle = setTimeout(() => read(0), SETTLE_MS);
    });
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      clearTimeout(settle);
      clearTimeout(expiry);
      off();
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [salon, wanted, round]);

  return { items, error, loading, refresh: () => setRound((r) => r + 1) };
}
