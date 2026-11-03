"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Globe, Key, Loader2, Plus, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { McpAuth, McpServerDraft, McpToolsReport } from "@/lib/mcp-servers";
import Link from "next/link";
import { searchDirectory, sameTool, serverName, serverSlug, type McpDirectoryEntry } from "@/lib/mcp-directory";
import type { IntegrationToolkitsResult } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { ToolLogo } from "./ToolLogo";
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
// Il s'ouvre sur une seule question, « Quel outil ? » (Leslie, 27/10) : un outil de l'annuaire vérifié
// (lib/mcp-directory) arrive avec son nom de serveur et son adresse déjà remplis, modifiables, puis ce que
// l'outil demande (une clé, dans l'en-tête que l'outil nomme au besoin) ; jamais de renvoi vers Connecteurs (Leslie, 27/10) ; tout autre serveur
// se saisit à la main, comme avant.
export function McpServerDialog({ open, onOpenChange, scopeLabel, onSave, oauth }: { open: boolean; onOpenChange: (open: boolean) => void; scopeLabel: string; onSave: (draft: McpServerDraft) => Promise<void>; oauth: OauthProps }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<Exclude<McpAuth, "stdio">>("none");
  const [token, setToken] = useState("");
  const [header, setHeader] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<McpDirectoryEntry | null>(null);
  const [alsoConnector, setAlsoConnector] = useState(false);
  const ownAgentId = useOwnAgentId();

  // Un dialogue rouvert repart vide : un jeton saisi puis abandonné ne reste pas dans la page.
  useEffect(() => {
    if (open) return;
    setName("");
    setUrl("");
    setAuth("none");
    setToken("");
    setHeader("");
    setStep("pick");
    setQuery("");
    setPicked(null);
    setNameTouched(false);
  }, [open]);

  const found = useMemo(() => searchDirectory(query), [query]);
  // Nothing in the list for what was typed: the address form opens under the search, its name taken from
  // the search until the member changes it.
  const noMatch = query.trim().length >= 2 && found.length === 0;
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (step === "pick" && !picked && !nameTouched) setName(noMatch ? serverSlug(query) : "");
  }, [noMatch, query, step, picked, nameTouched]);

  // The picked tool may also be among Connecteurs (Composio): one line under the form says so, nothing more.
  useEffect(() => {
    setAlsoConnector(false);
    if (!picked || !ownAgentId) return;
    let cancelled = false;
    apiFetch<IntegrationToolkitsResult>(`/api/agents/${ownAgentId}/integrations/toolkits?search=${encodeURIComponent(picked.name)}`)
      .then((r) => !cancelled && setAlsoConnector(r.items.some((k) => sameTool(picked.name, k.name) || sameTool(picked.key, k.slug))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [picked, ownAgentId]);

  function pick(entry: McpDirectoryEntry) {
    setPicked(entry);
    setName(serverName(entry));
    setUrl(entry.url);
    setAuth(entry.auth === "oauth" ? "oauth" : "bearer");
    setHeader(entry.auth === "header" ? (entry.header ?? "") : "");
    setToken("");
  }

  function back() {
    setPicked(null);
    setStep("pick");
    setName("");
    setUrl("");
    setAuth("none");
    setToken("");
    setHeader("");
  }

  // The hand-written server's fields: on « Saisir son adresse », and unfolded right under the search when
  // the tool typed is not in the list (Leslie, 01/11: « pourquoi les champs ne se déroulent pas »).
  function fields(focusName: boolean) {
    return (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-name">
                    Nom du serveur <span className="text-ko">*</span>
                  </Label>
                  <Input id="mcp-name" type="text" placeholder="ex. mon_crm" value={name} onChange={(e) => (setNameTouched(true), setName(e.target.value))} disabled={busy} required autoFocus={focusName} autoComplete="off" spellCheck={false} />
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
                    <Label htmlFor="mcp-header" className="pt-2">En-tête de la clé</Label>
                    <Input id="mcp-header" type="text" placeholder="Authorization: Bearer (par défaut)" value={header} onChange={(e) => setHeader(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />
                    <p className="text-xs text-ink-3">Seulement si le serveur attend sa clé dans un en-tête à lui, par exemple X-API-KEY.</p>
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
    );
  }

  const ready = Boolean(name.trim() && url.trim() && (auth !== "bearer" || token.trim()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), url: url.trim(), auth, ...(auth === "bearer" ? { token: token.trim(), ...(header.trim() ? { header: header.trim() } : {}) } : {}) });
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
        ) : step === "pick" && !picked ? (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Ajouter un outil</DialogTitle>
              <DialogDescription>Pour {scopeLabel}.</DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 focus-within:border-ink">
              <Search className="size-4 shrink-0 text-ink-3" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Quel outil ?"
                aria-label="Quel outil ?"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
              />
            </label>
            <ul className="-mx-1 flex flex-col">
              {found.map((e) => (
                  <li key={e.key}>
                    <button type="button" onClick={() => pick(e)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-soft">
                      <ToolLogo logo={`https://www.google.com/s2/favicons?domain=${e.domain}&sz=64`} name={e.name} className="size-8 rounded-lg" imgClassName="size-5" />
                      <span className="font-medium text-ink">{e.name}</span>
                      <span className="ml-auto text-xs text-ink-3">{e.category}</span>
                    </button>
                  </li>
                ))}
            </ul>
            {noMatch ? (
              <>
                <p className="-mt-1 text-sm text-ink-2">« {query.trim()} » n’est pas dans la liste : saisissez l’adresse de son serveur.</p>
                {fields(false)}
                <DialogFooter>
                  <Button type="submit" disabled={busy || !ready}>
                    {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                    {busy ? (auth === "oauth" && oauth.chains ? "Initialisation…" : "Connexion…") : "Connecter"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-sm text-ink-2">Votre outil n’est pas là ?</span>
                <Button type="button" variant="outline" onClick={() => setStep("form")} className="max-sm:w-full">
                  <Plus /> Saisir son adresse
                </Button>
              </div>
            )}
          </form>
        ) : step === "pick" && picked ? (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Ajouter un outil</DialogTitle>
              <DialogDescription className="sr-only">{picked.name}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <ToolLogo logo={`https://www.google.com/s2/favicons?domain=${picked.domain}&sz=64`} name={picked.name} />
              <span className="font-semibold text-ink">{picked.name}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Nom du serveur</Label>
              <Input id="mcp-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required autoComplete="off" spellCheck={false} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">Adresse du serveur</Label>
              <Input id="mcp-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} required autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />
            </div>
            {(picked.auth === "bearer" || picked.auth === "header") && (
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token">Clé {picked.name}</Label>
                <Input id="mcp-token" type="password" placeholder="Collez votre clé" value={token} onChange={(e) => setToken(e.target.value)} disabled={busy} required autoFocus autoComplete="off" spellCheck={false} />
                <p className="text-xs text-ink-3">À créer dans votre compte {picked.name}. Gardée par Yelema, elle ne sera plus affichée.</p>
              </div>
            )}
            {picked.auth === "oauth" && (
              <p className="rounded-xl bg-soft px-4 py-3 text-sm leading-relaxed text-ink-2">
                {oauth.chains ? `En cliquant sur « Connecter », la page de ${picked.name} s’ouvre : vous vous connectez et validez l’accès.` : `Rien à saisir. Ce membre se connectera ensuite à son propre compte ${picked.name}.`}
              </p>
            )}
            {alsoConnector && (
              <p className="flex items-center justify-between gap-3 text-sm text-ink-2">
                Un connecteur existe aussi pour {picked.name}.
                <Link href="/integrations/connecteurs" onClick={() => onOpenChange(false)} className="shrink-0 font-semibold text-ink underline-offset-2 hover:underline">
                  Voir le connecteur
                </Link>
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={back} disabled={busy}>
                <ChevronLeft /> Retour
              </Button>
              <Button type="submit" disabled={busy || !ready}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                {busy ? (auth === "oauth" && oauth.chains ? "Initialisation…" : "Connexion…") : "Connecter"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Connecter un serveur MCP</DialogTitle>
            <DialogDescription>Branchez un serveur Model Context Protocol pour {scopeLabel}.</DialogDescription>
          </DialogHeader>

          {fields(true)}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={back} disabled={busy}>
              <ChevronLeft /> Retour
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
