"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";
import { choiceMessage, MAX_CHOICE_BUTTONS, type ReplyChoice } from "@/lib/reply-parts";

// The question an expert ends on, answered in one click. The note under it is the expert's own.
export function ReplyChoices({ choices, note, onSend }: { choices: ReplyChoice[]; note: string | null; onSend: (text: string) => void }) {
  if (choices.length > MAX_CHOICE_BUTTONS) return <ReplyChoiceList choices={choices} note={note} onSend={onSend} />;
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
            <ChoiceLabel label={c.label} />
            {c.isDefault && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold">{c.mark ?? "par défaut"}</span>}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}

// « Notion ou Slack : vos Experts suivent vos projets » : the choice in bold, its explanation lighter.
function ChoiceLabel({ label }: { label: string }) {
  const cut = label.indexOf(" : ");
  if (cut < 1) return <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>;
  return (
    <span className="min-w-0 [overflow-wrap:anywhere]">
      {label.slice(0, cut)}
      <span className="block text-[12.5px] font-normal leading-snug text-ink-3">{label.slice(cut + 3)}</span>
    </span>
  );
}

// Many choices (« Par quel Expert commencer ? »): one list of our own, the recommended one picked, then « Valider ».
function ReplyChoiceList({ choices, note, onSend }: { choices: ReplyChoice[]; note: string | null; onSend: (text: string) => void }) {
  const [picked, setPicked] = useState(() => (choices.find((c) => c.isDefault) ?? choices[0]).letter);
  const chosen = choices.find((c) => c.letter === picked) ?? choices[0];
  return (
    <div className="mt-3" role="group" aria-label="Choisir une réponse">
      <div className="flex flex-wrap items-center gap-2">
        <Picker
          value={picked}
          onChange={setPicked}
          label="Votre choix"
          placeholder="Choisir"
          className="min-w-[14rem] flex-1 sm:flex-none"
          groups={[{ options: choices.map((c) => ({ value: c.letter, label: c.isDefault ? `${c.label} (${c.mark ?? "par défaut"})` : c.label })) }]}
        />
        <button
          type="button"
          onClick={() => onSend(choiceMessage(chosen))}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 sm:h-9"
        >
          Valider
          <ArrowRight className="size-4" />
        </button>
      </div>
      {note && <p className="mt-2 text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}
