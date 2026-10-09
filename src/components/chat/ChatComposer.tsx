"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachButton, AttachmentTray } from "./Attachments";
import { EffortMenu } from "./EffortMenu";
import { ModelMenu } from "./ModelMenu";
import type { ChatAttachments } from "./useChatAttachments";
import { useChatModels } from "./useChatModels";
import { useChatContext } from "./ChatProvider";
import { findModel, prettyModelLabel, type ChatSettings } from "./types";
import type { SendSettings } from "./useChat";

interface Props {
  agentId: string;
  isStreaming: boolean;
  // Attachment state is owned by ChatView (so the whole pane is a drop zone) and passed in.
  att: ChatAttachments;
  onSend: (text: string, settings: SendSettings) => void;
  onStop: () => void;
  // Prominent welcome-state composer (vs the compact docked composer).
  large?: boolean;
  focusToken?: number;
}

export function ChatComposer({ agentId, isStreaming, att, onSend, onStop, large = false, focusToken = 0 }: Props) {
  const [text, setText] = useState("");
  // model + provider are always chosen together (one selection); effort is independent. Group
  // them as the composer's outgoing ChatSettings so send is just `{ ...settings, files }`.
  const [settings, setSettings] = useState<ChatSettings>({ model: null, provider: null, reasoningEffort: null });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Each expert's profile has its own model configuration.
  const { profile } = useChatContext();
  const { groups, defaultModel, loading } = useChatModels(agentId, profile);

  useEffect(() => {
    if (focusToken === 0) return;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusToken]);

  // The model switcher is a persistent control, shown once the instance reports at least one model
  // (the older metered gateway exposes a single "default"; current builds expose the full catalog).
  // It stays hidden until the list resolves and hides if the call returns nothing (e.g. fetch
  // failed) — the agent default still runs, and there's no appear-then-vanish flicker. Every group
  // carries at least one model (useChatModels only creates a group when it has one), so a non-empty
  // `groups` is exactly "has models".
  const defaultLabel = useMemo(() => {
    const def = findModel(groups, defaultModel);
    return def ? prettyModelLabel(def.label) : loading ? "Loading…" : "Default";
  }, [groups, defaultModel, loading]);

  const canSend = (text.trim().length > 0 || att.hasFiles) && !att.blocksSend && !isStreaming;

  const grow = (el: HTMLTextAreaElement) => {
    const minHeight = large ? 76 : 44;
    const maxHeight = 180;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
  };

  const submit = () => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if ((!trimmed && !att.hasFiles) || att.blocksSend) return;
    const attachments = att.takeAttachments();
    onSend(trimmed, { ...settings, files: attachments.map((a) => a.path), attachments });
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "mx-auto w-full rounded-[22px] border border-line bg-surface shadow-[0_8px_30px_rgb(48_22_103_/_0.06)] transition-[border-color,box-shadow] focus-within:border-brand/30",
        large ? "max-w-2xl" : "max-w-3xl"
      )}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          grow(e.target);
        }}
        onKeyDown={onKeyDown}
        onPaste={att.handlePaste}
        rows={1}
        placeholder="Écrivez votre message…"
        className={cn(
          "w-full resize-none bg-transparent px-5 pb-2 pt-4 text-ink placeholder:text-ink-3 focus:outline-none",
          large ? "min-h-[76px] max-h-[180px] text-[15px] leading-6" : "min-h-[44px] max-h-[180px] text-[15px] leading-relaxed"
        )}
      />
      <AttachmentTray files={att.files} onRemove={att.removeFile} onRetry={att.retryFile} />
      <div className="flex items-center gap-2 px-3 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <AttachButton onFiles={att.addFiles} disabled={isStreaming} />
          {groups.length > 0 && (
            <ModelMenu
              groups={groups}
              model={settings.model}
              defaultModel={defaultModel}
              defaultLabel={defaultLabel}
              disabled={isStreaming}
              onChange={(model, provider) => setSettings((s) => ({ ...s, model, provider }))}
            />
          )}
          <EffortMenu
            value={settings.reasoningEffort}
            disabled={isStreaming}
            onChange={(reasoningEffort) => setSettings((s) => ({ ...s, reasoningEffort }))}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg hover:opacity-90"
            >
              <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} /> Arrêter
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {att.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
