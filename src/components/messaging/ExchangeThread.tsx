"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownRight, Loader2, MessagesSquare } from "lucide-react";
import type { BuzzEntry } from "@/lib/buzz";
import type { Conversation, Message } from "@/lib/buzz-relay";
import { cn } from "@/lib/utils";
import type { Candidate } from "@/lib/buzz-mentions";
import { MentionComposer } from "@/components/messaging/MentionComposer";
import { SalonDeliverables } from "@/components/messaging/SalonDeliverables";

// Le fil d'un échange, comme le chat d'un Expert (l'en-tête et ses onglets sont dans ExchangeHeader) : messages,
// « … travaille » pour vos Experts sollicités, saisie avec « @ ».

const moment = (seconds: number) => new Date(seconds * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface ThreadProps {
  current: Conversation | null;
  salon: boolean;
  pane: "fil" | "livrables";
  thread: Message[] | null;
  mine: string[];
  labels: Map<string, string>;
  busy: BuzzEntry[];
  candidates: Candidate[];
  sending: boolean;
  onSend: (text: string, mentions: string[], replyTo: string | null) => Promise<boolean>;
}

export function ExchangeThread(p: ThreadProps) {
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const id = p.current?.id;

  useEffect(() => {
    setReplyTo(null);
  }, [id]);
  // Bloc, pas expression : scrollIntoView renvoie désormais une promesse, que React prendrait pour un nettoyage.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [p.thread?.length, p.busy.length]);

  if (!p.current)
    return (
      <div className="m-auto p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><MessagesSquare className="h-6 w-6" /></span>
        <h2 className="mt-3 text-base font-semibold text-ink">Choisissez un échange</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">« Message » écrit à une personne ou à ses Experts ; « Salon » ouvre un espace nommé à plusieurs, où vos Experts travaillent quand vous les mentionnez avec « @ ».</p>
      </div>
    );

  const nameOf = (k: string) => (p.mine.includes(k) ? "Vous" : (p.labels.get(k) ?? "Membre inconnu"));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {p.pane === "livrables" && p.salon ? (
        <SalonDeliverables salon={p.current.id} />
      ) : (
        <>
          <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-busy={p.thread === null}>
            {p.thread === null && <li className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</li>}
            {p.thread?.length === 0 && <li className="text-sm text-ink-3">Aucun message pour l’instant.</li>}
            {p.thread?.map((m) => {
              const own = p.mine.includes(m.author);
              return (
                <li key={m.id} className={cn("group flex flex-col", own ? "items-end" : "items-start", m.replyTo && "pl-8")}>
                  <div className={cn("flex items-baseline gap-2", own && "flex-row-reverse")}>
                    {m.replyTo && <CornerDownRight className="h-3.5 w-3.5 shrink-0 self-center text-ink-3" />}
                    <span className="text-[13px] font-semibold text-ink">{nameOf(m.author)}</span>
                    <time className="text-[11.5px] text-ink-3">{moment(m.at)}</time>
                    <button type="button" onClick={() => setReplyTo(m)} className="rounded-md px-2 py-0.5 text-xs font-semibold text-ink-2 opacity-0 hover:bg-soft focus-visible:opacity-100 group-hover:opacity-100">
                      Répondre
                    </button>
                  </div>
                  <div className={cn("mt-1 max-w-[min(680px,90%)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink", own ? "rounded-tr-md bg-tint" : "rounded-tl-md border border-line bg-surface")}>{m.text}</div>
                </li>
              );
            })}
            {p.busy.map((e) => (
              <li key={`busy-${e.nom}`} className="flex items-center gap-2 text-sm text-ink-3" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> {e.nom.replace(/ \(de .*\)$/, "")} travaille…
              </li>
            ))}
            <li ref={end} aria-hidden />
          </ol>
          <MentionComposer
            candidates={p.candidates}
            replyTo={replyTo ? `Réponse à ${nameOf(replyTo.author)} : « ${replyTo.text} »` : null}
            onCancelReply={() => setReplyTo(null)}
            sending={p.sending}
            onSend={async (text, mentions) => {
              const ok = await p.onSend(text, mentions, replyTo?.id ?? null);
              if (ok) setReplyTo(null);
              return ok;
            }}
          />
        </>
      )}
    </div>
  );
}
