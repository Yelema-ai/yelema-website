"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { useChatContext } from "./ChatProvider";
import type { ChatSession } from "./types";

// Conversations grouped Aujourd'hui / Hier / Cette semaine / Plus ancien by last activity.
function groupSessions(sessions: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 24 * 60 * 60 * 1000;
  const groups = [
    { label: "Aujourd’hui", min: today, items: [] as ChatSession[] },
    { label: "Hier", min: today - day, items: [] as ChatSession[] },
    { label: "Cette semaine", min: today - 6 * day, items: [] as ChatSession[] },
    { label: "Plus ancien", min: -Infinity, items: [] as ChatSession[] },
  ];
  for (const s of sessions) {
    // Hermes reports seconds or milliseconds depending on the build.
    const at = s.last_active < 1e12 ? s.last_active * 1000 : s.last_active;
    groups.find((g) => at >= g.min)!.items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
}

// The conversation rail of one expert (or of the business chat). Selecting or starting a thread
// updates the URL (?session=) so refresh/Back/share reopen it.
export function ChatSidebar({ className }: { className?: string }) {
  const { sessions, activeSessionId, loadingSessions, selectSession, startNewChat, deleteSession, renameSession } =
    useChatContext();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete = sessions.find((s) => s.session_id === pendingDeleteId) ?? null;
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlur = useRef(false);

  function commitRename(sessionId: string, current: string | null) {
    setEditingId(null);
    const next = draft.trim();
    if (next && next !== (current ?? "")) renameSession(sessionId, next);
  }

  function onRenameKeyDown(e: KeyboardEvent<HTMLInputElement>, sessionId: string, current: string | null) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename(sessionId, current);
    } else if (e.key === "Escape") {
      e.preventDefault();
      skipBlur.current = true;
      setEditingId(null);
    }
  }

  return (
    <>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Conversations</span>
          <button
            type="button"
            onClick={startNewChat}
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-on-brand hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-3">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-ink-3">Aucune conversation pour l’instant.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-ink-3">{g.label}</p>
                {g.items.map((s) => {
                  const label = s.title || "Nouvelle conversation";
                  return (
                    <div key={s.session_id} className="group relative">
                      {editingId === s.session_id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => onRenameKeyDown(e, s.session_id, s.title)}
                          onBlur={() => {
                            if (skipBlur.current) {
                              skipBlur.current = false;
                              return;
                            }
                            commitRename(s.session_id, s.title);
                          }}
                          aria-label="Nom de la conversation"
                          className="w-full rounded-[10px] bg-soft px-2.5 py-2 text-sm text-ink outline-none ring-1 ring-brand/30"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => selectSession(s.session_id)}
                            onDoubleClick={() => {
                              setEditingId(s.session_id);
                              setDraft(s.title ?? "");
                            }}
                            className={cn(
                              "flex w-full select-none items-center rounded-[10px] px-2.5 py-2 pr-14 text-left text-[13.5px] transition-colors",
                              activeSessionId === s.session_id ? "bg-soft-2 font-semibold text-ink" : "text-ink-2 hover:bg-soft"
                            )}
                          >
                            <span className="truncate">{label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(s.session_id);
                              setDraft(s.title ?? "");
                            }}
                            aria-label={`Renommer ${label}`}
                            className="absolute right-8 top-1/2 -translate-y-1/2 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(s.session_id)}
                            aria-label={`Supprimer ${label}`}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 opacity-0 transition-opacity hover:text-ko group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Supprimer la conversation ?"
        description={`« ${pendingDelete?.title || "Nouvelle conversation"} » sera supprimée pour toute l’équipe. Cette action est définitive.`}
        confirmText="Supprimer"
        destructive
        onConfirm={async () => {
          if (!pendingDeleteId) return;
          await deleteSession(pendingDeleteId);
        }}
      />
    </>
  );
}
