"use client";

import { useEffect, useState } from "react";
import { Globe, Key, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { McpAuth, McpServerDraft, McpToolsReport } from "@/lib/mcp-servers";
import { cn } from "@/lib/utils";
import { McpOauthSteps, type McpOauthFlow } from "./McpOauthSteps";

const AUTH_OPTIONS: { value: Exclude<McpAuth, "stdio">; label: string; description: string; icon: typeof Globe }[] = [
  { value: "none", label: "Aucune", description: "Serveur public, sans clé", icon: Globe },
  { value: "bearer", label: "Jeton Bearer", description: "Une clé ou un jeton d’accès", icon: Key },
  { value: "oauth", label: "OAuth", description: "Connexion sur la page du fournisseur (Notion, Linear…)", icon: ShieldCheck },
];

type OauthProps = {
  /** True when « Connecter » goes on to authorize on the caller's own instance (not for another member's servers). */
  chains: boolean;
  flow: McpOauthFlow | null;
  tools: McpToolsReport["servers"][number]["tools"];
  onOpenAccess: () => void;
  onCancel: () => void;
  onClose: () => void;
};

// Le dialogue d'ajout d'un serveur MCP, puis, pour OAuth, le suivi de l'autorisation. Il ne garde rien :
// le brouillon part au back-office, qui contrôle le nom, l'adresse et le jeton ; son refus revient en une phrase.
export function McpServerDialog({ open, onOpenChange, scopeLabel, onSave, oauth }: { open: boolean; onOpenChange: (open: boolean) => void; scopeLabel: string; onSave: (draft: McpServerDraft) => Promise<void>; oauth: OauthProps }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<Exclude<McpAuth, "stdio">>("none");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  // Un dialogue rouvert repart vide : un jeton saisi puis abandonné ne reste pas dans la page.
  useEffect(() => {
    if (open) return;
    setName("");
    setUrl("");
    setAuth("none");
    setToken("");
  }, [open]);

  const ready = Boolean(name.trim() && url.trim() && (auth !== "bearer" || token.trim()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), url: url.trim(), auth, ...(auth === "bearer" ? { token: token.trim() } : {}) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open || Boolean(oauth.flow)} onOpenChange={(next) => (oauth.flow ? !next && (oauth.flow.step === "success" ? oauth.onClose() : oauth.onCancel()) : !busy && onOpenChange(next))}>
      <DialogContent className="sm:max-w-[580px]">
        {oauth.flow ? (
          <McpOauthSteps flow={oauth.flow} tools={oauth.tools} onOpenAccess={oauth.onOpenAccess} onCancel={oauth.onCancel} onClose={oauth.onClose} />
        ) : (
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Connecter un serveur MCP</DialogTitle>
            <DialogDescription>Branchez un serveur Model Context Protocol pour {scopeLabel}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">
                Nom du serveur <span className="text-ko">*</span>
              </Label>
              <Input id="mcp-name" type="text" placeholder="ex. mon_crm" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required autoFocus autoComplete="off" spellCheck={false} />
              <p className="text-xs text-ink-3">Des minuscules, des chiffres ou « _ », sans espace ni tiret. Vos Experts retrouvent ses outils sous ce nom.</p>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="mcp-url">
                  Adresse du serveur <span className="text-ko">*</span>
                </Label>
                <Input id="mcp-url" type="url" placeholder="https://exemple.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} required autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />
                <p className="text-xs text-ink-3">En https, joignable depuis Internet : vos Experts tournent dans le cloud, pas sur votre réseau.</p>
              </div>

            <fieldset className="space-y-1.5" disabled={busy}>
              <legend className="mb-1.5 text-sm font-medium text-ink">Authentification</legend>
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {AUTH_OPTIONS.map((opt) => {
                  const selected = auth === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setAuth(opt.value)}
                      className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", selected ? "border-brand bg-tint/60" : "border-line bg-surface hover:border-brand/40")}
                    >
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-on-brand" : "bg-soft-2 text-ink-2")}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight text-ink">{opt.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-ink-3">{opt.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {auth === "bearer" && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="mcp-token">
                  Jeton Bearer <span className="text-ko">*</span>
                </Label>
                <Input id="mcp-token" type="password" placeholder="Jeton ou clé secrète" value={token} onChange={(e) => setToken(e.target.value)} disabled={busy} required autoComplete="off" spellCheck={false} />
                <p className="text-xs text-ink-3">Chiffré et gardé par Yelema ; il ne sera plus affiché, seulement ses quatre derniers caractères.</p>
              </div>
            )}

            {auth === "oauth" && (
              <div className="space-y-1 rounded-xl border border-brand/20 bg-tint/60 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-brand">
                  <ShieldCheck className="h-3.5 w-3.5" /> Flux OAuth interactif sécurisé
                </p>
                <p className="leading-relaxed text-ink-2">
                  {oauth.chains
                    ? "En cliquant sur « Connecter », une fenêtre d’autorisation s’ouvrira directement sur le site du fournisseur pour vous connecter et valider l’accès. Chaque membre autorise ensuite son propre compte ; l’accès reste sur son instance."
                    : "Rien à saisir ici. Une fois le serveur installé, ce membre clique « Autoriser » et se connecte avec son propre compte chez le fournisseur ; l’accès reste sur son instance."}
                </p>
              </div>
            )}

            <p className="rounded-xl bg-soft px-3 py-2.5 text-xs leading-relaxed text-ink-2">
              Les outils de ce serveur seront offerts à tous les Experts concernés ; Yelema ne les vérifie pas. La conversation en cours sera interrompue le temps de l’installation.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !ready}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              {busy ? (auth === "oauth" && oauth.chains ? "Initialisation…" : "Connexion…") : "Connecter"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
