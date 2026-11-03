"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, cachedFetch, subscribe } from "@/lib/client-cache";
import { railViewKey } from "@/components/chat/ChatProvider";
import { sessionsKey } from "@/components/experts/expert-preload";
import type { ChatSession } from "@/components/chat/types";

// The chat d'entreprise's conversations for the menu: read once (kept 30 s), then kept in step
// with the company chat's own rail when it is open. No reading on each navigation.
export function useCompanySessions(agentId: string): ChatSession[] {
  const viewKey = railViewKey(agentId, null);
  const [all, setAll] = useState<ChatSession[]>(() => cached<ChatSession[]>(viewKey) ?? []);
  useEffect(() => {
    let live = true;
    const kept = cached<ChatSession[]>(viewKey);
    if (kept) setAll(kept);
    else
      cachedFetch(sessionsKey(agentId, null), () => apiFetch<{ sessions: ChatSession[] }>(`/api/agents/${agentId}/chat/sessions`).then((r) => r.sessions), 30_000).then(
        (rows) => live && setAll(rows),
        () => undefined
      );
    const off = subscribe<ChatSession[]>(viewKey, (rows) => live && setAll(rows));
    return () => {
      live = false;
      off();
    };
  }, [agentId, viewKey]);
  return all.filter((s) => !s.routine);
}
