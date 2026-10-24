"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { readNotifyPrefs } from "@/lib/notify-prefs";
import {
  EMPTY_ACTIVITY,
  bindTurn,
  detachTurn,
  dropTurn,
  excerpt,
  expertKey,
  finishTurn,
  markRead,
  notifications,
  parseConvKey,
  pruneUnread,
  parsePersisted,
  persistedFor,
  remember,
  routineDoneTitle,
  routineFinished,
  startTurn,
  view,
  type ActivityState,
  type Notice,
  type NotificationItem,
  type Outcome,
  type Turn,
} from "@/lib/activity";
import { isAccountToTopUp } from "@/lib/chat-errors";
import { agentTabPath } from "@/lib/expert-tabs";
import { expertDisplayName } from "@/lib/experts";
import type { ChatSession } from "@/components/chat/types";
import { useRoutinePoll } from "./useRoutinePoll";
import { useTurnWatch } from "./useTurnWatch";
import { systemNotify } from "./system-notify";

const STORAGE_PREFIX = "yelema.activity.";

export interface ChatPresence {
  open: (sessionId: string) => void;
  addSession: (row: ChatSession) => void;
}

export interface ActivityActions {
  start: (turn: Omit<Turn, "mode" | "startedAt">) => void;
  bind: (id: string, sessionId: string | null, responseId: string | null) => void;
  finish: (id: string, outcome: Outcome, text: string, source?: Turn["mode"]) => void;
  detach: (id: string) => void;
  drop: (id: string) => void;
  view: (key: string | null, previous?: string | null) => void;
  prune: (agentId: string, profile: string | null, sessionIds: string[]) => void;
  /** The chat of one expert, while it is mounted: how to open one of its threads, add a rail row. */
  present: (agentId: string, profile: string | null, presence: ChatPresence) => () => void;
  routineDone: (key: string, routine: string, sessionId: string, at: number, announce: boolean) => void;
}

/** The notification centre (the bell): what the provider already knows, newest first. */
export interface ActivityNotifications {
  items: NotificationItem[];
  /** Opens the conversation (a routine run is one) and reads it. */
  open: (item: NotificationItem) => void;
  markAllRead: () => void;
  /** Reads these conversations only (« Tout marquer comme lu » of one expert's list). */
  markRead: (keys: string[]) => void;
}

const ActionsContext = createContext<ActivityActions | null>(null);
const StateContext = createContext<ActivityState>(EMPTY_ACTIVITY);
const NotificationsContext = createContext<ActivityNotifications>({ items: [], open: () => undefined, markAllRead: () => undefined, markRead: () => undefined });

export const useActivityActions = () => useContext(ActionsContext);
export const useActivityState = () => useContext(StateContext);
export const useNotifications = () => useContext(NotificationsContext);

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

function readStorage(agentId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + agentId);
  } catch {
    return null;
  }
}

