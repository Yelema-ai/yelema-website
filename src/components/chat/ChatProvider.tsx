"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useChatPresence } from "@/components/activity/hooks";
import { apiFetch } from "@/lib/api";
import { cached, cachedFetch, remember } from "@/lib/client-cache";
import { browserPollEnv, startPoll } from "@/lib/poll";
import { sessionsKey } from "@/components/experts/expert-preload";
import { mergeRail, movedUpstream } from "@/lib/chat-rail";
import { profileQuery } from "@/lib/profile-id";
import type { MergedAgent } from "@/lib/types";
import { type ChatSession } from "./types";

interface ChatContextValue {
  agentId: string;
  // The expert this chat talks to: a Hermes profile on the instance, or null for its default home.
  profile: string | null;
  // The workspace's agent list, threaded down so the composer's agent switcher can list them.
  agents: MergedAgent[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  // Whether the Chat tab is the one on screen. The open thread is kept active even off-tab (so its
  // stream survives a tab switch), so consumers gate "is this thread being viewed" UI on this.
  onChatTab: boolean;
  composerFocusToken: number;
  // Ping the composer to refocus its textarea (e.g. after an attachment lands).
  requestComposerFocus: () => void;
  loadingSessions: boolean;
  // Re-read the rail from the instance (button, focus, every 30 s); the last failure, if any.
  reloadSessions: () => void;
  refreshingSessions: boolean;
  sessionsError: string | null;
  // Bumped when the instance reports new activity on the open thread (another channel, a routine).
  threadVersion: number;
  selectSession: (sessionId: string | null) => void;
  startNewChat: () => void;
  // `promote: false` records the rail row without opening the thread — used when a backgrounded
  // run mints its session after the user has already moved on.
  onSessionCreated: (sessionId: string, title: string, opts?: { promote?: boolean }) => void;
  // The conversation pane registers its run-killer here so deleting a thread also stops any turn
  // still streaming on it (locally and upstream).
  registerRunKiller: (fn: (sessionId: string) => void) => () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  // Rename a thread (server-side via PATCH). Optimistic; rolls back + toasts if the build
  // doesn't support titles. Resolves whether it succeeded so callers can react if needed.
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

// Holds the thread rail + the active selection, shared by the sidebar rail and the conversation
// pane, for ONE expert. The rail comes straight from the Agent37 Agents API (GET /v1/sessions?profile=) — there is no local
// sessions table. Each row's label (server-side title, else the first-message preview) is resolved
// by the sessions route, so the rail paints in one fetch with no per-session hydration.
/** Where the rail of one space is published, as it is on screen (new and renamed threads included). */
export const railViewKey = (agentId: string, profile: string | null) => `rail-view:${agentId}:${profile ?? ""}`;

const FRESH_RAIL_MS = 15_000;

export function ChatProvider({
  agentId,
  profile,
  agents,
  urlSessionId,
  onChatTab,
  navigateToSession,
  children,
}: {
  agentId: string;
  profile: string | null;
  agents: MergedAgent[];
  // The open thread's id, taken from the URL (?session=) — null for a new chat. The URL is the
  // source of truth so refresh, Back/Forward, and shared links all reopen the same thread.
  urlSessionId: string | null;
  // Whether the Chat tab is the one on screen. We only adopt the URL's thread while on Chat, so
  // visiting another tab never drops the open thread or cancels its in-flight stream.
  onChatTab: boolean;
  // Writes the chat URL (?session=). Selecting/clearing a thread navigates; activeSessionId follows.
  navigateToSession: (sessionId: string | null, mode?: "push" | "replace") => void;
  children: ReactNode;
}) {
  // Every chat route takes the expert as ?profile=; threads of one expert are invisible to another.
  const q = profileQuery(profile);
  // The rail last read for this expert (or read ahead by the menu, expert-preload): it paints at once.
  const railKey = sessionsKey(agentId, profile);
  const [sessions, setSessions] = useState<ChatSession[]>(() => cached<ChatSession[]>(railKey) ?? []);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(urlSessionId);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const [loadingSessions, setLoadingSessions] = useState(() => cached(railKey) === undefined);

  // Adopt the thread from the URL whenever it changes — a rail click, Back/Forward, or a refresh.
  // Done during render (React's "adjust state when a prop changes" pattern) so there's no extra
  // paint. We always track the URL, but only adopt it into the open thread while the Chat tab is
  // showing, so leaving to another tab keeps the open thread (and its in-flight stream) mounted
  // rather than resetting it.
  const [syncedUrlSessionId, setSyncedUrlSessionId] = useState<string | null>(urlSessionId);
  if (urlSessionId !== syncedUrlSessionId) {
    setSyncedUrlSessionId(urlSessionId);
    if (onChatTab) setActiveSessionId(urlSessionId);
  }

  // Tab switches (handled by the shell) rewrite the path WITHOUT the ?session= query, so on the
  // way back to Chat the open thread lives only in memory. Re-stamp the URL with the open thread
  // when Chat becomes visible again, so a refresh/share from here reopens the same thread.
  useEffect(() => {
    if (onChatTab && activeSessionId && urlSessionId !== activeSessionId) {
      navigateToSession(activeSessionId, "replace");
    }
    // Only react to tab-visibility flips; activeSessionId changes already drive the URL elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChatTab]);

  // The rail follows the instance: first load (retried while it wakes up), then every 30 s while the
  // tab is visible, once on return to it, and on demand. A failed read keeps the rows already shown.
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [threadVersion, setThreadVersion] = useState(0);
  const serverRail = useRef<ChatSession[] | null>(null);
  const openRef = useRef<string | null>(null);
  openRef.current = activeSessionId;
  const loadSeq = useRef(0);

  const reloadSessions = useCallback(
    async (retries = 0, shared = false): Promise<void> => {
      const seq = ++loadSeq.current;
      setRefreshingSessions(true);
      try {
        const read = () => apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions${q}`);
        // On opening, a read the menu has running or has just made is joined instead of repeated.
        const res = shared ? { sessions: await cachedFetch(railKey, () => read().then((r) => r.sessions), FRESH_RAIL_MS) } : await read();
        if (seq !== loadSeq.current) return;
        if (movedUpstream(serverRail.current, res.sessions, openRef.current)) setThreadVersion((v) => v + 1);
        serverRail.current = res.sessions;
        remember(railKey, res.sessions);
        setSessions((prev) => mergeRail(res.sessions, prev));
        setSessionsError(null);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 3_000));
          if (seq === loadSeq.current) return reloadSessions(retries - 1);
          return;
        }
        setSessionsError(e instanceof Error ? e.message : "Liste des conversations indisponible");
      } finally {
        if (seq === loadSeq.current) {
          setRefreshingSessions(false);
          setLoadingSessions(false);
        }
      }
    },
    [agentId, q, railKey]
  );

  useEffect(() => {
    const kept = cached<ChatSession[]>(railKey) ?? null;
    serverRail.current = kept;
    setSessions(kept ?? []);
    setLoadingSessions(kept === null);
    void reloadSessions(3, true);
    // Every 30 s while visible; hidden, nothing, and one reading on the way back.
    const poll = startPoll(() => reloadSessions(), { everyMs: 30_000, immediate: false }, browserPollEnv());
    return () => {
      loadSeq.current += 1;
      poll.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSessions]);

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

  // Point the open thread at a session. While the Chat tab is showing this rides the URL (so
  // Back/Forward and refresh stay in sync); off-tab we set it directly so we don't yank the user's
  // URL back to chat or cancel an in-flight stream they've stepped away from.
  const setOpenThread = useCallback(
    (sessionId: string | null, mode: "push" | "replace" = "push") => {
      if (onChatTab) navigateToSession(sessionId, mode);
      else setActiveSessionId(sessionId);
    },
    [onChatTab, navigateToSession]
  );

  // A brand-new conversation just minted its session id mid-stream. We already have its first
  // message (the label), so add the rail row locally and promote it — no write-back: the session
  // already exists upstream and will reappear from GET /v1/sessions on the next load. A run that
  // finished creating in the background (promote: false) only gets its rail row.
  const onSessionCreated = useCallback(
    (sessionId: string, title: string, opts?: { promote?: boolean }) => {
      // Give the freshly-minted thread its own URL (replace, so Back doesn't return to the blank
      // new-chat URL); off-tab it's adopted silently.
      if (opts?.promote !== false) setOpenThread(sessionId, "replace");
      setSessions((prev) =>
        prev.some((s) => s.session_id === sessionId)
          ? prev
          : [{ session_id: sessionId, title: title.trim().slice(0, 80) || null, last_active: Date.now() }, ...prev]
      );
    },
    [setOpenThread]
  );

  // The conversation pane's run-killer (deleting a thread must also stop any turn still
  // streaming on it). A ref, not state — registration shouldn't re-render the tree.
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
      runKillerRef.current?.(sessionId); // stop any in-flight turn before the thread disappears
      setSessions((s) => s.filter((x) => x.session_id !== sessionId)); // optimistic, functional
      // Deleting the open thread falls back to a new chat (the rail can delete the active thread
      // from any tab, so off-tab this stays silent rather than yanking the user's URL).
      if (wasActive) setOpenThread(null);
      try {
        await apiFetch(`/api/agents/${agentId}/chat/sessions/${sessionId}${q}`, { method: "DELETE" });
      } catch (e) {
        // Functional rollback: re-insert only the removed row (preserving any threads added
        // concurrently) and restore the open thread.
        if (removed) setSessions((s) => (s.some((x) => x.session_id === sessionId) ? s : [removed, ...s]));
        if (wasActive) setOpenThread(sessionId);
        toast.error((e as Error).message || "La conversation n’a pas pu être supprimée.");
      }
    },
    [agentId, q, activeSessionId, sessions, setOpenThread]
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const next = title.trim().slice(0, 200);
      const prev = sessions.find((s) => s.session_id === sessionId)?.title ?? null;
      if (!next || next === prev) return;
      setSessions((s) => s.map((x) => (x.session_id === sessionId ? { ...x, title: next } : x))); // optimistic
      try {
        await apiFetch(`/api/agents/${agentId}/chat/sessions/${sessionId}${q}`, {
          method: "PATCH",
          body: JSON.stringify({ title: next }),
        });
      } catch (e) {
        setSessions((s) => s.map((x) => (x.session_id === sessionId ? { ...x, title: prev } : x))); // rollback
        toast.error((e as Error).message || "La conversation n’a pas pu être renommée.");
      }
    },
    [agentId, q, sessions]
  );

  // Move a thread to the top of the rail, under "Aujourd'hui", on new activity. Upstream ordering
  // (last_active) only refreshes on reload, so keep the most-recently-used thread first meanwhile.
  const bumpSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.session_id === sessionId);
      if (idx < 0) return prev;
      const now = Date.now();
      // Already first and just stamped: nothing to move, and no re-render per streamed token.
      if (idx === 0 && now - prev[0].last_active < 60_000) return prev;
      return [{ ...prev[idx], last_active: now }, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  // A routine run announced by the tracker joins the rail if it is not there yet.
  // What the rail shows, for the other lists of the same space (the menu's company chats).
  useEffect(() => {
    if (!loadingSessions) remember(railViewKey(agentId, profile), sessions);
  }, [agentId, profile, sessions, loadingSessions]);

  const addSession = useCallback((row: ChatSession) => {
    setSessions((prev) => (prev.some((s) => s.session_id === row.session_id) ? prev : [row, ...prev]));
  }, []);
  useChatPresence(agentId, profile, onChatTab ? activeSessionId : null, selectSession, addSession, loadingSessions ? null : sessions);

  const value = useMemo<ChatContextValue>(
    () => ({
      agentId,
      profile,
      agents,
      sessions,
      activeSessionId,
      onChatTab,
      composerFocusToken,
      requestComposerFocus,
      loadingSessions,
      reloadSessions: () => void reloadSessions(),
      refreshingSessions,
      sessionsError,
      threadVersion,
      selectSession,
      startNewChat,
      onSessionCreated,
      registerRunKiller,
      deleteSession,
      renameSession,
      bumpSession,
    }),
    [agentId, profile, agents, sessions, activeSessionId, onChatTab, composerFocusToken, requestComposerFocus, loadingSessions, reloadSessions, refreshingSessions, sessionsError, threadVersion, selectSession, startNewChat, onSessionCreated, registerRunKiller, deleteSession, renameSession, bumpSession]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
