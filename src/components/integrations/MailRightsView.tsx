"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { MailRights, MailRightsPatch } from "@/lib/mail";
import { expertDisplayName } from "@/lib/experts";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";

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
      <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">E-mails des experts</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Chaque expert a une adresse e-mail pour toute l’entreprise. Vous décidez ici s’il peut écrire, à la demande de qui, et à qui. Ces règles s’appliquent à chaque envoi, que la demande vienne d’un membre ou de l’expert lui-même.
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
                  label="Cet expert peut envoyer des e-mails"
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

              <fieldset className="mt-5" disabled={locked}>
                <legend className="text-[13px] font-semibold text-ink-3">Membres autorisés à le faire écrire et à lire sa boîte</legend>
                {inbox.eligible.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-3">Aucun membre n’a cet expert dans son équipe.</p>
                ) : (
                  <>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {inbox.eligible.map((email) => (
                        <li key={email}>
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--brand)]"
                              checked={inbox.senders.includes(email)}
                              onChange={(e) => void save(inbox, { senders: e.target.checked ? [...inbox.senders, email] : inbox.senders.filter((s) => s !== email) })}
                            />
                            <span className="truncate">{email}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ink-3">
                      {inbox.senders.length === 0 ? "Aucun membre coché : tous ceux qui ont cet expert y ont accès." : "Seuls les membres cochés y ont accès."}
                    </p>
                  </>
                )}
              </fieldset>
            </section>
          );
        })}
      </div>
    </div>
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
