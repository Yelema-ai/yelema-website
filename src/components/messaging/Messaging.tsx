"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownRight, MessageSquarePlus, Send, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { conversationName, labelsOf, MAX_RECIPIENTS, type BuzzEntry, type BuzzOverview } from "@/lib/buzz";
import { deviceKey } from "@/lib/buzz-keys";
import { BuzzConnection, conversations, messages, MESSAGE_KINDS, openDirect, sendMessage, toMessage, type Conversation, type Message } from "@/lib/buzz-relay";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Échanges entre membres : les salons des équipes et les conversations directes, lus et écrits par
// ce navigateur sur le relais du client. Le back-office ne fait qu'admettre la clé de l'appareil.

type State = { kind: "loading" } | { kind: "closed"; reason: string } | { kind: "ready" };

export function Messaging() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [overview, setOverview] = useState<BuzzOverview | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<Conversation[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [composing, setComposing] = useState(false);
  const relay = useRef<BuzzConnection | null>(null);

  const labels = useMemo(() => labelsOf(overview?.annuaire ?? []), [overview]);
  const mine = useMemo(() => [...(overview?.appareils.map((d) => d.cle) ?? []), ...(me ? [me] : [])], [overview, me]);
  const salonIds = useMemo(() => new Set(overview?.salons.map((s) => s.id) ?? []), [overview]);
  const nameOf = useCallback((c: Conversation) => overview?.salons.find((s) => s.id === c.id)?.nom ?? conversationName(c.members, mine, labels, c.name), [overview, mine, labels]);

  const refresh = useCallback(async () => {
    if (relay.current && me) setList(await conversations(relay.current, me));
  }, [me]);

  // Ouverture : la vue du back-office, la clé de ce navigateur, puis le relais (la clé vient peut-être
  // d'être admise : quelques essais le temps que la synchronisation passe).
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
    void messages(c, open).then((m) => {
      setThread(m);
      live = c.subscribe({ kinds: MESSAGE_KINDS, "#h": [open], since: Math.floor(Date.now() / 1000) }, (e) =>
        setThread((t) => (t.some((x) => x.id === e.id) ? t : [...t, toMessage(e)])),
      );
    });
    return () => live?.close();
  }, [open, me]);

  async function send() {
    const c = relay.current;
    const text = draft.trim();
    if (!c || !open || !text) return;
    const r = await sendMessage(c, open, text, replyTo?.id ?? null);
    if (!r.ok) return setState({ kind: "closed", reason: r.message || "Message refusé par le relais." });
    setDraft("");
    setReplyTo(null);
    const recipients = (list.find((c) => c.id === open)?.members ?? []).filter((k) => !mine.includes(k));
    void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: replyTo ? "reply" : salonIds.has(open) ? "salon" : "dm", recipients }) }).catch(() => undefined);
  }

  async function start(keys: string[]) {
    const c = relay.current;
    if (!c) return;
    const id = await openDirect(c, [...new Set([...mine.filter((k) => k !== me), ...keys])]);
    setComposing(false);
    await refresh();
    setOpen(id);
    void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: "dm", recipients: keys }) }).catch(() => undefined);
  }

  if (state.kind === "loading") return <p className="text-sm text-ink-3">Ouverture des Échanges…</p>;
  if (state.kind === "closed") return <p className="rounded-[18px] border border-line bg-surface p-5 text-sm text-ink-2">{state.reason}</p>;

  const current = list.find((c) => c.id === open) ?? null;
  return (
    <div className="grid min-h-[70vh] grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-1 rounded-[22px] border border-line bg-surface p-3">
        <Button variant="secondary" className="mb-2 justify-start gap-2" onClick={() => setComposing(true)}>
          <MessageSquarePlus className="size-4" /> Nouveau message
        </Button>
        {list.length === 0 && <p className="px-2 py-3 text-sm text-ink-3">Aucune conversation pour l’instant.</p>}
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpen(c.id)}
            className={cn("flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm", open === c.id ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft")}
          >
            {salonIds.has(c.id) ? <Users className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
            <span className="min-w-0 truncate">{nameOf(c)}</span>
          </button>
        ))}
      </aside>

      <section className="flex flex-col rounded-[22px] border border-line bg-surface">
        {!current ? (
          <p className="m-auto p-8 text-sm text-ink-3">Choisissez une conversation, ou écrivez à quelqu’un de l’entreprise.</p>
        ) : (
          <>
            <header className="border-b border-line px-5 py-3 text-sm font-semibold">{nameOf(current)}</header>
            <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {thread.map((m) => (
                <li key={m.id} className={cn("group text-sm", m.replyTo && "ml-6")}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{mine.includes(m.author) ? "Vous" : (labels.get(m.author) ?? "Inconnu")}</span>
                    <time className="text-xs text-ink-3">{new Date(m.at * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
                    <button type="button" onClick={() => setReplyTo(m)} className="ml-auto hidden text-xs text-link group-hover:inline">
                      Répondre
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-ink-2">
                    {m.replyTo && <CornerDownRight className="mr-1 inline size-3.5 text-ink-3" />}
                    {m.text}
                  </p>
                </li>
              ))}
            </ol>
            <footer className="border-t border-line p-3">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
                  Réponse à {labels.get(replyTo.author) ?? "ce message"} : « {replyTo.text.slice(0, 60)} »
                  <button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}>
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  maxLength={8000}
                  placeholder="Écrire un message"
                  className="min-w-0 flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={!draft.trim()} aria-label="Envoyer">
                  <Send className="size-4" />
                </Button>
              </form>
            </footer>
          </>
        )}
      </section>

      <NewConversation open={composing} onClose={() => setComposing(false)} directory={overview?.annuaire ?? []} mine={mine} onStart={start} />
    </div>
  );
}

function NewConversation({ open, onClose, directory, mine, onStart }: { open: boolean; onClose: () => void; directory: BuzzEntry[]; mine: string[]; onStart: (keys: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reachable = directory.filter((e) => e.cles.length && !e.cles.every((k) => mine.includes(k)));
  const keys = [...new Set(reachable.filter((e) => picked.includes(e.nom)).flatMap((e) => e.cles))];
  const tooMany = keys.length + mine.length > MAX_RECIPIENTS + 1;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
        </DialogHeader>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {reachable.map((e) => (
            <li key={`${e.type}:${e.nom}`}>
              <label className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm hover:bg-soft">
                <input type="checkbox" checked={picked.includes(e.nom)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.nom] : p.filter((n) => n !== e.nom)))} />
                <span>{e.nom}</span>
                <span className="ml-auto text-xs text-ink-3">{e.type === "expert" ? "Expert" : "Personne"}</span>
              </label>
            </li>
          ))}
        </ul>
        {tooMany && <p className="text-xs text-ko">9 participants au plus par conversation : retirez quelqu’un.</p>}
        {error && <p className="text-xs text-ko">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!keys.length || tooMany}
            onClick={() => {
              setError(null);
              onStart(keys).then(() => setPicked([]), (e: unknown) => setError(e instanceof Error ? e.message : "Conversation non ouverte."));
            }}
          >
            Ouvrir la conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
