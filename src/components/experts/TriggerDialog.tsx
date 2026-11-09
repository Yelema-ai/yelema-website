"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { MAX_INSTRUCTION, MAX_NAME, SOURCE_LABELS, accountChoice, draftOf, hasKey, isMailSource, toolkitOf, triggerAccounts, triggerPayload, type Trigger, type TriggerDraft, type TriggerSource, type TriggerWithKey } from "@/lib/triggers";
import type { IntegrationConnection, IntegrationConnectionsResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Picker } from "@/components/ui/picker";
import { CopyField } from "./TriggerKeyDialog";

const area =
  "w-full resize-y rounded-xl border bg-card px-4 py-3 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";

// Créer ou modifier un déclencheur : l'événement, la consigne ; les conditions et le plafond repliés.
export function TriggerDialog({
  agentId,
  expert,
  sources,
  trigger,
  onClose,
  onSaved,
}: {
  agentId: string;
  expert: { profileId: string; name: string };
  sources: TriggerSource[];
  trigger: Trigger | null;
  onClose: () => void;
  onSaved: (t: TriggerWithKey) => void;
}) {
  const [draft, setDraft] = useState<TriggerDraft>(() => draftOf(trigger, sources[0]));
  const [advanced, setAdvanced] = useState(() => Boolean(trigger && (trigger.filter.senders.length || trigger.filter.domains.length || trigger.filter.keywords.length)));
  const [busy, setBusy] = useState(false);
  // Comptes connectés du membre (null : en lecture). Illisibles : aucun choix, le back-office prend le défaut.
  const [conns, setConns] = useState<IntegrationConnection[] | null>(trigger ? [] : null);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    if (trigger) return;
    let live = true;
    apiFetch<IntegrationConnectionsResult>(`/api/agents/${agentId}/integrations/connections`)
      .then((r) => live && setConns(r.connections))
      .catch(() => live && setConns([]));
    return () => {
      live = false;
    };
  }, [agentId, trigger]);
  const listening = !trigger && toolkitOf(draft.source) !== null;
  const accounts = listening && conns ? triggerAccounts(conns, draft.source) : [];
  const accountId = accounts.some((a) => a.id === picked) ? picked : (accounts[0]?.id ?? "");
  const loadingAccounts = listening && conns === null;
  const set = (patch: Partial<TriggerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const label = "text-[13px] font-semibold text-ink-2";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const out = triggerPayload(draft);
    if ("error" in out) {
      toast.error(out.error);
      return;
    }
    const account = trigger ? {} : accountChoice(accounts, accountId);
    if ("error" in account) {
      toast.error(account.error);
      return;
    }
    setBusy(true);
    try {
      const saved = trigger
        ? await apiFetch<TriggerWithKey>(`/api/triggers/${trigger.id}`, { method: "PATCH", body: JSON.stringify(out.body) })
        : await apiFetch<TriggerWithKey>("/api/triggers", { method: "POST", body: JSON.stringify({ ...out.body, ...account, expert: expert.profileId, source: draft.source }) });
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expert.name}, {trigger ? "modifier le déclencheur" : "quand un événement arrive"}
          </DialogTitle>
          <DialogDescription>
            {expert.name} s’y met dès que l’événement arrive. Ce qu’il reçoit n’est jamais pris pour un ordre : seule votre consigne compte.
          </DialogDescription>
        </DialogHeader>
        <form id="trigger-form" onSubmit={save} className="grid content-start gap-3">
          <div>
            <p className={label}>Quand</p>
            {trigger ? (
              <>
                <p className="mt-1 text-[15px] text-ink">{SOURCE_LABELS[trigger.source]}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">Pour changer l’événement, l’expert ou le délai, supprimez ce déclencheur puis recréez-le.</p>
              </>
            ) : (
              <Picker
                label="Événement"
                placeholder="Choisissez un événement"
                value={draft.source}
                onChange={(v) => set({ source: v as TriggerSource })}
                groups={[{ options: sources.map((s) => ({ value: s, label: SOURCE_LABELS[s] })) }]}
                className="mt-1.5 w-full sm:h-11 sm:text-[15px]"
              />
            )}
          </div>

          {listening && conns !== null && accounts.length === 0 && (
            <p className="text-[12.5px] text-ink-3">Aucun compte connecté pour cet événement : connectez-le d’abord dans Intégrations.</p>
          )}
          {listening && conns !== null && accounts.length > 1 && (
            <div>
              <p className={label}>Compte écouté</p>
              <Picker
                label="Compte"
                placeholder="Choisissez un compte"
                value={accountId}
                onChange={setPicked}
                groups={[{ options: accounts.map((a) => ({ value: a.id, label: a.isDefault ? `${a.title} (par défaut)` : a.title })) }]}
                className="mt-1.5 w-full sm:h-11 sm:text-[15px]"
              />
            </div>
          )}

          {draft.source === "calendar" && (
            <label className="flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
              Prévenir
              <Input type="number" min={5} max={240} step={5} disabled={Boolean(trigger)} aria-label="Minutes avant le rendez-vous" value={draft.leadMinutes} onChange={(e) => set({ leadMinutes: Number(e.target.value) })} className="w-24" />
              minutes avant le rendez-vous
            </label>
          )}

          <div>
            <p className={label}>Alors</p>
            <textarea
              placeholder="Ce que l’expert doit faire. Exemple : range la facture dans le dossier Comptabilité et préviens-moi."
              aria-label="Consigne"
              rows={5}
              maxLength={MAX_INSTRUCTION}
              value={draft.instruction}
              onChange={(e) => set({ instruction: e.target.value })}
              className={cn(area, "mt-1.5")}
            />
            <p className="mt-0.5 text-right text-[12px] text-ink-3">
              {draft.instruction.length} / {MAX_INSTRUCTION}
            </p>
          </div>

          <Input placeholder="Nom (facultatif)" aria-label="Nom du déclencheur" maxLength={MAX_NAME} value={draft.name} onChange={(e) => set({ name: e.target.value })} />

          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
            <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} /> Conditions et limite
          </button>
          {advanced && (
            <div className="grid gap-3 rounded-xl bg-soft px-4 py-3">
              {isMailSource(draft.source) && (
                <>
                  <Input placeholder="Seulement ces expéditeurs (adresses, séparées par des virgules)" aria-label="Expéditeurs" value={draft.senders} onChange={(e) => set({ senders: e.target.value })} />
                  <Input placeholder="Seulement ces domaines (exemple : orange.ci)" aria-label="Domaines" value={draft.domains} onChange={(e) => set({ domains: e.target.value })} />
                </>
              )}
              <Input placeholder="Seulement si l’un de ces mots apparaît (séparés par des virgules)" aria-label="Mots-clés" value={draft.keywords} onChange={(e) => set({ keywords: e.target.value })} />
              <label className="flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
                Au plus
                <Input type="number" min={1} max={30} aria-label="Fois par heure au plus" value={draft.maxPerHour} onChange={(e) => set({ maxPerHour: Number(e.target.value) })} className="w-20" />
                fois par heure
              </label>
              <p className="text-[12.5px] text-ink-3">Laissez vide pour tout accepter. Au-delà du plafond, l’événement est noté et ignoré.</p>
            </div>
          )}

          {trigger?.webhookSubscribed && trigger.source === "unipile" && <p className="text-[13px] text-ink-2">Abonnement Unipile actif : rien à configurer chez Unipile.</p>}
          {trigger?.webhookUrl && hasKey(trigger.source) && !trigger.webhookSubscribed && (
            <div>
              <p className={label}>Adresse à donner à l’autre logiciel</p>
              <CopyField value={trigger.webhookUrl} label="Copier l’adresse" />
              <p className="mt-1 text-[12.5px] text-ink-3">La clé ne s’affiche plus. Perdue ? Choisissez « Nouvelle clé » dans Action.</p>
            </div>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="trigger-form" disabled={busy || loadingAccounts}>
            {busy && <Loader2 className="animate-spin" />}
            {trigger ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
