"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useExperts, type UseExperts } from "@/components/experts/useExperts";

const ExpertsContext = createContext<UseExperts | null>(null);

/**
 * Les Experts de l'utilisateur, lus UNE fois pour tout le cadre : le menu, l'accueil et l'espace
 * d'un expert lisent la même liste. Lire les profils d'une instance peut coûter un `exec` ; le
 * faire une fois par écran, pas une fois par composant.
 */
export function ExpertsProvider({ children }: { children: ReactNode }) {
  const { current } = useWorkspace();
  const value = useExperts(current?.id);
  return <ExpertsContext.Provider value={value}>{children}</ExpertsContext.Provider>;
}

export function useExpertsContext(): UseExperts {
  const ctx = useContext(ExpertsContext);
  if (!ctx) throw new Error("useExpertsContext must be used within an ExpertsProvider");
  return ctx;
}
