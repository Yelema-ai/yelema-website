"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { stepDone } from "@/lib/tool-steps";
import type { ToolEvent } from "./types";

// How long a turn runs before the member is told they may leave: the reply reaches them anyway.
const LONG_WAIT_MS = 30_000;

// While the expert answers: the three dots, and one quiet line saying what it does: it reads the
// message, then its latest step. A long turn adds one line, no more (Leslie, 27/10: light, no
// timer, no list). The wait counts from `since`, the member's message, so a line that comes and
// goes during the turn (a thought, a sentence before a tool) does not start it again.
export function LiveWait({ tools, name, since }: { tools: ToolEvent[]; name: string | null; since?: number }) {
  const [long, setLong] = useState(false);
  useEffect(() => {
    const left = LONG_WAIT_MS - (since ? Date.now() - since : 0);
    if (left <= 0) {
      setLong(true);
      return;
    }
    const t = setTimeout(() => setLong(true), left);
    return () => clearTimeout(t);
  }, [since]);
  const current = tools.findLast((t) => t.status === "running") ?? tools.at(-1);
  const doing = current?.phrase ?? "Lit votre message";
  const line = name ? `${name} ${doing.charAt(0).toLowerCase()}${doing.slice(1)}` : doing;
  return (
    <div className="mb-2" aria-live="polite">
      <p className="flex items-center gap-2.5 py-1 text-sm text-ink-3">
        <TypingDots />
        <span className="truncate">{line.replace(/…$/, "")}</span>
      </p>
      {long && <p className="mt-0.5 text-[13px] text-ink-3">Vous serez prévenu dès que c’est prêt.</p>}
    </div>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-ink-3">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

// Once the answer is done: the steps it took, folded by default.
export function StepsList({ tools }: { tools: ToolEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-ink-3 transition-colors hover:text-ink"
      >
        <ListChecks className="h-3.5 w-3.5" />
        Étapes ({tools.length})
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="mt-1 space-y-1 border-l-2 border-line pl-3">
          {tools.map((t, k) => (
            <li key={`${t.tool}-${k}`} className="flex items-center gap-2 text-xs text-ink-2">
              {t.status === "error" ? <X className="h-3.5 w-3.5 shrink-0 text-ko" /> : <Check className="h-3.5 w-3.5 shrink-0 text-ok" />}
              <span className="truncate">{stepDone(t.phrase)}</span>
              {t.durationMs != null && <span className="ml-auto tabular-nums text-ink-3">{(t.durationMs / 1000).toFixed(1)} s</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
