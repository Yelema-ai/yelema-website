"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, FolderInput, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isDriveClutter, matchesDriveQuery } from "@/lib/drive-order";
import { DRIVE_ABS, fileLabel } from "@/lib/drive-paths";
import { driveTree } from "@/lib/drive-store";
import type { FileEntry } from "./types";

// « Déplacer vers… » (Leslie, 30/10): every folder of the drive the tree reaches, the root first, a
// search on top. A folder never goes into itself, and where the file already is is not offered.
export function MoveDialog({
  agentId,
  entry,
  onMove,
  onClose,
}: {
  agentId: string;
  entry: FileEntry | null;
  onMove: (entry: FileEntry, destDir: string) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<{ path: string; label: string }[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!entry) return;
    setQuery("");
    let live = true;
    driveTree(agentId).then(
      (tree) => {
        const here = entry.path.slice(0, entry.path.lastIndexOf("/"));
        const dirs = tree.entries
          .filter((e) => e.type === "directory" && !e.hidden && !isDriveClutter(e))
          // Not inside a folder the tree hides (memory, caches), not into itself.
          .filter((e) => !e.path.slice(DRIVE_ABS.length + 1).split("/").some((part) => isDriveClutter({ name: part, type: "directory" })))
          .filter((e) => e.path !== entry.path && !e.path.startsWith(`${entry.path}/`))
          .map((e) => ({ path: e.path, label: e.path.slice(DRIVE_ABS.length + 1).split("/").join(" › ") }))
          .sort((a, b) => a.label.localeCompare(b.label, "fr"));
        const all = [{ path: DRIVE_ABS, label: "Livrables" }, ...dirs].filter((d) => d.path !== here);
        if (live) setFolders(all);
      },
      () => live && setFolders([])
    );
    return () => {
      live = false;
    };
  }, [agentId, entry]);

  const shown = useMemo(() => (folders ?? []).filter((f) => !query.trim() || matchesDriveQuery(f.label, query)), [folders, query]);

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="size-5" /> Déplacer vers…
          </DialogTitle>
          <DialogDescription className="truncate">{entry ? fileLabel(entry) : ""}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un dossier" className="pl-9" aria-label="Chercher un dossier" />
        </div>
        <div className="-mx-1 max-h-[50vh] overflow-y-auto">
          {folders === null ? (
            <p className="flex items-center gap-2 px-2 py-3 text-sm text-ink-3">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-3">Aucun dossier ne correspond.</p>
          ) : (
            <ul>
              {shown.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => {
                      if (entry) onMove(entry, f.path);
                      onClose();
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-ink hover:bg-soft"
                  >
                    <Folder className="size-4 shrink-0 text-brand-ink" />
                    <span className="min-w-0 truncate">{f.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
