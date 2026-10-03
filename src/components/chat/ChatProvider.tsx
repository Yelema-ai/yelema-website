"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { type ChatSession } from "./types";

interface ChatContextValue {
  agentId: string;
  // The Hermes profile: an expert's key, or "default" for the business chat.
  profile: string;
  sessions: ChatSession[];
  activeSessionId: string | null;
  composerFocusToken: number;
  // Ping the composer to refocus its textarea (e.g. after an attachment lands).
  requestComposerFocus: () => void;
  loadingSessions: boolean;
  selectSession: (sessionId: string | null) => void;
  startNewChat: () => void;
  // `promote: false` records the rail row without opening the thread — used when a backgrounded
  // run mints its session after the user has already moved on.
  onSessionCreated: (sessionId: string, title: string, opts?: { promote?: boolean }) => void;
  // The conversation pane registers its run-killer here so deleting a thread also stops any turn
  // still streaming on it (locally and upstream).
  registerRunKiller: (fn: (sessionId: string) => void) => () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  // Move a thread to the top of the rail on new activity (most-recently-used first).
  bumpSession: (sessionId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within a ChatProvider");
  return ctx;
}

// The open thread rides the URL as ?session=, written with history.pushState (Next's
// useSearchParams follows it), so refresh, Back/Forward and shared links reopen the same thread.
export function useSessionUrl(): [string | null, (sessionId: string | null, mode?: "push" | "replace") => void] {
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSessionId(new URLSearchParams(window.location.search).get("session"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const navigate = useCallback((id: string | null, mode: "push" | "replace" = "push") => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("session", id);
    else url.searchParams.delete("session");
    if (mode === "replace") window.history.replaceState(window.history.state, "", url);
    else window.history.pushState(window.history.state, "", url);
    setSessionId(id);
  }, []);
  return [sessionId, navigate];
}

// Holds one profile's thread rail + the open thread, shared by the rail and the conversation pane.
// The rail comes straight from the Agent37 Agents API (GET /v1/sessions?profile=); there is no
// local sessions table.
export function ChatProvider({
  agentId,
  profile,
  urlSessionId,
  navigateToSession,
  children,
}: {
  agentId: string;
  profile: string;
  urlSessionId: string | null;
  navigateToSession: (sessionId: string | null, mode?: "push" | "replace") => void;
  children: ReactNode;
}) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const activeSessionId = urlSessionId;
  const q = `?profile=${encodeURIComponent(profile)}`;

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions${q}`)
      .then((res) => {
        // A conversation started before this list arrived (the home page's message) is not in it
        // yet: Hermes stores a session when its first turn ends. Keep such local rows on top.
        if (!cancelled)
          setSessions((prev) => [...prev.filter((p) => !res.sessions.some((s) => s.session_id === p.session_id)), ...res.sessions]);
      })
      .catch((e) => {
        if (!cancelled) toast.error((e as Error).message || "Impossible de charger les conversations.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, q]);

  const requestComposerFocus = useCallback(() => setComposerFocusToken((n) => n + 1), []);

  const selectSession = useCallback(
    (sessionId: string | null) => {
      navigateToSession(sessionId);
      requestComposerFocus();
    },
    [navigateToSession, requestComposerFocus]
  );

  const startNewChat = useCallback(() => {
    navigateToSession(null);
    requestComposerFocus();
  }, [navigateToSession, requestComposerFocus]);

  // A brand-new conversation just minted its session id mid-stream: add its rail row locally (it
  // reappears from GET /v1/sessions on the next load) and give it its own URL.
  const onSessionCreated = useCallback(
    (sessionId: string, title: string, opts?: { promote?: boolean }) => {
      if (opts?.promote !== false) navigateToSession(sessionId, "replace");
      setSessions((prev) =>
        prev.some((s) => s.session_id === sessionId)
          ? prev
          : [{ session_id: sessionId, title: title.trim().slice(0, 80) || null, last_active: Date.now() }, ...prev]
      );
    },
    [navigateToSession]
  );

  const runKillerRef = useRef<((sessionId: string) => void) | null>(null);
  const registerRunKiller = useCallback((fn: (sessionId: string) => void) => {
    runKillerRef.current = fn;
    return () => {
      if (runKillerRef.current === fn) runKillerRef.current = null;
    };
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const removed = sessions.find((x) => x.session_id === sessionId);
      const wasActive = activeSessionId === sessionId;
      runKillerRef.current?.(sessionId);
      setSessions((s) => s.filter((x) => x.session_id !== sessionId));
      if (wasActive) navigateToSession(null);
      try {
        await apiFetch(`/api/agents/${agentId}/chat/sessions/${sessionId}${q}`, { method: "DELETE" });
      } catch (e) {
        if (removed) setSessions((s) => (s.some((x) => x.session_id === sessionId) ? s : [removed, ...s]));
        if (wasActive) navigateToSession(sessionId);
        toast.error((e as Error).message || "Impossible de supprimer cette conversation.");
      }
    },
    [agentId, q, activeSessionId, sessions, navigateToSession]
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const next = title.trim().slice(0, 200);
      const prev = sessions.find((s) => s.session_id === sessionId)?.title ?? null;
      if (!next || next === prev) return;
      setSessions((s) => s.map((x) => (x.session_id === sessionId ? { ...x, title: next } : x)));
      try {
        await apiFetch(`/api/agents/${agentId}/chat/sessions/${sessionId}${q}`, {
          method: "PATCH",
          body: JSON.stringify({ title: next }),
        });
      } catch (e) {
        setSessions((s) => s.map((x) => (x.session_id === sessionId ? { ...x, title: prev } : x)));
        toast.error((e as Error).message || "Impossible de renommer cette conversation.");
      }
    },
    [agentId, q, sessions]
  );

  const bumpSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.session_id === sessionId);
      if (idx < 0) return prev;
      const row = { ...prev[idx], last_active: Date.now() };
      return [row, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      agentId,
      profile,
      sessions,
      activeSessionId,
      composerFocusToken,
      requestComposerFocus,
      loadingSessions,
      selectSession,
      startNewChat,
      onSessionCreated,
      registerRunKiller,
      deleteSession,
      renameSession,
      bumpSession,
    }),
    [agentId, profile, sessions, activeSessionId, composerFocusToken, requestComposerFocus, loadingSessions, selectSession, startNewChat, onSessionCreated, registerRunKiller, deleteSession, renameSession, bumpSession]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
