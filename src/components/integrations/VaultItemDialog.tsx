"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDENTIFIER_TYPES, type IdentifierType, type VaultDraft } from "@/lib/vault";
import { cn } from "@/lib/utils";

const EMPTY: VaultDraft = { label: "", origin: "", identifierType: "email", identifier: "", password: "", purpose: "" };
const PLACEHOLDER: Record<IdentifierType, string> = { email: "rh@entreprise.ci", username: "acme-tresorerie", phone: "+225 07 00 00 00 00" };

// Ajout d'un accès : ce que demande `hermes vault add`, plus une description pour l'expert. Pas de 2FA.
// Pour tous les experts (par défaut) ou pour certains, cochés. Le brouillon part au back-office ; un
// dialogue refermé repart vide (le mot de passe ne reste pas).
export function VaultItemDialog({ open, onOpenChange, profiles, nameOf, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; profiles: string[]; nameOf: (profile: string) => string; onSave: (profiles: string[], draft: VaultDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<VaultDraft>(EMPTY);
  const [everyone, setEveryone] = useState(true);
  const [some, setSome] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setDraft(EMPTY);
      setEveryone(true);
      setSome([]);
    }
  }, [open]);
  const targets = everyone ? profiles : some;
  const set = <K extends keyof VaultDraft>(k: K, v: VaultDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ready = Boolean(targets.length && draft.label.trim() && draft.origin.trim() && draft.identifier.trim() && draft.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSave(targets, draft);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Ajouter un accès</DialogTitle>
            <DialogDescription>Les Experts choisis pourront se connecter à ce site sans jamais voir le mot de passe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Pour</Label>
            <div role="radiogroup" className="flex gap-1 rounded-xl bg-soft p-1">
              {[
                { on: true, label: "Tous les Experts" },
                { on: false, label: "Certains experts" },
              ].map((o) => (
                <button key={o.label} type="button" role="radio" aria-checked={everyone === o.on} onClick={() => setEveryone(o.on)} className={cn("flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold", everyone === o.on ? "bg-surface text-ink shadow-sm" : "text-ink-2")}>
                  {o.label}
                </button>
              ))}
            </div>
            {!everyone && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {profiles.map((p) => {
                  const on = some.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSome((l) => (on ? l.filter((x) => x !== p) : [...l, p]))}
                      className={cn("inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold", on ? "border-brand bg-tint text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-soft")}
                    >
                      {on && <Check className="size-3.5" />}
                      {nameOf(p)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-label">Libellé</Label>
              <Input id="v-label" value={draft.label} maxLength={80} placeholder="Portail CNPS" onChange={(e) => set("label", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-origin">Lien du site</Label>
              <Input id="v-origin" type="url" inputMode="url" value={draft.origin} placeholder="https://e.cnps.ci/login" onChange={(e) => set("origin", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Identifiant</Label>
            <div role="radiogroup" className="flex gap-1 rounded-xl bg-soft p-1">
              {IDENTIFIER_TYPES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={draft.identifierType === t.value} onClick={() => set("identifierType", t.value)} className={cn("flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold", draft.identifierType === t.value ? "bg-surface text-ink shadow-sm" : "text-ink-2")}>
                  {t.label}
                </button>
              ))}
            </div>
            <Input aria-label="Valeur de l’identifiant" value={draft.identifier} maxLength={254} autoComplete="off" placeholder={PLACEHOLDER[draft.identifierType]} onChange={(e) => set("identifier", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-password">Mot de passe</Label>
            <Input id="v-password" type="password" value={draft.password} maxLength={1024} autoComplete="new-password" onChange={(e) => set("password", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-purpose">À quoi sert cet accès</Label>
            <textarea id="v-purpose" value={draft.purpose} maxLength={300} rows={3} placeholder="Déclarer les salariés à la CNPS chaque mois" onChange={(e) => set("purpose", e.target.value)} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
            <p className="text-xs text-ink-3">L’Expert lit cette description pour savoir quand utiliser cet accès.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {busy && <Loader2 className="animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
          {busy && <p className="text-xs text-ink-3">Si l’instance est en veille, son réveil prend quelques secondes.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
