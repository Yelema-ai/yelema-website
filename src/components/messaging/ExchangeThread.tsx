"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownRight, Loader2, MessagesSquare, Reply } from "lucide-react";
import { dayLabel, expertChip, expertParts, hourLabel, mentionMarker, newDay, shortName, startsRun, type BuzzEntry } from "@/lib/buzz";
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
import { linkSalonPaths, salonDeliverableFor, salonPathsIn, type SalonDeliverable } from "@/lib/salon-deliverables";
import { GuestBadge, SalonParticipants } from "@/components/messaging/SalonParticipants";
import type { RosterContext } from "@/components/messaging/SalonRoster";
import { NewMenu } from "@/components/messaging/ExchangeRail";
import type { ExchangeKind } from "@/components/messaging/NewExchange";

// Le fil d'un échange, comme le chat d'un Expert (l'en-tête et ses onglets sont dans ExchangeHeader) : messages,
// visage de l'auteur en tête de chaque suite, choix du dernier message en boutons (comme le chat d'un Expert), « … travaille » pour vos Experts sollicités, saisie avec « @ ».
// Façon Slack : un séparateur par jour (« Aujourd'hui », « Hier », la date), l'heure seule à côté du nom, un Expert
// nommé par son prénom avec une pastille « Experte d'Aïcha », les @mentions en pastille de couleur.

const moment = (seconds: number) => new Date(seconds * 1000).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
// Une mention est posée en code en ligne (markMentions) : ici, dessinée en pastille de la couleur de l'espace.
const MENTIONS = "[&_[data-streamdown=inline-code]]:rounded-md [&_[data-streamdown=inline-code]]:bg-tint [&_[data-streamdown=inline-code]]:px-1 [&_[data-streamdown=inline-code]]:py-px [&_[data-streamdown=inline-code]]:font-sans [&_[data-streamdown=inline-code]]:text-[0.95em] [&_[data-streamdown=inline-code]]:font-semibold [&_[data-streamdown=inline-code]]:text-brand-ink";

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
  /** The salon's deliverables read elsewhere (an external guest's page); by default, the member's own reading. */
  deliverables?: { items: SalonDeliverable[] | null; error: string | null; loading: boolean; refresh: () => void };
  /** Each participant's role (a member's space); a guest's page goes without. */
  roles?: RosterContext;
  /** The « + » of the empty screen (a member's space); a guest's page goes without. */
  onNew?: (kind: ExchangeKind) => void;
  /** The microphone in the composer, where voice is on. */
  canDictate?: boolean;
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
  const own = useSalonDeliverables(p.deliverables ? null : salonId, p.pane === "livrables" || cited.length > 0);
  const livrables = p.deliverables ?? own;
  const rereadGuest = p.deliverables?.refresh;
  const items = livrables.items;
  // Un fichier cité après la dernière lecture, absent de la liste : relue une fois.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!salonId || !items) return;
    const late = cited.find((c) => !salonDeliverableFor(c.path, salonId, items) && c.at * 1000 > salonReadAt(salonId) && !asked.current.has(c.path));
    if (!late) return;
    asked.current.add(late.path);
    if (rereadGuest) rereadGuest();
    else void readSalonDeliverables(salonId, 0).catch(() => undefined);
  }, [salonId, cited, items, rereadGuest]);
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

  const mark = useMemo(
    () => mentionMarker([...p.directory.flatMap((e) => (e.type === "expert" ? [e.nom, shortName(e.nom)] : [e.nom])), ...p.candidates.filter((c) => c.group).map((c) => c.handle), "tous", "experts"]),
    [p.directory, p.candidates],
  );

  if (!p.current)
    return (
      <div className="m-auto flex flex-col items-center p-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><MessagesSquare className="h-6 w-6" /></span>
        <h2 className="mt-3 text-base font-semibold text-ink">Choisissez une conversation, ou commencez-en une.</h2>
        {p.onNew && <div className="mt-4"><NewMenu onNew={p.onNew} label="Nouvelle conversation" /></div>}
      </div>
    );

  // Façon Slack : tout le monde à gauche, chacun avec son nom et son visage, soi compris ; le fil se lit pareil
  // pour tous. Son propre message garde seulement un fond teinté pour se repérer.
  const self = p.directory.find((e) => e.type !== "expert" && e.cles.length > 0 && e.cles.every((k) => p.mine.includes(k))) ?? null;
  const nameOf = (k: string) => (p.mine.includes(k) ? (self?.nom ?? "Vous") : (p.labels.get(k) ?? "Membre inconnu"));
  const entryOf = (k: string) => (p.mine.includes(k) ? self : (byKey.get(k) ?? null));
  // Un Expert par son prénom, son propriétaire dans la pastille ; une personne par son nom.
  const shownName = (k: string) => (entryOf(k)?.type === "expert" ? expertParts(nameOf(k)).name : nameOf(k));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {p.pane === "livrables" && p.salon ? (
        <SalonDeliverables items={items} error={livrables.error} loading={livrables.loading} onRefresh={livrables.refresh} directory={p.directory} />
      ) : p.pane === "participants" && p.salon ? (
        <SalonParticipants members={p.current.members} directory={p.directory} mine={p.mine} roles={p.roles} />
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
              const day = newDay(p.thread?.[i - 1], m);
              const author = entryOf(m.author);
              return (
                <Fragment key={m.id}>
                {day && (
                  <li role="separator" aria-label={dayLabel(m.at)} className="relative mb-1 mt-5 flex items-center justify-center first:mt-0">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden />
                    <span className="relative rounded-full border border-line bg-surface px-3 py-0.5 text-[12px] font-semibold text-ink-2">{dayLabel(m.at)}</span>
                  </li>
                )}
                <li className={cn("group flex gap-2.5", first || day ? "mt-4 first:mt-0" : "mt-1", m.replyTo && "pl-8")}>
                  {first || day ? <ParticipantAvatar entry={author} name={shownName(m.author)} className="mt-0.5" /> : <span className="w-7 shrink-0" aria-hidden />}
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    {(first || day) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {m.replyTo && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
                        <span className="text-[13px] font-semibold text-ink">{shownName(m.author)}</span>
                        {author?.type === "expert" && (
                          <span className="rounded-full bg-tint px-2 py-px text-[11px] font-semibold text-brand-ink">{expertChip(author, author.membre === self?.membre)}</span>
                        )}
                        {author?.type === "invite" && <GuestBadge />}
                        <time dateTime={new Date(m.at * 1000).toISOString()} title={moment(m.at)} className="text-[11.5px] tabular-nums text-ink-3">{hourLabel(m.at)}</time>
                      </div>
                    )}
                    <div className={cn(BUBBLE_ROW, (first || day) && "mt-1")}>
                      <div className={cn(BUBBLE, mineMsg ? "rounded-tl-md bg-tint" : "rounded-tl-md border border-line bg-surface")} title={first || day ? undefined : hourLabel(m.at)} tabIndex={-1}>
                        {/* Comme le chat d'un Expert : liens cliquables (un site extérieur demande confirmation), listes, gras. */}
                        <div onClickCapture={openCited} className={MENTIONS}>
                          <Markdown content={mark(linked?.text ?? body)} />
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
                </Fragment>
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
            replyTo={replyTo ? `Réponse à ${shownName(replyTo.author)}${replyMention(replyTo.author, p.candidates) ? " — votre Expert sera prévenu" : ""} : « ${excerpt(replyTo.text, 120)} »` : null}
            onCancelReply={() => setReplyTo(null)}
            canDictate={p.canDictate}
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
