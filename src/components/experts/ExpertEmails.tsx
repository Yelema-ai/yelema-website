"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  Send,
  Inbox,
  RefreshCw,
  Copy,
  Check,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Plus,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getExpert } from "@/config/experts";
import { useApp } from "@/components/app/AppProvider";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MessageItem {
  messageId: string;
  threadId?: string;
  from?: string;
  to?: string[] | string;
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  extractedText?: string;
  createdAt?: string;
  labels?: string[];
}

interface EmailResponse {
  configured: boolean;
  inbox: {
    inboxId: string;
    email: string;
    displayName: string;
    createdAt: string;
  } | null;
  messages: MessageItem[];
}

export function ExpertEmails({ expertKey }: { expertKey: string }) {
  const expert = getExpert(expertKey);
  const { workspace } = useApp();
  const slug = workspace?.name ? workspace.name.toLowerCase().replace(/[^a-z0-9]/g, "") : "mstudio";
  const defaultEmail = `${expertKey}.${slug}@agentmail.to`;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EmailResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "inbox" | "sent">("all");

  // Form states for compose
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<EmailResponse>(`/api/experts/${expertKey}/email`);
      setData(res);
    } catch (e: any) {
      console.error("Erreur chargement e-mails:", e);
    } finally {
      setLoading(false);
    }
  }, [expertKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyEmail = () => {
    const emailToCopy = data?.inbox?.email || defaultEmail;
    navigator.clipboard.writeText(emailToCopy);
    setCopied(true);
    toast.success("Adresse e-mail copiée !");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !subject || !body) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setSending(true);
    try {
      await apiFetch(`/api/experts/${expertKey}/email`, {
        method: "POST",
        body: JSON.stringify({
          to,
          subject,
          text: body,
        }),
      });

      toast.success("E-mail envoyé avec succès !");
      setComposeOpen(false);
      setTo("");
      setSubject("");
      setBody("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'envoi de l'e-mail");
    } finally {
      setSending(false);
    }
  };

  if (!expert) return null;
  const emailAddress = data?.inbox?.email || defaultEmail;
  const messages = data?.messages || [];

  const filteredMessages = messages.filter((m) => {
    const matchSearch =
      !searchQuery ||
      m.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(m.to) ? m.to.join(" ") : m.to || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.from || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;
    if (filter === "sent") {
      return (m.from || "").includes(expertKey) || (m.labels || []).includes("outreach") || (m.labels || []).includes("sent");
    }
    if (filter === "inbox") {
      return !(m.from || "").includes(expertKey);
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-[24px] border border-line bg-surface p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-brand">
            <Mail className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              E-mails de {expert.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-ink-2">{emailAddress}</span>
              <button
                onClick={copyEmail}
                className="inline-flex items-center gap-1 rounded-md bg-soft px-2 py-0.5 text-xs text-ink-2 hover:bg-soft-2"
                title="Copier l'adresse"
              >
                {copied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Boîte autonome gérée par AgentMail. {expert.name} reçoit et répond automatiquement aux e-mails qui lui sont adressés.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="rounded-full">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => setComposeOpen(true)} className="rounded-full gap-2">
            <Plus className="h-4 w-4" />
            Nouveau message
          </Button>
        </div>
      </div>

      {/* Toolbar & Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-1">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === "all" ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-soft"
            )}
          >
            Tous ({messages.length})
          </button>
          <button
            onClick={() => setFilter("inbox")}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === "inbox" ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-soft"
            )}
          >
            Reçus
          </button>
          <button
            onClick={() => setFilter("sent")}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === "sent" ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-soft"
            )}
          >
            Envoyés
          </button>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-3" />
          <Input
            placeholder="Rechercher un e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-full bg-surface"
          />
        </div>
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-[18px] bg-surface border border-line" />
          ))}
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="rounded-[22px] border border-line bg-surface p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3 mb-3">
            <Inbox className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-ink text-base">Aucun e-mail pour l'instant</h3>
          <p className="text-sm text-ink-3 max-w-md mx-auto mt-1">
            Les e-mails envoyés à <b>{emailAddress}</b> ou rédigés par {expert.name} apparaîtront automatiquement ici.
          </p>
          <Button onClick={() => setComposeOpen(true)} variant="outline" size="sm" className="mt-4 rounded-full">
            Envoyer un premier e-mail
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredMessages.map((m) => {
            const isSent = (m.from || "").includes(expertKey) || (m.labels || []).includes("outreach");
            return (
              <div
                key={m.messageId}
                onClick={() => setSelectedMessage(m)}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-[18px] border border-line bg-surface p-4 hover:border-brand/40 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      isSent ? "bg-soft-2 text-ink-2" : "bg-ok-pale text-ok"
                    )}
                  >
                    {isSent ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink truncate">
                        {isSent ? `À : ${Array.isArray(m.to) ? m.to.join(", ") : m.to}` : `De : ${m.from}`}
                      </span>
                      {m.labels && m.labels.length > 0 && (
                        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] text-ink-3">
                          {m.labels[0]}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm text-ink-2 truncate mt-0.5">{m.subject || "(Sans objet)"}</p>
                    <p className="text-xs text-ink-3 truncate mt-0.5">
                      {m.extractedText || m.preview || m.text || "..."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs text-ink-3">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "Récemment"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View Message Dialog */}
      <Dialog open={selectedMessage !== null} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedMessage && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-xl font-display font-bold text-ink">
                  {selectedMessage.subject || "(Sans objet)"}
                </DialogTitle>
                <div className="flex flex-col gap-1 text-xs text-ink-3 pt-2">
                  <p><b>De :</b> {selectedMessage.from || emailAddress}</p>
                  <p><b>À :</b> {Array.isArray(selectedMessage.to) ? selectedMessage.to.join(", ") : selectedMessage.to}</p>
                  {selectedMessage.createdAt && (
                    <p><b>Date :</b> {new Date(selectedMessage.createdAt).toLocaleString("fr-FR")}</p>
                  )}
                </div>
              </DialogHeader>

              <div className="rounded-xl border border-line bg-soft/30 p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap">
                {selectedMessage.extractedText || selectedMessage.text || (
                  <div dangerouslySetInnerHTML={{ __html: selectedMessage.html || "" }} />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedMessage(null)}>
                  Fermer
                </Button>
                <Button
                  onClick={() => {
                    setTo(selectedMessage.from || "");
                    setSubject(`Re: ${selectedMessage.subject || ""}`);
                    setSelectedMessage(null);
                    setComposeOpen(true);
                  }}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Répondre
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-ink">
              Envoyer un e-mail au nom de {expert.name}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSend} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="to">Destinataire (À)</Label>
              <Input
                id="to"
                type="email"
                placeholder="client@entreprise.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Objet</Label>
              <Input
                id="subject"
                placeholder="Sujet de votre message"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <textarea
                id="body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Rédigez votre message ici..."
                className="w-full rounded-[14px] border border-line bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={sending} className="gap-2">
                <Send className={cn("h-4 w-4", sending && "animate-spin")} />
                {sending ? "Envoi en cours..." : "Envoyer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
