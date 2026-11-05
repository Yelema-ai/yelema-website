"use client";

import { useMemo, useRef, useState } from "react";
import { AtSign, CornerDownRight, Loader2, Send, X } from "lucide-react";
import { mentionsIn, TOKEN, type Candidate } from "@/lib/buzz-mentions";
import { fold } from "@/lib/fold";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";

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

  // Le bouton « @ » : le signe posé au curseur, la liste ouverte, comme si on l'avait tapé.
  function startMention() {
    const el = area.current;
    const caret = el?.selectionStart ?? draft.length;
    const lead = caret > 0 && !/\s/.test(draft[caret - 1]) ? " " : "";
    const next = draft.slice(0, caret) + lead + "@" + draft.slice(caret);
    const at = caret + lead.length + 1;
    track(next, at);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
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
    <form onSubmit={(e) => void submit(e)} className="relative space-y-2 border-t border-line px-3 py-3 sm:pl-4 sm:pr-24">
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
                <ParticipantAvatar entry={c.entry} name={c.handle} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.handle}</span>
                <span className="shrink-0 text-xs text-ink-3">{c.mine ? "Votre Expert IA" : c.entry.type === "expert" ? "Expert IA" : "Membre de l’équipe"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="@container rounded-[22px] border border-line bg-surface shadow-[0_8px_30px_rgb(48_22_103_/_0.06)] transition-[border-color,box-shadow] focus-within:border-brand/30">
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
          rows={1}
          maxLength={8000}
          placeholder="Écrire un message"
          className="block max-h-[180px] min-h-[44px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15px] leading-relaxed text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          {/* « @ » : demander à vos Experts (ils travaillent) ou prévenir quelqu'un ; un clic ouvre la liste. */}
          <button
            type="button"
            onClick={startMention}
            disabled={!candidates.length}
            title={candidates.some((c) => c.mine) ? "Demander à vos Experts" : "Mentionner quelqu’un"}
            aria-label={candidates.some((c) => c.mine) ? "Demander à vos Experts" : "Mentionner quelqu’un"}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold text-ink-2 hover:bg-soft hover:text-ink disabled:opacity-40"
          >
            <AtSign className="size-4" />
            <span className="@max-md:sr-only">{candidates.some((c) => c.mine) ? "Demander à vos Experts" : "Mentionner"}</span>
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Envoyer"
            title="Envoyer"
            className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40 @max-xl:w-10 @max-xl:justify-center @max-xl:rounded-full @max-xl:px-0"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="@max-xl:sr-only">Envoyer</span>
          </button>
        </div>
      </div>
    </form>
  );
}
