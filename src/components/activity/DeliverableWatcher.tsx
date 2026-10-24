"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import { agentTabPath } from "@/lib/expert-tabs";
import { readNotifyPrefs } from "@/lib/notify-prefs";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { isDir, type FileListResponse } from "@/components/files/types";
import { systemNotify } from "./system-notify";

// Every two minutes, the drive's files: one the page has not seen yet is a new deliverable, announced
// like a reply (toast, system notification when the tab is hidden) unless switched off in Paramètres.
// The first listing is the baseline: nothing already there is announced.
const EVERY = 120_000;

export function DeliverableWatcher() {
  const agentId = useOwnAgentId();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!agentId) return;
    seen.current = null;
    let live = true;
    const list = (path: string) =>
      apiFetch<FileListResponse>(`/api/agents/${agentId}/files/list?path=${encodeURIComponent(path)}`).then(
        (r) => (r.entries ?? []).filter((e) => !e.hidden),
        () => null
      );
    async function check() {
      const root = await list(DRIVE_ROOT);
      if (!root || !live) return;
      const nested = await Promise.all(root.filter(isDir).map((d) => list(d.path)));
      // A folder that failed to list would read as files gone, then as new ones on the next pass.
      if (!live || nested.some((n) => n === null)) return;
      const files = [...root, ...nested.flatMap((n) => n ?? [])].filter((e) => e.type === "file");
      const before = seen.current;
      seen.current = new Set(files.map((f) => f.path));
      if (!before || !readNotifyPrefs().deliverable) return;
      const open = () => router.push(agentTabPath(agentId!, "files"));
      for (const f of files.filter((f) => !before.has(f.path))) {
        toast("Nouveau livrable", { id: `livrable:${f.path}`, description: f.name, action: { label: "Ouvrir", onClick: open }, duration: 8000 });
        if (document.hidden) systemNotify("Nouveau livrable", f.name, `livrable:${f.path}`, open);
      }
    }
    void check();
    const timer = setInterval(() => void check(), EVERY);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [agentId, router]);

  return null;
}
