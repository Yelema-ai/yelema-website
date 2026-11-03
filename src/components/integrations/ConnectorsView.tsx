"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, MoreHorizontal, Pencil, Plug, Plus, RotateCw, Search, Star, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import {
  ACCOUNT_STATE_LABELS,
  accountState,
  accountSummary,
  accountTitle,
  accountsBySlug,
  needsReconnect,
  splitAccounts,
} from "@/lib/connection-accounts";
import { isConnectionActive as isActive } from "@/lib/expert-tools";
import { DEFAULT_INTEGRATION_TOOLKITS, catalogToolkit, composioLogoUrl } from "@/lib/integration-catalog";
import type {
  IntegrationConnection,
  IntegrationConnectionsResult,
  IntegrationConnectResult,
  IntegrationToolkit,
  IntegrationToolkitsResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolLogo } from "./ToolLogo";
import { runPool } from "@/lib/bulk";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH = 3; // the toolkits route 400s a non-empty query shorter than this
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45000;

function slugKey(slug: string | null | undefined): string {
  return (slug || "").toLowerCase();
}

function activeCount(conns: IntegrationConnection[], slug: string): number {
  return conns.filter((c) => isActive(c) && slugKey(c.toolkitSlug) === slugKey(slug)).length;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// A tool connected from a search and gone from the catalog comes back with its slug for a name
// (« googleslides », « google_search_console ») : the usual ones by their real name, the others
// spaced and capitalised.
const KNOWN_NAMES: Record<string, string> = {
  googleslides: "Google Slides", googlemeet: "Google Meet", googletasks: "Google Tasks", googlephotos: "Google Photos",
  googlemaps: "Google Maps", googleads: "Google Ads", googlebigquery: "Google BigQuery", google_analytics: "Google Analytics",
  google_search_console: "Google Search Console", googlesuper: "Google Workspace", youtube: "YouTube", linkedin: "LinkedIn",
  whatsapp: "WhatsApp", github: "GitHub", gitlab: "GitLab", hubspot: "HubSpot", clickup: "ClickUp", mailchimp: "Mailchimp",
  sharepoint: "SharePoint", one_drive: "OneDrive", microsoft_teams: "Microsoft Teams", excel: "Excel", openai: "OpenAI",
};

function readableName(slug: string, name: string | null | undefined): string {
  if (name && name !== name.toLowerCase()) return name;
  return KNOWN_NAMES[slug] ?? slug.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// Search results come with English descriptions: a tool from our catalog keeps its French copy, any
// other one shows its name only.
function localized(t: IntegrationToolkit): IntegrationToolkit {
  const ours = catalogToolkit(t.slug);
  return ours ? { ...t, name: ours.name, description: ours.description } : { ...t, description: null };
}

// Connecteurs: the member's tools (Gmail, Drive, Notion…), connected through Yelema's own Composio
// (src/lib/composio.ts). A connection belongs to the member who owns the instance, so every expert
// on it (every Hermes profile) can use it, and nobody else's experts can. A popular catalog shows first; typing searches the full catalog.
export function ConnectorsView({ agentId }: { agentId: string }) {
  const [search, setSearch] = useState("");
  const [remote, setRemote] = useState<{ q: string; items: IntegrationToolkit[] } | null>(null);
  // The connections read last time this visit show at once (Leslie, 28/10); the live list follows.
  const [connections, setConnections] = useState<IntegrationConnection[] | null>(() => cached<IntegrationConnection[]>(`conns:${agentId}`) ?? null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [open, setOpen] = useState<IntegrationToolkit | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef(0);

  const fetchConnections = useCallback(async () => {
    const { connections: list } = await apiFetch<IntegrationConnectionsResult>(
      `/api/agents/${agentId}/integrations/connections`
    );
    remember(`conns:${agentId}`, list);
    setConnections(list);
    return list;
  }, [agentId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setPending(null);
  }, []);

  useEffect(() => {
    fetchConnections().catch((e) => {
      setConnections([]);
      toast.error((e as Error).message);
    });
  }, [fetchConnections]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const q = search.trim();

  // Debounced search of the full catalog from 3 characters; shorter queries filter the list locally.
  useEffect(() => {
    if (q.length < MIN_SEARCH) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      apiFetch<IntegrationToolkitsResult>(`/api/agents/${agentId}/integrations/toolkits?search=${encodeURIComponent(q)}`)
        .then((res) => !cancelled && setRemote({ q, items: res.items.map(localized) }))
        .catch((e) => {
          if (cancelled) return;
          setRemote({ q, items: [] });
          toast.error((e as Error).message);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, agentId]);

  const accounts = useMemo(() => accountsBySlug(connections ?? []), [connections]);

  // The panel closes once its last account is gone.
  useEffect(() => {
    if (open && connections && !accounts.has(slugKey(open.slug))) setOpen(null);
  }, [open, connections, accounts]);

  // The catalog, plus any connected tool that is not in it (connected from a search).
  const base = useMemo(() => {
    const extra: IntegrationToolkit[] = [];
    for (const c of connections ?? []) {
      const slug = slugKey(c.toolkitSlug);
      if (!slug || catalogToolkit(slug) || extra.some((t) => t.slug === slug)) continue;
      extra.push({
        slug,
        name: readableName(slug, c.toolkitName),
        description: null,
        logo: composioLogoUrl(slug),
        enabled: true,
        isNoAuth: false,
        authSchemes: [],
      });
    }
    return [...extra, ...DEFAULT_INTEGRATION_TOOLKITS];
  }, [connections]);

  const searching = q.length >= MIN_SEARCH && remote?.q !== q;

  const visible = useMemo(() => {
    const nq = normalize(q);
    const local = nq ? base.filter((t) => normalize(`${t.name} ${t.slug} ${t.description ?? ""}`).includes(nq)) : base;
    const found = q.length >= MIN_SEARCH && remote?.q === q ? remote.items : [];
    const seen = new Set(local.map((t) => slugKey(t.slug)));
    const merged = [...local, ...found.filter((t) => !seen.has(slugKey(t.slug)))];
    // Tools with accounts first; the catalog order otherwise (sort is stable).
    return merged.sort((a, b) => Number(accounts.has(slugKey(b.slug))) - Number(accounts.has(slugKey(a.slug))));
  }, [q, base, remote, accounts]);

  // The connected tools with an account to sign in again, for the sentence above the list.
  const toFix = useMemo(
    () => base.filter((t) => (accounts.get(slugKey(t.slug)) ?? []).some(needsReconnect)),
    [base, accounts]
  );

  // Watch the connections until this tool gains an account (the sign-in happens in another tab) or
  // the deadline passes.
  function startPolling(toolkit: IntegrationToolkit, baseline: number) {
    setPending(slugKey(toolkit.slug));
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      // The sign-in tab is in front: asked again once this one shows.
      if (document.hidden) {
        if (Date.now() > pollDeadline.current) stopPolling();
        return;
      }
      try {
        const conns = await fetchConnections();
        if (activeCount(conns, toolkit.slug) > baseline) {
          stopPolling();
          toast.success(`${toolkit.name} est connecté`);
          return;
        }
      } catch {
        // transient; keep polling until the deadline
      }
      if (Date.now() > pollDeadline.current) stopPolling();
    }, POLL_INTERVAL_MS);
  }

  async function connect(toolkit: IntegrationToolkit) {
    setConnecting(slugKey(toolkit.slug));
    try {
      const { redirectUrl } = await apiFetch<IntegrationConnectResult>(`/api/agents/${agentId}/integrations/connect`, {
        method: "POST",
        body: JSON.stringify({ toolkit: toolkit.slug }),
      });
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
      startPolling(toolkit, activeCount(connections ?? [], toolkit.slug));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  // One account at a time, or every unfinished sign-in at once: the other accounts stay. Throws so
  // the confirmation stays open on a failure.
  async function disconnect(toolkit: IntegrationToolkit, ids: string[]) {
    try {
      setDisconnecting(ids[0] ?? null);
      // Three at a time; the first refusal is the one shown.
      const done = await runPool(ids, 3, (id) => apiFetch(`/api/agents/${agentId}/integrations/connections/${encodeURIComponent(id)}`, { method: "DELETE" }));
      const failed = done.find((r) => r.status === "rejected");
      if (failed) throw (failed as PromiseRejectedResult).reason;
      toast.success(ids.length > 1 ? `${ids.length} connexions ${toolkit.name} retirées` : `Compte ${toolkit.name} déconnecté`);
    } finally {
      await fetchConnections().catch(() => undefined);
      setDisconnecting(null);
    }
  }

  // Label and default are kept by the back office, so they follow the member on every device.
  async function updateAccount(id: string, body: { label?: string | null; isDefault?: boolean }) {
    try {
      await apiFetch(`/api/agents/${agentId}/integrations/connections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (body.isDefault) toast.success("Vos Experts utiliseront ce compte par défaut");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await fetchConnections().catch(() => undefined);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">
        <p className="text-[15px] text-ink-2">Connectez les outils de l’entreprise : tous vos Experts peuvent s’en servir.</p>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
          <Plug className="h-4 w-4" />
          Plus de 1 000 applications disponibles
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher un outil"
          aria-label="Chercher un outil"
          className="pl-10 pr-10"
        />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-3" />
        )}
      </div>

      {toFix.length > 0 && (
        // A calm sentence and one button, never a red block (Leslie, 27/10).
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] border bg-card px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-coral-ink" />
          <p className="min-w-0 flex-1 text-[14px] text-ink-2">
            {toFix.length === 1
              ? `Un compte ${toFix[0].name} est à reconnecter.`
              : `Des comptes sont à reconnecter : ${toFix.map((t) => t.name).join(", ")}.`}
          </p>
          <Button size="sm" variant="outline" onClick={() => setOpen(toFix[0])}>
            Reconnecter
          </Button>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="space-y-6">
        {[
          { title: "Connectés", items: q ? [] : visible.filter((t) => accounts.has(slugKey(t.slug))) },
          { title: q ? "" : "Les plus utiles à vos Experts", items: q ? visible : visible.filter((t) => !accounts.has(slugKey(t.slug))) },
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => (
        <div key={g.title || "q"}>
        {g.title && <h3 className="mb-2.5 px-0.5 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3">{g.title}</h3>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {g.items.map((t) => {
            const k = slugKey(t.slug);
            return (
              <ToolTile
                key={k}
                toolkit={t}
                accounts={connections === null ? null : (accounts.get(k) ?? [])}
                waiting={connecting === k || pending === k}
                onConnect={() => connect(t)}
                onOpen={() => setOpen(t)}
              />
            );
          })}
        </div>
        </div>
          ))}
        </div>
      ) : searching ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[22px] border bg-soft" />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed px-6 py-12 text-center text-sm text-ink-3">
          {q.length < MIN_SEARCH
            ? "Tapez au moins 3 lettres pour chercher parmi toutes les applications."
            : `Aucun outil trouvé pour « ${q} ».`}
        </div>
      )}

      {open && (
        <AccountsPanel
          toolkit={open}
          accounts={accounts.get(slugKey(open.slug)) ?? []}
          waiting={connecting === slugKey(open.slug) || pending === slugKey(open.slug)}
          disconnecting={disconnecting}
          onClose={() => setOpen(null)}
          onConnect={() => connect(open)}
          onDisconnect={(ids) => disconnect(open, ids)}
          onUpdate={updateAccount}
        />
      )}

      {pending && !open && (
        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Terminez la connexion dans l’onglet qui vient de s’ouvrir.
        </p>
      )}
    </div>
  );
}

const STATE_TONE = {
  active: "bg-ok-pale text-ok",
  pending: "bg-soft text-ink-2",
  failed: "bg-coral-pale text-coral-ink",
  disabled: "bg-soft text-ink-3",
} as const;

// « 12 oct. », the year only when it is not this one.
const dateFr = (ms: number | null | undefined): string => {
  if (!ms) return "";
  const d = new Date(ms);
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {};
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...year });
};

function ToolTile({
  toolkit,
  accounts,
  waiting,
  onConnect,
  onOpen,
}: {
  toolkit: IntegrationToolkit;
  // null while the connections are still loading
  accounts: IntegrationConnection[] | null;
  waiting: boolean;
  onConnect: () => void;
  onOpen: () => void;
}) {
  const head = (
    <>
      <ToolLogo logo={toolkit.logo} name={toolkit.name} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{toolkit.name}</p>
        {toolkit.description ? (
          <p className="truncate text-[13px] text-ink-3">{toolkit.description}</p>
        ) : (
          accounts && accounts.length > 0 && <p className="truncate text-[13px] text-ink-3">{accountSummary(accounts)}</p>
        )}
      </div>
    </>
  );

  // A tool with accounts is one button: the card sums them up, the panel lists them.
  if (accounts && accounts.length > 0) {
    const broken = accounts.some(needsReconnect) || !accounts.some(isActive);
    // The default account first; the others in their order.
    const listed = [...splitAccounts(accounts).accounts].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));
    const many = listed.length > 1;
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Comptes ${toolkit.name}`}
        className="flex min-h-[78px] w-full flex-wrap items-center gap-3 rounded-[22px] border bg-card py-3 pl-4 pr-3 text-left transition-colors hover:border-ink-3/40"
      >
        {head}
        {waiting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-3" />
        ) : listed.length > 0 ? null : broken ? (
          <span title="Un compte est à reconnecter" className="grid size-6 shrink-0 place-items-center rounded-full bg-coral-pale text-coral-ink">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
            <Check className="h-3.5 w-3.5" />
            Connecté
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
        {/* Each account in one line: which one the Experts use by default, which one to sign in again. */}
        {listed.length > 0 && (
          <ul className="w-full space-y-1 border-t pt-2.5 text-[13px] text-ink-2">
            {listed.slice(0, 3).map((a, i) => (
              <li key={a.id} className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", needsReconnect(a) ? "bg-coral" : "bg-ok")} />
                <span className="min-w-0 truncate">{accountTitle(a, i)}</span>
                {needsReconnect(a) ? (
                  <span className="ml-auto shrink-0 font-semibold text-coral-ink">À reconnecter</span>
                ) : (
                  many && a.isDefault && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-3">
                      <Star className="h-3 w-3 fill-current" /> par défaut
                    </span>
                  )
                )}
              </li>
            ))}
            {listed.length > 3 && <li className="pl-4 text-ink-3">et {listed.length - 3} autres</li>}
          </ul>
        )}
      </button>
    );
  }

  return (
    <div className="flex min-h-[78px] items-center gap-3 rounded-[22px] border bg-card py-3 pl-4 pr-3">
      {head}
      {accounts === null ? (
        <span className="h-8 w-24 shrink-0 animate-pulse rounded-[10px] bg-soft" />
      ) : waiting ? (
        <Button size="sm" variant="outline" disabled className="shrink-0">
          <Loader2 className="animate-spin" />
          En attente
        </Button>
      ) : (
        // Quiet: a list of thirty brand buttons shouts and guides nowhere (Leslie, 27/10).
        <Button size="sm" variant="outline" className="shrink-0" onClick={onConnect}>
          Connecter
        </Button>
      )}
    </div>
  );
}

// Every account of one tool: a drawer on the right on a computer, a sheet from the bottom on a phone.
function AccountsPanel({
  toolkit,
  accounts,
  waiting,
  disconnecting,
  onClose,
  onConnect,
  onDisconnect,
  onUpdate,
}: {
  toolkit: IntegrationToolkit;
  accounts: IntegrationConnection[];
  waiting: boolean;
  disconnecting: string | null;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: (ids: string[]) => Promise<void>;
  onUpdate: (id: string, body: { label?: string | null; isDefault?: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<{ ids: string[]; title: string; description: string } | null>(null);
  const { accounts: listed, unfinished } = splitAccounts(accounts);
  const titleOf = (c: IntegrationConnection) => accountTitle(c, listed.indexOf(c));

  function saveName(c: IntegrationConnection) {
    setEditing(null);
    const label = draft.trim() || null;
    if (label !== (c.label ?? null)) void onUpdate(c.id, { label });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-y-auto p-0",
          "sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:w-[440px] sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:border-y-0 sm:border-r-0",
          "max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-h-[88vh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[22px]"
        )}
      >
        <div className="flex items-center gap-3 border-b px-5 py-4 pr-14">
          <ToolLogo logo={toolkit.logo} name={toolkit.name} />
          <div className="min-w-0">
            <DialogTitle className="text-[19px] font-bold leading-tight text-ink">{toolkit.name}</DialogTitle>
            <DialogDescription className="text-[13px] text-ink-3">{accountSummary(accounts)}</DialogDescription>
          </div>
        </div>

        <div className="flex-1 px-5 py-2">
          {listed.length > 1 && !listed.some((a) => a.isDefault) && (
            <p className="pt-2 text-[13px] text-ink-3">Plusieurs comptes : choisissez celui que vos Experts utilisent (menu « … », Utiliser par défaut).</p>
          )}
          <ul className="divide-y">
            {listed.map((a) => {
              const state = accountState(a);
              const title = titleOf(a);
              return (
                <li key={a.id} className="flex items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    {editing === a.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveName(a);
                        }}
                      >
                        <Input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => saveName(a)}
                          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))}
                          placeholder={a.email || a.accountName || `Compte ${listed.indexOf(a) + 1}`}
                          aria-label="Nom du compte"
                          maxLength={80}
                          className="h-10"
                        />
                      </form>
                    ) : (
                      <p className="truncate text-[15px] font-semibold text-ink" title={a.id}>
                        {title}
                      </p>
                    )}
                    {a.email && a.email !== title && <p className="truncate text-[13px] text-ink-2">{a.email}</p>}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                      {dateFr(a.createdAt) && (
                        <span>
                          Ajouté le {dateFr(a.createdAt)}
                          {a.addedBy && ` par ${a.addedBy.name || a.addedBy.email}`}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_TONE[state]}`}>
                        {ACCOUNT_STATE_LABELS[state]}
                      </span>
                      {a.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2 py-0.5 text-[11px] font-semibold text-ok">
                          <Star className="h-3 w-3" />
                          Par défaut
                        </span>
                      )}
                    </p>
                  </div>
                  {needsReconnect(a) && (
                    <Button size="sm" onClick={onConnect} disabled={waiting} className="shrink-0">
                      <RotateCw />
                      Reconnecter
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options pour ${title}`}
                        className="grid size-10 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink"
                      >
                        {disconnecting === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        onSelect={() => {
                          setDraft(a.label ?? "");
                          setEditing(a.id);
                        }}
                      >
                        <Pencil /> Renommer
                      </DropdownMenuItem>
                      {!a.isDefault && listed.length > 1 && state === "active" && (
                        <DropdownMenuItem onSelect={() => void onUpdate(a.id, { isDefault: true })}>
                          <Star /> Utiliser par défaut
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() =>
                          setConfirm({
                            ids: [a.id],
                            title: `Déconnecter ${title} ?`,
                            description: `Vos Experts n’auront plus accès à ce compte ${toolkit.name}. Vous pourrez le reconnecter quand vous voulez.`,
                          })
                        }
                      >
                        <Unplug /> Déconnecter
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>

          {unfinished.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-[14px] bg-soft py-1 pl-4 pr-1 text-[13px]">
              <span className="text-ink-2">
                {unfinished.length > 1 ? `${unfinished.length} connexions inachevées` : "1 connexion inachevée"}
              </span>
              <button
                type="button"
                disabled={disconnecting !== null}
                onClick={() =>
                  setConfirm({
                    ids: unfinished.map((c) => c.id),
                    title: "Faire le ménage ?",
                    description: "Les connexions jamais terminées sont retirées. Vos comptes connectés ne bougent pas.",
                  })
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-semibold text-ink transition-colors hover:bg-card disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Faire le ménage
              </button>
            </div>
          )}

          <Button variant="outline" className="mt-4 w-full" onClick={onConnect} disabled={waiting}>
            {waiting ? <Loader2 className="animate-spin" /> : <Plus />}
            {waiting ? "En attente de la connexion" : `Ajouter un compte ${toolkit.name}`}
          </Button>
          {waiting && (
            <p className="mt-2 text-center text-[13px] text-ink-3">Terminez la connexion dans l’onglet qui vient de s’ouvrir.</p>
          )}
          <div className="h-4" />
        </div>
      </DialogContent>

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm.title}
          description={confirm.description}
          confirmText={confirm.ids.length > 1 ? "Retirer" : "Déconnecter"}
          destructive
          onConfirm={() => onDisconnect(confirm.ids)}
        />
      )}
    </Dialog>
  );
}
