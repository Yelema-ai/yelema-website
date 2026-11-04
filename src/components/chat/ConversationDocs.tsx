"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderOpen, Pin } from "lucide-react";
import type { TurnDoc } from "@/lib/drive-links";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilePreview } from "@/components/files/FilePreview";
import { DOC_TONE } from "@/components/files/preview-siblings";
import type { FileEntry } from "@/components/files/types";
import { cn } from "@/lib/utils";
import { GOOGLE_LABEL, type GoogleDoc } from "@/lib/google-docs";
import { GoogleTile, usePins } from "./GoogleDocs";

const TONE = DOC_TONE;

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.slice(0, 4).toUpperCase() : "FICH");

function modifiedLabel(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `Modifié à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : `Modifié le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

function usedLabel(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `, utilisé à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : `, utilisé le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

// The deliverables this discussion produced (Leslie, 28/10): a button in the chat's bar, the Google
// documents it uses first (31/10, opened in Google), then the files in a list, each opened in place,
// then the whole folder in Livrables.
export function ConversationDocs({
  agentId,
  docs,
  google = [],
  folderHref,
}: {
  agentId: string;
  docs: TurnDoc[];
  google?: (GoogleDoc & { usedAt: number | null })[];
  folderHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<FileEntry | null>(null);
  // The punaise of a row pins that document above the conversation (Leslie, 03/11): one at a time, the
  // last used by default.
  const pins = usePins();
  const pinnedId = google.find((g) => pins?.pinned.includes(g.id))?.id ?? google[0]?.id ?? null;
  if (!docs.length && !google.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Livrables de cette discussion"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-tint px-3 text-[13px] font-semibold text-brand-ink hover:bg-soft-2"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="max-sm:hidden">Livrables</span>
            <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] leading-5 text-on-brand tabular-nums">{docs.length + google.length}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-1.5">
          <DropdownMenuLabel className="text-[12.5px] font-semibold text-ink-2">Livrables de cette discussion</DropdownMenuLabel>
          {google.map((g) => {
            const isPinned = g.id === pinnedId;
            return (
              <div key={g.id} className="flex items-center gap-1">
                <DropdownMenuItem asChild className="min-w-0 flex-1 gap-2.5 rounded-lg py-2">
                  <a href={g.url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${g.title} dans ${GOOGLE_LABEL[g.kind]}`}>
                    <GoogleTile kind={g.kind} className="size-8 rounded-md" />
                    <span className="min-w-0 grow">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{g.title}</span>
                      <span className="block text-[12px] text-ink-3">
                        {GOOGLE_LABEL[g.kind]}
                        {usedLabel(g.usedAt)}
                      </span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-ink-3" />
                  </a>
                </DropdownMenuItem>
                {pins && google.length > 1 && (
                  <button
                    type="button"
                    onClick={() => pins.toggle(g.id)}
                    aria-pressed={isPinned}
                    title={isPinned ? "Épinglé en haut de la discussion" : "Épingler en haut de la discussion"}
                    aria-label={isPinned ? `${g.title} est épinglé en haut de la discussion` : `Épingler ${g.title} en haut de la discussion`}
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      isPinned ? "bg-tint text-brand-ink" : "text-ink-3 hover:bg-soft hover:text-ink"
                    )}
                  >
                    <Pin className={cn("size-4", isPinned && "fill-current")} />
                  </button>
                )}
              </div>
            );
          })}
          {docs.map((d) => (
            <DropdownMenuItem
              key={d.path}
              onSelect={() => setOpen({ name: d.name, path: d.path, type: "file", size: d.size, modified: d.modified ?? 0, hidden: false })}
              className="gap-2.5 rounded-lg py-2"
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-md text-[9.5px] font-bold text-white", TONE[d.kind])}>{ext(d.name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium text-ink">{d.name}</span>
                {modifiedLabel(d.modified) && <span className="block text-[12px] text-ink-3">{modifiedLabel(d.modified)}</span>}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push(folderHref)} className="rounded-lg py-2 text-[13.5px] font-semibold text-brand-ink">
            Ouvrir dans Livrables
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FilePreview agentId={agentId} entry={open} onClose={() => setOpen(null)} />
    </>
  );
}
