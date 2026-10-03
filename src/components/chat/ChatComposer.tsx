"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachButton, AttachmentTray } from "./Attachments";
import type { ChatAttachments } from "./useChatAttachments";
import type { SendSettings } from "./useChat";

interface Props {
  isStreaming: boolean;
  // Attachment state is owned by ChatView (so the whole pane is a drop zone) and passed in.
  att: ChatAttachments;
  onSend: (text: string, settings: SendSettings) => void;
  onStop: () => void;
  placeholder: string;
  // Prominent welcome-state composer (vs the compact docked composer).
  large?: boolean;
  focusToken?: number;
}

export function ChatComposer({ isStreaming, att, onSend, onStop, placeholder, large = false, focusToken = 0 }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusToken === 0) return;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusToken]);

  const canSend = (text.trim().length > 0 || att.hasFiles) && !att.blocksSend && !isStreaming;

  const grow = (el: HTMLTextAreaElement) => {
    const minHeight = large ? 76 : 44;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, 180))}px`;
  };

  const submit = () => {
    if (!canSend) return;
    const attachments = att.takeAttachments();
    onSend(text.trim(), { files: attachments.map((a) => a.path), attachments });
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
        placeholder={placeholder}
        className={cn(
          "w-full resize-none bg-transparent px-5 pb-2 pt-4 text-ink placeholder:text-ink-3 focus:outline-none",
          large ? "min-h-[76px] max-h-[180px] text-[15px] leading-6" : "min-h-[44px] max-h-[180px] text-[15px] leading-relaxed"
        )}
      />
      <AttachmentTray files={att.files} onRemove={att.removeFile} onRetry={att.retryFile} />
      <div className="flex items-center gap-2 px-3 pb-3">
        <AttachButton onFiles={att.addFiles} disabled={isStreaming} />
        <div className="ml-auto">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} /> Arrêter
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40"
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
