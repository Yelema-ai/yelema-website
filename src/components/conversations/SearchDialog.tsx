"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FileText, Lock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { FilePreview } from "@/components/files/FilePreview";
import { formatMtime, type FileEntry } from "@/components/files/types";
import { fold, useAllConversations, useDriveFiles, useOwnAgentId } from "./useAllConversations";

// Whether the search is open: one store, so the menu's « Rechercher » and Ctrl K open the same one.
const listeners = new Set<() => void>();
let opened = false;
function setOpen(v: boolean) {
  opened = v;
  listeners.forEach((l) => l());
}
export const openSearch = () => setOpen(true);
function useOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => opened,
    () => false
  );
}

const SHOWN = 8;

// « Rechercher » (Ctrl K): the member's conversations (chat d'entreprise and every Expert) by title,
// and the drive's files by name. A conversation opens in its space, a file in its preview. With
// nothing typed, the latest of each.
export function SearchDialog() {
  const open = useOpen();
  const ownAgentId = useOwnAgentId();
  const router = useRouter();
  const { experts } = useExpertsContext();
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const convs = useAllConversations(ownAgentId, experts, open);
  const files = useDriveFiles(ownAgentId, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = fold(q.trim());
  const foundConvs = useMemo(
    () => (convs ?? []).filter((c) => !needle || fold(c.session.routine ?? c.session.title ?? "").includes(needle)).slice(0, SHOWN),
    [convs, needle]
  );
  const foundFiles = useMemo(() => (files ?? []).filter((f) => !needle || fold(f.name).includes(needle)).slice(0, SHOWN), [files, needle]);
  const loading = convs === null || files === null;

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Rechercher</DialogTitle>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-5 shrink-0 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une conversation, un livrable…"
              className="h-14 w-full bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading && foundConvs.length === 0 && foundFiles.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">Recherche…</p>
            ) : foundConvs.length === 0 && foundFiles.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">Aucun résultat pour « {q.trim()} ».</p>
            ) : (
              <>
                {foundConvs.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Conversations</p>}
                {foundConvs.map((c) => (
                  <button
                    key={c.href}
                    type="button"
                    onClick={() => {
                      close();
                      router.push(c.href);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-soft"
                  >
                    {c.expert ? (
                      <ExpertAvatar expert={{ ...c.expert, gateway: null }} size="xs" />
                    ) : (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-brand-ink">
                        <Lock className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{c.session.routine ?? (c.session.title || "Nouvelle conversation")}</span>
                      <span className="block truncate text-xs text-ink-3">{c.expert ? c.expert.displayName : "Chat d’entreprise"}</span>
                    </span>
                  </button>
                ))}
                {foundFiles.length > 0 && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Livrables</p>}
                {foundFiles.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      close();
                      setPreview(f);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-soft"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-tint text-brand-ink">
                      <FileText className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
                      <span className="block truncate text-xs text-ink-3">{formatMtime(f.modified)}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {ownAgentId && <FilePreview agentId={ownAgentId} entry={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
