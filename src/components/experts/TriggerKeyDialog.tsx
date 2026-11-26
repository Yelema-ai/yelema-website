"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { TriggerWithKey } from "@/lib/triggers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("La copie a échoué : sélectionnez le texte et copiez-le à la main.");
    }
  }
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-soft px-3 py-2">
      <code className="min-w-0 flex-1 select-all break-all font-mono text-[12.5px] text-ink">{value}</code>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={label} onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

// La clé d'un webhook, rendue une seule fois par le back-office : copiée ici ou perdue.
export function TriggerKeyDialog({ trigger, onClose }: { trigger: TriggerWithKey & { key: string }; onClose: () => void }) {
  const unipile = trigger.source === "unipile";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Clé de « {trigger.name} »</DialogTitle>
          <DialogDescription>
            {unipile
              ? "Dans votre tableau de bord Unipile, créez un webhook « message_received » vers cette adresse, avec l’en-tête X-Yelema-Key et la clé ci-dessous."
              : "L’autre logiciel envoie ses événements à cette adresse (POST, en JSON), avec l’en-tête X-Yelema-Key et la clé ci-dessous."}
          </DialogDescription>
        </DialogHeader>
        {trigger.webhookUrl && (
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Adresse</p>
            <CopyField value={trigger.webhookUrl} label="Copier l’adresse" />
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold text-ink-2">Clé (X-Yelema-Key)</p>
          <CopyField value={trigger.key} label="Copier la clé" />
        </div>
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Copiez-la maintenant : elle ne sera plus jamais affichée. Perdue, il faudra en demander une nouvelle.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            J’ai copié la clé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
