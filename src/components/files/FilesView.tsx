"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from "react";
import {
  ArrowUp,
  Cloud,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";
import { DropOverlay } from "@/components/DropOverlay";
import { HiddenFileInput } from "@/components/HiddenFileInput";
import { useAsyncAction } from "@/components/useAsyncAction";
import { EXPERTS } from "@/config/experts";
import { cn } from "@/lib/utils";
import { FilePreview } from "./FilePreview";
import { useFileBrowser } from "./useFileBrowser";
import {
  archiveUrl,
  breadcrumbs,
  contentUrl,
  formatBytes,
  formatMtime,
  isDir,
  toAbsPath,
  type FileEntry,
} from "./types";

type ViewMode = "list" | "grid";

// The top of the shared drive: its folders named after an expert show that expert's face.
const DRIVE_TOP = toAbsPath("~/Livrables");

// Touch screens have no double-click: a tap opens instead of selecting.
const COARSE = "(pointer: coarse)";
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(COARSE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COARSE).matches,
    () => false
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

// The drive pane: one folder of the workspace instance's ~/Livrables, fenced to `root` (browsing
// never goes above it; the breadcrumb starts at `rootLabel`). The whole pane is a drop zone for
// uploads. The pane sizes itself by container width: on a narrow pane every action lives in one
// menu and the list drops its size/date columns.
export function FilesView({ agentId, root, rootLabel }: { agentId: string; root: string; rootLabel: string }) {
  const fb = useFileBrowser(agentId, root);
  const touch = useCoarsePointer();
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ connections: Array<{ toolkitSlug?: string; status?: string }> }>(
      `/api/agents/${agentId}/integrations/connections`
    )
      .then((res) => {
        if (active) {
          const isConn = (res.connections || []).some(
            (c) => (c.toolkitSlug === "googledrive" || c.toolkitSlug === "one_drive") && c.status?.toUpperCase() === "ACTIVE"
          );
          setDriveConnected(isConn);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [agentId]);

  const handleConnectDrive = async () => {
    try {
      setDriveConnecting(true);
      const res = await apiFetch<{ redirectUrl: string }>(
        `/api/agents/${agentId}/integrations/connect`,
        {
          method: "POST",
          body: JSON.stringify({ toolkit: "googledrive" }),
        }
      );
      if (res.redirectUrl) {
        window.open(res.redirectUrl, "_blank");
        toast.info("Autorisez l'accès à Google Drive dans la fenêtre ouverte.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Impossible d'initialiser la connexion à Google Drive.");
    } finally {
      setDriveConnecting(false);
    }
  };
  const uploadRef = useRef<HTMLInputElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const crumbRef = useRef<HTMLElement>(null);

  // `webkitdirectory` isn't in React's input typings, so set it on the DOM node directly. It makes
  // the picker select a whole folder; each file then reports its path under it via webkitRelativePath.
  useEffect(() => {
    folderUploadRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  // Keep the deepest breadcrumb in view when the path is longer than the bar.
  useEffect(() => {
    const el = crumbRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [fb.path]);

  // Inline rename: the entry's name swaps to an input (Enter commits, Escape cancels). `skipBlur`
  // suppresses the commit the Escape-triggered blur would fire.
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlurRef = useRef(false);

  function startRename(entry: FileEntry) {
    setSelectedPath(entry.path);
    setEditingPath(entry.path);
    setDraft(entry.name);
  }
  function commitRename(entry: FileEntry) {
    setEditingPath(null);
    setSelectedPath(null);
    fb.rename(entry, draft);
  }
  function onRenameKeyDown(e: KeyboardEvent<HTMLInputElement>, entry: FileEntry) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      skipBlurRef.current = true;
      setEditingPath(null);
    }
  }

  function openEntry(entry: FileEntry) {
    if (isDir(entry)) {
      resetSelection();
      fb.openEntry(entry);
    } else {
      setSelectedPath(entry.path);
      setPreview(entry);
    }
  }

  function onEntryKeyDown(e: KeyboardEvent<HTMLElement>, entry: FileEntry) {
    if (e.key === "Enter") {
      e.preventDefault();
      openEntry(entry);
    } else if (e.key === " ") {
      e.preventDefault();
      setSelectedPath(entry.path);
    }
  }

  // Selection is anchored to the listing, so clear it (and any in-progress rename) whenever the
  // directory changes out from under it.
  function resetSelection() {
    setSelectedPath(null);
    setEditingPath(null);
  }

  function navigate(path: string) {
    resetSelection();
    fb.navigate(path);
  }

  function goUp() {
    resetSelection();
    fb.goUp();
  }

  function askDelete(entry: FileEntry) {
    setSelectedPath(entry.path);
    setPendingDelete(entry);
  }

  function clearSelection() {
    if (!editingPath) setSelectedPath(null);
  }

  // Shared row/card interaction: with a mouse, click selects and double-click opens; on a touch
  // screen, a tap opens. Enter opens and Space selects from the keyboard (only when the row itself
  // has focus, not its actions menu). `stopPropagation` keeps the click from reaching the pane's
  // clear-selection handler.
  function entryHandlers(entry: FileEntry) {
    return {
      tabIndex: 0,
      onClick: (e: ReactMouseEvent<HTMLElement>) => {
        e.stopPropagation();
        if (touch) openEntry(entry);
        else setSelectedPath(entry.path);
      },
      onDoubleClick: (e: ReactMouseEvent<HTMLElement>) => {
        e.stopPropagation();
        if (!touch) openEntry(entry);
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.target === e.currentTarget) onEntryKeyDown(e, entry);
      },
    };
  }

  const crumbs = breadcrumbs(fb.path, fb.root, rootLabel);
  const selectedEntry = useMemo(
    () => (selectedPath == null ? null : fb.visibleEntries.find((entry) => entry.path === selectedPath) ?? null),
    [fb.visibleEntries, selectedPath]
  );
  const atDriveTop = fb.path === DRIVE_TOP;
  const canWrite = !!fb.path;
  const pickFiles = () => uploadRef.current?.click();
  const pickFolder = () => folderUploadRef.current?.click();

  const renameProps = { draft, setDraft, onRenameKeyDown, commitRename, skipBlurRef };
  const menuProps = { agentId, onOpen: openEntry, onRename: startRename, onDelete: askDelete };

  return (
    <div
      className="@container relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-line bg-surface"
      {...fb.dragHandlers}
    >
      {fb.dragOver && <DropOverlay label="Déposez vos fichiers pour les importer ici" />}

      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-3 @2xl:px-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={goUp}
          disabled={fb.atRoot}
          aria-label="Dossier parent"
          title="Dossier parent"
          className="shrink-0"
        >
          <ArrowUp />
        </Button>
        <nav
          ref={crumbRef}
          aria-label="Emplacement"
          className="flex h-10 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl bg-soft px-2 text-sm [scrollbar-width:none]"
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.path} className="flex shrink-0 items-center">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-3" />}
                <button
                  type="button"
                  onClick={() => navigate(c.path)}
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "flex max-w-[12rem] items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-soft-2",
                    last ? "font-semibold text-ink" : "text-ink-2"
                  )}
                >
                  {i === 0 && <FolderOpen className="h-4 w-4 shrink-0 text-brand" />}
                  <span className="min-w-0 truncate">{c.label}</span>
                </button>
              </span>
            );
          })}
        </nav>

        {/* Wide pane: the full toolbar. */}
        <div className="hidden shrink-0 items-center gap-1.5 @2xl:flex">
          {selectedEntry && !editingPath && (
            <SelectedActions entry={selectedEntry} agentId={agentId} onRename={startRename} onDelete={askDelete} />
          )}

          {driveConnected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-ok border-ok/30 bg-ok/5 hover:bg-ok/10"
              title="Google Drive connecté à votre espace"
              onClick={() => toast.success("Google Drive est connecté et accessible par vos experts.")}
            >
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="hidden @3xl:inline">Drive connecté</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleConnectDrive}
              disabled={driveConnecting}
              className="gap-1.5 text-xs font-medium text-ink hover:text-brand"
              title="Connecter Google Drive"
            >
              {driveConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              ) : (
                <Cloud className="h-3.5 w-3.5 text-brand" />
              )}
              <span className="hidden @3xl:inline">Connecter son Drive</span>
            </Button>
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={fb.refresh}
            aria-label="Actualiser"
            title="Actualiser"
          >
            <RefreshCw className={cn(fb.loading && "animate-spin")} />
          </Button>
          <span className="mx-0.5 h-6 w-px bg-line" />
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewFolderOpen(true)}
            disabled={!canWrite}
            aria-label="Nouveau dossier"
            title="Nouveau dossier"
          >
            <FolderPlus />
            <span className="hidden @4xl:inline">Nouveau dossier</span>
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button disabled={!canWrite || fb.uploading}>
                {fb.uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                Importer
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={pickFiles}>
                <Upload />
                Des fichiers
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={pickFolder}>
                <FolderUp />
                Un dossier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Narrow pane: every action in one menu. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Plus d’actions" className="shrink-0 @2xl:hidden">
              {fb.uploading ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={handleConnectDrive} disabled={driveConnecting}>
              <Cloud className="text-brand" />
              {driveConnected ? "Google Drive (Connecté)" : "Connecter Google Drive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={pickFiles} disabled={!canWrite || fb.uploading}>
              <Upload />
              Importer des fichiers
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={pickFolder} disabled={!canWrite || fb.uploading}>
              <FolderUp />
              Importer un dossier
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNewFolderOpen(true)} disabled={!canWrite}>
              <FolderPlus />
              Nouveau dossier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setViewMode(viewMode === "list" ? "grid" : "list")}>
              {viewMode === "list" ? <LayoutGrid /> : <List />}
              {viewMode === "list" ? "Afficher en grille" : "Afficher en liste"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={fb.refresh}>
              <RefreshCw />
              Actualiser
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <HiddenFileInput inputRef={uploadRef} onFiles={fb.uploadFiles} />
        <HiddenFileInput inputRef={folderUploadRef} onFiles={fb.uploadFolder} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto" onClick={clearSelection}>
        {fb.loading && fb.visibleEntries.length === 0 ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center text-ink-3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : fb.error ? (
          <div className="flex flex-col items-start gap-3 p-4 @2xl:p-6">
            <p className="rounded-xl bg-ko-pale px-3 py-2 text-[13px] text-ko">{fb.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={fb.refresh}>
              <RefreshCw />
              Réessayer
            </Button>
          </div>
        ) : fb.visibleEntries.length === 0 ? (
          <EmptyFolder
            atRoot={fb.atRoot}
            canCreate={canWrite}
            uploading={fb.uploading}
            onNewFolder={() => setNewFolderOpen(true)}
            onUpload={pickFiles}
          />
        ) : viewMode === "list" ? (
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 hidden bg-surface text-left text-xs font-semibold text-ink-3 @2xl:table-header-group">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-semibold">Nom</th>
                <th className="w-28 px-4 py-2.5 text-right font-semibold">Taille</th>
                <th className="w-52 px-4 py-2.5 font-semibold">Modifié le</th>
                <th className="w-14 px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fb.visibleEntries.map((entry) => {
                const selected = selectedEntry?.path === entry.path;
                const meta = [isDir(entry) ? "Dossier" : formatBytes(entry.size), formatMtime(entry.modified)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={entry.path}
                    aria-selected={selected}
                    className={cn(
                      "group cursor-default select-none border-b border-line outline-none transition-colors last:border-0 hover:bg-soft focus-visible:bg-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/25",
                      selected && "bg-soft-2 hover:bg-soft-2"
                    )}
                    {...entryHandlers(entry)}
                  >
                    <td className="min-w-0 py-2.5 pl-3 pr-2 @2xl:pl-4">
                      {editingPath === entry.path ? (
                        <RenameInput entry={entry} {...renameProps} />
                      ) : (
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                          <EntryGlyph entry={entry} expertFolder={atDriveTop} selected={selected} />
                          <span className="min-w-0">
                            <span className={cn("block truncate text-ink", isDir(entry) && "font-semibold")}>
                              {entry.name}
                            </span>
                            {meta && <span className="block truncate text-xs text-ink-3 @2xl:hidden">{meta}</span>}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="hidden w-28 whitespace-nowrap px-4 py-2.5 text-right text-ink-3 @2xl:table-cell">
                      {formatBytes(entry.size)}
                    </td>
                    <td className="hidden w-52 whitespace-nowrap px-4 py-2.5 text-ink-3 @2xl:table-cell">
                      {formatMtime(entry.modified)}
                    </td>
                    <td className="w-14 px-2 py-2.5 text-right">
                      <EntryMenu entry={entry} {...menuProps} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 @md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] @2xl:p-4">
            {fb.visibleEntries.map((entry) => {
              const selected = selectedEntry?.path === entry.path;
              return (
                <div
                  key={entry.path}
                  aria-selected={selected}
                  className={cn(
                    "group flex cursor-default select-none flex-col rounded-[18px] border border-line bg-surface p-3 outline-none transition-colors hover:bg-soft focus-visible:ring-2 focus-visible:ring-brand/25 @md:min-h-40",
                    selected && "border-brand/25 bg-soft-2 hover:bg-soft-2"
                  )}
                  {...entryHandlers(entry)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <EntryGlyph entry={entry} expertFolder={atDriveTop} large selected={selected} />
                    <EntryMenu entry={entry} {...menuProps} />
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    {editingPath === entry.path ? (
                      <RenameInput entry={entry} {...renameProps} />
                    ) : (
                      <span className={cn("block truncate text-sm text-ink", isDir(entry) && "font-semibold")}>
                        {entry.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-ink-3">
                    <div>{isDir(entry) ? "Dossier" : formatBytes(entry.size)}</div>
                    <div className="truncate">{formatMtime(entry.modified)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {fb.truncated && !fb.error && (
          <p className="px-4 py-3 text-xs text-ink-3">
            Seuls les 1 000 premiers éléments sont affichés. Ouvrez un sous-dossier pour voir la suite.
          </p>
        )}
      </div>

      <FilePreview agentId={agentId} entry={preview} onClose={() => setPreview(null)} />

      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={fb.createDir} />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete && isDir(pendingDelete) ? "Supprimer ce dossier ?" : "Supprimer ce fichier ?"}
        description={
          pendingDelete
            ? `« ${pendingDelete.name} » sera supprimé définitivement${
                isDir(pendingDelete) ? ", avec tout son contenu" : ""
              }. Cette action est irréversible.`
            : undefined
        }
        confirmText="Supprimer"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await fb.remove(pendingDelete);
        }}
      />
    </div>
  );
}

const VIEW_MODES = [
  { mode: "list" as const, Icon: List, label: "Vue liste" },
  { mode: "grid" as const, Icon: LayoutGrid, label: "Vue grille" },
];

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 rounded-xl bg-soft p-1" role="group" aria-label="Affichage">
      {VIEW_MODES.map(({ mode, Icon, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          aria-label={label}
          title={label}
          onClick={() => onChange(mode)}
          className={cn(
            "inline-flex w-9 items-center justify-center rounded-[9px] transition-colors",
            value === mode ? "bg-surface text-brand shadow-sm" : "text-ink-3 hover:text-ink"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

// Quick actions for the selected entry, in the wide toolbar (mouse users select with a click).
function SelectedActions({
  agentId,
  entry,
  onRename,
  onDelete,
}: {
  agentId: string;
  entry: FileEntry;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}) {
  const dir = isDir(entry);
  return (
    <div className="mr-0.5 flex items-center gap-1 border-r border-line pr-2">
      <Button asChild variant="ghost" size="icon" title={dir ? "Télécharger (.tar.gz)" : "Télécharger"}>
        <a
          href={dir ? archiveUrl(agentId, entry.path) : contentUrl(agentId, entry.path, "attachment")}
          download={dir ? `${entry.name}.tar.gz` : entry.name}
          aria-label={dir ? `Télécharger ${entry.name} en archive .tar.gz` : `Télécharger ${entry.name}`}
        >
          <Download />
        </a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRename(entry)}
        aria-label={`Renommer ${entry.name}`}
        title="Renommer"
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(entry)}
        className="hover:bg-ko-pale hover:text-ko"
        aria-label={`Supprimer ${entry.name}`}
        title="Supprimer"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

// The per-entry "…" menu: always visible on touch screens, on hover/focus/selection with a mouse.
// Its events are kept from reaching the row (React bubbles them through the menu's portal), and
// after an action focus is left where the action put it (the rename field, a dialog).
function EntryMenu({
  agentId,
  entry,
  onOpen,
  onRename,
  onDelete,
}: {
  agentId: string;
  entry: FileEntry;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}) {
  const dir = isDir(entry);
  const acted = useRef(false);
  const act = (fn: () => void) => () => {
    acted.current = true;
    fn();
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions pour ${entry.name}`}
          onClick={stop}
          onDoubleClick={stop}
          onKeyDown={stop}
          className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-soft-2 hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 data-[state=open]:bg-soft-2 data-[state=open]:text-ink data-[state=open]:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-aria-selected:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={stop}
        onDoubleClick={stop}
        onKeyDown={stop}
        onCloseAutoFocus={(e) => {
          if (acted.current) e.preventDefault();
          acted.current = false;
        }}
      >
        <DropdownMenuItem onSelect={act(() => onOpen(entry))}>
          {dir ? <FolderOpen /> : <Eye />}
          {dir ? "Ouvrir" : "Aperçu"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild onSelect={act(() => undefined)}>
          <a
            href={dir ? archiveUrl(agentId, entry.path) : contentUrl(agentId, entry.path, "attachment")}
            download={dir ? `${entry.name}.tar.gz` : entry.name}
          >
            <Download />
            {dir ? "Télécharger (.tar.gz)" : "Télécharger"}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={act(() => onRename(entry))}>
          <Pencil />
          Renommer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={act(() => onDelete(entry))}>
          <Trash2 />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;
const SHEET_EXT = /\.(csv|tsv|xlsx?|ods|numbers)$/i;
const ARCHIVE_EXT = /\.(zip|tar|gz|tgz|rar|7z)$/i;
const DOC_EXT = /\.(pdf|docx?|odt|rtf|txt|md|pptx?|odp|key|pages)$/i;

function fileIcon(name: string) {
  if (IMAGE_EXT.test(name)) return FileImage;
  if (SHEET_EXT.test(name)) return FileSpreadsheet;
  if (ARCHIVE_EXT.test(name)) return FileArchive;
  if (DOC_EXT.test(name)) return FileText;
  return FileIcon;
}

function EntryGlyph({
  entry,
  expertFolder,
  large = false,
  selected = false,
}: {
  entry: FileEntry;
  expertFolder: boolean;
  large?: boolean;
  selected?: boolean;
}) {
  const dir = isDir(entry);
  const expert = dir && expertFolder ? EXPERTS.find((e) => e.name.normalize() === entry.name.normalize()) : undefined;
  if (expert) return <ExpertAvatar expertKey={expert.key} size={large ? 44 : 32} />;

  const Icon = dir ? Folder : entry.type === "symlink" ? Link2 : fileIcon(entry.name);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        large ? "size-11 rounded-[14px]" : "size-8 rounded-[10px]",
        dir ? "bg-soft-2 text-brand" : "bg-soft text-ink-2",
        selected && "bg-surface"
      )}
    >
      <Icon className={large ? "h-5 w-5" : "h-4 w-4"} strokeWidth={1.9} />
    </span>
  );
}

function RenameInput({
  entry,
  draft,
  setDraft,
  onRenameKeyDown,
  commitRename,
  skipBlurRef,
}: {
  entry: FileEntry;
  draft: string;
  setDraft: (draft: string) => void;
  onRenameKeyDown: (e: KeyboardEvent<HTMLInputElement>, entry: FileEntry) => void;
  commitRename: (entry: FileEntry) => void;
  skipBlurRef: { current: boolean };
}) {
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={stop}
      onDoubleClick={stop}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        onRenameKeyDown(e, entry);
      }}
      onBlur={() => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        commitRename(entry);
      }}
      aria-label="Nouveau nom"
      className="h-9 w-full rounded-[10px] border border-brand/40 bg-surface px-2.5 text-sm text-ink outline-none ring-2 ring-brand/15"
    />
  );
}

function EmptyFolder({
  atRoot,
  canCreate,
  uploading,
  onNewFolder,
  onUpload,
}: {
  atRoot: boolean;
  canCreate: boolean;
  uploading: boolean;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-soft-2 text-brand">
        <FolderOpen className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <p className="font-display text-lg font-bold tracking-tight text-ink">
        {atRoot ? "Aucun fichier pour l’instant" : "Ce dossier est vide"}
      </p>
      <p className="mt-1.5 max-w-sm text-sm text-ink-3">
        {atRoot
          ? "Les livrables de vos experts et les documents importés par l’équipe apparaîtront ici."
          : "Glissez-y des fichiers ou importez-les depuis votre ordinateur."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onUpload} disabled={!canCreate || uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          Importer des fichiers
        </Button>
        <Button variant="outline" onClick={onNewFolder} disabled={!canCreate}>
          <FolderPlus />
          Nouveau dossier
        </Button>
      </div>
      <p className="mt-4 hidden text-xs text-ink-3 pointer-fine:block">Ou déposez-les directement dans cette fenêtre.</p>
    </div>
  );
}

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const { busy, run } = useAsyncAction();

  function submit() {
    const clean = name.trim();
    if (!clean) return;
    run(async () => {
      await onCreate(clean);
      setName("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          if (!o) setName("");
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-bold text-ink">Nouveau dossier</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nom du dossier"
          aria-label="Nom du dossier"
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Création…" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
