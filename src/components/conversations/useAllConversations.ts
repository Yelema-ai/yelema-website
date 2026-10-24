"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { profileQuery } from "@/lib/profile-id";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import { agentTabPath } from "@/lib/expert-tabs";
import type { ChatSession } from "@/components/chat/types";
import { isDir, type FileEntry, type FileListResponse } from "@/components/files/types";
import type { Expert } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";

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

const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

// Every conversation of the member: the chat d'entreprise's (the instance with no profile) and each
// Expert's, newest first. One read per space, in parallel; a space that does not answer is left out.
export function useAllConversations(ownAgentId: string | null, experts: Expert[], enabled = true) {
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const key = experts.map((e) => `${e.agentId}:${e.profileId}`).join(",");

  useEffect(() => {
    if (!enabled || !ownAgentId) return;
    let live = true;
    const spaces: { agentId: string; expert: Expert | null }[] = [
      { agentId: ownAgentId, expert: null },
      ...experts.map((e) => ({ agentId: e.agentId, expert: e })),
    ];
    void Promise.all(
      spaces.map(({ agentId, expert }) =>
        apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions${profileQuery(expert?.profileId)}`).then(
          (r) =>
            r.sessions.map((session) => ({
              session,
              expert,
              at: ms(session.last_active),
              href: `${agentTabPath(agentId, "chat", expert?.profileId)}?session=${encodeURIComponent(session.session_id)}`,
            })),
          () => [] as ConversationRow[]
        )
      )
    ).then((all) => {
      if (live) setRows(all.flat().sort((a, b) => b.at - a.at));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAgentId, key, enabled]);

  return rows;
}

// The drive's files, at its root and one level down (each Expert keeps its own folder there),
// newest first. Null while reading.
export function useDriveFiles(agentId: string | null, enabled = true) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    if (!enabled || !agentId) return;
    let live = true;
    const list = (path: string) =>
      apiFetch<FileListResponse>(`/api/agents/${agentId}/files/list?path=${encodeURIComponent(path)}`).then(
        (r) => r.entries.filter((e) => !e.hidden),
        () => [] as FileEntry[]
      );
    void (async () => {
      const root = await list(DRIVE_ROOT);
      const nested = await Promise.all(root.filter(isDir).map((d) => list(d.path)));
      const all = [...root, ...nested.flat()].filter((e) => e.type === "file");
      all.sort((a, b) => b.modified - a.modified);
      if (live) setFiles(all);
    })();
    return () => {
      live = false;
    };
  }, [agentId, enabled]);
  return files;
}

/** Lower case, accents dropped: « réunion » matches « reunion ». */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
