"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceWithRole } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { resetBootstrap } from "@/lib/bootstrap-client";
import { confirmDevice } from "@/lib/device-cache-client";

const STORAGE_KEY = "agent37wl_workspace";

interface WorkspaceContextValue {
  workspaces: WorkspaceWithRole[];
  current: WorkspaceWithRole | null;
  setCurrentId: (id: string) => void;
  refresh: () => Promise<WorkspaceWithRole[]>;
  userEmail: string;
  /** The user's name as the back office knows it; null when it has none. */
  userName: string | null;
  userFirstName: string | null;
  /** The user's own photo, null for the initial; changed at once from « Mon profil ». */
  userAvatarUrl: string | null;
  setUserAvatarUrl: (url: string | null) => void;
  /** Called by « Entreprise » when the main logo changes, so the menu follows at once. */
  setCurrentLogoUrl: (url: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  initialWorkspaces,
  userEmail,
  userName,
  userFirstName,
  userAvatarUrl: initialAvatarUrl = null,
  children,
}: {
  initialWorkspaces: WorkspaceWithRole[];
  userEmail: string;
  userName: string | null;
  userFirstName: string | null;
  userAvatarUrl?: string | null;
  children: React.ReactNode;
}) {
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>(initialWorkspaces);
  const [currentId, setCurrentIdState] = useState<string | null>(initialWorkspaces[0]?.id ?? null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && workspaces.some((w) => w.id === stored)) {
      setCurrentIdState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The device's copy of this account and space fills the stores before the screens' first reads
  // (layout effects run before them). Not while the stored space is about to replace the first one.
  const confirmedId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!currentId) return;
    if (!confirmedId.current) {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {}
      if (stored && stored !== currentId && workspaces.some((w) => w.id === stored)) return;
    }
    if (confirmedId.current && confirmedId.current !== currentId) resetBootstrap();
    confirmedId.current = currentId;
    confirmDevice(userEmail, currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, currentId]);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    const { workspaces: ws } = await apiFetch<{ workspaces: WorkspaceWithRole[] }>("/api/workspaces");
    setWorkspaces(ws);
    setCurrentIdState((prev) => (prev && ws.some((w) => w.id === prev) ? prev : ws[0]?.id ?? null));
    return ws;
  }, []);

  const setCurrentLogoUrl = useCallback(
    (url: string | null) =>
      setWorkspaces((ws) => ws.map((w) => (w.id === currentId && w.logo_url !== url ? { ...w, logo_url: url } : w))),
    [currentId]
  );

  const current = useMemo(
    () => workspaces.find((w) => w.id === currentId) ?? null,
    [workspaces, currentId]
  );

  return (
    <WorkspaceContext.Provider value={{ workspaces, current, setCurrentId, refresh, userEmail, userName, userFirstName, userAvatarUrl, setUserAvatarUrl, setCurrentLogoUrl }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
