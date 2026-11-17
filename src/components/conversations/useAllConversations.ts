"use client";

import { cached, remember, whenKept } from "@/lib/client-cache";
import { useEffect, useMemo, useState } from "react";
import { useHydrated } from "@/components/useHydrated";
import { useServerReading, type ServerReading } from "@/components/useServerReading";
import { driveTree } from "@/lib/drive-store";
import { sessionsStore } from "@/lib/sessions-client";
import { isDriveClutter } from "@/lib/drive-order";
import { agentTabPath } from "@/lib/expert-tabs";
import type { ChatSession } from "@/components/chat/types";
import type { FileEntry } from "@/components/files/types";
import type { Expert } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { toMs } from "@/lib/activity";
import { spaceKey } from "@/lib/first-screen";

/** The member's own instance: with no Expert chosen, it is their chat d'entreprise. */
export function useOwnAgentId(): string | null {
  const { current } = useWorkspace();
  const { agents } = useMyAgents(current?.id);
  const { experts } = useExpertsContext();
  return agents[0]?.agent37_id ?? experts[0]?.agentId ?? null;
}

/** One conversation, wherever it lives: the chat d'entreprise (`expert` null) or an Expert's space. */
export interface ConversationRow {
  session: ChatSession;
  expert: Expert | null;
  href: string;
  /** last_active in milliseconds (Hermes reports seconds or milliseconds). */
  at: number;
}


type Space = { agentId: string; expert: Expert | null };
const spacesOf = (ownAgentId: string, experts: Expert[]): Space[] => [{ agentId: ownAgentId, expert: null }, ...experts.map((e) => ({ agentId: e.agentId, expert: e }))];
const rowsOf = ({ agentId, expert }: Space, sessions: ChatSession[]): ConversationRow[] =>
  sessions.map((session) => ({
    session,
    expert,
    at: toMs(session.last_active),
    href: `${agentTabPath(agentId, "chat", expert?.profileId)}?session=${encodeURIComponent(session.session_id)}`,
  }));
const newestFirst = (all: ConversationRow[][]) => all.flat().sort((a, b) => b.at - a.at);

// Every conversation of the member: the chat d'entreprise's (the instance with no profile) and each
// Expert's, newest first, from the tab's sessions store: one grouped call per instance, none when the
// page's server reading (`initial`, by spaceKey) is there, and read again when the stream says so.
export function useAllConversations(ownAgentId: string | null, experts: Expert[], enabled = true, reading: ServerReading<Record<string, ChatSession[]>> = null) {
  const { value: initial, settled } = useServerReading(reading);
  const key = experts.map((e) => `${e.agentId}:${e.profileId}`).join(",");
  const store = ownAgentId ? `conversations:${ownAgentId}:${key}` : null;
  const [rows, setRows] = useState<ConversationRow[] | null>(() => (store && cached<ConversationRow[]>(store)) || null);
  const hydrated = useHydrated();
  const seed = useMemo(
    () => (initial && ownAgentId ? newestFirst(spacesOf(ownAgentId, experts).map((s) => rowsOf(s, initial[spaceKey(s.agentId, s.expert?.profileId ?? null)] ?? []))) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, ownAgentId, key]
  );

  useEffect(() => {
    if (!enabled || !ownAgentId) return;
    let live = true;
    // The page's server reading still streaming in: the list this device last showed paints, nothing is read twice.
    if (!settled) {
      const off = store ? whenKept<ConversationRow[]>(store, (v) => live && setRows((r) => r ?? v)) : () => undefined;
      return () => {
        live = false;
        off();
      };
    }
    const spaces = spacesOf(ownAgentId, experts);
    // What the server read with the page is the store's first reading: no second read of the same.
    for (const s of spaces) {
      const got = initial?.[spaceKey(s.agentId, s.expert?.profileId ?? null)];
      if (got && (!sessionsStore.get(s.agentId, s.expert?.profileId ?? null) || sessionsStore.fromDevice(s.agentId, s.expert?.profileId ?? null))) sessionsStore.put(s.agentId, s.expert?.profileId ?? null, { sessions: got, runs: null });
    }
    const build = () =>
      Promise.all(spaces.map((space) => sessionsStore.read(space.agentId, space.expert?.profileId ?? null).then((d) => rowsOf(space, d.sessions), () => [] as ConversationRow[]))).then((all) => {
        const sorted = newestFirst(all);
        if (store) remember(store, sorted);
        if (live) setRows(sorted);
      });
    // Nothing read with the page: the list this device last showed paints while the reads go out.
    const offKept = store && !seed ? whenKept<ConversationRow[]>(store, (v) => live && setRows((r) => r ?? v)) : () => undefined;
    void build();
    // A space read again (an event, another view): the list follows, rebuilt once per burst.
    let queued = false;
    const again = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        if (live) void build();
      }, 0);
    };
    const offs = spaces.map((s) => sessionsStore.subscribe(s.agentId, s.expert?.profileId ?? null, again));
    return () => {
      live = false;
      offKept();
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAgentId, key, enabled, settled]);

  return rows ?? (hydrated ? seed : null);
}

// The drive's files, at its root and one level down (each Expert keeps its own folder there),
// newest first. Null while reading. The tree is the one the deliverable watcher reads.
export function useDriveFiles(agentId: string | null, enabled = true) {
  // The drive as last read in this tab shows at once; the fresh listing replaces it behind.
  const key = agentId ? `drive-files:${agentId}` : null;
  const [files, setFiles] = useState<FileEntry[] | null>(() => (key && cached<FileEntry[]>(key)) || null);
  useEffect(() => {
    if (!enabled || !agentId) return;
    let live = true;
    const offKept = whenKept<FileEntry[]>(`drive-files:${agentId}`, (v) => live && setFiles((f) => f ?? v));
    driveTree(agentId).then(
      (tree) => {
        const all = tree.entries.filter((e) => e.depth <= 1 && e.type === "file" && !e.hidden && !isDriveClutter(e));
        all.sort((a, b) => b.modified - a.modified);
        remember(`drive-files:${agentId}`, all);
        if (live) setFiles(all);
      },
      () => live && setFiles([])
    );
    return () => {
      live = false;
      offKept();
    };
  }, [agentId, enabled]);
  return files;
}

/** Lower case, accents dropped: « réunion » matches « reunion ». */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
