"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, readApiError } from "@/lib/api";
import { isDriveRoot } from "@/lib/drive-paths";
import { TOO_LARGE, tooLarge } from "@/lib/upload-limit";
import { useDropZone } from "../useDropZone";
import { joinPath, type FileEntry, type FileListResponse } from "./types";

// Run `worker` over `items` with at most `limit` in flight. Folder uploads fan out to one PUT per
// file; an unbounded Promise.all would open hundreds of sockets (and buffer hundreds of bodies) at
// once, so we cap concurrency.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

// Owns the Files tab's directory state + mutations. One hook instance per pane, callbacks
// memoised, a ref-counted drag overlay. The current directory's resolved absolute `path` comes
// from the Agents API (it resolves ~ / defaults), so navigation, upload targets, and
// new-folder/rename paths are all derived from the listing the server returns. Every call targets
// the active agent via the `agentId` prop (this app is multi-agent).
export function useFileBrowser(agentId: string, initialPath?: string) {
  const [path, setPath] = useState<string | null>(null); // resolved abs dir; null until first load
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [uploading, setUploading] = useState(0); // count of in-flight uploads

  // Guard against an older list response landing after a newer navigation.
  const loadSeq = useRef(0);

  // Mirror `path` into a ref so a long-running upload can tell whether the user has since navigated
  // away — if so, the post-upload refresh must not pull them back to the directory it started in.
  const pathRef = useRef<string | null>(null);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // Load one directory level. `target` undefined loads the agent's default workspace dir (first
  // mount); on success the resolved abs path replaces whatever we asked for.
  const load = useCallback(
    async (target?: string) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        const qs = target ? `?path=${encodeURIComponent(target)}` : "";
        const res = await apiFetch<FileListResponse>(`/api/agents/${agentId}/files/list${qs}`);
        if (seq !== loadSeq.current) return; // a newer load superseded us
        setPath(res.path);
        setParentPath(res.parentPath);
        setEntries(res.entries);
        setTruncated(res.truncated);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setError((e as Error).message || "Ce dossier n’a pas pu être ouvert.");
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [agentId]
  );

  // Initial load: the drive's root, or the folder the caller starts in (an expert's own). A
  // starting folder that does not exist yet falls back to the root instead of an error screen.
  const initialPathRef = useRef(initialPath);
  useEffect(() => {
    const start = initialPathRef.current;
    if (!start) {
      load();
      return;
    }
    let cancelled = false;
    apiFetch<FileListResponse>(`/api/agents/${agentId}/files/list?path=${encodeURIComponent(start)}`)
      .then(() => {
        if (!cancelled) void load(start);
      })
      .catch(() => {
        if (!cancelled) void load();
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, load]);

  const navigate = useCallback((target: string) => load(target), [load]);
  const refresh = useCallback(() => load(path ?? undefined), [load, path]);
  // The drive's root has nothing above it that a member may open.
  const atRoot = path === null || isDriveRoot(path);
  const goUp = useCallback(() => {
    if (parentPath && !atRoot) load(parentPath);
  }, [load, parentPath, atRoot]);

  // Open an entry: directories (and dir symlinks) navigate; everything else is left to the caller
  // (preview/download), which knows the entry.
  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "directory") navigate(entry.path);
    },
    [navigate]
  );

  // PUT one file to `relPath` under the current dir. `relPath` may contain slashes (a folder
  // upload passes webkitRelativePath); the Agents API creates the parent dirs (mkdir -p) on write.
  // The PUT goes through the BFF content route, which buffers the streamed body to a known
  // Content-Length — the instance-host proxy drops chunked uploads (→ 0-byte files), so the
  // component just PUTs the File and lets the route frame it.
  const putFile = useCallback(
    async (file: File, relPath: string): Promise<void> => {
      const target = joinPath(path!, relPath);
      const res = await fetch(
        `/api/agents/${agentId}/files/content?path=${encodeURIComponent(target)}&overwrite=true`,
        { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }
      );
      if (!res.ok) throw new Error(await readApiError(res, "L’envoi a échoué"));
    },
    [agentId, path]
  );

  // Upload a batch of (file, destination-relative-path) pairs to the current dir, then refresh once.
  // overwrite=true mirrors a normal desktop drop (replace in place); a failed file is toasted but
  // doesn't abort the batch. Concurrency is bounded so a deep folder can't open a socket per file.
  const uploadEntries = useCallback(
    async (all: { file: File; relPath: string }[]) => {
      // A file over the limit would be refused by the host with a page of its own: say it here.
      const items = all.filter(({ file }) => !tooLarge(file));
      for (const { relPath } of all.filter(({ file }) => tooLarge(file)).slice(0, 3)) toast.error(`${relPath} : ${TOO_LARGE}`);
      if (all.length - items.length > 3) toast.error(`${all.length - items.length - 3} autres fichiers dépassent 4 Mo.`);
      if (!items.length || !path) return;
      setUploading((n) => n + items.length);
      let failures = 0;
      try {
        await runPool(items, 4, async ({ file, relPath }) => {
          try {
            await putFile(file, relPath);
          } catch (e) {
            failures += 1;
            toast.error(`${relPath} : ${(e as Error).message}`);
          }
        });
      } finally {
        setUploading((n) => Math.max(0, n - items.length));
      }
      const ok = items.length - failures;
      if (ok > 0) toast.success(ok === 1 ? "1 fichier envoyé" : `${ok} fichiers envoyés`);
      // Refresh only if the user is still in the directory we uploaded into. A folder upload can run
      // for many seconds; reloading the captured `path` would otherwise undo a navigation made while
      // it was in flight.
      if (pathRef.current === path) await load(path);
    },
    [path, putFile, load]
  );

  // Flat upload (the multi-file picker + drag-drop): each file lands by its basename.
  const uploadFiles = useCallback(
    (incoming: FileList | File[]) =>
      uploadEntries(Array.from(incoming).map((file) => ({ file, relPath: file.name }))),
    [uploadEntries]
  );

  // Folder upload (webkitdirectory picker): webkitRelativePath carries the tree under the picked
  // folder (e.g. "proj/src/a.ts"), so the structure is recreated under the current dir. Empty
  // subfolders are dropped — the browser only enumerates files, matching every per-file uploader.
  const uploadFolder = useCallback(
    (incoming: FileList | File[]) =>
      uploadEntries(
        Array.from(incoming).map((file) => ({
          file,
          relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        }))
      ),
    [uploadEntries]
  );

  const createDir = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean || !path) return;
      try {
        await apiFetch(`/api/agents/${agentId}/files/dir?path=${encodeURIComponent(joinPath(path, clean))}`, {
          method: "POST",
        });
        toast.success("Dossier créé");
        await load(path);
      } catch (e) {
        toast.error((e as Error).message || "Le dossier n’a pas pu être créé.");
      }
    },
    [agentId, path, load]
  );

  // Rename in place: the entry lives in the current dir, so `to` is the new basename joined onto it.
  const rename = useCallback(
    async (entry: FileEntry, newName: string) => {
      const clean = newName.trim();
      if (!clean || !path || clean === entry.name) return;
      try {
        await apiFetch(`/api/agents/${agentId}/files`, {
          method: "PATCH",
          body: JSON.stringify({ from: entry.path, to: joinPath(path, clean) }),
        });
        await load(path);
      } catch (e) {
        toast.error((e as Error).message || "Le renommage a échoué.");
      }
    },
    [agentId, path, load]
  );

  const remove = useCallback(
    async (entry: FileEntry) => {
      try {
        await apiFetch(`/api/agents/${agentId}/files?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
        toast.success(`${entry.name} supprimé`);
        await load(path ?? undefined);
      } catch (e) {
        toast.error((e as Error).message || "La suppression a échoué.");
      }
    },
    [agentId, path, load]
  );

  // Whole-pane drag-drop overlay.
  const { dragOver, dragHandlers } = useDropZone(uploadFiles);

  const visibleEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.hidden)),
    [entries, showHidden]
  );
  const hiddenCount = useMemo(() => entries.reduce((n, e) => n + (e.hidden ? 1 : 0), 0), [entries]);

  return {
    path,
    parentPath,
    atRoot,
    entries,
    visibleEntries,
    hiddenCount,
    truncated,
    loading,
    error,
    showHidden,
    setShowHidden,
    uploading: uploading > 0,
    dragOver,
    dragHandlers,
    navigate,
    refresh,
    goUp,
    openEntry,
    uploadFiles,
    uploadFolder,
    createDir,
    rename,
    remove,
  };
}

export type FileBrowser = ReturnType<typeof useFileBrowser>;
