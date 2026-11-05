"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { TelegramHubStatus } from "@/lib/agent37";
import { usePoll } from "@/components/usePoll";
import { WAIT_POLL_MS } from "@/components/wake";

// Past this, nothing came from Telegram: the screen says so and puts the QR code and the link forward.
export const SLOW_START_MS = 2 * 60_000;
const TG_LINK = /^https:\/\/t\.me\//;

export type HubBusy = "link" | "own" | "sync" | "off" | null;
export type TelegramHubApi = ReturnType<typeof useTelegramHub>;

// The Telegram the runtime gateway prepares for an instance (Yelema bot or the member's own), read once for
// the whole screen and re-read while a step waits on Telegram. `unavailable`: no gateway for this instance.
export function useTelegramHub(agentId: string) {
  const base = `/api/agents/${agentId}/channels/telegram/hub`;
  const [status, setStatus] = useState<TelegramHubStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [busy, setBusy] = useState<HubBusy>(null);
  const [posted, setPosted] = useState<{ url: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<TelegramHubStatus>(base));
    } catch {
      setUnavailable(true);
    }
  }, [base]);

  useEffect(() => void load(), [load]);

  const phase = status?.state?.phase;
  // The gateway keeps the manager bot's link (one per instance) until it expires: it survives a reload.
  const kept = status?.link ?? (posted && Date.parse(posted.expiresAt) > Date.now() ? { ...posted, started: false } : null);
  const link = !status?.state && kept && TG_LINK.test(kept.url) ? kept : null;
  // Bounded by the link's own expiry: the gateway stops returning it, the polling stops.
  const waiting = link !== null;
  // A wait on Telegram: 15 s apart at least, at once on the gateway's word or back on the tab.
  usePoll(load, { everyMs: WAIT_POLL_MS, immediate: false, runOnShow: true, wake: { types: ["job.done"], kind: "telegram" }, enabled: waiting || phase === "awaiting_group" || phase === "needs_topics" });
  useEffect(() => {
    if (status?.state) setWaitingSince(null);
  }, [status?.state]);

  const act = async (what: NonNullable<HubBusy>, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(what);
    try {
      await fn();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    status,
    state: status?.state ?? null,
    instanceBot: status?.instanceBot ?? null,
    unavailable,
    waiting,
    /** When this screen asked for the link (null after a reload: the wait is then already old). */
    waitingSince,
    link,
    busy,
    load,
    /** A new Yelema bot (via the manager bot), or the resumption of a set-up already started. */
    connect: () => {
      // Opened during the click: after the gateway's answer (seconds) the browser would block it silently.
      const tab = window.open("", "_blank");
      return act("link", async () => {
        try {
          const { url, expiresAt } = await apiFetch<{ url: string; expiresAt: string }>(base, { method: "POST", body: "{}" });
          setPosted({ url, expiresAt });
          if (tab && TG_LINK.test(url)) {
            tab.opener = null;
            tab.location.href = url;
          } else tab?.close();
        } catch (e) {
          tab?.close();
          throw e;
        }
        setWaitingSince(Date.now());
        await load();
      });
    },
    stopWaiting: () =>
      act("off", async () => {
        setWaitingSince(null);
        setPosted(null);
        await apiFetch(base, { method: "DELETE" });
        await load();
      }),
    own: (token: string) =>
      act("own", async () => {
        await apiFetch(`${base}/own`, { method: "POST", body: JSON.stringify({ token }) });
        await load();
      }),
    sync: () =>
      act("sync", async () => {
        const out = await apiFetch<{ topics: number }>(`${base}/sync`, { method: "POST" });
        toast.success(`Sujets à jour (${out.topics})`);
        await load();
      }),
    /** Unplugs the bot (the instance lets go of it only if it is the one it listens to), or cancels a set-up. */
    disconnect: () =>
      act("off", async () => {
        await apiFetch(base, { method: "DELETE" });
        await load();
      }),
  };
}

export const isTelegramLink = (url: string | null | undefined): url is string => Boolean(url && TG_LINK.test(url));
