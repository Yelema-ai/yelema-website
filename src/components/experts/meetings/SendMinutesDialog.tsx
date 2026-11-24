"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { SendOptions, SendRequest, SenderChoice } from "@/lib/meetings/audience";
import type { MeetingContact } from "@/lib/meetings/minutes";
import { MAX_RECIPIENTS, isEmail } from "@/lib/meetings/record";
import type { MeetingView } from "@/lib/meetings/view";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Picker } from "@/components/ui/picker";

interface Audience {
  me: boolean;
  company: boolean;
  participants: boolean;
  others: boolean;
}

const NO_AUDIENCE: Audience = { me: false, company: false, participants: false, others: false };
const EXPERT_SENDER = "expert";

const senderValue = (s: SenderChoice | null) => (!s ? "" : s.kind === "expert" ? EXPERT_SENDER : s.account);
const senderOf = (value: string): SenderChoice => (value === EXPERT_SENDER ? { kind: "expert" } : { kind: "connected", account: value });

function Chip({ on, disabled, label, title, onToggle }: { on: boolean; disabled?: boolean; label: string; title?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        on ? "border-brand bg-tint text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-soft"
      )}
    >
      {on && <Check className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmailsField({ emails, onChange }: { emails: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const add = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    const known = new Set(emails.map((e) => e.toLowerCase()));
    const fresh = parts.filter((p) => isEmail(p) && !known.has(p.toLowerCase()));
    const bad = parts.filter((p) => !isEmail(p));
    if (fresh.length) onChange([...emails, ...fresh].slice(0, MAX_RECIPIENTS));
    setInvalid(bad.length > 0);
    setDraft(bad.join(" "));
  };
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 focus-within:border-brand">
        {emails.map((email) => (
          <span key={email} className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-soft py-0.5 pl-2.5 pr-0.5 text-[13px] text-ink">
            <span className="truncate">{email}</span>
            <button type="button" aria-label={`Retirer ${email}`} onClick={() => onChange(emails.filter((e) => e !== email))} className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-soft-2 hover:text-ink">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="email"
          inputMode="email"
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && emails.length) {
              onChange(emails.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          onPaste={(e) => {
            e.preventDefault();
            add(`${draft} ${e.clipboardData.getData("text")}`);
          }}
          placeholder={emails.length ? "" : "nom@entreprise.com"}
          aria-label="Adresses e-mail"
          aria-invalid={invalid || undefined}
          className="h-7 w-0 min-w-[8rem] flex-1 bg-transparent px-1 text-[14px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {invalid && <p className="mt-1 text-[12px] text-ko">Adresse e-mail invalide.</p>}
    </div>
  );
}

export function SendMinutesDialog({
  open,
  onOpenChange,
  contacts,
  loadOptions,
  onSend,
  expertName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: MeetingContact[];
  loadOptions: () => Promise<SendOptions>;
  onSend: (request: SendRequest) => Promise<MeetingView>;
  expertName: string;
}) {
  const [options, setOptions] = useState<SendOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sender, setSender] = useState<SenderChoice | null>(null);
  const [audience, setAudience] = useState<Audience>(NO_AUDIENCE);
  const [emails, setEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setOptions(null);
    setLoadError(null);
    setError(null);
    setEmails([]);
    setAudience(NO_AUDIENCE);
    loadOptions()
      .then((o) => {
        if (!live) return;
        setOptions(o);
        setSender(o.expert?.canSend ? { kind: "expert" } : o.connected[0] ? { kind: "connected", account: o.connected[0].id } : null);
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [open, loadOptions]);

  const fromOptions = options
    ? [...(options.expert?.canSend ? [{ value: EXPERT_SENDER, label: options.expert.address }] : []), ...options.connected.map((c) => ({ value: c.id, label: c.email }))]
    : [];
  const chosen = audience.me || audience.company || audience.participants || (audience.others && emails.length > 0);
  const toggle = (key: keyof Audience) => setAudience((a) => ({ ...a, [key]: !a[key] }));

  const submit = async () => {
    if (!sender) return;
    setSending(true);
    setError(null);
    try {
      const view = await onSend({
        sender,
        audience: { me: audience.me, company: audience.company, participants: audience.participants, emails: audience.others ? emails : [] },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (view.status === "sending") toast.success(`${expertName} envoie le compte rendu.`);
      else if (view.lastFailure) toast.warning(view.lastFailure.reason);
      else toast.success("Compte rendu envoyé.");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] gap-3.5 overflow-y-auto overflow-x-hidden p-5 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        <DialogTitle className="pr-8 text-[17px] font-bold text-ink">Envoyer le compte rendu</DialogTitle>

        {!options && !loadError && (
          <p className="flex items-center gap-2 py-3 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" /> Chargement…
          </p>
        )}
        {loadError && <p className="text-sm text-ko">{loadError}</p>}

        {options && (
          <>
            <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-3">
              <span className="text-[13px] font-semibold text-ink-3">De</span>
              {fromOptions.length ? (
                <Picker
                  label="De"
                  value={senderValue(sender)}
                  onChange={(v) => setSender(senderOf(v))}
                  groups={[{ options: fromOptions }]}
                  placeholder="Choisir une adresse"
                  className="w-full sm:h-9"
                />
              ) : (
                <Link href="/integrations/connecteurs" className="truncate text-[14px] font-semibold text-link underline-offset-2 hover:underline">
                  Connecter une boîte e-mail
                </Link>
              )}

              <span className="self-start pt-1.5 text-[13px] font-semibold text-ink-3">À</span>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  <Chip on={audience.me} disabled={!options.me} label="Moi" title={options.me ?? undefined} onToggle={() => toggle("me")} />
                  <Chip
                    on={audience.company}
                    disabled={options.company.length === 0}
                    label={`Entreprise · ${options.company.length}`}
                    title={options.company.join(", ") || undefined}
                    onToggle={() => toggle("company")}
                  />
                  <Chip
                    on={audience.participants}
                    disabled={contacts.length === 0}
                    label={`Participants · ${contacts.length}`}
                    title={contacts.map((c) => c.email).join(", ") || undefined}
                    onToggle={() => toggle("participants")}
                  />
                  <button
                    type="button"
                    aria-expanded={audience.others}
                    onClick={() => toggle("others")}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                      audience.others ? "border-brand bg-tint text-brand-ink" : "border-dashed border-line text-ink-2 hover:bg-soft"
                    )}
                  >
                    {audience.others ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                    E-mail
                  </button>
                </div>
                {audience.participants && contacts.length > 0 && (
                  <p className="break-words text-xs text-ink-3">Adresses relevées par l’Expert, à vérifier avant l’envoi : {contacts.map((c) => c.email).join(", ")}</p>
                )}
                {audience.others && <EmailsField emails={emails} onChange={setEmails} />}
              </div>
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-ko">
                {error}
              </p>
            )}

            <Button className="w-full rounded-full" onClick={() => void submit()} disabled={!sender || !chosen || sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Envoyer
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
