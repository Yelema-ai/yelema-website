"use client";

import { useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getExpert } from "@/config/experts";
import { DropOverlay } from "@/components/DropOverlay";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";
import { ChatComposer } from "./ChatComposer";
import { ChatMessages } from "./ChatMessages";
import { useChatContext } from "./ChatProvider";
import { useChat } from "./useChat";
import { useChatAttachments } from "./useChatAttachments";

// Prompts for the business chat's empty state.
const BUSINESS_SUGGESTIONS = [
  "Rédige un e-mail de relance client",
  "Résume ce document",
  "Prépare l’ordre du jour de la réunion",
  "Traduis ce texte en anglais",
];

// The conversation pane. Empty state = a centered welcome (heading, composer, suggestion chips);
// once there are messages it becomes a scrolling transcript with the composer docked at the
// bottom. The composer keeps a STABLE position in the tree across both states so the draft survives
// the first send. `initialMessage` (from the home page's "Demander à mon équipe") is sent once.
export function ChatView({ initialMessage }: { initialMessage?: string | null }) {
  const {
    agentId,
    profile,
    activeSessionId,
    composerFocusToken,
    requestComposerFocus,
    startNewChat,
    onSessionCreated,
    registerRunKiller,
    bumpSession,
  } = useChatContext();
  const expert = getExpert(profile);
  const { messages, isStreaming, loadingHistory, error, send, stop, killRun } = useChat({
    agentId,
    profile,
    sessionId: activeSessionId,
    onSessionCreated,
    onActivity: bumpSession,
  });

  useEffect(() => registerRunKiller(killRun), [registerRunKiller, killRun]);

  const att = useChatAttachments(agentId, requestComposerFocus);
  const { clearFiles } = att;
  useEffect(() => {
    clearFiles();
  }, [activeSessionId, clearFiles]);

  // Send the home page's message once, on a fresh chat, then drop it from the URL.
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
  const stickRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingHistory]);

  const showWelcome = !loadingHistory && messages.length === 0;
  const suggestions = expert?.suggestions ?? BUSINESS_SUGGESTIONS;
  const placeholder = expert ? `Écrire à ${expert.name}` : "Écrire un message";

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...att.dragHandlers}>
      {att.dragOver && <DropOverlay label="Déposez les fichiers à joindre" />}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {expert && <ExpertAvatar expertKey={expert.key} size={32} />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{expert ? expert.name : "Chat entreprise"}</p>
            <p className="truncate text-xs text-ink-3">{expert ? expert.role : "Une IA généraliste pour toute l’équipe"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-soft"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nouvelle conversation</span>
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn("min-h-0", showWelcome ? "flex flex-1 flex-col items-center justify-end px-4 pb-5" : "flex-1 overflow-y-auto")}
      >
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center text-ink-3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length > 0 ? (
          <ChatMessages messages={messages} isStreaming={isStreaming} expertKey={expert?.key} />
        ) : (
          <div className="flex flex-col items-center text-center">
            {expert && <ExpertAvatar expertKey={expert.key} size={72} className="mb-4" />}
            <h1 className="font-display text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
              {expert ? `Que voulez-vous confier à ${expert.name} ?` : "Que puis-je faire pour vous ?"}
            </h1>
            {expert && <p className="mt-2 max-w-md text-sm text-ink-3">{expert.tagline}</p>}
          </div>
        )}
      </div>

      <div className={cn("relative", showWelcome ? "w-full px-4 sm:px-6" : "px-4 py-3 sm:px-6")}>
        <div className={cn("mx-auto w-full", showWelcome ? "max-w-2xl" : "max-w-3xl")} aria-live="polite">
          {error && <p className="mb-2 rounded-xl bg-ko-pale px-3 py-2 text-[13px] text-ko">{error}</p>}
        </div>
        <ChatComposer
          isStreaming={isStreaming}
          att={att}
          onSend={send}
          onStop={stop}
          placeholder={placeholder}
          large={showWelcome}
          focusToken={composerFocusToken}
        />
      </div>

      {showWelcome && (
        <div className="flex flex-1 flex-wrap content-start justify-center gap-2 px-4 pt-4">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-dashed border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-brand/30 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
