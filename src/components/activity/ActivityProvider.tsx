"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { readNotifyPrefs } from "@/lib/notify-prefs";
import {
  EMPTY_ACTIVITY,
  bindTurn,
  convKey,
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
import { cleanReply, isAccountToTopUp } from "@/lib/chat-errors";
import { driveChanged } from "@/lib/drive-store";
import { instanceEvents } from "@/lib/instance-events";
import { agentTabPath } from "@/lib/expert-tabs";
import { expertDisplayName } from "@/lib/experts";
import type { ChatSession } from "@/components/chat/types";
import { useRoutinePoll } from "./useRoutinePoll";
import { useTurnWatch } from "./useTurnWatch";
import { alertInTab } from "./DeliverableWatcher";
import { responsePath } from "@/lib/api-paths";
import { answerOutcome } from "@/lib/approval";
import { addPending, dropPending, openPending, pendingLine, type PendingApproval } from "@/lib/pending-approvals";
import { systemNotify } from "./system-notify";

const STORAGE_PREFIX = "yelema.activity.";
const GROUP_TOAST = "activity";
const GROUP_MS = 6000;

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
  routineDone: (key: string, routine: string, sessionId: string, at: number, announce: boolean, silent?: boolean) => void;
  /** An expert waits for an agreement. `shown`: the asking place shows its card already (no pop-up). */
  asked: (p: PendingApproval, shown: boolean) => void;
  /** Answered, refused or past its time, wherever it was. */
  settled: (requestId: string) => void;
}

/** The agreements waiting, for the bell: answered from it, wherever the member is (Leslie, 26/11). */
export interface PendingApprovals {
  items: PendingApproval[];
  answer: (p: PendingApproval, choice: "once" | "deny") => Promise<void>;
  open: (p: PendingApproval) => void;
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
const ApprovalsContext = createContext<PendingApprovals>({ items: [], answer: async () => undefined, open: () => undefined });

export const useActivityActions = () => useContext(ActionsContext);
export const useActivityState = () => useContext(StateContext);
export const useNotifications = () => useContext(NotificationsContext);
export const usePendingApprovals = () => useContext(ApprovalsContext);

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const SAVE_AFTER_MS = 1_000;

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
  // Not kept across reloads: past a few minutes the instance has refused by itself.
  const [pending, setPending] = useState<PendingApproval[]>([]);

