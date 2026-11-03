"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useConversationStatus } from "@/components/activity/hooks";
import { Archive, ChevronRight, Link2, Loader2, MoreHorizontal, Pencil, Pin, PinOff, Plus, Repeat, RotateCw, Search, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/components/activity/ActivityProvider";
import { convKey } from "@/lib/activity";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useChatMarks } from "@/components/conversations/useChatMarks";
import { arrange } from "@/lib/chat-marks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { agentTabPath } from "@/lib/expert-tabs";
import { copyLater } from "@/lib/clipboard";
import { profileQuery } from "@/lib/profile-id";
import { useChatContext } from "./ChatProvider";
import type { ChatSession } from "./types";
import { toMs } from "@/lib/activity";

// Hermes reports seconds or milliseconds depending on the build.
const activeAt = (s: ChatSession) => toMs(s.last_active);

// The short date at the end of a row: the hour today and yesterday, the weekday this week, the day and
// month before.
function shortWhen(at: number): string {
  const d = new Date(at);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime() - 24 * 60 * 60 * 1000) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (at >= startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Search ignores case and accents (« reference » finds « Référencement »).
const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const FOLDED_KEY = "yelema:rail-folded";
function readFolded(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === "boolean")) : {};
  } catch {
    return {};
  }
}

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
  for (const s of [...sessions].sort((a, b) => activeAt(b) - activeAt(a))) {
    const at = activeAt(s);
    groups.find((g) => at >= g.min)!.items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
}

// No « Archivées » here (Leslie, 25/10): archived conversations are found under Toutes les conversations.
type Filter = "all" | "unread" | "routines";
const PINNED = "Épinglées";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "unread", label: "Non lues" },
  { id: "routines", label: "Routines" },
];

const BADGES = {
  running: { text: "En cours…", className: "text-ink-3" },
  unread: { text: "Nouvelle réponse", className: "text-brand-ink" },
  failed: { text: "La réponse a échoué", className: "text-ko" },
} as const;

