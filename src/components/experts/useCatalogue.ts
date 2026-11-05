"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, cachedFetch } from "@/lib/client-cache";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { CatalogueExpertDetail, CatalogueResponse } from "@/lib/types";

const EMPTY: CatalogueResponse = { available: false, defaultExpertKey: null, categories: [], experts: [] };
// The catalogue changes with a release, what is installed with an installation: one reading shared
// by every screen of the page, renewed past this age.
const CATALOGUE_TTL_MS = 5 * 60_000;

export const catalogueKey = (userEmail: string, workspaceId: string) => `catalogue:${userEmail}:${workspaceId}`;

/**
 * Le catalogue du back-office, croisé avec ce qui est installé pour l'utilisateur. Un écran rouvert
 * montre tout de suite la dernière lecture, puis la remplace par la nouvelle.
 */
export function useCatalogue(workspaceId: string | undefined): { catalogue: CatalogueResponse; loading: boolean } {
  const { userEmail } = useWorkspace();
  const key = workspaceId ? catalogueKey(userEmail, workspaceId) : null;
  const [catalogue, setCatalogue] = useState<CatalogueResponse>(() => (key && cached<CatalogueResponse>(key)) || EMPTY);
  const [loading, setLoading] = useState(() => !key || !cached(key));

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const known = cached<CatalogueResponse>(key);
    if (known) setCatalogue(known);
    setLoading(!known);
    cachedFetch(key, () => apiFetch<CatalogueResponse>(`/api/catalogue?workspace=${workspaceId}`), CATALOGUE_TTL_MS)
      .then((d) => {
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
    // Joins the expert page's grouped read (expert-preload) when one is under way.
    cachedFetch(`fiche:${key}`, () => apiFetch<{ expert: CatalogueExpertDetail }>(`/api/catalogue/${encodeURIComponent(key)}`).then((d) => d.expert))
      .then((d) => {
        if (alive) setExpert(d);
      })
      .catch(() => alive && setExpert(false));
    return () => {
      alive = false;
    };
  }, [key]);

  return expert;
}
