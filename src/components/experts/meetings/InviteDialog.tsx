"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseMeetingLink } from "@/lib/meetings/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const INVALID_LINK = "Collez le lien d’une réunion Google Meet ou Microsoft Teams.";

export function InviteDialog({
  open,
  onOpenChange,
  expertName,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertName: string;
  onInvite: (link: string) => Promise<unknown>;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setLink("");
      setError(null);
    }
    onOpenChange(next);
  };

  const invite = async () => {
    if (busy) return;
    if (!parseMeetingLink(link)) {
      setError(INVALID_LINK);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onInvite(link.trim());
      toast.success(`${expertName} rejoint la réunion.`);
      setLink("");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-3.5 overflow-x-hidden p-5 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        <DialogTitle className="pr-8 text-[17px] font-bold text-ink">Inviter {expertName} dans une réunion</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
            <Link2 className="size-4 shrink-0 text-ink-3" />
            <input
              type="url"
              inputMode="url"
              autoFocus
              value={link}
              disabled={busy}
              onChange={(e) => {
                setLink(e.target.value);
                setError(null);
              }}
              placeholder="Lien Google Meet ou Teams"
              aria-label="Lien de la réunion"
              aria-invalid={error ? true : undefined}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-ko">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !link.trim()}
            aria-busy={busy || undefined}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Inviter
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
