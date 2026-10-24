"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Layers, Loader2, MoreHorizontal, Plus, RefreshCw, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StateBadge } from "@/components/models/MemberSources";
import { ScopePicker } from "@/components/models/ScopePicker";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";
import type { SettingScope } from "@/lib/llm";
import { mcpPending, type McpOauthServer, type McpOverview, type McpServer, type McpServerDraft, type McpToolsOverview, type McpToolsReport, type McpWritten } from "@/lib/mcp-servers";
import { type McpOauthFlow } from "./McpOauthSteps";
import { McpServerDialog } from "./McpServerDialog";

// Une pose prend d'ordinaire moins d'une minute par instance ; au-delà, on cesse de relire seul.
const POLL_MS = 4_000;
const POLL_TRIES = 45;
// Une autorisation attend le fournisseur au plus 10 minutes sur l'instance.
const OAUTH_POLL_MS = 3_000;
const OAUTH_POLL_TRIES = 200;

const scopeUrl = (scope: SettingScope) => (scope.kind === "member" ? `/api/mcp/members/${encodeURIComponent(scope.id)}` : `/api/mcp/${scope.kind}`);

type Access = { connected: boolean; busy: boolean; onAuthorize: () => void };

/** OAuth : l'accès du membre connecté, sur sa propre instance. */
function OauthAccess({ server, access }: { server: McpServer; access: Access }) {
  if (access.connected)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2 py-0.5 text-[11px] font-semibold text-ok">
        <CheckCircle2 className="h-3 w-3" /> Autorisé
      </span>
    );
  return (
    <Button size="sm" variant="outline" onClick={access.onAuthorize} disabled={access.busy || server.state !== "applied"} title={server.state !== "applied" ? "Disponible une fois le serveur installé" : undefined}>
      {access.busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Autoriser
    </Button>
  );
}

type Tools = McpToolsReport["servers"][number];

