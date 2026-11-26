"use client";

import { useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { ExpertLook } from "@/lib/backoffice";
import { sanitizeInboxDisplayName, type CreateMailInboxInput, type MailInbox } from "@/lib/mail";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";

export type InboxRequest = Pick<CreateMailInboxInput, "expert" | "displayName">;

export interface InboxAssignment {
  expert: string;
  currentName: string;
  name: string;
  renames: boolean;
  create: (request: InboxRequest) => Promise<MailInbox>;
}

export function useAssignInbox(): (assignment: InboxAssignment) => Promise<MailInbox> {
  const { reload, applyLook } = useExpertsContext();
  return useCallback(
    async ({ expert, currentName, name, renames, create }: InboxAssignment) => {
      if (renames && name !== currentName) {
        const updated = await apiFetch<ExpertLook>(`/api/experts/${encodeURIComponent(expert)}`, {
          method: "PATCH",
          body: JSON.stringify({ displayName: name }),
        });
        applyLook(updated);
        reload();
      }
      const displayName = sanitizeInboxDisplayName(name);
      return create(displayName ? { expert, displayName } : { expert });
    },
    [applyLook, reload]
  );
}
