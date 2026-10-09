"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Expert } from "@/lib/types";

/** Les Experts lus par le serveur avec la page, pour l'organisation indiquée. */
export interface InitialExperts {
  workspaceId: string;
  experts: Expert[];
  unreadable: unknown[];
}

const woken = new Set<string>();

export interface UseExperts {
  experts: Expert[];
  /** Instances dont les profils n'ont pas pu être lus — à montrer, jamais à taire. */
  unreadable: number;
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
  const [loading, setLoading] = useState(!initial);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!workspaceId) return;
    // The server already read this workspace's experts with the page: nothing to ask until a reload.
    if (tick === 0 && initial?.workspaceId === workspaceId) return;
    let alive = true;
    setLoading(true);
    apiFetch<{ experts: Expert[]; unreadable: unknown[] }>(`/api/experts?workspace=${workspaceId}`)
      .then((d) => {
        if (!alive) return;
        setExperts(d.experts);
        setUnreadable(d.unreadable.length);
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

  return { experts, unreadable, loading, reload };
}
