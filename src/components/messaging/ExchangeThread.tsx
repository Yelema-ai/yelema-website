"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownRight, Loader2, MessagesSquare, Reply } from "lucide-react";
import { shortName, startsRun, type BuzzEntry } from "@/lib/buzz";
import type { Conversation, Message } from "@/lib/buzz-relay";
import { cn } from "@/lib/utils";
import { BUBBLE, BUBBLE_ROW } from "@/lib/exchange-bubble";
import { replyMention, withReplyMention, type Candidate } from "@/lib/buzz-mentions";
import { excerpt } from "@/lib/activity";
import { Markdown } from "@/components/chat/Markdown";
import { ReplyChoices } from "@/components/chat/ReplyActions";
import { replyParts } from "@/lib/reply-parts";
import { MentionComposer } from "@/components/messaging/MentionComposer";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";
import { SalonDeliverables } from "@/components/messaging/SalonDeliverables";
import { SalonDocCards } from "@/components/messaging/SalonDocCards";
import { readSalonDeliverables, salonReadAt, useSalonDeliverables } from "@/components/messaging/salon-deliverables-store";
import { linkSalonPaths, salonDeliverableFor, salonPathsIn } from "@/lib/salon-deliverables";
import { SalonParticipants } from "@/components/messaging/SalonParticipants";

// Le fil d'un échange, comme le chat d'un Expert (l'en-tête et ses onglets sont dans ExchangeHeader) : messages,
// visage de l'auteur en tête de chaque suite, choix du dernier message en boutons (comme le chat d'un Expert), « … travaille » pour vos Experts sollicités, saisie avec « @ ».

