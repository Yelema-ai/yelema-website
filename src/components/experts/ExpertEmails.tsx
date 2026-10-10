"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Inbox, Loader2, Mail, Paperclip, Plus, RefreshCw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { bareAddress, isSent, parseRecipients, sandboxedMail, type MailDetail, type MailInbox, type MailOutgoingAttachment, type MailSummary } from "@/lib/mail";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The expert's own inbox: what it received, what it sent, and writing from it. Everything is read
// from the back office, which holds the mailbox and allows or refuses each sending; a refusal comes
// back as a sentence and is shown as it is. Screen adapted from Christelle Ebou's first version.

type Filter = "all" | "received" | "sent";
type Page = { items: MailSummary[]; nextPageToken: string | null };
type Compose = { replyTo: MailDetail | null };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "received", label: "Reçus" },
  { id: "sent", label: "Envoyés" },
];

const moment = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const weight = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);

// A file as the back office takes it: base64, without the data: prefix.
function encode(file: File): Promise<MailOutgoingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Le fichier ${file.name} n’a pas pu être lu.`));
    reader.onload = () => resolve({ filename: file.name, contentType: file.type || "application/octet-stream", content: String(reader.result).replace(/^data:[^,]*,/, "") });
    reader.readAsDataURL(file);
  });
}

export function ExpertEmails({ inbox, expertName, loaded }: { inbox: MailInbox | null; expertName: string; loaded: boolean }) {
  const expert = inbox?.expert ?? null;
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<{ id: string; message: MailDetail | null } | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  // An answer for an expert the screen has left is dropped.
  const asked = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!expert) return;
    asked.current = expert;
    setLoading(true);
    try {
      const data = await apiFetch<Page>(`/api/mail/${expert}/messages`);
      if (asked.current !== expert) return;
      setPage(data);
      setError(null);
    } catch (e) {
      if (asked.current === expert) setError((e as Error).message);
    } finally {
      if (asked.current === expert) setLoading(false);
    }
  }, [expert]);

  useEffect(() => {
    setPage(null);
    void load();
  }, [load]);

  async function more() {
    if (!expert || !page?.nextPageToken) return;
    setLoadingMore(true);
    try {
      const next = await apiFetch<Page>(`/api/mail/${expert}/messages?page=${encodeURIComponent(page.nextPageToken)}`);
      if (asked.current === expert) setPage({ items: [...page.items, ...next.items], nextPageToken: next.nextPageToken });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function read(id: string) {
    if (!expert) return;
    setOpen({ id, message: null });
    try {
      const message = await apiFetch<MailDetail>(`/api/mail/${expert}/messages/${id}`);
      setOpen((current) => (current?.id === id ? { id, message } : current));
    } catch (e) {
      toast.error((e as Error).message);
      setOpen((current) => (current?.id === id ? null : current));
    }
  }

  function copy() {
    if (!inbox) return;
    void navigator.clipboard.writeText(inbox.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!inbox) {
    return (
      <div className="rounded-[22px] border border-line bg-surface p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3">
          {loaded ? <Inbox className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </span>
        <h2 className="mt-3 text-base font-semibold text-ink">{loaded ? "Pas de boîte e-mail" : "Chargement…"}</h2>
        {loaded && <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{expertName} n’a pas de boîte e-mail que vous puissiez consulter. Votre administrateur peut le régler dans Administration › E-mails.</p>}
      </div>
    );
  }

  const messages = (page?.items ?? []).filter((m) => filter === "all" || (filter === "sent") === isSent(m.labels));

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-brand">
            <Mail className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">E-mails de {expertName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="break-all font-mono text-sm font-semibold text-ink-2">{inbox.address}</span>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-soft px-2 py-0.5 text-xs text-ink-2 hover:bg-soft-2">
                {copied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiée" : "Copier"}
              </button>
            </div>
            <p className="mt-2 max-w-xl text-xs text-ink-3">
              {inbox.canSend
                ? inbox.externalAllowed
                  ? `${expertName} écrit depuis cette adresse, à votre demande, y compris hors de l’entreprise.`
                  : `${expertName} écrit depuis cette adresse, à votre demande, aux membres de votre entreprise seulement.`
                : inbox.sendEnabled
                  ? "Vous pouvez lire cette boîte ; l’envoi ne vous est pas ouvert. Votre administrateur peut le régler dans Administration › E-mails."
                  : `${expertName} n’est pas encore autorisé à envoyer des e-mails. Votre administrateur peut l’autoriser dans Administration › E-mails.`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Actualiser">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
          <Button onClick={() => setCompose({ replyTo: null })} disabled={!inbox.canSend}>
            <Plus />
            Nouveau message
          </Button>
        </div>
      </header>

      <div className="flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", filter === f.id ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-soft")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}

      {!page && !error ? (
        <div className="space-y-2.5" aria-busy="true">
          {[1, 2, 3].map((n) => <div key={n} className="h-[74px] animate-pulse rounded-[18px] border border-line bg-surface" />)}
        </div>
      ) : messages.length === 0 && !error ? (
        <div className="rounded-[22px] border border-line bg-surface p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><Inbox className="h-6 w-6" /></span>
          <h2 className="mt-3 text-base font-semibold text-ink">Aucun e-mail ici</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">Les e-mails envoyés à {inbox.address}, et ceux que {expertName} envoie, apparaissent ici.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {messages.map((m) => {
            const sent = isSent(m.labels);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => void read(m.id)}
                  className="flex w-full flex-col items-start justify-between gap-3 rounded-[18px] border border-line bg-surface p-4 text-left transition-colors hover:border-brand/40 sm:flex-row sm:items-center"
                >
                  <span className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", sent ? "bg-soft-2 text-ink-2" : "bg-ok-pale text-ok")}>
                      {sent ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{sent ? `À : ${m.to.join(", ")}` : `De : ${m.from}`}</span>
                      <span className="mt-0.5 block truncate text-sm font-medium text-ink-2">{m.subject || "(Sans objet)"}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{m.preview}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
                    {m.attachments > 0 && <Paperclip className="h-3.5 w-3.5" aria-label={`${m.attachments} pièce(s) jointe(s)`} />}
                    {moment(m.at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {page?.nextPageToken && (
        <Button variant="outline" size="sm" onClick={() => void more()} disabled={loadingMore}>
          {loadingMore && <Loader2 className="animate-spin" />}
          Messages plus anciens
        </Button>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          {open?.message ? (
            <MessageView
              expert={inbox.expert}
              message={open.message}
              canReply={inbox.canSend && !isSent(open.message.labels)}
              onReply={() => {
                setCompose({ replyTo: open.message });
                setOpen(null);
              }}
            />
          ) : (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-ink"><Loader2 className="h-4 w-4 animate-spin" />Ouverture du message…</DialogTitle>
              <DialogDescription className="sr-only">Le message se charge.</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {compose && (
        <ComposeDialog
          inbox={inbox}
          expertName={expertName}
          replyTo={compose.replyTo}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function MessageView({ expert, message, canReply, onReply }: { expert: string; message: MailDetail; canReply: boolean; onReply: () => void }) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-display text-xl font-bold text-ink">{message.subject || "(Sans objet)"}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-col gap-1 pt-2 text-xs text-ink-3">
            <span><b>De :</b> {message.from}</span>
            <span><b>À :</b> {message.to.join(", ")}</span>
            {message.cc.length > 0 && <span><b>Copie :</b> {message.cc.join(", ")}</span>}
            <span><b>Date :</b> {moment(message.at)}</span>
          </div>
        </DialogDescription>
      </DialogHeader>

      {message.html ? (
        // Written by anyone: an empty `sandbox` runs no script, submits no form and has no access to
        // this page; the document's own policy (sandboxedMail) fetches nothing but images.
        <iframe title="Contenu du message" sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxedMail(message.html)} className="h-[46vh] w-full rounded-xl border border-line bg-white" />
      ) : (
        <div className="whitespace-pre-wrap rounded-xl border border-line bg-soft/30 p-4 text-sm leading-relaxed text-ink">{message.text}</div>
      )}

      {message.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {message.attachments.map((a) => (
            <li key={a.id}>
              <a href={`/api/mail/${expert}/messages/${message.id}/attachments/${a.id}`} download={a.filename} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink hover:bg-soft">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="max-w-[220px] truncate">{a.filename}</span>
                <span className="font-normal text-ink-3">{weight(a.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {canReply && (
        <div className="flex justify-end">
          <Button onClick={onReply}><Send />Répondre</Button>
        </div>
      )}
    </div>
  );
}

function ComposeDialog({ inbox, expertName, replyTo, onClose, onSent }: { inbox: MailInbox; expertName: string; replyTo: MailDetail | null; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  // Base64 adds a third: the whole request must stay under the host's limit.
  const tooHeavy = total > MAX_UPLOAD_BYTES * 0.7;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const recipients = replyTo ? [] : parseRecipients(to);
    if (!recipients) return setRefusal("Indiquez une ou plusieurs adresses e-mail valides, séparées par des virgules.");
    if (tooHeavy) return setRefusal("Les pièces jointes dépassent 2,8 Mo au total.");
    setSending(true);
    setRefusal(null);
    try {
      const attachments = await Promise.all(files.map(encode));
      const url = replyTo ? `/api/mail/${inbox.expert}/messages/${replyTo.id}/reply` : `/api/mail/${inbox.expert}/messages`;
      await apiFetch(url, { method: "POST", body: JSON.stringify(replyTo ? { text, attachments } : { to: recipients, subject, text, attachments }) });
      toast.success("E-mail envoyé.");
      onSent();
    } catch (e) {
      // The back office's own sentence when it refuses: shown where the member is writing.
      setRefusal((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-ink">{replyTo ? "Répondre" : `Écrire au nom de ${expertName}`}</DialogTitle>
          <DialogDescription>
            {replyTo ? `À ${bareAddress(replyTo.from)}, depuis ${inbox.address}.` : `Depuis ${inbox.address}.`}
            {!inbox.externalAllowed && " Cet expert ne peut écrire qu’aux membres de votre entreprise."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void send(e)} className="space-y-4 pt-1">
          {!replyTo && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mail-to">Destinataires</Label>
                <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="prenom@entreprise.com, …" autoComplete="off" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail-subject">Objet</Label>
                <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mail-text">Message</Label>
            <textarea
              id="mail-text"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              className="w-full rounded-xl border border-line bg-surface p-3 text-[15px] text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
            />
          </div>

          <div className="space-y-2">
            <input ref={picker} type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}><Paperclip />Joindre un fichier</Button>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg bg-soft px-2.5 py-1 text-xs text-ink-2">
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-ink-3">{weight(f.size)}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Retirer ${f.name}`}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {refusal && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{refusal}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={sending}>Annuler</Button>
            <Button type="submit" disabled={sending || tooHeavy}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending ? "Envoi…" : "Envoyer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
