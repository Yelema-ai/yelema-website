"use client";

import { createContext, useContext } from "react";

export interface AppContextValue {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaces: { id: string; name: string }[];
  // The workspace's Agent37 instance (all experts live on it); null while it's being set up.
  agentId: string | null;
  profiles: string[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// The workspace instance, for pages that only render once it's ready (the layout guarantees it).
export function useAgentId(): string {
  const { agentId } = useApp();
  if (!agentId) throw new Error("No agent for this workspace yet");
  return agentId;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
