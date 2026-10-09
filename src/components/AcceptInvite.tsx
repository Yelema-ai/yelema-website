"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

const STORAGE_KEY = "agent37wl_workspace";

export function AcceptInvite({
  token,
  workspaceName,
  role,
}: {
  token: string;
  workspaceName: string;
  role: string;
}) {
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      const { workspace_id } = await apiFetch<{ workspace_id: string }>(`/api/invitations/${token}`, {
        method: "POST",
      });
      localStorage.setItem(STORAGE_KEY, workspace_id);
      window.location.href = "/";
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <span className="self-start rounded-full bg-soft-2 px-3 py-1.5 text-[13px] font-semibold text-ink-2">
        Invitation de {workspaceName}
      </span>

      <AuthHeading title="Bienvenue">
        Vous rejoignez l’espace de <b className="text-ink">{workspaceName}</b> en tant que {role}.
        Vos experts vous y attendent.
      </AuthHeading>

      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Un instant…" : "Entrer dans mon espace"}
        <ArrowRight className="size-[18px]" />
      </button>
    </AuthShell>
  );
}
