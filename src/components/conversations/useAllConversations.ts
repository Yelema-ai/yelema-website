"use client";

import { cached, cachedFetch, remember } from "@/lib/client-cache";
import { sessionsKey } from "@/components/experts/expert-preload";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { profileQuery } from "@/lib/profile-id";
import { driveTree } from "@/lib/drive-store";
import { isDriveClutter } from "@/lib/drive-order";
import { agentTabPath } from "@/lib/expert-tabs";
import type { ChatSession } from "@/components/chat/types";
import type { FileEntry } from "@/components/files/types";
import type { Expert } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { toMs } from "@/lib/activity";

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


// Every conversation of the member: the chat d'entreprise's (the instance with no profile) and each
// Expert's, newest first. One read per space, in parallel; a space that does not answer is left out.
// The list as last read in this tab shows at once (Leslie, 27/10: the search was slow to show them);
// the fresh reading replaces it behind.
export function useAllConversations(ownAgentId: string | null, experts: Expert[], enabled = true) {
  const key = experts.map((e) => `${e.agentId}:${e.profileId}`).join(",");
  const store = ownAgentId ? `conversations:${ownAgentId}:${key}` : null;
  const [rows, setRows] = useState<ConversationRow[] | null>(() => (store && cached<ConversationRow[]>(store)) || null);

  useEffect(() => {
    if (!enabled || !ownAgentId) return;
    let live = true;
    const spaces: { agentId: string; expert: Expert | null }[] = [
      { agentId: ownAgentId, expert: null },
      ...experts.map((e) => ({ agentId: e.agentId, expert: e })),
    ];
    void Promise.all(
      spaces.map(({ agentId, expert }) =>
        // Shared with each space's own rail and the menu's read-ahead: read at most every 30 s.
        cachedFetch(sessionsKey(agentId, expert?.profileId ?? null), () => apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions${profileQuery(expert?.profileId)}`).then((r) => r.sessions), 30_000).then(
          (sessions) =>
            sessions.map((session) => ({
              session,
              expert,
              at: toMs(session.last_active),
              href: `${agentTabPath(agentId, "chat", expert?.profileId)}?session=${encodeURIComponent(session.session_id)}`,
            })),
          () => [] as ConversationRow[]
        )
      )
    ).then((all) => {
      const sorted = all.flat().sort((a, b) => b.at - a.at);
      if (store) remember(store, sorted);
      if (live) setRows(sorted);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAgentId, key, enabled]);

  return rows;
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
    };
  }, [agentId, enabled]);
  return files;
}

/** Lower case, accents dropped: « réunion » matches « reunion ». */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