  // Written once a burst of changes is over (and when the tab hides), only what changed: not on every
  // streamed turn's commit.
  const written = useRef(new Map<string, string>());
  const pendingSave = useRef<{ timer: number; state: ActivityState } | null>(null);
  const save = useCallback(() => {
    const p = pendingSave.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pendingSave.current = null;
    for (const agentId of loadedRef.current) {
      const text = JSON.stringify(persistedFor(p.state, routinesRef.current, agentId));
      if (written.current.get(agentId) === text) continue;
      try {
        localStorage.setItem(STORAGE_PREFIX + agentId, text);
        written.current.set(agentId, text);
      } catch {
        // No storage: the badges last as long as the page.
      }
    }
  }, []);
  const persist = useCallback(
    (s: ActivityState) => {
      if (pendingSave.current) window.clearTimeout(pendingSave.current.timer);
      pendingSave.current = { state: s, timer: window.setTimeout(save, SAVE_AFTER_MS) };
    },
    [save]
  );
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", save);
    };
  }, [save]);

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

  // The pop-ups of answers and routines share one place (Leslie, 28/10, A): a second one turns it into
  // « N nouvelles notifications » with « Tout fermer », instead of a pile to close one by one.
  const grouped = useRef(new Set<string>());
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
      if (n.toast && n.kind === "failed") {
        toast.error(title, { id: n.key, description: body, action: { label: "Ouvrir", onClick: open }, duration: 8000 });
      } else if (n.toast && !grouped.current.has(n.key)) {
        // Counted by key: the same event from the stream and from polling is one notification.
        const reset = () => grouped.current.clear();
        const count = grouped.current.add(n.key).size;
        const ends = { id: GROUP_TOAST, duration: GROUP_MS, onDismiss: reset, onAutoClose: reset };
        if (count === 1) {
          // The expert's face stands in for the icon of a reply or a routine.
          // eslint-disable-next-line @next/next/no-img-element
          const icon = expert?.photoUrl ? <img src={expert.photoUrl} alt="" className="toast-face" /> : undefined;
          toast(title, { ...ends, description: body, icon, action: { label: "Ouvrir", onClick: open } });
        } else {
          toast(`${count} nouvelles notifications`, {
            ...ends,
            description: `Dernière : ${title}`,
            icon: null,
            action: { label: "Tout fermer", onClick: () => toast.dismiss(GROUP_TOAST) },
          });
        }
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
      finish: (id, outcome, raw, source = "local") => {
        // A turn that ended may have written deliverables (unless the stream says so itself).
        const agentId = stateRef.current.turns[id]?.agentId;
        if (agentId && !instanceEvents.heard(agentId, "files.changed")) driveChanged(agentId);
        // A turn that ended waits for nothing any more.
        const responseId = stateRef.current.turns[id]?.responseId;
        if (responseId) setPending((l) => (l.some((p) => p.responseId === responseId) ? l.filter((p) => p.responseId !== responseId) : l));
        const text = cleanReply(raw);
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
      asked: (p, shown) => {
        setPending((l) => addPending(l, p));
        // The card is on screen where it was asked: no pop-up on top of it.
        const here = p.sessionId ? stateRef.current.viewing === convKey(p.agentId, p.profile, p.sessionId) : false;
        if (shown || here) return;
        const expert = expertsRef.current.find((e) => expertKey(e.agentId, e.profileId) === expertKey(p.agentId, p.profile));
        const name = expert?.displayName ?? (p.profile ? expertDisplayName(p.profile) : "Votre Expert");
        // eslint-disable-next-line @next/next/no-img-element
        const icon = expert?.photoUrl ? <img src={expert.photoUrl} alt="" className="toast-face" /> : undefined;
        const open = () => p.sessionId && openConversation(p.agentId, p.profile, p.sessionId);
        toast(`${name} attend votre accord`, { id: `accord-${p.requestId}`, description: pendingLine(p.message), icon, duration: 15000, action: { label: "Voir", onClick: open } });
        if (!visible()) {
          alertInTab(1);
          systemNotify(`${name} attend votre accord`, pendingLine(p.message), `accord-${p.requestId}`, open);
        }
      },
      settled: (requestId) => {
        setPending((l) => dropPending(l, requestId));
        toast.dismiss(`accord-${requestId}`);
      },
      routineDone: (key, routine, sessionId, at, loud, silent = false) => {
        const ref = parseConvKey(key);
        // Nothing to report: a line in the bell, no conversation and no pop-up (Leslie, 28/10: « juste une notif »).
        if (ref && !silent && !instanceEvents.heard(ref.agentId, "files.changed")) driveChanged(ref.agentId);
        if (ref && !silent) presenceRef.current.get(expertKey(ref.agentId, ref.profile))?.addSession({ session_id: sessionId, title: routine, last_active: at, routine });
        const now = Date.now();
        const r = routineFinished(stateRef.current, key, visible(), now, silent);
        commit(r.notice ? remember(r.state, r.notice, "", routine, now, silent) : r.state);
        if (r.notice && loud && !silent) announce(r.notice, "", routine);
      },
    }),
    [announce, commit, load, openConversation]
  );

  // Past their time, they leave the bell on their own.
  useEffect(() => {
    const live = openPending(pending);
    if (live.length !== pending.length) return setPending(live);
    if (!live.length) return;
    const next = Math.min(...live.map((p) => p.expiresAt)) - Date.now() + 50;
    const t = window.setTimeout(() => setPending((l) => openPending(l)), Math.max(0, next));
    return () => window.clearTimeout(t);
  }, [pending]);

  const approvals = useMemo<PendingApprovals>(
    () => ({
      items: openPending(pending),
      answer: async (p, choice) => {
        const res = await fetch(responsePath(p.agentId, p.responseId, "approval"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: p.requestId, choice }),
        }).catch(() => null);
        const outcome = res ? answerOutcome(res.status) : "error";
        if (outcome === "error") {
          toast.error("La réponse n’est pas partie. Réessayez.");
          return;
        }
        actions.settled(p.requestId);
        if (outcome === "expired") toast("Cette demande n’attendait plus : l’Expert n’a rien fait.");
      },
      open: (p) => p.sessionId && openConversation(p.agentId, p.profile, p.sessionId),
    }),
    [pending, actions, openConversation]
  );

  const bell = useMemo<ActivityNotifications>(
    () => ({
      items: notifications(state),
      open: (item) => {
        commit(markRead(stateRef.current, [item.key]));
        // A run with nothing to report is no conversation (Leslie, 29/10): its line has nothing to open.
        if (!item.silent) openConversation(item.agentId, item.profile, item.sessionId);
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
        <NotificationsContext.Provider value={bell}>
          <ApprovalsContext.Provider value={approvals}>{children}</ApprovalsContext.Provider>
        </NotificationsContext.Provider>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
}