/** Les outils relevés sur l'instance : texte venu du serveur, affiché tel quel, jamais interprété. */
function ToolList({ tools }: { tools: Tools }) {
  const [open, setOpen] = useState(false);
  if (tools.state !== "ok") return null;
  return (
    <div className="border-t border-line px-4 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-[12px] font-semibold text-ink-2">
        {tools.tools.length} outil{tools.tools.length > 1 ? "s" : ""} disponible{tools.tools.length > 1 ? "s" : ""}
        <ChevronDown className={open ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
      </button>
      {open && (
        <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
          {tools.tools.map((t) => (
            <li key={t.name} className="text-[11px] leading-snug text-ink-3">
              <span className="font-mono text-ink-2">{t.name}</span>
              {t.description && <> — {t.description}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ServerCard({ server, note, access, tools, catalogueLabel, onRemove }: { server: McpServer; note?: string; access?: Access; tools?: Tools; catalogueLabel?: string; onRemove?: () => void }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface">
      <div className="flex min-h-[76px] items-center gap-3 py-3 pl-4 pr-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint text-brand">
          <Server className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-semibold text-ink">{server.name}</p>
            {server.auth === "oauth" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-brand">
                <ShieldCheck className="h-3 w-3" /> OAuth
              </span>
            )}
            {note && <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-ink-3">{note}</span>}
          </div>
          {server.auth === "stdio" ? (
            <p className="truncate text-[12px] text-ink-3">Catalogue Yelema · {catalogueLabel ?? server.stdio}</p>
          ) : (
            <p className="truncate font-mono text-[12px] text-ink-3" title={server.url}>
              {server.url}
            </p>
          )}
          <p className="text-[11px] text-ink-3">
            {server.auth === "stdio" ? "Lancé sur l’instance" : server.auth === "oauth" ? "OAuth · chacun autorise son compte" : server.hint ? `Jeton ${server.hint}` : "Sans jeton"}
            {tools?.state === "failed" && <span className="text-ko"> · injoignable au dernier relevé</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {access && server.state === "applied" ? <OauthAccess server={server} access={access} /> : <StateBadge state={server.state} />}
          {(onRemove || (access?.connected && !access.busy)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Options pour ${server.name}`} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {access?.connected && (
                  <DropdownMenuItem onSelect={access.onAuthorize}>
                    <RefreshCw /> Réautoriser
                  </DropdownMenuItem>
                )}
                {onRemove && (
                  <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                    <Trash2 /> Supprimer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {tools && <ToolList tools={tools} />}
    </div>
  );
}

// Administration · MCP : les serveurs d'outils que le client branche sur ses experts. L'écran
// affiche ce que le back-office sert (serveurs en place, état) et lui demande d'en ajouter ou d'en
// retirer ; il n'écrit rien sur une instance et ne garde aucun jeton.
export function McpView() {
  const [data, setData] = useState<McpOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SettingScope>({ kind: "own" });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<McpServer | null>(null);
  const [tries, setTries] = useState(0);
  const [oauth, setOauth] = useState<Record<string, McpOauthServer>>({});
  const [flow, setFlow] = useState<McpOauthFlow | null>(null);
  const popup = useRef<Window | null>(null);
  const [tools, setTools] = useState<McpToolsOverview | null>(null);
  const [surveying, setSurveying] = useState(false);
  const [oauthTries, setOauthTries] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<McpOverview>("/api/mcp"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTools = useCallback(() => {
    apiFetch<McpToolsOverview>("/api/mcp/tools").then(setTools, () => setTools(null));
  }, []);
  useEffect(() => {
    if (data && !mcpPending(data)) loadTools();
  }, [data, loadTools]);

  async function survey() {
    setSurveying(true);
    try {
      const own = await apiFetch<McpToolsReport>("/api/mcp/tools/refresh", { method: "POST" });
      setTools((t) => ({ ...t, own }));
      toast.success("Outils relevés sur votre instance");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSurveying(false);
    }
  }

  // L'accès OAuth se lit sur l'instance de l'appelant : seulement s'il porte un serveur OAuth.
  const hasOauth = Boolean(data && [...data.own, ...(data.client ?? [])].some((s) => s.auth === "oauth"));
  const loadOauth = useCallback(async () => {
    try {
      const { servers } = await apiFetch<{ servers: McpOauthServer[] }>("/api/mcp/oauth");
      setOauth(Object.fromEntries(servers.map((s) => [s.id, s])));
      return servers;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (hasOauth) void loadOauth();
  }, [hasOauth, loadOauth]);

  // La fenêtre du fournisseur s'ouvre au clic (sinon bloquée), vide, puis reçoit son adresse sans lien vers cette page.
  function openPopup(name: string) {
    const w = window.open("about:blank", "mcp-oauth", "popup,width=600,height=750");
    if (w) {
      w.document.title = "Autorisation";
      w.document.body.style.cssText = "font:14px system-ui,sans-serif;padding:24px;color:#444";
      w.document.body.textContent = `Préparation de l’autorisation de ${name}…`;
    }
    popup.current = w;
  }
  const closePopup = useCallback(() => {
    if (popup.current && !popup.current.closed) popup.current.close();
    popup.current = null;
  }, []);
  useEffect(() => closePopup, [closePopup]);

  function openAccess() {
    if (!flow?.url) return;
    if (popup.current && !popup.current.closed) popup.current.focus();
    else window.open(flow.url, "mcp-oauth", "popup,width=600,height=750,noopener");
  }

  async function startAuth(serverId: string, name: string) {
    setFlow({ serverId, name, step: "authorizing", url: null });
    setOauthTries(0);
    try {
      const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(`/api/mcp/oauth/${encodeURIComponent(serverId)}`, { method: "POST" });
      if (!authorizationUrl.startsWith("https://")) throw new Error("Adresse d’autorisation refusée.");
      setFlow((f) => (f?.serverId === serverId ? { ...f, url: authorizationUrl } : f));
      const w = popup.current;
      if (w && !w.closed) {
        w.opener = null;
        w.location.href = authorizationUrl;
      }
    } catch (e) {
      closePopup();
      setFlow(null);
      toast.error((e as Error).message);
    }
  }

  function authorize(server: McpServer) {
    openPopup(server.name);
    void startAuth(server.id, server.name);
  }

  function cancelFlow() {
    if (flow?.step === "authorizing") void apiFetch("/api/mcp/oauth", { method: "DELETE" }).catch(() => undefined);
    closePopup();
    setFlow(null);
  }

  // Un serveur OAuth tout juste ajouté : l'autorisation part dès qu'il est posé sur les instances.
  useEffect(() => {
    if (flow?.step !== "installing" || !data) return;
    const s = [...data.own, ...(data.client ?? [])].find((x) => x.id === flow.serverId);
    if (s?.state === "applied") void startAuth(s.id, s.name);
    else if (!s || s.state === "failed") {
      closePopup();
      setFlow(null);
      if (s) toast.error("L’installation du serveur n’a pas abouti.", { description: "Supprimez-le puis ajoutez-le de nouveau." });
    }
  }, [data, flow]);

  // Tant que la fenêtre du fournisseur est ouverte, l'accès est relu jusqu'à ce que l'instance l'ait.
  useEffect(() => {
    if (flow?.step !== "authorizing" || !flow.url) return;
    const timer = setTimeout(async () => {
      const servers = await loadOauth();
      const done = servers?.find((s) => s.id === flow.serverId);
      if (done?.connected) {
        setFlow((f) => (f?.serverId === done.id ? { ...f, step: "success" } : f));
        closePopup();
        loadTools();
      } else if ((done && !done.pending && oauthTries > 3) || oauthTries >= OAUTH_POLL_TRIES) {
        closePopup();
        setFlow(null);
        toast.error("L’autorisation n’a pas abouti.", { description: "Relancez-la depuis la carte du serveur." });
      } else setOauthTries((n) => n + 1);
    }, OAUTH_POLL_MS);
    return () => clearTimeout(timer);
  }, [flow, oauthTries, loadOauth, loadTools, closePopup]);

  // Tant qu'une pose est en cours, l'état est relu : l'écran passe seul à « En service » ou à l'échec.
  useEffect(() => {
    if (!data || !mcpPending(data) || tries >= POLL_TRIES) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      void load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, tries, load]);

  const admin = data?.members !== undefined;
  // Le relevé de l'instance concernée : la sienne, ou celle du membre regardé par l'administrateur.
  const report = scope.kind === "member" ? tools?.members?.find((m) => m.id === scope.id)?.report : tools?.own;
  const toolsOf = (s: McpServer) => report?.servers.find((t) => t.name === s.name);
  const labelOf = (s: McpServer) => data?.stdioCatalogue.find((c) => c.key === s.stdio)?.label;
  const accessOf = (s: McpServer): Access | undefined =>
    s.auth === "oauth" && scope.kind !== "member" ? { connected: oauth[s.id]?.connected === true, busy: flow?.serverId === s.id && flow.step !== "success", onAuthorize: () => authorize(s) } : undefined;
  // Un administrateur règle l'entreprise ou un membre ; un membre, seulement lui-même.
  useEffect(() => {
    if (data) setScope((s) => (admin ? (s.kind === "own" ? { kind: "client" } : s) : { kind: "own" }));
  }, [data, admin]);

  const member = scope.kind === "member" ? data?.members?.find((m) => m.id === scope.id) : undefined;
  const servers = (scope.kind === "client" ? data?.client : scope.kind === "member" ? member?.servers : data?.own) ?? [];
  // Sur l'instance d'un membre, les serveurs de l'entreprise s'ajoutent aux siens ; à nom égal, le sien l'emporte.
  const inherited = scope.kind === "member" ? (data?.client ?? []).filter((c) => !servers.some((s) => s.name === c.name)) : [];
  const scopeLabel = scope.kind === "client" ? "tous les Experts de l’entreprise" : scope.kind === "member" ? `les Experts de ${member?.name ?? member?.email ?? "ce membre"}` : "vos Experts";

  async function written(call: Promise<McpWritten>, done: string): Promise<McpWritten> {
    const out = await call;
    setTries(0);
    await load();
    toast.success(done, { description: out.state === "pending" ? "L’installation sur les instances est en cours." : undefined });
    return out;
  }

  // OAuth sur l'entreprise ou sur soi : « Connecter » enchaîne sur l'autorisation de son propre compte.
  const chains = scope.kind !== "member";
  async function add(draft: McpServerDraft) {
    const authorizeNext = draft.auth === "oauth" && chains;
    if (authorizeNext) openPopup(draft.name);
    try {
      const out = await written(apiFetch<McpWritten>(scopeUrl(scope), { method: "POST", body: JSON.stringify(draft) }), `Serveur ${draft.name} enregistré`);
      if (authorizeNext && out.server) setFlow({ serverId: out.server.id, name: out.server.name, step: "installing", url: null });
      else closePopup();
    } catch (e) {
      closePopup();
      throw e;
    }
    setAdding(false);
  }

  async function remove() {
    if (!removing) return;
    await written(apiFetch<McpWritten>(`${scopeUrl(scope)}/${encodeURIComponent(removing.id)}`, { method: "DELETE" }), `Serveur ${removing.name} supprimé`);
  }

  if (error && !data) return <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="sr-only">Serveurs MCP</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">Connectez vos serveurs Model Context Protocol (MCP) pour étendre les capacités de vos Experts.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {scope.kind !== "member" && (
            <Button variant="outline" onClick={() => void survey()} disabled={surveying} title={report ? `Dernier relevé : ${new Date(report.at).toLocaleString("fr-FR")}` : undefined}>
              {surveying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Relever les outils
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus /> Ajouter un serveur MCP
          </Button>
        </div>
      </div>

      {admin && data?.members && (
        <ScopePicker members={data.members} value={scope} onChange={setScope} />
      )}

      <div className="flex items-start gap-3.5 rounded-[22px] border border-line bg-surface p-4 text-sm text-ink-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint text-brand">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="font-semibold text-ink">Vos outils, sous votre responsabilité</p>
          <p className="text-xs leading-relaxed text-ink-3">
            Les outils d’un serveur sont offerts à tous les Experts concernés, routines et messages reçus par Telegram ou WhatsApp compris. Yelema ne les vérifie pas : ne branchez qu’un serveur en qui vous avez confiance.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">Serveurs connectés ({data ? servers.length + inherited.length : "…"})</p>
        {!data ? (
          <div className="flex min-h-[12rem] items-center justify-center rounded-[22px] border border-line bg-surface p-8">
            <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
          </div>
        ) : servers.length + inherited.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((s) => (
              <ServerCard key={s.id} server={s} access={accessOf(s)} tools={toolsOf(s)} catalogueLabel={labelOf(s)} onRemove={() => setRemoving(s)} />
            ))}
            {inherited.map((s) => (
              <ServerCard key={s.id} server={s} note="De l’entreprise" tools={toolsOf(s)} catalogueLabel={labelOf(s)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-line px-6 py-12 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3">
              <Layers className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-ink">Aucun serveur MCP personnalisé</p>
            <p className="mt-1 max-w-sm text-xs text-ink-3">Ajoutez vos serveurs MCP pour connecter vos sources de données et vos outils à vos Experts.</p>
            <Button onClick={() => setAdding(true)} variant="outline" size="sm" className="mt-4">
              <Plus />
              Ajouter un serveur MCP
            </Button>
          </div>
        )}
        {servers.some((s) => s.state === "failed") && (
          <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">
            L’installation d’un serveur n’a pas abouti sur une instance au moins. Supprimez-le puis ajoutez-le de nouveau ; si cela persiste, contactez Yelema.
          </p>
        )}
      </div>

      <McpServerDialog
        open={adding}
        onOpenChange={setAdding}
        scopeLabel={scopeLabel}
        onSave={add}
        oauth={{
          chains,
          flow,
          tools: (flow && tools?.own?.servers.find((t) => t.name === flow.name && t.state === "ok")?.tools) || [],
          onOpenAccess: openAccess,
          onCancel: cancelFlow,
          onClose: () => setFlow(null),
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer le serveur MCP"
        description={`Supprimer le serveur « ${removing?.name ?? ""} » ? Les Experts concernés ne pourront plus utiliser ses outils, et la conversation en cours sera interrompue.`}
        confirmText="Supprimer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
