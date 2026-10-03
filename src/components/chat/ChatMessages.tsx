"use client";

import { useState } from "react";
import { Check, ChevronDown, FileText, Image as ImageIcon, ListChecks, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";
import { Markdown } from "./Markdown";
import type { ChatMessage, MessageAttachment, ToolEvent } from "./types";

// Files that rode along with a user turn, shown as compact chips above the message bubble.
function MessageAttachments({ attachments }: { attachments: MessageAttachment[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {attachments.map((a, k) => (
        <span
          key={`${a.path}-${k}`}
          title={a.name}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
        >
          {a.isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ink-3" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
          <span className="max-w-[12rem] truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

function prettyTool(tool: ToolEvent): string {
  return tool.label || tool.tool.replace(/_/g, " ");
}

// The agent's tool calls, folded into one "N étapes faites" line (the mockup's step summary).
function Steps({ tools, live }: { tools: ToolEvent[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "running");
  const done = tools.filter((t) => t.status !== "running").length;
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink"
      >
        {running && live ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <ListChecks className="h-4 w-4 text-ink-3" />}
        {running && live ? `Au travail… ${done} étape${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""}` : `${tools.length} étape${tools.length > 1 ? "s" : ""} faite${tools.length > 1 ? "s" : ""}`}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="space-y-1 border-t border-line px-3 py-2">
          {tools.map((t, k) => (
            <li key={`${t.tool}-${k}`} className="flex items-center gap-2 text-xs text-ink-2">
              {t.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : t.status === "error" ? (
                <X className="h-3.5 w-3.5 shrink-0 text-ko" />
              ) : (
                <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
              )}
              <span className="truncate">{prettyTool(t)}</span>
              {t.durationMs != null && <span className="ml-auto tabular-nums text-ink-3">{(t.durationMs / 1000).toFixed(1)} s</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2 text-ink-3">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

export function ChatMessages({
  messages,
  isStreaming,
  expertKey,
  agentId,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  // Turns the drive paths experts mention into download links.
  agentId: string;
  // Shows the expert's face beside their replies; omitted for the business chat.
  expertKey?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {messages.map((m, i) => {
        if (m.role === "user") {
          const attachments = m.attachments ?? [];
          return (
            <div key={m.id} className="flex justify-end">
              <div className="flex max-w-[85%] flex-col items-end gap-1.5">
                {attachments.length > 0 && <MessageAttachments attachments={attachments} />}
                {m.content && (
                  <div className="whitespace-pre-wrap break-words rounded-[18px] rounded-br-md bg-brand px-4 py-2.5 text-[15px] text-on-brand">
                    {m.content}
                  </div>
                )}
              </div>
            </div>
          );
        }

        const lastAssistant = i === messages.length - 1 && m.role === "assistant";
        const live = lastAssistant && isStreaming;
        const tools = m.tools ?? [];
        const showDots = live && !m.content && !tools.some((t) => t.status === "running");

        return (
          <div key={m.id} className="flex items-start gap-3">
            {expertKey && <ExpertAvatar expertKey={expertKey} size={32} className="mt-0.5" />}
            <div className="min-w-0 max-w-full flex-1 text-[15px] text-ink">
              {tools.length > 0 && <Steps tools={tools} live={live} />}
              {m.content ? <Markdown content={m.content} agentId={agentId} /> : showDots ? <TypingDots /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
