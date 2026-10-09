"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Image as ImageIcon, ListChecks, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import type { Expert } from "@/lib/types";
import { useChatContext } from "./ChatProvider";
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
          {a.isImage ? (
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          )}
          <span className="max-w-[12rem] truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

function ThinkingBlock({ content, live }: { content: string; live: boolean }) {
  const [open, setOpen] = useState(live);
  if (!content) return null;
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs text-ink-3 transition-colors hover:text-ink"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{live ? "Réflexion en cours…" : "Sa réflexion"}</span>
        {live && <Loader2 className="h-3 w-3 animate-spin" />}
      </button>
      {open && (
        <div className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-line pl-3 text-xs leading-relaxed text-ink-3">
          {content}
        </div>
      )}
    </div>
  );
}

function prettyTool(tool: ToolEvent): string {
  return tool.label || tool.tool.replace(/_/g, " ");
}

const steps = (n: number) => `${n} étape${n > 1 ? "s" : ""} faite${n > 1 ? "s" : ""}`;

// The agent's tool calls, folded into one "N étapes faites" line (the mockup's step summary).
function Steps({ tools, live }: { tools: ToolEvent[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const working = live && tools.some((t) => t.status === "running");
  const done = tools.filter((t) => t.status !== "running").length;
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink"
      >
        {working ? <Loader2 className="h-4 w-4 animate-spin text-brand-ink" /> : <ListChecks className="h-4 w-4 text-ink-3" />}
        {working ? `Au travail… ${steps(done)}` : steps(tools.length)}
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
        <span
          key={d}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

// `face` is the expert whose replies these are: its portrait sits beside each one. Null on the
// instance's default home, which has no persona.
export function ChatMessages({
  messages,
  isStreaming,
  face = null,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  face?: Pick<Expert, "displayName" | "photoUrl" | "gateway"> | null;
}) {
  // The instance whose drive the paths in a reply point into (they become download links).
  const { agentId } = useChatContext();
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
        const tools = m.tools ?? [];
        const showDots =
          lastAssistant && isStreaming && !m.content && !m.thinking && !tools.some((t) => t.status === "running");

        return (
          <div key={m.id} className="flex items-start gap-3">
            {face && <ExpertAvatar expert={face} size="xs" className="mt-0.5" />}
            <div className="min-w-0 max-w-full flex-1 text-[15px] text-ink">
              {m.thinking && <ThinkingBlock content={m.thinking} live={lastAssistant && isStreaming && !m.content} />}
              {tools.length > 0 && <Steps tools={tools} live={lastAssistant && isStreaming} />}
              {m.content ? <Markdown content={m.content} agentId={agentId} /> : showDots ? <TypingDots /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
