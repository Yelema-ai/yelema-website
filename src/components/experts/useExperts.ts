"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Expert } from "@/lib/types";

/** Les Experts lus par le serveur avec la page, pour l'organisation indiquée. */
export interface InitialExperts {
  workspaceId: string;
  experts: Expert[];
  unreadable: unknown[];
  installing: boolean;
  failed: boolean;
  failedExperts: string[];
}

const woken = new Set<string>();

// While the back office installs the experts, the list is read again at this pace.
const INSTALL_POLL_MS = 10_000;
// An installation takes minutes. The back office only says "not ready", never "failed": past this
// long the wait is called off, so a failed one does not leave the screen turning forever.
const INSTALL_GIVE_UP_MS = 15 * 60_000;

// When this browser first saw the installation running, kept across reloads (a reload must not
// restart the wait). Null when storage is unavailable: the wait then counts from this page load.
function installSince(workspaceId: string): number {
  const key = `yelema-install:${workspaceId}`;
  try {
    const kept = Number(sessionStorage.getItem(key));
    if (kept > 0) return kept;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {}
  return Date.now();
}

function installOver(workspaceId: string): void {
  try {
    sessionStorage.removeItem(`yelema-install:${workspaceId}`);
  } catch {}
}

export interface UseExperts {
  experts: Expert[];
  /** Instances dont les profils n'ont pas pu être lus — à montrer, jamais à taire. */
  unreadable: number;
  /** Vrai tant que le back-office installe encore des experts sur l'instance. */
  installing: boolean;
  /** Vrai quand l'installation dure depuis trop longtemps pour être encore attendue. */
  stalled: boolean;
  /** Vrai quand le back-office dit que l'installation a échoué ; `failedExperts` nomme les experts. */
  failed: boolean;
  failedExperts: string[];
  loading: boolean;
  reload: () => void;
}

/**
 * Les Experts d'une organisation, c'est-à-dire les profils Hermes de ses instances.
 *
 * Partagé : la barre latérale, l'accueil et tout écran qui liste les Experts doivent lire la
 * même chose, au même format. Dupliquer ce `fetch` ferait diverger les écrans au premier
 * enrichissement (photo, métier…).
 */
export function useExperts(workspaceId: string | undefined, initial: InitialExperts | null = null): UseExperts {
  const [experts, setExperts] = useState<Expert[]>(initial?.experts ?? []);
  const [unreadable, setUnreadable] = useState(initial?.unreadable.length ?? 0);
  const [installing, setInstalling] = useState(initial?.installing ?? false);
  const [stalled, setStalled] = useState(false);
  const [failure, setFailure] = useState({ failed: initial?.failed ?? false, experts: initial?.failedExperts ?? [] });
  const since = useRef<number | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [tick, setTick] = useState(0);
  // A reading renewed in the background does not put the screens back to "loading".
  const quiet = useRef(false);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!workspaceId) return;
    // The server already read this workspace's experts with the page: nothing to ask until a reload.
    if (tick === 0 && initial?.workspaceId === workspaceId) return;
    let alive = true;
    if (!quiet.current) setLoading(true);
    quiet.current = false;
    apiFetch<{ experts: Expert[]; unreadable: unknown[]; installing?: boolean; failed?: boolean; failedExperts?: string[] }>(
      `/api/experts?workspace=${workspaceId}`
    )
      .then((d) => {
        if (!alive) return;
        setExperts(d.experts);
        setUnreadable(d.unreadable.length);
        setInstalling(d.installing === true);
        setFailure({ failed: d.failed === true, experts: d.failedExperts ?? [] });
      })
      .catch(() => {
        // L'appelant reste utilisable sans la liste ; l'écran principal remonte l'erreur.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `initial` is what the page was rendered with; it does not change afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, tick]);

  // The experts appear on their own as the installation goes: no page to reload.
  useEffect(() => {
    if (!workspaceId) return;
    if (!installing) {
      since.current = null;
      installOver(workspaceId);
      setStalled(false);
      return;
    }
    since.current ??= installSince(workspaceId);
    if (Date.now() - since.current >= INSTALL_GIVE_UP_MS) {
      setStalled(true);
      return;
    }
    const timer = setTimeout(() => {
      quiet.current = true;
      setTick((t) => t + 1);
    }, INSTALL_POLL_MS);
    return () => clearTimeout(timer);
  }, [installing, tick, workspaceId]);

  // An instance asleep takes seconds to answer its first request. Asking it something light as soon
  // as the app opens gets that wait over with before the user opens a chat or a folder. Once per
  // instance and per page load; the answer is not used.
  useEffect(() => {
    for (const agentId of new Set(experts.map((e) => e.agentId))) {
      if (woken.has(agentId)) continue;
      woken.add(agentId);
      fetch(`/api/agents/${agentId}/chat/models`).catch(() => {});
    }
  }, [experts]);

  return { experts, unreadable, installing, stalled, failed: failure.failed, failedExperts: failure.experts, loading, reload };
}
