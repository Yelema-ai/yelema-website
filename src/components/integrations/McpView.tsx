"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe,
  Key,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export interface McpServer {
  name: string;
  url: string;
  transport?: string;
  isManaged?: boolean;
  status: "active" | "error";
  hasAuth: boolean;
  authType?: "none" | "bearer" | "oauth";
}

type AuthTypeOption = "none" | "bearer" | "oauth";

const AUTH_OPTIONS = [
  {
    value: "none" as const,
    label: "Aucune (None)",
    description: "Serveur public ou sans clé d'autorisation",
    icon: Globe,
  },
  {
    value: "bearer" as const,
    label: "Bearer token",
    description: "Clé API secrète ou token d'accès dans le header",
    icon: Key,
  },
  {
    value: "oauth" as const,
    label: "OAuth",
    description: "Autorisation via flux OAuth 2.0",
    icon: ShieldCheck,
  },
];

export function McpView({ agentId }: { agentId: string }) {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<AuthTypeOption>("none");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Deletion state
  const [serverToDelete, setServerToDelete] = useState<McpServer | null>(null);

  const loadServers = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ servers: McpServer[] }>(`/api/agents/${agentId}/mcp`);
      setServers(data.servers || []);
    } catch (e) {
      toast.error("Impossible de charger les serveurs MCP.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) loadServers();
  }, [agentId]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Veuillez renseigner le nom du serveur.");
      return;
    }
    if (!url.trim()) {
      toast.error("Veuillez renseigner l'URL du serveur.");
      return;
    }
    if (authType === "bearer" && !token.trim()) {
      toast.error("Veuillez renseigner le Bearer token.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch<{ server: McpServer }>(`/api/agents/${agentId}/mcp`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          transport: "HTTP/SSE",
          url: url.trim(),
          authType,
          token: token.trim(),
        }),
      });

      toast.success("Serveur MCP connecté avec succès !");
      setName("");
      setUrl("");
      setToken("");
      setAuthType("none");
      setModalOpen(false);
      setServers((prev) => (prev ? [...prev.filter((s) => s.name !== res.server.name), res.server] : [res.server]));
    } catch (e: any) {
      toast.error(e?.message || "Échec de la connexion du serveur MCP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!serverToDelete) return;
    try {
      await apiFetch(`/api/agents/${agentId}/mcp?name=${encodeURIComponent(serverToDelete.name)}`, {
        method: "DELETE",
      });
      toast.success(`Serveur ${serverToDelete.name} supprimé.`);
      setServers((prev) => (prev ? prev.filter((s) => s.name !== serverToDelete.name) : []));
      setServerToDelete(null);
    } catch (e: any) {
      toast.error(e?.message || "Échec de la suppression.");
    }
  };

  const currentAuth = AUTH_OPTIONS.find((o) => o.value === authType) || AUTH_OPTIONS[0];
  const CurrentAuthIcon = currentAuth.icon;

  return (
    <div className="space-y-6">
      {/* Header section identical to TeamView / ConnectorsView */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] font-bold tracking-tight text-ink">Serveurs MCP</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">
            Connectez vos serveurs Model Context Protocol (MCP) pour étendre les capacités de vos experts.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="self-start sm:self-auto">
          <Plus /> Ajouter un serveur MCP
        </Button>
      </div>

      {/* Info card */}
      <div className="flex items-start gap-3.5 rounded-[22px] border border-line bg-surface p-4 text-sm text-ink-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint text-brand">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="font-semibold text-ink">Fonctionnement direct & sécurisé</p>
          <p className="text-xs leading-relaxed text-ink-3">
            Les serveurs MCP sont branchés directement sur votre instance d'experts via le protocole MCP. Tous les experts du workspace peuvent utiliser leurs outils.
          </p>
        </div>
      </div>

      {/* Server list */}
      <div className="space-y-3">
        <p className="text-[13px] font-semibold text-ink-3 uppercase tracking-wider">
          Serveurs connectés ({servers?.length ?? (loading ? "…" : 0)})
        </p>

        {loading ? (
          <div className="flex min-h-[12rem] items-center justify-center rounded-[22px] border border-line bg-surface p-8">
            <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
          </div>
        ) : servers && servers.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => (
              <div
                key={server.name}
                className="flex min-h-[76px] items-center gap-3 rounded-[22px] border border-line bg-surface py-3 pl-4 pr-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint text-brand">
                  <Server className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {server.name === "apps" ? "Connecteurs Yelema" : server.name}
                    </p>
                    {server.isManaged && (
                      <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-ink-3">
                        Par défaut
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-[12px] text-ink-3" title={server.url}>
                    {server.url}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
                    <Check className="h-3.5 w-3.5" />
                    Actif
                  </span>

                  {!server.isManaged && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Options pour ${server.name}`}
                          className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setServerToDelete(server)}
                        >
                          <Trash2 /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-line px-6 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3 mb-3">
              <Layers className="h-6 w-6" />
            </div>
            <p className="font-semibold text-ink text-sm">Aucun serveur MCP personnalisé</p>
            <p className="text-xs text-ink-3 mt-1 max-w-sm">
              Ajoutez vos serveurs MCP pour connecter vos sources de données et outils externes à vos agents.
            </p>
            <Button
              onClick={() => setModalOpen(true)}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              <Plus />
              Ajouter un serveur MCP
            </Button>
          </div>
        )}
      </div>

      {/* Modal: Connecter un serveur MCP */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleConnect} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Connecter un serveur MCP</DialogTitle>
              <DialogDescription>
                Renseignez les paramètres de connexion pour brancher un serveur Model Context Protocol à vos experts.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Field 1: NAME */}
              <div className="space-y-1.5">
                <Label htmlFor="mcp-name">
                  Nom du serveur <span className="text-ko">*</span>
                </Label>
                <Input
                  id="mcp-name"
                  type="text"
                  placeholder="ex. my-server"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  required
                  autoFocus
                />
                <p className="text-xs text-ink-3">Identifiant unique pour ce serveur MCP.</p>
              </div>

              {/* Field 2: URL */}
              <div className="space-y-1.5">
                <Label htmlFor="mcp-url">
                  URL du serveur <span className="text-ko">*</span>
                </Label>
                <Input
                  id="mcp-url"
                  type="url"
                  placeholder="https://example.com/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={submitting}
                  required
                  className="font-mono text-[13px]"
                />
                <p className="text-xs text-ink-3">Endpoint HTTP / SSE exposé par le serveur.</p>
              </div>

              {/* Field 3: AUTHENTICATION (Custom Styled DropdownMenu) */}
              <div className="space-y-1.5">
                <Label htmlFor="mcp-auth">Authentification</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      id="mcp-auth"
                      type="button"
                      disabled={submitting}
                      className="flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2 text-[14px] text-ink transition-colors hover:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-soft-2 text-brand">
                          <CurrentAuthIcon className="h-3.5 w-3.5" />
                        </div>
                        <span className="truncate font-medium">{currentAuth.label}</span>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(23,17,43,.25)]"
                  >
                    {AUTH_OPTIONS.map((opt) => {
                      const isSelected = authType === opt.value;
                      const Icon = opt.icon;
                      return (
                        <DropdownMenuItem
                          key={opt.value}
                          onSelect={() => setAuthType(opt.value)}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
                            isSelected
                              ? "bg-tint/80 text-brand"
                              : "hover:bg-soft text-ink"
                          )}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 transition-colors",
                                isSelected ? "bg-brand text-on-brand" : "bg-soft-2 text-ink-2"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-tight">{opt.label}</p>
                              <p className="text-xs text-ink-3 leading-snug mt-0.5">{opt.description}</p>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="h-4 w-4 shrink-0 text-brand stroke-[2.5]" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-ink-3">Méthode de sécurité requise pour accéder aux outils.</p>
              </div>

              {/* Conditional Bearer Token field */}
              {authType === "bearer" && (
                <div className="space-y-1.5 pt-1 animate-in fade-in-50 duration-200">
                  <Label htmlFor="mcp-token">
                    Bearer Token / Clé secrète <span className="text-ko">*</span>
                  </Label>
                  <Input
                    id="mcp-token"
                    type="password"
                    placeholder="Bearer token ou clé secrète..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={submitting}
                    required
                  />
                  <p className="text-xs text-ink-3">
                    Transmis dans l'en-tête Authorization de chaque appel.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={submitting || !name.trim() || !url.trim() || (authType === "bearer" && !token.trim())}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
                {submitting ? "Connexion…" : "Connecter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation delete dialog */}
      <ConfirmDialog
        open={Boolean(serverToDelete)}
        onOpenChange={(open) => !open && setServerToDelete(null)}
        title="Supprimer le serveur MCP"
        description={`Êtes-vous sûr de vouloir supprimer le serveur MCP "${serverToDelete?.name}" ? Vos experts ne pourront plus utiliser les outils associés.`}
        confirmText="Supprimer"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