// Turns in flight and unread conversations for the whole shell: survives moving between threads and
// experts, announces what ends out of sight (toast, system notification when the tab is hidden).
export function ActivityProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { experts } = useExpertsContext();
  const [state, setState] = useState<ActivityState>(EMPTY_ACTIVITY);
  const stateRef = useRef(state);
  const routinesRef = useRef<Record<string, number>>({});
  const loadedRef = useRef(new Set<string>());
  const presenceRef = useRef(new Map<string, ChatPresence>());
  const expertsRef = useRef(experts);
  expertsRef.current = experts;

  const persist = useCallback((s: ActivityState) => {
    for (const agentId of loadedRef.current) {
      try {
        localStorage.setItem(STORAGE_PREFIX + agentId, JSON.stringify(persistedFor(s, routinesRef.current, agentId)));
      } catch {
        // No storage: the badges last as long as the page.
      }
    }
  }, []);

  const commit = useCallback(
    (next: ActivityState) => {
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
      persist(next);
    },
    [persist]
  );

  // An instance's saved badges, routine marks and unresolved turns, merged in once.
  const load = useCallback(
    (agentId: string) => {
      if (loadedRef.current.has(agentId)) return;
      loadedRef.current.add(agentId);
      const saved = parsePersisted(readStorage(agentId), agentId, Date.now());
      routinesRef.current = { ...saved.routines, ...routinesRef.current };
      let s = stateRef.current;
      s = { ...s, unread: { ...saved.unread, ...s.unread }, notes: { ...saved.notes, ...s.notes } };
      for (const t of saved.watching) if (!s.turns[t.id]) s = startTurn(s, t);
      commit(s);
    },
    [commit]
  );

  useEffect(() => {
    for (const e of experts) load(e.agentId);
  }, [experts, load]);

  const openConversation = useCallback(
    (agentId: string, profile: string | null, sessionId: string) => {
      const here = presenceRef.current.get(expertKey(agentId, profile));
      if (here) here.open(sessionId);
      else router.push(`${agentTabPath(agentId, "chat", profile)}?session=${encodeURIComponent(sessionId)}`);
    },
    [router]
  );

  const announce = useCallback(
    (n: Notice, text: string, routine?: string) => {
      const expert = expertsRef.current.find((e) => expertKey(e.agentId, e.profileId) === expertKey(n.agentId, n.profile));
      const name = expert?.displayName ?? (n.profile ? expertDisplayName(n.profile) : "Votre Expert");
      const title =
        n.kind === "routine" ? `${routineDoneTitle(routine)} (${name})` : n.kind === "failed"
            ? isAccountToTopUp(text)
              ? "Votre compte d’IA est à recharger"
              : `${name} : la réponse a échoué`
            : `${name} a répondu`;
      const body = n.kind === "reply" || isAccountToTopUp(text) ? excerpt(text) || undefined : undefined;
      const open = () => openConversation(n.agentId, n.profile, n.sessionId);
      // A kind the user switched off in Paramètres stays in the bell but no longer pops up.
      if (!readNotifyPrefs()[n.kind]) return;
      if (n.toast) {
        const show = n.kind === "failed" ? toast.error : toast;
        // The expert's face stands in for the icon of a reply or a routine; a failure keeps the error mark.
        // eslint-disable-next-line @next/next/no-img-element
        const icon = n.kind !== "failed" && expert?.photoUrl ? <img src={expert.photoUrl} alt="" className="toast-face" /> : undefined;
        show(title, { id: n.key, description: body, icon, action: { label: "Ouvrir", onClick: open }, duration: 8000 });
      }
      if (n.system) systemNotify(title, body, n.key, open);
    },
    [openConversation]
  );

  const actions = useMemo<ActivityActions>(
    () => ({
      start: (t) => {
        load(t.agentId);
        commit(startTurn(stateRef.current, { ...t, startedAt: Date.now(), mode: "local" }));
      },
      bind: (id, sessionId, responseId) => commit(bindTurn(stateRef.current, id, sessionId, responseId)),
      finish: (id, outcome, text, source = "local") => {
        const now = Date.now();
        const r = finishTurn(stateRef.current, id, outcome, source, visible(), now);
        commit(r.notice ? remember(r.state, r.notice, text, null, now) : r.state);
        if (r.notice) announce(r.notice, text);
      },
      detach: (id) => commit(detachTurn(stateRef.current, id)),
      drop: (id) => commit(dropTurn(stateRef.current, id)),
      view: (key, previous) => {
        // An unmounting chat clears the view only if a newer one has not claimed it already.
        if (key === null && previous !== undefined && stateRef.current.viewing !== previous) return;
        commit(view(stateRef.current, key));
      },
      prune: (agentId, profile, sessionIds) => commit(pruneUnread(stateRef.current, agentId, profile, sessionIds)),
      present: (agentId, profile, presence) => {
        const k = expertKey(agentId, profile);
        presenceRef.current.set(k, presence);
        return () => {
          if (presenceRef.current.get(k) === presence) presenceRef.current.delete(k);
        };
      },
      routineDone: (key, routine, sessionId, at, loud) => {
        const ref = parseConvKey(key);
        if (ref) presenceRef.current.get(expertKey(ref.agentId, ref.profile))?.addSession({ session_id: sessionId, title: routine, last_active: at, routine });
        const now = Date.now();
        const r = routineFinished(stateRef.current, key, visible(), now);
        commit(r.notice ? remember(r.state, r.notice, "", routine, now) : r.state);
        if (r.notice && loud) announce(r.notice, "", routine);
      },
    }),
    [announce, commit, load]
  );

  const bell = useMemo<ActivityNotifications>(
    () => ({
      items: notifications(state),
      open: (item) => {
        commit(markRead(stateRef.current, [item.key]));
        openConversation(item.agentId, item.profile, item.sessionId);
      },
      markAllRead: () => commit(markRead(stateRef.current, null)),
      markRead: (keys) => commit(markRead(stateRef.current, keys)),
    }),
    [state, commit, openConversation]
  );

  useTurnWatch(state.turns, actions);
  useRoutinePoll(experts, routinesRef, load, actions, persist, stateRef);

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        <NotificationsContext.Provider value={bell}>{children}</NotificationsContext.Provider>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
}
