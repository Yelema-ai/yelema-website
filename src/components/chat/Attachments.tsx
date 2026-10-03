"use client";

import { useRef } from "react";
import { FileText, Loader2, Paperclip, RotateCw, X } from "lucide-react";
import { HiddenFileInput } from "@/components/HiddenFileInput";
import type { PendingFile } from "./useChatAttachments";

export function AttachButton({ onFiles, disabled }: { onFiles: (files: FileList) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        aria-label="Joindre des fichiers"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:bg-soft hover:text-ink disabled:opacity-50"
      >
        <Paperclip className="h-4 w-4" />
      </button>
      <HiddenFileInput inputRef={ref} onFiles={onFiles} />
    </>
  );
}

export function AttachmentTray({
  files,
  onRemove,
  onRetry,
}: {
  files: PendingFile[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-full border bg-secondary/50 px-2.5 py-1 text-xs text-foreground"
        >
          {f.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL thumbnail, not a remote asset
            <img src={f.previewUrl} alt="" className="h-6 w-6 rounded object-cover" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="max-w-[10rem] truncate">{f.file.name}</span>
          {f.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {f.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(f.id)}
              aria-label="Réessayer l’envoi"
              className="text-destructive hover:text-destructive/80"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            aria-label="Retirer la pièce jointe"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
