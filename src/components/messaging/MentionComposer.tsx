"use client";

import { useMemo, useRef, useState } from "react";
import { CornerDownRight, Loader2, MessagesSquare, Send, User, X } from "lucide-react";
import { mentionsIn, TOKEN, type Candidate } from "@/lib/buzz-mentions";
import { fold } from "@/lib/fold";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// La saisie d'un échange : « @ » ouvre la liste des participants. Vos Experts y sont en tête : mentionnés, ils
// travaillent ; une personne ou l'Expert d'un collègue mentionné est seulement prévenu.

export function MentionComposer({ candidates, replyTo, onCancelReply, sending, onSend }: { candidates: Candidate[]; replyTo: string | null; onCancelReply: () => void; sending: boolean; onSend: (text: string, mentions: string[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);

  const shown = useMemo(() => (query === null ? [] : candidates.filter((c) => fold(c.handle).includes(fold(query))).slice(0, 8)), [candidates, query]);

  function track(value: string, caret: number) {
    setDraft(value);
    const m = TOKEN.exec(value.slice(0, caret));
    setQuery(m ? (m[2] ?? "") : null);
    setActive(0);
  }

  function choose(c: Candidate) {
    const el = area.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(TOKEN, (_all, lead: string) => `${lead}@${c.handle} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setPicked((p) => (p.some((x) => x.handle === c.handle) ? p : [...p, c]));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (await onSend(text, mentionsIn(text, picked))) {
      setDraft("");
      setPicked([]);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="relative space-y-2 border-t border-line p-4">
      {replyTo && (
        <div className="flex items-center gap-2 rounded-lg bg-soft px-2.5 py-1.5 text-xs text-ink-2">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{replyTo}</span>
          <button type="button" aria-label="Annuler la réponse" onClick={onCancelReply}><X className="h-3 w-3" /></button>
        </div>
      )}
      {shown.length > 0 && (
        <ul role="listbox" aria-label="Mentionner" className="absolute bottom-full left-4 z-20 mb-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {shown.map((c, i) => (
            <li key={c.handle} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(c); }} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", i === active ? "bg-soft" : "hover:bg-soft")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", c.entry.type === "expert" ? "bg-tint text-brand" : "bg-soft-2 text-ink-2")}>
                  {c.entry.type === "expert" ? <MessagesSquare className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.handle}</span>
                <span className="shrink-0 text-xs text-ink-3">{c.mine ? "Votre Expert" : c.entry.type === "expert" ? "Expert" : "Personne"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Label htmlFor="echange-message" className="sr-only">Message</Label>
        <textarea
          id="echange-message"
          ref={area}
          value={draft}
          onChange={(e) => track(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (shown.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
            } else if (shown.length && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              const c = shown[active];
              if (c) choose(c);
            } else if (shown.length && e.key === "Escape") {
              setQuery(null);
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          maxLength={8000}
          placeholder={candidates.some((c) => c.mine) ? "Écrire un message · @ pour demander à vos Experts" : "Écrire un message · @ pour mentionner"}
          className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface p-3 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
        />
        <Button type="submit" disabled={!draft.trim() || sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Envoyer
        </Button>
      </div>
    </form>
  );
}
