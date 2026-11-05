"use client";

import { useEffect, useState } from "react";
import { cached, subscribe } from "@/lib/client-cache";
import { railViewKey } from "@/components/chat/ChatProvider";
import { sessionsStore } from "@/lib/sessions-client";
import type { ChatSession } from "@/components/chat/types";

// The chat d'entreprise's conversations for the menu, from the tab's sessions store (read once, then
// kept current by the stream), and in step with the company chat's own rail when it is open.
export function useCompanySessions(agentId: string): ChatSession[] {
  const viewKey = railViewKey(agentId, null);
  const [all, setAll] = useState<ChatSession[]>(() => cached<ChatSession[]>(viewKey) ?? sessionsStore.get(agentId, null)?.sessions ?? []);
  useEffect(() => {
    let live = true;
    const kept = cached<ChatSession[]>(viewKey);
    if (kept) setAll(kept);
    else sessionsStore.read(agentId, null).then((d) => live && setAll(d.sessions), () => undefined);
    const offStore = sessionsStore.subscribe(agentId, null, (d) => live && !cached(viewKey) && setAll(d.sessions));
    const offView = subscribe<ChatSession[]>(viewKey, (rows) => live && setAll(rows));
    return () => {
      live = false;
      offStore();
      offView();
    };
  }, [agentId, viewKey]);
  return all.filter((s) => !s.routine);
}
