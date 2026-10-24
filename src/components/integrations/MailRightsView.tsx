"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { MailRights, MailRightsPatch } from "@/lib/mail";
import { expertDisplayName } from "@/lib/experts";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Who may have each expert write e-mails. One inbox per expert for the whole workspace, and three
// settings that add up: the expert may send at all, only some members may ask it to, and it may
// write outside the company. The back office applies them before every sending, whoever asks.

const STATUS: Record<MailRights["status"], string> = { pending: "En création", active: "Active", suspended: "Suspendue" };

export function MailRightsView() {
  const [inboxes, setInboxes] = useState<MailRights[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const { current } = useWorkspace();
  const { catalogue } = useCatalogue(current?.id);
  const nameOf = (key: string) => catalogue.experts.find((e) => e.key === key)?.name ?? expertDisplayName(key);

  useEffect(() => {
    apiFetch<{ items: MailRights[] }>("/api/mail/rights")
      .then((data) => setInboxes(data.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(inbox: MailRights, patch: MailRightsPatch) {
    setSaving(inbox.expert);
    try {
      const next = await apiFetch<MailRights>(`/api/mail/rights/${inbox.expert}`, { method: "PUT", body: JSON.stringify(patch) });
      setInboxes((list) => (list ?? []).map((i) => (i.expert === next.expert ? next : i)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="sr-only">E-mails des Experts</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Chaque Expert a une adresse e-mail pour toute l’entreprise. Vous décidez ici s’il peut écrire, à la demande de qui, et à qui. Ces règles s’appliquent à chaque envoi, que la demande vienne d’un membre ou de l’Expert lui-même.
      </p>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {!inboxes && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}
      {inboxes?.length === 0 && <p className="mt-6 rounded-[22px] border border-line bg-surface p-8 text-center text-sm text-ink-3">Aucun expert n’a encore de boîte e-mail.</p>}

      <div className="mt-5 space-y-4">
        {inboxes?.map((inbox) => {
          const locked = saving === inbox.expert || inbox.status === "suspended";
          return (
            <section key={inbox.expert} className="rounded-[22px] border border-line bg-surface p-5 sm:p-6" aria-busy={saving === inbox.expert}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-ink">{nameOf(inbox.expert)}</h2>
                  <p className="break-all font-mono text-[13px] text-ink-3">{inbox.address ?? "adresse en cours de création"}</p>
                </div>
                <Badge variant={inbox.status === "active" ? "success" : inbox.status === "suspended" ? "warning" : "muted"}>{STATUS[inbox.status]}</Badge>
              </div>
              {inbox.status === "suspended" && <p className="mt-3 text-sm text-ink-3">Cette boîte est suspendue par Yelema : ses réglages ne peuvent pas être modifiés.</p>}

              <div className="mt-4 grid gap-3">
                <Toggle
                  label="Cet Expert peut envoyer des e-mails"
                  hint="Décoché, il reçoit du courrier mais n’envoie rien."
                  checked={inbox.sendEnabled}
                  disabled={locked}
                  onChange={(sendEnabled) => void save(inbox, { sendEnabled })}
                />
                <Toggle
                  label="Il peut écrire hors de l’entreprise"
                  hint="Décoché, seuls les membres de votre entreprise sont joignables."
                  checked={inbox.externalAllowed}
                  disabled={locked || !inbox.sendEnabled}
                  onChange={(externalAllowed) => void save(inbox, { externalAllowed })}
                />
              </div>

              <MemberAccess inbox={inbox} name={nameOf(inbox.expert)} locked={locked} onSave={(senders) => void save(inbox, { senders })} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Who may have the expert write and read its inbox: every member who has it (no list: the back office
// reads an empty one so, and members added later are in too), or some of them, picked in a list that
// stays usable with many members (search, scroll, count). « Certains » needs at least one name: an
// empty list would mean everyone again, so the last checked member cannot be unchecked.
function MemberAccess({ inbox, name, locked, onSave }: { inbox: MailRights; name: string; locked: boolean; onSave: (senders: string[]) => void }) {
  const [some, setSome] = useState(inbox.senders.length > 0);
  const [query, setQuery] = useState("");
  useEffect(() => setSome(inbox.senders.length > 0 || some), [inbox.senders.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inbox.eligible.filter((e) => e.toLowerCase().includes(q)) : inbox.eligible;
  }, [inbox.eligible, query]);
  if (inbox.eligible.length === 0)
    return (
      <div className="mt-5">
        <p className="text-[13px] font-semibold text-ink-3">Qui peut le faire écrire et lire sa boîte</p>
        <p className="mt-2 text-sm text-ink-3">Aucun membre n’a cet Expert dans son équipe.</p>
      </div>
    );
  const choice = (on: boolean, label: string, hint: string, pick: () => void) => (
    <label className={cn("flex flex-1 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors", on ? "border-brand/40 bg-tint/60" : "border-line hover:bg-soft")}>
      <input type="radio" name={`acces-${inbox.expert}`} className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={on} disabled={locked} onChange={pick} />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="mt-5" disabled={locked}>
      <legend className="text-[13px] font-semibold text-ink-3">Qui peut le faire écrire et lire sa boîte</legend>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {choice(!some, `Tous les membres qui ont ${name}`, `${inbox.eligible.length} aujourd’hui, et ceux qui l’auront plus tard`, () => {
          setSome(false);
          if (inbox.senders.length > 0) onSave([]);
        })}
        {choice(some, "Certains membres", some ? `${inbox.senders.length} sur ${inbox.eligible.length}` : "Vous les choisissez un par un", () => setSome(true))}
      </div>
      {some && (
        <div className="mt-3 rounded-2xl border border-line">
          {inbox.eligible.length > 6 && (
            <label className="relative block border-b border-line">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un membre"
                aria-label="Chercher un membre"
                className="h-11 w-full rounded-t-2xl bg-transparent pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          )}
          <ul className="max-h-64 overflow-y-auto p-1.5">
            {shown.map((email) => {
              const checked = inbox.senders.includes(email);
              const last = checked && inbox.senders.length === 1;
              return (
                <li key={email}>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm text-ink hover:bg-soft" title={last ? "Au moins un membre reste coché" : undefined}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--brand)]"
                      checked={checked}
                      disabled={last}
                      onChange={(e) => onSave(e.target.checked ? [...inbox.senders, email] : inbox.senders.filter((x) => x !== email))}
                    />
                    <span className="truncate">{email}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2.5 py-3 text-sm text-ink-3">Aucun membre ne correspond.</li>}
          </ul>
          {inbox.senders.length === 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Cochez au moins un membre : en attendant, tous y ont accès.</p>}
        </div>
      )}
    </fieldset>
  );
}

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
}
