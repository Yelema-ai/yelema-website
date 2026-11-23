"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiFetchError } from "@/lib/api";
import { EXPERT_NAME_MAX, EXPERT_NAME_RULE, expertName as cleanExpertName } from "@/lib/expert-looks";
import { INBOX_LIMIT_CODE, moreInboxesHref, type MailInbox } from "@/lib/mail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/components/WorkspaceProvider";

export function AssignInboxDialog({
  open,
  onOpenChange,
  expertName,
  owner,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertName: string;
  owner: string | null;
  onAssign: (name: string) => Promise<MailInbox>;
}) {
  const { current } = useWorkspace();
  const [chosenName, setChosenName] = useState(expertName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noneLeft, setNoneLeft] = useState(false);
  const cleanedName = cleanExpertName(chosenName);

  useEffect(() => {
    if (!open) return;
    setChosenName(expertName);
    setError(null);
    setNoneLeft(false);
  }, [open, expertName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    if (!cleanedName) {
      setError(EXPERT_NAME_RULE);
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const created = await onAssign(cleanedName);
      onOpenChange(false);
      toast.success(`Adresse attribuée : ${created.address}`);
    } catch (err) {
      setError((err as Error).message);
      setNoneLeft(err instanceof ApiFetchError && err.code === INBOX_LIMIT_CODE);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attribuer une adresse e-mail</DialogTitle>
          <DialogDescription asChild>
            <div role="alert" className="mt-3 flex gap-2.5 rounded-xl border border-coral/60 bg-coral/20 px-3.5 py-2.5 text-left text-coral-ink">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {owner ? (
                <div className="space-y-0.5 text-xs leading-relaxed">
                  <p className="font-bold">Ce nom ne sert qu’à l’adresse e-mail.</p>
                  <p>L’expert de {owner} garde son nom : seul ce membre peut le renommer.</p>
                </div>
              ) : (
                <div className="space-y-0.5 text-xs leading-relaxed">
                  <p className="font-bold">Attention : ce nom renomme aussi l’expert.</p>
                  <p>Si vous modifiez le nom ci-dessous, l’expert est renommé et son adresse e-mail est créée avec ce même nom.</p>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <Label htmlFor="inbox-expert-name">Nom de l’expert</Label>
            <Input
              id="inbox-expert-name"
              value={chosenName}
              onChange={(e) => {
                setChosenName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={expertName}
              maxLength={EXPERT_NAME_MAX}
              disabled={creating}
              className="mt-1.5"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">
              <p>{error}</p>
              {noneLeft && (
                <a href={moreInboxesHref(current?.name ?? null, cleanedName || expertName)} className="mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2">
                  <Mail className="size-4" />
                  Contacter Yelema
                </a>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Annuler
            </Button>
            <Button type="submit" disabled={creating || !cleanedName}>
              {creating ? <Loader2 className="animate-spin" /> : <Mail />}
              {creating ? "Attribution…" : "Confirmer et attribuer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
