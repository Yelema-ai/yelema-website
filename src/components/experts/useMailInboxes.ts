"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import type { MailInbox } from "@/lib/mail";
import { useWorkspace } from "@/components/WorkspaceProvider";

// The experts' inboxes this member may read. Starts from the last reading so the E-mails tab does
// not flicker in and out; an error reads as "no inbox", and the tab simply does not show.
export function useMailInboxes(): { inboxes: MailInbox[]; loaded: boolean; reload: () => Promise<void> } {
  const { userEmail, current } = useWorkspace();
  const key = `mail-inboxes:${userEmail}:${current?.id ?? ""}`;
  const [state, setState] = useState<{ key: string; inboxes: MailInbox[] } | null>(() => {
    const kept = cached<MailInbox[]>(key);
    return kept ? { key, inboxes: kept } : null;
  });

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: MailInbox[] }>("/api/mail/inboxes");
      setState({ key, inboxes: remember(key, data.items) });
    } catch {
      setState((prev) => (prev?.key === key ? prev : { key, inboxes: [] }));
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mine = state?.key === key ? state : null;
  return { inboxes: mine?.inboxes ?? [], loaded: mine !== null, reload };
}
