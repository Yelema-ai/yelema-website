"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { useTurnReporter } from "@/components/activity/hooks";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api";
import { responsePath } from "@/lib/api-paths";
import { answerOutcome, autoApproves, type ApprovalChoice } from "@/lib/approval";
import { splitSSE } from "@/lib/activity";
import { isDialogSend } from "@/lib/send-accounts";
import { answered, askApproval, SEND_START, sendEvent, type SendTurn } from "@/lib/send-turn";
import { GENERIC_STEP, toolPhrase } from "@/lib/tool-steps";
import type { Expert } from "@/lib/types";

// « Envoyer » on a deliverable, followed where it was asked (Leslie and Djénéba, 26/11: the agreement used to
// arrive in a new conversation nobody knew about). The turn runs in its own conversation as before; the window
// shows its progress, the e-mail to agree to when the expert asks, and the result. Closed before the end, the
// turn is handed to the activity provider: the bell and the toasts take over.
export function FileSend({
  agentId,
  profileId,
  expert,
  text,
  onOpenConversation,
}: {
  agentId: string;
  profileId: string;
  expert: Pick<Expert, "displayName" | "gateway" | "photoUrl">;
  /** The instruction the « Envoyer » window wrote (`sendFilesText`): its click is the member's yes. */
  text: string;
  onOpenConversation: (sessionId: string | null) => void;
}) {
  const [turn, setTurn] = useState<SendTurn>(SEND_START);
  const [error, setError] = useState<string | null>(null);
  const reporter = useTurnReporter(agentId, profileId);
  const live = useRef({ sessionId: null as string | null, responseId: null as string | null, assistant: { content: "" }, done: false });

  useEffect(() => {
    const run = live.current;
    const abort = new AbortController();
    let state = SEND_START;
    const apply = (next: SendTurn) => {
      state = next;
      run.sessionId = next.sessionId;
      run.responseId = next.responseId;
      run.assistant.content = next.text;
      setTurn(next);
    };
    const give = (requestId: string, choice: ApprovalChoice) =>
      fetch(responsePath(agentId, state.responseId!, "approval"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, choice }),
      }).then((r) => answerOutcome(r.status), () => "error" as const);

    // Started on the next task: React's development double run cancels the timer, so one turn only leaves.
    let begun = false;
    const timer = setTimeout(() => void (async () => {
      begun = true;
      reporter.start(run);
      try {
        const res = await fetch(`/api/agents/${agentId}/chat/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: text, profile: profileId, client_message_id: `send-${Date.now().toString(36)}` }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(await readApiError(res, "L’envoi n’a pas pu commencer."));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const { events, rest } = splitSSE(buffer + decoder.decode(value, { stream: true }));
          buffer = rest;
          for (const { event, data } of events) {
            if (event === "response.approval_requested") {
              const asked = askApproval(state, data);
              if (!asked.approval) continue;
              // The window named the recipients and the account: a plain send to them needs no second yes (Leslie, 17/11).
              if (autoApproves([text], asked.approval.message, isDialogSend)) {
                const outcome = await give(asked.approval.requestId, "once");
                apply(outcome === "error" ? asked : answered(asked));
              } else {
                apply(asked);
                // In the bell too: the window may be closed before the answer.
                reporter.asked(run, asked.approval, true);
              }
              continue;
            }
            const next = sendEvent(state, event, data);
            if (event === "response.created") {
              apply(next);
              reporter.bind(run);
              continue;
            }
            if (event === "response.tool_call.started") {
              const args = data.arguments && typeof data.arguments === "object" ? (data.arguments as Record<string, unknown>) : undefined;
              apply({ ...next, step: toolPhrase(typeof data.tool === "string" ? data.tool : "tool", args) });
              continue;
            }
            apply(next);
          }
          if (state.phase === "sent" || state.phase === "failed") break;
        }
        run.done = true;
        if (state.phase === "sent") reporter.end(run, "completed");
        else if (state.phase === "failed") reporter.end(run, "failed");
        // A stream cut before the end: the turn goes on, the activity provider follows it.
        else reporter.detach(run);
      } catch (e) {
        if (abort.signal.aborted) return;
        run.done = true;
        reporter.cancel(run);
        setError((e as Error).message || "L’envoi n’a pas pu commencer.");
      }
    })(), 0);
    return () => {
      clearTimeout(timer);
      // The window closes on a turn still running: the provider takes it over (bell, toasts).
      if (begun && !run.done) {
        abort.abort();
        reporter.detach(run);
      }
    };
    // Started once, with the text the window wrote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = async (choice: ApprovalChoice) => {
    const a = turn.approval;
    if (!a || !turn.responseId) return;
    setTurn(answered(turn));
    reporter.settled(a.requestId);
    const res = await fetch(responsePath(agentId, turn.responseId, "approval"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: a.requestId, choice }),
    }).catch(() => null);
    if (!res || answerOutcome(res.status) === "error") setTurn((t) => ({ ...t, approval: a, phase: "waiting" }));
  };

  const name = expert.displayName;
  const phase = error ? "failed" : turn.phase;
  return (
    <section aria-live="polite" className="basis-full rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <ExpertAvatar expert={expert} size="sm" />
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          {(phase === "starting" || phase === "working") && (
            <p className="flex items-center gap-2 text-ink-2">
              <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
              <span>
                <b className="font-semibold text-ink">{name}</b> prépare l’envoi. {turn.step ?? GENERIC_STEP}
              </span>
            </p>
          )}
          {phase === "waiting" && (
            <p className="text-ink-2">
              <b className="font-semibold text-ink">{name}</b> attend votre accord, ici.
            </p>
          )}
          {phase === "sent" && (
            <div>
              <p className="flex items-center gap-2 font-semibold text-ink">
                <CheckCircle2 className="size-4 shrink-0 text-ok" />
                C’est fait
              </p>
              {turn.text && <p className="mt-1 line-clamp-4 whitespace-pre-line text-ink-2">{turn.text}</p>}
            </div>
          )}
          {phase === "failed" && (
            <p className="flex items-start gap-2 text-ink-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ko" />
              {error ?? `${name} n’a pas pu terminer l’envoi.`}
            </p>
          )}
        </div>
      </div>
      {turn.approval && (
        <ApprovalCard
          approval={{ ...turn.approval, choices: ["once", "deny"], state: "pending" }}
          onAnswer={(c) => void answer(c)}
          onModify={() => onOpenConversation(turn.sessionId)}
        />
      )}
      {(phase === "sent" || phase === "failed" || phase === "waiting") && turn.sessionId && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onOpenConversation(turn.sessionId)}>
          <MessageSquare className="h-4 w-4" />
          Voir la conversation
        </Button>
      )}
    </section>
  );
}