function ConversationBadge({ status }: { status: keyof typeof BADGES }) {
  const { text, className } = BADGES[status];
  return (
    <span className={cn("flex items-center gap-1 text-[11.5px] font-semibold", className)}>
      {status === "running" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {text}
    </span>
  );
}

// The conversation rail of one expert: in the expert's left column on a computer, in a side panel on
// phones and tablets (`onNavigate` closes it). Selecting or starting a thread updates the chat URL
// (?session=) so refresh/Back/share reopen it. Routine runs repeat the same title every day, so they
// show their repeat icon and have their own filter, and « Plus ancien » starts folded, so they never drown
// the conversations people started.
export function ChatSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { agentId, profile, sessions, activeSessionId, onChatTab, loadingSessions, reloadSessions, refreshingSessions, sessionsError, selectSession, startNewChat, deleteSession, renameSession } =
    useChatContext();
  const statusOf = useConversationStatus(agentId, profile);
  // The open thread stays "active" even when you're on another tab (so its stream isn't cancelled),
  // but it should only look selected in the rail while the Chat tab is actually showing.
  const highlightedSessionId = onChatTab ? activeSessionId : null;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete = sessions.find((s) => s.session_id === pendingDeleteId) ?? null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // A group the person folded stays folded (kept in this browser); « Plus ancien » starts folded.
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => setFolded(readFolded()), []);
  const setFold = (label: string, shut: boolean) =>
    setFolded((prev) => {
      const next = { ...prev, [label]: shut };
      try {
        localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
      } catch {
        /* storage off: the choice lasts for this visit */
      }
      return next;
    });
  const unreadIds = sessions.filter((s) => statusOf(s.session_id) === "unread").map((s) => s.session_id);
  const unreadCount = unreadIds.length;
  const { markRead } = useNotifications();
  const { marks, mark } = useChatMarks();
  const keyOf = (s: ChatSession) => convKey(agentId, profile, s.session_id);
  const pinnedIds = new Set(marks.pinned);
  // Archived conversations leave the rail (Toutes les conversations keeps them under « Archivées »); pinned
  // ones head it, above the dates.
  const archivedIds = new Set(marks.archived);
  const groups = useMemo(() => {
    const q = fold(query.trim());
    let found = q ? sessions.filter((s) => fold(s.routine ?? s.title ?? "Nouvelle conversation").includes(q)) : sessions;
    if (filter === "unread") found = found.filter((s) => statusOf(s.session_id) === "unread");
    if (filter === "routines") found = found.filter((s) => s.routine);
    // « Tout » is the member's own conversations (Leslie, 29/10): routines live under « Routines », and an
    // unread one still shows in « Non lues » and the bell. A search still finds them.
    if (filter === "all" && !q) found = found.filter((s) => !s.routine);
    const { pinned, rest } = arrange(found, (s) => convKey(agentId, profile, s.session_id), marks);
    return [...(pinned.length ? [{ label: PINNED, items: pinned }] : []), ...groupSessions(rest)];
  }, [sessions, query, filter, statusOf, marks, agentId, profile]);

  function archive(s: ChatSession) {
    const key = keyOf(s);
    mark(key, "archived", true);
    toast("Conversation archivée", {
      description: "Elle reste dans Toutes les conversations, sous Archivées.",
      action: { label: "Annuler", onClick: () => mark(key, "archived", false) },
    });
  }
  // A search or a filter shows everything it finds, and the open thread is never hidden in a folded group.
  // Only the default fold of « Plus ancien » gives way to the open thread; a fold the person chose holds.
  const isFolded = (g: { label: string; items: ChatSession[] }) =>
    !query.trim() && filter === "all" && (folded[g.label] ?? g.label === "Plus ancien") && (g.label in folded || !g.items.some((s) => s.session_id === highlightedSessionId));
  const pick = (sessionId: string) => {
    selectSession(sessionId);
    onNavigate?.();
  };

  // Inline rename: the row's label swaps to a text input. Enter (or blur) commits; Escape cancels
  // without committing — `skipBlur` suppresses the commit the resulting blur would otherwise fire.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlur = useRef(false);

  // « Copier le lien »: the conversation's own address (?session=), so its owner reopens it later and
  // keeps writing. With sharing on, the link also carries a sealed token (c=, 30 days, see
  // conversation-token.ts): a signed-in colleague of the same company who opens it is sent to the
  // read-only view instead of a 404. Without it, the link still works for the owner.
  async function copyLink(s: ChatSession) {
    const link = new URL(`${agentTabPath(agentId, "chat", profile)}?session=${encodeURIComponent(s.session_id)}`, window.location.origin);
    const mint = apiFetch<{ path: string; days: number }>(
      `/api/agents/${agentId}/chat/sessions/${s.session_id}/share${profileQuery(profile)}`,
      { method: "POST", body: JSON.stringify({ title: s.routine ?? s.title ?? "" }) }
    ).then(
      (res) => ({ token: new URL(res.path, window.location.origin).searchParams.get("c"), days: res.days }),
      () => ({ token: null, days: 0 })
    );
    // Started during the click: see copyLater.
    const url = mint.then(({ token }) => {
      if (token) link.searchParams.set("c", token);
      return link.toString();
    });
    try {
      await copyLater(url);
      const { token, days } = await mint;
      toast.success(token ? `Lien copié. Il rouvre cette conversation, et vos collègues la lisent pendant ${days} jours.` : "Lien copié. Il rouvre cette conversation.");
    } catch {
      toast.error("Le lien n’a pas pu être copié. Réessayez.");
    }
  }

  function startRename(sessionId: string, current: string | null) {
    setEditingId(sessionId);
    setDraft(current ?? "");
  }

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

  function renderRow(s: ChatSession) {
    // A routine run is named after its routine; the repeat icon says what it is.
    const label = s.routine ?? (s.title || "Nouvelle conversation");
    const status = statusOf(s.session_id);
    const pinned = pinnedIds.has(keyOf(s));
    if (editingId === s.session_id)
      return (
        <input
          key={s.session_id}
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
      );
    return (
      <div key={s.session_id} className="group relative">
        <button
          type="button"
          onClick={() => pick(s.session_id)}
          onDoubleClick={() => startRename(s.session_id, s.title)}
          className={cn(
            "flex min-h-10 w-full select-none items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors",
            highlightedSessionId === s.session_id ? "bg-soft-2 font-semibold text-ink" : pinned ? "bg-tint text-ink hover:bg-soft" : "text-ink-2 hover:bg-soft"
          )}
        >
          {/* A pinned thread carries its pin and a light tint (Leslie, 31/10): it stands out from the dates. */}
          {pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-brand-ink" aria-label="Épinglée" />}
          {s.routine && <Repeat className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="Routine" />}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", status === "unread" && "font-semibold text-ink")}>{label}</span>
            {status && <ConversationBadge status={status} />}
          </span>
          {/* The date gives way to the row's actions on hover, and while « … » holds the focus (back from its menu). */}
          <span className="shrink-0 text-[11.5px] font-normal tabular-nums text-ink-3 group-hover:invisible group-has-[[data-state=open]]:invisible group-has-[:focus-visible]:invisible pointer-coarse:mr-7 pointer-coarse:group-hover:visible pointer-coarse:group-has-[[data-state=open]]:visible">{shortWhen(activeAt(s))}</span>
        </button>
        {/* Renommer, Épingler, Copier, Archiver and Supprimer behind « … »: on hover with a mouse, always shown on a touch screen. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions pour ${label}`}
            title="Renommer, épingler, copier, archiver ou supprimer"
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 opacity-0 transition-opacity hover:bg-soft-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1.5">
            <DropdownMenuItem onSelect={() => startRename(s.session_id, s.title)} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
              <Pencil className="size-4" /> Renommer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => mark(keyOf(s), "pinned", !pinnedIds.has(keyOf(s)))} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
              {pinnedIds.has(keyOf(s)) ? (
                <>
                  <PinOff className="size-4" /> Désépingler
                </>
              ) : (
                <>
                  <Pin className="size-4" /> Épingler
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyLink(s)} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
              <Link2 className="size-4" /> Copier le lien
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (archivedIds.has(keyOf(s)) ? mark(keyOf(s), "archived", false) : archive(s))} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
              <Archive className="size-4" /> {archivedIds.has(keyOf(s)) ? "Désarchiver" : "Archiver"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPendingDeleteId(s.session_id)} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm text-ko">
              <Trash2 className="size-4" /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }


  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
          <span className="text-[15px] font-bold text-ink">
            Conversations{sessions.length > 0 && <span className="ml-1 font-semibold tabular-nums text-ink-3">({sessions.length})</span>}
          </span>
          <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={reloadSessions}
            disabled={refreshingSessions}
            aria-label="Actualiser"
            title="Actualiser"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-60"
          >
            <RotateCw className={`h-4 w-4${refreshingSessions ? " animate-spin" : ""}`} />
          </button>
          </span>
        </div>
        {/* An expert's new conversation starts from its list of conversations (Leslie, 28/10). */}
        {profile && (
          <button
            type="button"
            onClick={() => {
              startNewChat();
              onNavigate?.();
            }}
            className="mx-1 mb-2.5 inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-brand/60 bg-surface text-[13.5px] font-semibold text-brand-ink transition-colors hover:bg-tint"
          >
            <Plus className="h-4 w-4" />
            Nouvelle conversation
          </button>
        )}
        {sessionsError ? (
          <p className="px-2.5 pb-2 text-xs text-ink-3">
            Liste non mise à jour : l’instance ne répond pas.{" "}
            <button type="button" onClick={reloadSessions} className="underline">
              Réessayer
            </button>
          </p>
        ) : null}
        {sessions.length > 0 && (
          <label className="relative mx-1 mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher"
              aria-label="Rechercher une conversation"
              className="h-9 w-full rounded-[10px] border border-line bg-soft pl-8 pr-8 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-brand/40 focus:bg-surface [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        )}

        {sessions.length > 0 && (
          // One bar across the column, set on the search field (Leslie, 27/10, choice C): three equal places.
          // No « Tout marquer comme lu » here (Leslie, 31/10): it sits at the top of the « Non lues » list.
          <div role="group" aria-label="Filtrer les conversations" className="mx-1 mb-2.5 grid grid-cols-3 gap-0.5 rounded-xl bg-soft p-[3px]">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-2 text-[12.5px] font-semibold transition-colors",
                  filter === id ? "bg-surface text-brand-ink shadow-[0_1px_3px_rgba(20,10,60,0.12)]" : "text-ink-2 hover:text-ink"
                )}
              >
                {label}
                {/* A dot, not a number (Leslie, 28/10, A): the count is on the bell. After the word, on its
                    line (Leslie, 31/10), never in the tab's corner. */}
                {id === "unread" && unreadCount > 0 && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label={`${unreadCount} non lues`} />}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filter === "unread" && unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead(unreadIds.map((id) => convKey(agentId, profile, id)))}
              className="mb-1 ml-auto flex min-h-9 items-center rounded-[10px] px-2.5 text-[12.5px] font-semibold text-brand-ink hover:bg-soft"
            >
              Tout marquer comme lu
            </button>
          )}
          {loadingSessions ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-3">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-ink-3">Aucune conversation pour l’instant.</p>
          ) : (
            groups.map((g) => {
              const shut = isFolded(g);
              return (
                <div key={g.label} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => setFold(g.label, !shut)}
                    aria-expanded={!shut}
                    className="flex min-h-9 w-full items-center gap-1.5 rounded-[10px] px-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 hover:bg-soft"
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !shut && "rotate-90")} aria-hidden />
                    {g.label === PINNED && <Pin className="h-3.5 w-3.5 text-brand-ink" aria-hidden />}
                    {g.label}
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-soft px-1.5 text-[11px] tabular-nums tracking-normal">{g.items.length}</span>
                  </button>
                  {!shut && <nav className="flex flex-col gap-0.5">{g.items.map(renderRow)}</nav>}
                </div>
              );
            })
          )}
          {!loadingSessions && sessions.length > 0 && groups.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-ink-3">
              {query.trim() ? "Aucune conversation ne correspond." : filter === "unread" ? "Tout est lu." : filter === "all" ? "Aucune conversation pour l’instant." : "Aucune routine pour l’instant."}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Supprimer la conversation ?"
        description={`« ${pendingDelete?.title || "Nouvelle conversation"} » sera supprimée. Cette action est définitive.`}
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