const moment = (seconds: number) => new Date(seconds * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface ThreadProps {
  current: Conversation | null;
  salon: boolean;
  pane: "fil" | "livrables" | "participants";
  thread: Message[] | null;
  mine: string[];
  labels: Map<string, string>;
  directory: BuzzEntry[];
  failed: boolean;
  onRetry: () => void;
  busy: BuzzEntry[];
  candidates: Candidate[];
  sending: boolean;
  onSend: (text: string, mentions: string[], replyTo: Message | null) => Promise<boolean>;
}

export function ExchangeThread(p: ThreadProps) {
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const id = p.current?.id;
  const byKey = useMemo(() => new Map(p.directory.flatMap((e) => e.cles.map((k): [string, BuzzEntry] => [k, e]))), [p.directory]);

  useEffect(() => {
    setReplyTo(null);
  }, [id]);

  // Les fichiers du salon cités dans le fil : la liste des livrables n'est lue que s'il y en a (ou l'onglet ouvert).
  const salonId = p.salon ? (id ?? null) : null;
  const cited = useMemo(() => (salonId ? (p.thread ?? []).flatMap((m) => salonPathsIn(m.text, salonId).map((path) => ({ path, at: m.at }))) : []), [salonId, p.thread]);
  const livrables = useSalonDeliverables(salonId, p.pane === "livrables" || cited.length > 0);
  const items = livrables.items;
  // Un fichier cité après la dernière lecture, absent de la liste : relue une fois.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!salonId || !items) return;
    const late = cited.find((c) => !salonDeliverableFor(c.path, salonId, items) && c.at * 1000 > salonReadAt(salonId) && !asked.current.has(c.path));
    if (!late) return;
    asked.current.add(late.path);
    void readSalonDeliverables(salonId, 0).catch(() => undefined);
  }, [salonId, cited, items]);
  // Le texte de chaque lien vers son adresse ; deux fichiers du même nom gardent leur lien, sans raccourci.
  const links = useMemo(() => {
    const out = new Map<string, string | null>();
    if (!salonId || !items) return out;
    for (const m of p.thread ?? []) for (const [label, url] of linkSalonPaths(m.text, salonId, items).links) out.set(label, out.has(label) && out.get(label) !== url ? null : url);
    return out;
  }, [salonId, items, p.thread]);
  // Un lien vers un fichier du salon s'ouvre comme dans l'onglet Livrables, sans l'avertissement de site extérieur.
  const openCited = (e: React.MouseEvent) => {
    const el = (e.target as Element).closest?.("[data-streamdown=link]");
    const url = el ? links.get(el.textContent?.trim() ?? "") : undefined;
    if (!url) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  // Le fil descend seul à l'ouverture, à son propre message, ou quand on est déjà en bas ; quelqu'un qui
  // remonte lire un ancien message n'est jamais ramené en bas par un nouveau.
  const list = useRef<HTMLOListElement>(null);
  const atEnd = useRef(true);
  const opened = useRef<string | null>(null);
  const last = p.thread?.at(-1);
  useEffect(() => {
    if (!p.thread) return;
    const first = opened.current !== id;
    opened.current = id ?? null;
    if (first || atEnd.current || (last && p.mine.includes(last.author))) end.current?.scrollIntoView({ block: "end" });
  }, [id, p.thread, last, p.mine, p.busy.length]);

  if (!p.current)
    return (
      <div className="m-auto p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><MessagesSquare className="h-6 w-6" /></span>
        <h2 className="mt-3 text-base font-semibold text-ink">Choisissez un échange</h2>
        <ul className="mx-auto mt-3 max-w-sm space-y-2 text-left text-sm text-ink-3">
          <li><span className="font-semibold text-ink">Message direct</span> : écrivez à un membre de l’équipe ou à ses Experts IA, 9 personnes au plus.</li>
          <li><span className="font-semibold text-ink">Salon</span> : un espace nommé pour un sujet, jusqu’à 50 participants.</li>
          <li><span className="font-semibold text-ink">@</span> : demandez un travail à vos Experts IA, ils répondent dans le fil.</li>
        </ul>
      </div>
    );

  // Façon Slack : tout le monde à gauche, chacun avec son nom et son visage, soi compris ; le fil se lit pareil
  // pour tous. Son propre message garde seulement un fond teinté pour se repérer.
  const self = p.directory.find((e) => e.type === "personne" && e.cles.length > 0 && e.cles.every((k) => p.mine.includes(k))) ?? null;
  const nameOf = (k: string) => (p.mine.includes(k) ? (self?.nom ?? "Vous") : (p.labels.get(k) ?? "Membre inconnu"));
  const entryOf = (k: string) => (p.mine.includes(k) ? self : (byKey.get(k) ?? null));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {p.pane === "livrables" && p.salon ? (
        <SalonDeliverables items={items} error={livrables.error} loading={livrables.loading} onRefresh={livrables.refresh} directory={p.directory} />
      ) : p.pane === "participants" && p.salon ? (
        <SalonParticipants members={p.current.members} directory={p.directory} mine={p.mine} />
      ) : (
        <>
          <ol
            ref={list}
            onScroll={(e) => {
              const o = e.currentTarget;
              atEnd.current = o.scrollHeight - o.scrollTop - o.clientHeight < 80;
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
            aria-busy={p.thread === null}
          >
            {p.thread === null && !p.failed && <li className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</li>}
            {p.thread === null && p.failed && (
              <li className="flex flex-wrap items-center gap-2 text-sm text-ink-3" role="status">
                Le fil n’a pas pu être chargé : la connexion au relais se rétablit.
                <button type="button" onClick={p.onRetry} className="rounded-md px-2 py-0.5 text-xs font-semibold text-brand-ink hover:bg-soft">Réessayer</button>
              </li>
            )}
            {p.thread?.length === 0 && <li className="text-sm text-ink-3">Aucun message pour l’instant.</li>}
            {p.thread?.map((m, i) => {
              const mineMsg = p.mine.includes(m.author);
              // Seul le dernier message, d'un autre, se répond en un clic ; un choix plus ancien reste écrit.
              const parts = !mineMsg && i === (p.thread?.length ?? 0) - 1 ? replyParts(m.text) : null;
              const choices = parts?.choices.length ? parts : null;
              const first = startsRun(p.thread?.[i - 1], m) || Boolean(m.replyTo);
              const body = choices ? choices.body : m.text;
              const linked = salonId && items ? linkSalonPaths(body, salonId, items) : null;
              const docs = salonId && items ? salonPathsIn(m.text, salonId).flatMap((path) => {
                const d = salonDeliverableFor(path, salonId, items);
                return d?.url ? [{ ...d, url: d.url }] : [];
              }) : [];
              return (
                <li key={m.id} className={cn("group flex gap-2.5", first ? "mt-4 first:mt-0" : "mt-1", m.replyTo && "pl-8")}>
                  {first ? <ParticipantAvatar entry={entryOf(m.author)} name={nameOf(m.author)} className="mt-0.5" /> : <span className="w-7 shrink-0" aria-hidden />}
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    {first && (
                      <div className="flex items-baseline gap-2">
                        {m.replyTo && <CornerDownRight className="h-3.5 w-3.5 shrink-0 self-center text-ink-3" />}
                        <span className="text-[13px] font-semibold text-ink">{nameOf(m.author)}</span>
                        <time className="text-[11.5px] text-ink-3">{moment(m.at)}</time>
                      </div>
                    )}
                    <div className={cn(BUBBLE_ROW, first && "mt-1")}>
                      <div className={cn(BUBBLE, mineMsg ? "rounded-tl-md bg-tint" : "rounded-tl-md border border-line bg-surface")} title={first ? undefined : moment(m.at)} tabIndex={-1}>
                        {/* Comme le chat d'un Expert : liens cliquables (un site extérieur demande confirmation), listes, gras. */}
                        <div onClickCapture={openCited}>
                          <Markdown content={linked?.text ?? body} />
                        </div>
                        {/* Répondre, accroché au coin haut de la bulle au survol (comme Slack) : on voit à quel message il répond. */}
                        <button
                          type="button"
                          onClick={() => setReplyTo(m)}
                          aria-label="Répondre"
                          title="Répondre"
                          className={cn("absolute -top-3.5 grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 opacity-0 shadow-sm hover:bg-soft hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 -right-3")}
                        >
                          <Reply className="size-4" />
                        </button>
                      </div>
                    </div>
                    <SalonDocCards docs={docs} />
                    {choices && (
                      <ReplyChoices
                        choices={choices.choices}
                        note={choices.choicesNote}
                        onSend={(text) => !p.sending && void p.onSend(text, withReplyMention([], m.author, p.candidates), m)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
            {p.busy.map((e) => (
              // Comme dans le chat d'un Expert : son visage, puis une bulle qui dit qu'il est au travail.
              <li key={`busy-${e.nom}`} className="mt-4 flex items-start gap-2.5" role="status">
                <ParticipantAvatar entry={e} name={e.nom} className="mt-0.5" />
                <span className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-brand/25 bg-tint px-3.5 py-2.5 text-sm text-brand-ink">
                  <span className="flex gap-1" aria-hidden>
                    <span className="size-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-brand" />
                  </span>
                  <span className="font-semibold">{shortName(e.nom)} travaille</span>
                </span>
              </li>
            ))}
            <li ref={end} aria-hidden />
          </ol>
          <MentionComposer
            candidates={p.candidates}
            replyTo={replyTo ? `Réponse à ${nameOf(replyTo.author)}${replyMention(replyTo.author, p.candidates) ? " — votre Expert sera prévenu" : ""} : « ${excerpt(replyTo.text, 120)} »` : null}
            onCancelReply={() => setReplyTo(null)}
            sending={p.sending}
            onSend={async (text, mentions) => {
              const ok = await p.onSend(text, withReplyMention(mentions, replyTo?.author, p.candidates), replyTo);
              if (ok) setReplyTo(null);
              return ok;
            }}
          />
        </>
      )}
    </div>
  );
}
