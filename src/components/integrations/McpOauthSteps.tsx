"use client";

import { Check, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { McpToolsReport } from "@/lib/mcp-servers";

/** Where the authorization of one server stands, in the MCP dialog. `url` arrives once the instance has answered. */
export interface McpOauthFlow {
  serverId: string;
  name: string;
  step: "installing" | "authorizing" | "success";
  url: string | null;
}

type Tool = McpToolsReport["servers"][number]["tools"][number];

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-soft p-3 text-xs text-ink-2">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
      <span className="font-medium">{children}</span>
    </div>
  );
}

// The steps after « Connecter » for an OAuth server: installing on the instance, authorizing at the
// provider (its window, reopenable), then the tools it brought. Tool names come from the server: shown as text only.
export function McpOauthSteps({ flow, tools, onOpenAccess, onCancel, onClose }: { flow: McpOauthFlow; tools: Tool[]; onOpenAccess: () => void; onCancel: () => void; onClose: () => void }) {
  if (flow.step === "success")
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ok-pale text-ok">
          <Check className="h-8 w-8 stroke-[2.5]" />
        </div>
        <div className="space-y-1">
          <DialogTitle className="font-display text-lg font-bold text-ink">Connexion réussie !</DialogTitle>
          <DialogDescription className="text-xs text-ink-3">
            Le serveur MCP <strong>{flow.name}</strong> est maintenant connecté et prêt à l’emploi.
          </DialogDescription>
        </div>
        {tools.length > 0 && (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-line bg-surface p-3 text-left">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Outils disponibles ({tools.length}) :
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tools.map((t) => (
                <span key={t.name} className="rounded-lg bg-soft px-2 py-1 font-mono text-[11px] text-ink" title={t.description || undefined}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose} className="w-full sm:w-auto">
            Terminer
          </Button>
        </DialogFooter>
      </div>
    );

  const installing = flow.step === "installing";
  return (
    <div className="space-y-5 py-2">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint text-brand">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle>Connexion au compte : {flow.name}</DialogTitle>
            <DialogDescription>Finalisez la connexion en autorisant l’accès sur le site officiel.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-ink">Page d’autorisation</p>
            <p className="text-xs text-ink-3">
              {installing ? "Elle s’ouvrira dès que l’outil sera installé." : "Si la fenêtre ne s’est pas ouverte automatiquement, cliquez sur le bouton."}
            </p>
          </div>
          <Button size="sm" onClick={onOpenAccess} disabled={!flow.url} className="shrink-0">
            <ExternalLink className="h-4 w-4" />
            Ouvrir l’accès
          </Button>
        </div>
        <Waiting>{installing ? "Installation de l’outil…" : flow.url ? "En attente de votre validation dans la fenêtre du fournisseur…" : "Préparation de l’autorisation…"}</Waiting>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
          Annuler
        </Button>
      </DialogFooter>
    </div>
  );
}
