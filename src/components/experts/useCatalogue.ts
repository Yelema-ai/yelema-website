"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CatalogueExpertDetail, CatalogueResponse } from "@/lib/types";

const EMPTY: CatalogueResponse = { available: false, defaultExpertKey: null, categories: [], experts: [] };

/** Le catalogue du back-office, croisé avec ce qui est installé pour l'utilisateur. */
export function useCatalogue(workspaceId: string | undefined): { catalogue: CatalogueResponse; loading: boolean } {
  const [catalogue, setCatalogue] = useState<CatalogueResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    setLoading(true);
    apiFetch<CatalogueResponse>(`/api/catalogue?workspace=${workspaceId}`)
      .then((d) => alive && setCatalogue(d))
      .catch(() => {
        // Sans catalogue l'écran reste utilisable : il le dit au lieu d'échouer.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  return { catalogue, loading };
}

/** La fiche complète d'un expert. `null` tant qu'elle charge, `false` si elle n'existe pas. */
export function useCatalogueExpert(key: string | null | undefined): CatalogueExpertDetail | null | false {
  const [expert, setExpert] = useState<CatalogueExpertDetail | null | false>(null);

  useEffect(() => {
    if (!key) {
      setExpert(false);
      return;
    }
    let alive = true;
    setExpert(null);
    apiFetch<{ expert: CatalogueExpertDetail }>(`/api/catalogue/${encodeURIComponent(key)}`)
      .then((d) => alive && setExpert(d.expert))
      .catch(() => alive && setExpert(false));
    return () => {
      alive = false;
    };
  }, [key]);

  return expert;
}
