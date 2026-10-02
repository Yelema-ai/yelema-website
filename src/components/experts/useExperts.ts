"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Expert } from "@/lib/types";

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
export function useExperts(workspaceId: string | undefined): UseExperts {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!workspaceId) return;
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
  }, [workspaceId, tick]);

  return { experts, unreadable, loading, reload };
}
