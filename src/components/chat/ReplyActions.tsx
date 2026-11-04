"use client";

import { cn } from "@/lib/utils";
import { choiceMessage, type ReplyChoice } from "@/lib/reply-parts";

// The question an expert ends on, answered in one click. The note under it is the expert's own.
export function ReplyChoices({ choices, note, onSend }: { choices: ReplyChoice[]; note: string | null; onSend: (text: string) => void }) {
  return (
    <div className="mt-3" role="group" aria-label="Choisir une réponse">
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.letter}
            type="button"
            onClick={() => onSend(choiceMessage(c))}
            className={cn(
              "flex min-h-11 max-w-full items-center gap-2.5 rounded-xl border py-1.5 pl-2 pr-3.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              c.isDefault ? "border-brand/40 bg-tint text-brand hover:bg-brand/15" : "border-line bg-surface text-ink hover:bg-soft"
            )}
          >
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold", c.isDefault ? "bg-surface" : "bg-soft")}>{c.letter}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{c.label}</span>
            {c.isDefault && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold">par défaut</span>}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}
