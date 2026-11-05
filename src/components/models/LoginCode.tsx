"use client";

import { usePoll, WAIT_POLL_MS } from "@/components/usePoll";
import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { safeVerificationUrl } from "@/lib/llm";
import type { LlmAccount } from "@/lib/llm-accounts";

// Une connexion en attente : l'adresse à ouvrir et le code à y saisir, avec le compte à ajouter. Le
// back-office est relu jusqu'à l'approbation ; `onDone` est appelé quand elle aboutit ou échoue.
export function LoginCode({ account, onDone, compact }: { account: LlmAccount; onDone: () => Promise<void>; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = safeVerificationUrl(account.login?.verificationUrl);

  // Hidden: nothing is asked until the tab shows again (back from the sign-in tab: at once). A failed
  // read keeps the wait: the next turn reads again.
  const poller = usePoll(
    async () => {
      const next = await apiFetch<LlmAccount>(`/api/llm/accounts/${account.id}`);
      if (next.state === "active") toast.success("Compte connecté", { description: "L’installation sur l’instance est en cours." });
      if (next.state === "failed") toast.error("La connexion n’a pas abouti (refusée ou code expiré). Relancez-la.");
      if (next.state === "pending") return;
      poller.current?.stop();
      await onDone();
    },
    { everyMs: WAIT_POLL_MS, immediate: false, runOnShow: true, wake: { types: ["job.done"], kind: "llm" } }
  );

  if (!account.login || !url) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(account.login!.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div role="status" className={compact ? "flex flex-wrap items-center gap-2 text-xs" : "space-y-3 py-2 text-center"}>
      {!compact && <p className="text-xs text-ink-3">Ouvrez la page du fournisseur, connectez-vous avec le compte à ajouter et saisissez ce code :</p>}
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-soft px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-ink">
        {account.login.userCode}
        <button type="button" aria-label="Copier le code" onClick={() => void copy()} className="text-ink-3 hover:text-ink">
          {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
        Ouvrir la page <ExternalLink className="h-3 w-3" />
      </a>
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
        <Loader2 className="h-3 w-3 animate-spin" /> En attente d’approbation…
      </span>
    </div>
  );
}
