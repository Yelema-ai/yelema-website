"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { ComputerButton, ComputerDialog, ComputerPanel } from "@/components/experts/ExpertComputer";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { expertDisplayName } from "@/lib/experts";
import { cn } from "@/lib/utils";
import { DropOverlay } from "@/components/DropOverlay";
import { ChatComposer } from "./ChatComposer";
import { ChatMessages } from "./ChatMessages";
import { useChatContext } from "./ChatProvider";
import { useChat } from "./useChat";
import { useChatAttachments } from "./useChatAttachments";

// The conversation pane, rendered full-height in the chat tab's main column. Empty state = a
// centered welcome (heading + big composer + subtitle); once there are messages it becomes a
// scrolling transcript with the composer docked at the bottom. The composer is kept at a STABLE
// position in the tree across both states so it never remounts (preserving the draft, model, and
// effort selection through the first send).
export function ChatView({ initialMessage }: { initialMessage?: string | null }) {
  const {
    agentId,
    profile,
    agents,
    sessions,
    activeSessionId,
    composerFocusToken,
    requestComposerFocus,
    startNewChat,
    onSessionCreated,
    registerRunKiller,
    bumpSession,
  } = useChatContext();
  const { messages, isStreaming, loadingHistory, error, send, stop, killRun } = useChat({
    agentId,
    profile,
    sessionId: activeSessionId,
    onSessionCreated,
    onActivity: bumpSession,
  });

  // Deleting a thread from the rail must also stop any turn still streaming on it.
  useEffect(() => registerRunKiller(killRun), [registerRunKiller, killRun]);

  // Attachment state lives here (not in the composer) so the ENTIRE pane is a drop zone — a file
  // dropped anywhere over the transcript or composer lands in the same tray. A landed attachment
  // refocuses the composer through the same shared signal selecting/creating a thread uses.
  const att = useChatAttachments(agentId, requestComposerFocus);
  const { clearFiles } = att;

  // Switching threads / starting a new chat empties the staged tray, so a file picked for one
  // conversation can't silently ride along into the next.
  useEffect(() => {
    clearFiles();
  }, [activeSessionId, clearFiles]);

  // A message handed over by the home page ("Demander à mon équipe") is sent once, into a new
  // thread, and dropped from the URL so a refresh does not send it again.
  const sentInitial = useRef(false);
  useEffect(() => {
    if (!initialMessage || sentInitial.current || activeSessionId) return;
    sentInitial.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    void send(initialMessage);
  }, [initialMessage, activeSessionId, send]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is pinned near the bottom — controls whether new tokens auto-scroll.
  const stickRef = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Follow the stream only when the user is already near the bottom.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingHistory]);

  const showWelcome = !loadingHistory && messages.length === 0;
  // Memoized so the per-token re-renders during streaming don't re-scan the thread list.
  const activeTitle = useMemo(
    () => sessions.find((s) => s.session_id === activeSessionId)?.title?.trim(),
    [sessions, activeSessionId]
  );
  const headerTitle = activeTitle || (activeSessionId ? "Discussion" : "Nouvelle discussion");
  // The expert this chat talks to, dressed by the catalogue (name, portrait); null on the
  // instance's default home or while the list loads.
  const { experts } = useExpertsContext();
  const expert = useMemo(
    () => (profile ? (experts.find((e) => e.agentId === agentId && e.profileId === profile) ?? null) : null),
    [experts, agentId, profile]
  );
  const instance = useMemo(() => agents.find((x) => x.agent37_id === agentId) ?? null, [agents, agentId]);
  // The expert's name when the chat targets one, the instance's otherwise.
  const agentName = profile
    ? (expert?.displayName ?? expertDisplayName(profile))
    : instance?.name?.trim() || agentId;
  // The avatar shown in the header, the welcome and beside each reply.
  const face = profile ? { displayName: agentName, photoUrl: expert?.photoUrl ?? null, gateway: null } : null;
  // "Son ordinateur" needs the screen the yelema-hermes image streams; other instances have none.
  const hasComputer = Boolean(profile) && (instance?.template ?? "").startsWith("yelema-hermes");

  return (
    <div className="flex h-full min-h-0">
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col wide:min-w-[400px]" {...att.dragHandlers}>
      {att.dragOver && <DropOverlay label="Déposez vos fichiers pour les joindre" />}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          {face && <ExpertAvatar expert={face} size="sm" />}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">{headerTitle}</h1>
            <p className="truncate text-xs text-muted-foreground">{agentName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {hasComputer && <ComputerButton />}
        <button
          type="button"
          onClick={startNewChat}
          aria-label="Nouvelle discussion"
          title="Nouvelle discussion"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        </div>
      </header>
      {/* Top: scrolling transcript when there are messages; the centered welcome heading when
          empty (justify-end seats it just above the composer). */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn(
          "min-h-0",
          showWelcome ? "flex flex-1 flex-col items-center justify-end px-4 pb-4" : "flex-1 overflow-y-auto"
        )}
      >
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length > 0 ? (
          <ChatMessages messages={messages} isStreaming={isStreaming} face={face} />
        ) : (
          <>
            {face && <ExpertAvatar expert={face} size="lg" className="mb-4" />}
          <h1 className="text-center text-[26px] font-semibold tracking-tight text-foreground sm:text-[30px]">
            {profile ? `Que voulez-vous confier à ${agentName} ?` : "Que puis-je faire pour vous ?"}
          </h1>
            {expert?.tagline && <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">{expert.tagline}</p>}
          </>
        )}
      </div>

      {/* Composer wrapper — the STABLE 2nd child. Its chrome (docked vs bare centered) is a
          className swap so the ChatComposer inside never changes tree position. */}
      <div className={cn("relative", showWelcome ? "w-full px-6 md:px-10" : "bg-background px-6 py-3 md:px-10 sm:py-4")}>
        {/* No hard divider — a short fade dissolves the transcript into the composer instead. */}
        {!showWelcome && (
          <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent" />
        )}
        <div className={cn("mx-auto w-full", showWelcome ? "max-w-2xl" : "max-w-3xl")} aria-live="polite">
          {error && <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
        <ChatComposer
          agentId={agentId}
          isStreaming={isStreaming}
          att={att}
          onSend={send}
          onStop={stop}
          large={showWelcome}
          focusToken={composerFocusToken}
        />
      </div>

      {/* Bottom: balances the vertical centering and carries the welcome subtitle. */}
      {showWelcome && (
        <div className="flex flex-1 flex-col items-center px-4 pt-3">
          <p className="text-sm text-muted-foreground">
            Plus vous donnez de contexte, meilleure sera la réponse.
          </p>
        </div>
      )}
    </div>
      {hasComputer && (
        <>
          <ComputerPanel expert={{ name: agentName }} busy={isStreaming} onTakeOver={stop} />
          <ComputerDialog expert={{ name: agentName }} busy={isStreaming} onTakeOver={stop} onWrite={requestComposerFocus} />
        </>
      )}
    </div>
  );
}
