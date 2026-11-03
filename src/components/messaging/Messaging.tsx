"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownRight, Hash, Loader2, MessagesSquare, Plus, RefreshCw, Send, User, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { conversationName, isSalonName, labelsOf, participants, type BuzzOverview } from "@/lib/buzz";
import { deviceKey } from "@/lib/buzz-keys";
import { BuzzConnection, conversations, messages, MESSAGE_KINDS, openDirect, sendMessage, toMessage, type Conversation, type Message } from "@/lib/buzz-relay";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NewExchange, type ExchangeKind } from "@/components/messaging/NewExchange";

// Échanges entre membres : les salons des équipes et les conversations directes, lus et écrits par ce
// navigateur sur le relais du client. Le back-office ne fait qu'admettre la clé de l'appareil.

type State = { kind: "loading" } | { kind: "closed"; reason: string } | { kind: "ready" };
type Filter = "all" | "salons" | "direct";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "salons", label: "Salons" },
  { id: "direct", label: "Conversations" },
];

const moment = (seconds: number) => new Date(seconds * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Messaging() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [overview, setOverview] = useState<BuzzOverview | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState<ExchangeKind | null>(null);
  const relay = useRef<BuzzConnection | null>(null);

  const labels = useMemo(() => labelsOf(overview?.annuaire ?? []), [overview]);
  const mine = useMemo(() => [...(overview?.appareils.map((d) => d.cle) ?? []), ...(me ? [me] : [])], [overview, me]);
  const unitSalons = useMemo(() => new Set(overview?.salons.map((s) => s.id) ?? []), [overview]);
  const isSalon = useCallback((c: Conversation) => unitSalons.has(c.id) || isSalonName(c.name), [unitSalons]);
  const nameOf = useCallback((c: Conversation) => overview?.salons.find((s) => s.id === c.id)?.nom ?? (isSalonName(c.name) ? c.name : conversationName(c.members, mine, labels, "Conversation")), [overview, mine, labels]);
  const kindOf = (c: Conversation): string => (unitSalons.has(c.id) ? "Salon d’équipe" : isSalon(c) ? "Salon" : "Conversation");

  const refresh = useCallback(async () => {
    if (!relay.current || !me) return;
    setRefreshing(true);
    try {
      setList(await conversations(relay.current, me));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [me]);

  // Ouverture : la vue du back-office, la clé de ce navigateur, puis le relais (une clé qui vient
  // d'être admise attend la synchronisation suivante : quelques essais).
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const o = await apiFetch<BuzzOverview>("/api/buzz");
        if (stop) return;
        setOverview(o);
        const key = await deviceKey(o.appareils.map((d) => d.cle));
        for (let attempt = 0; attempt < 8 && !stop; attempt++) {
          const c = new BuzzConnection(o.relais, key.secret);
          try {
            await c.connect();
            relay.current = c;
            setMe(key.pubkey);
            setState({ kind: "ready" });
            return;
          } catch {
            c.close();
            await new Promise((r) => setTimeout(r, 3000 + attempt * 2000));
          }
        }
        if (!stop) setState({ kind: "closed", reason: "Votre accès aux Échanges est en cours d’activation. Réessayez dans une minute." });
      } catch (e) {
        if (!stop) setState({ kind: "closed", reason: e instanceof Error ? e.message : "Les Échanges ne sont pas disponibles." });
      }
    })();
    return () => {
      stop = true;
      relay.current?.close();
      relay.current = null;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Le fil ouvert, puis chaque nouveau message en direct.
  useEffect(() => {
    const c = relay.current;
    if (!c || !open) return;
    let live: { close: () => void } | null = null;
    setThread(null);
    messages(c, open).then(
      (m) => {
        setThread(m);
        live = c.subscribe({ kinds: MESSAGE_KINDS, "#h": [open], since: Math.floor(Date.now() / 1000) }, (e) => setThread((t) => (t?.some((x) => x.id === e.id) ? t : [...(t ?? []), toMessage(e)])));
      },
      (e: unknown) => toast.error((e as Error).message),
    );
    return () => live?.close();
  }, [open, me]);

  const current = list?.find((c) => c.id === open) ?? null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const c = relay.current;
    const text = draft.trim();
    if (!c || !open || !text) return;
    setSending(true);
    try {
      const r = await sendMessage(c, open, text, replyTo?.id ?? null);
      if (!r.ok) throw new Error(r.message.replace(/^[a-z-]+: /, "") || "Message refusé.");
      const recipients = (list?.find((x) => x.id === open)?.members ?? []).filter((k) => !mine.includes(k));
      void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: replyTo ? "reply" : current && isSalon(current) ? "salon" : "dm", recipients }) }).catch(() => undefined);
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function start(kind: ExchangeKind, keys: string[], name: string) {
    const c = relay.current;
    if (!c) return;
    const id =
      kind === "salon"
        ? (await apiFetch<{ id: string }>("/api/buzz/salons", { method: "POST", body: JSON.stringify({ nom: name, cles: keys }) }, "Le salon n’a pas pu être créé")).id
        : await openDirect(c, [...new Set([...mine.filter((k) => k !== me), ...keys])]);
    setComposing(null);
    await refresh();
    setOpen(id);
    if (kind === "message") void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: "dm", recipients: keys }) }).catch(() => undefined);
  }

  const shown = (list ?? []).filter((c) => filter === "all" || (filter === "salons") === isSalon(c));
  const groups = filter === "all" ? [{ title: "Salons", items: shown.filter(isSalon) }, { title: "Conversations", items: shown.filter((c) => !isSalon(c)) }].filter((g) => g.items.length) : [{ title: null, items: shown }];

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-brand">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Échanges</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-3">Écrivez à vos collègues et à leurs Experts, et suivez les salons de vos équipes. Votre Expert peut aussi le faire pour vous, à votre demande.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={state.kind !== "ready" || refreshing} aria-label="Actualiser">
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={() => setComposing("salon")} disabled={state.kind !== "ready"}>
            <Hash />
            Nouveau salon
          </Button>
          <Button onClick={() => setComposing("message")} disabled={state.kind !== "ready"}>
            <Plus />
            Nouveau message
          </Button>
        </div>
      </header>

      {state.kind === "closed" && <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{state.reason}</p>}

      {state.kind !== "closed" && (
        <>
          <div className="flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors max-sm:py-2.5", filter === f.id ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-soft")}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
            {!list ? (
              <div className="space-y-2.5" aria-busy="true">
                {[1, 2, 3].map((n) => <div key={n} className="h-[62px] animate-pulse rounded-[18px] border border-line bg-surface" />)}
              </div>
            ) : shown.length === 0 ? (
              <Empty title="Aucun échange ici" text="Vos salons et vos conversations avec vos collègues apparaissent ici." />
            ) : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.title ?? "all"}>
                    {g.title && <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{g.title}</h2>}
                    <ul className="space-y-2.5">
                      {g.items.map((c) => {
                        const salon = isSalon(c);
                        const who = participants(c.members, mine, labels).length;
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setOpen(c.id)}
                              aria-current={open === c.id}
                              className={cn("flex w-full items-center gap-3 rounded-[18px] border bg-surface p-3.5 text-left transition-colors", open === c.id ? "border-brand/40 bg-tint" : "border-line hover:border-brand/40")}
                            >
                              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", salon ? "bg-tint text-brand" : "bg-soft-2 text-ink-2")}>
                                {unitSalons.has(c.id) ? <Users className="h-4 w-4" /> : salon ? <Hash className="h-4 w-4" /> : <User className="h-4 w-4" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-ink">{nameOf(c)}</span>
                                <span className="mt-0.5 block truncate text-xs text-ink-3">{kindOf(c)} · {who} participant{who > 1 ? "s" : ""}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <section className="flex min-h-[460px] flex-col rounded-[22px] border border-line bg-surface">
              {!current ? (
                <div className="m-auto p-10 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><MessagesSquare className="h-6 w-6" /></span>
                  <h2 className="mt-3 text-base font-semibold text-ink">Choisissez un échange</h2>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">« Nouveau message » écrit à une personne ou à ses Experts ; « Nouveau salon » ouvre un espace nommé à plusieurs.</p>
                </div>
              ) : (
                <>
                  <header className="border-b border-line px-5 py-4">
                    <h2 className="font-display text-lg font-bold text-ink">{nameOf(current)}</h2>
                    <p className="mt-0.5 text-xs text-ink-3">{kindOf(current)} · {participants(current.members, mine, labels).join(", ")}</p>
                  </header>
                  <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-busy={thread === null}>
                    {thread === null && <li className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</li>}
                    {thread?.length === 0 && <li className="text-sm text-ink-3">Aucun message pour l’instant.</li>}
                    {thread?.map((m) => {
                      const own = mine.includes(m.author);
                      return (
                        <li key={m.id} className={cn("group", m.replyTo && "ml-8")}>
                          <div className="flex items-baseline gap-2">
                            {m.replyTo && <CornerDownRight className="h-3.5 w-3.5 shrink-0 self-center text-ink-3" />}
                            <span className="text-sm font-semibold text-ink">{own ? "Vous" : (labels.get(m.author) ?? "Membre inconnu")}</span>
                            <time className="text-xs text-ink-3">{moment(m.at)}</time>
                            <button type="button" onClick={() => setReplyTo(m)} className="ml-auto rounded-md px-2 py-0.5 text-xs font-semibold text-ink-2 opacity-0 hover:bg-soft focus-visible:opacity-100 group-hover:opacity-100">
                              Répondre
                            </button>
                          </div>
                          <div className={cn("mt-1 whitespace-pre-wrap rounded-xl border p-3 text-sm leading-relaxed text-ink", own ? "border-brand/20 bg-tint" : "border-line bg-soft/30")}>{m.text}</div>
                        </li>
                      );
                    })}
                  </ol>
                  <form onSubmit={(e) => void send(e)} className="space-y-2 border-t border-line p-4">
                    {replyTo && (
                      <div className="flex items-center gap-2 rounded-lg bg-soft px-2.5 py-1.5 text-xs text-ink-2">
                        <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">Réponse à {mine.includes(replyTo.author) ? "vous" : (labels.get(replyTo.author) ?? "ce message")} : « {replyTo.text} »</span>
                        <button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}><X className="h-3 w-3" /></button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <Label htmlFor="echange-message" className="sr-only">Message</Label>
                      <textarea
                        id="echange-message"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        rows={2}
                        maxLength={8000}
                        placeholder="Écrire un message"
                        className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface p-3 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
                      />
                      <Button type="submit" disabled={!draft.trim() || sending}>
                        {sending ? <Loader2 className="animate-spin" /> : <Send />}
                        Envoyer
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </>
      )}

      <NewExchange kind={composing} onClose={() => setComposing(null)} directory={overview?.annuaire ?? []} mine={mine} onStart={start} />
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-line bg-surface p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><MessagesSquare className="h-6 w-6" /></span>
      <h2 className="mt-3 text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{text}</p>
    </div>
  );
}
