"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { CatalogueExpertDetail, CatalogueResponse } from "@/lib/types";

const EMPTY: CatalogueResponse = { available: false, defaultExpertKey: null, categories: [], experts: [] };

/**
 * Le catalogue du back-office, croisé avec ce qui est installé pour l'utilisateur. Un écran rouvert
 * montre tout de suite la dernière lecture, puis la remplace par la nouvelle.
 */
export function useCatalogue(workspaceId: string | undefined): { catalogue: CatalogueResponse; loading: boolean } {
  const { userEmail } = useWorkspace();
  const key = workspaceId ? `catalogue:${userEmail}:${workspaceId}` : null;
  const [catalogue, setCatalogue] = useState<CatalogueResponse>(() => (key && cached<CatalogueResponse>(key)) || EMPTY);
  const [loading, setLoading] = useState(() => !key || !cached(key));

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const known = cached<CatalogueResponse>(key);
    if (known) setCatalogue(known);
    setLoading(!known);
    apiFetch<CatalogueResponse>(`/api/catalogue?workspace=${workspaceId}`)
      .then((d) => {
        remember(key, d);
        if (alive) setCatalogue(d);
      })
      .catch(() => {
        // Sans catalogue l'écran reste utilisable : il le dit au lieu d'échouer.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, workspaceId]);

  return { catalogue, loading };
}

/** La fiche complète d'un expert. `null` tant qu'elle charge, `false` si elle n'existe pas. */
export function useCatalogueExpert(key: string | null | undefined): CatalogueExpertDetail | null | false {
  const [expert, setExpert] = useState<CatalogueExpertDetail | null | false>(
    () => (key && cached<CatalogueExpertDetail>(`fiche:${key}`)) || null
  );

  useEffect(() => {
    if (!key) {
      setExpert(false);
      return;
    }
    let alive = true;
    // The same for every user, and it changes with a catalogue release: read once per page load.
    const known = cached<CatalogueExpertDetail>(`fiche:${key}`);
    setExpert(known ?? null);
    if (known) return;
    apiFetch<{ expert: CatalogueExpertDetail }>(`/api/catalogue/${encodeURIComponent(key)}`)
      .then((d) => {
        remember(`fiche:${key}`, d.expert);
        if (alive) setExpert(d.expert);
      })
      .catch(() => alive && setExpert(false));
    return () => {
      alive = false;
    };
  }, [key]);

  return expert;
}
