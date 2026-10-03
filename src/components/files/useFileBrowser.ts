"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDropZone } from "../useDropZone";
import { isInside, isVisible, joinPath, toAbsPath, type FileEntry, type FileListResponse } from "./types";

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

class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The BFF and the instance answer in a mix of English and French; the drive only speaks French, so
// errors are worded here from the status, with `fallback` saying what failed.
async function driveError(res: Response, fallback: string): Promise<DriveError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const code = body?.error?.code;
  const message =
    res.status === 401
      ? "Votre session a expiré, reconnectez-vous."
      : code === "forbidden"
        ? "Seuls les administrateurs peuvent modifier les fichiers."
        : code === "forbidden_path"
          ? "Ce dossier n’est pas accessible."
          : code === "invalid_path" && body?.error?.message // worded in French by lib/drive.ts
            ? body.error.message
            : res.status === 404
              ? "Ce fichier ou ce dossier n’existe plus."
              : res.status === 409
                ? "Un élément porte déjà ce nom."
                : res.status === 413
                  ? "Ce fichier est trop volumineux."
                  : fallback;
  return new DriveError(res.status, message);
}

async function driveFetch<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await driveError(res, fallback);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// Owns the drive pane's directory state + mutations. Browsing is fenced to `root` (a drive path like
// `~/Livrables` or `~/Livrables/Fatima`): it starts there, the breadcrumb and "up" stop there, and a
// missing root is created on first open. Listings come back with resolved absolute paths, so the
// root is compared in its absolute form. Every call targets the workspace instance (`agentId`).
export function useFileBrowser(agentId: string, root: string) {
  const rootAbs = useMemo(() => toAbsPath(root), [root]);
  const [path, setPath] = useState<string | null>(null); // resolved abs dir; null until first load
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0); // count of in-flight uploads

  // Guard against an older list response landing after a newer navigation.
  const loadSeq = useRef(0);

  // Mirror `path` into a ref so a long-running upload can tell whether the user has since navigated
  // away: if so, the post-upload refresh must not pull them back to the directory it started in.
  const pathRef = useRef<string | null>(null);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const list = useCallback(
    (target: string) =>
      driveFetch<FileListResponse>(
        `/api/agents/${agentId}/files/list?path=${encodeURIComponent(target)}`,
        {},
        "Impossible d’ouvrir ce dossier."
      ),
    [agentId]
  );

  // Load one directory level. A missing root (nothing saved in the drive yet) is created, then
  // listed again; if that's not possible (members can't write), it shows as an empty folder.
  const load = useCallback(
    async (target: string) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        let res: FileListResponse;
        try {
          res = await list(target);
        } catch (e) {
          if (!(e instanceof DriveError && e.status === 404 && toAbsPath(target) === rootAbs)) throw e;
          await fetch(`/api/agents/${agentId}/files/dir?path=${encodeURIComponent(root)}`, { method: "POST" }).catch(
            () => undefined
          );
          res = await list(target).catch(() => ({ path: rootAbs, parentPath: null, entries: [], truncated: false }));
        }
        if (seq !== loadSeq.current) return; // a newer load superseded us
        setPath(res.path);
        setEntries(res.entries);
        setTruncated(res.truncated);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setError((e as Error).message || "Impossible d’ouvrir ce dossier.");
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [agentId, list, root, rootAbs]
  );

  // Start at the root (again whenever the root changes).
  useEffect(() => {
    load(rootAbs);
  }, [load, rootAbs]);

  // Never navigate above the root.
  const navigate = useCallback((target: string) => load(isInside(target, rootAbs) ? target : rootAbs), [load, rootAbs]);
  const refresh = useCallback(() => load(path ?? rootAbs), [load, path, rootAbs]);
  const atRoot = path == null || path === rootAbs;
  const goUp = useCallback(() => {
    if (!path || path === rootAbs) return;
    navigate(path.slice(0, path.lastIndexOf("/")) || rootAbs);
  }, [navigate, path, rootAbs]);

  // Open an entry: directories navigate; everything else is left to the caller (preview/download),
  // which knows the entry.
  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "directory") navigate(entry.path);
    },
    [navigate]
  );

  // PUT one file to `relPath` under the current dir. `relPath` may contain slashes (a folder
  // upload passes webkitRelativePath); the Agents API creates the parent dirs (mkdir -p) on write.
  // The PUT goes through the BFF content route, which buffers the streamed body to a known
  // Content-Length (the instance-host proxy drops chunked uploads, leaving 0-byte files), so the
  // component just PUTs the File and lets the route frame it.
  const putFile = useCallback(
    async (file: File, relPath: string): Promise<void> => {
      const target = joinPath(path!, relPath);
      await driveFetch(
        `/api/agents/${agentId}/files/content?path=${encodeURIComponent(target)}&overwrite=true`,
        { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file },
        "L’import a échoué."
      );
    },
    [agentId, path]
  );

  // Upload a batch of (file, destination-relative-path) pairs to the current dir, then refresh once.
  // overwrite=true mirrors a normal desktop drop (replace in place); a failed file is toasted but
  // doesn't abort the batch. Concurrency is bounded so a deep folder can't open a socket per file.
  const uploadEntries = useCallback(
    async (items: { file: File; relPath: string }[]) => {
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
      if (ok > 0) toast.success(ok === 1 ? "1 fichier importé" : `${ok} fichiers importés`);
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
  // folder (e.g. "Devis/2026/mars.pdf"), so the structure is recreated under the current dir. Empty
  // subfolders are dropped: the browser only enumerates files.
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
        await driveFetch(
          `/api/agents/${agentId}/files/dir?path=${encodeURIComponent(joinPath(path, clean))}`,
          { method: "POST" },
          "Impossible de créer le dossier."
        );
        toast.success("Dossier créé");
        await load(path);
      } catch (e) {
        toast.error((e as Error).message);
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
        await driveFetch(
          `/api/agents/${agentId}/files`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: entry.path, to: joinPath(path, clean) }),
          },
          "Impossible de renommer cet élément."
        );
        await load(path);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [agentId, path, load]
  );

  const remove = useCallback(
    async (entry: FileEntry) => {
      try {
        await driveFetch(
          `/api/agents/${agentId}/files?path=${encodeURIComponent(entry.path)}`,
          { method: "DELETE" },
          "Impossible de supprimer cet élément."
        );
        toast.success(`« ${entry.name} » a été supprimé`);
        await load(path ?? rootAbs);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [agentId, path, rootAbs, load]
  );

  // Whole-pane drag-drop overlay.
  const { dragOver, dragHandlers } = useDropZone(uploadFiles);

  const visibleEntries = useMemo(() => entries.filter(isVisible), [entries]);

  return {
    root: rootAbs,
    path,
    atRoot,
    visibleEntries,
    truncated,
    loading,
    error,
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
