"use client";

import { usePoll, WAIT_POLL_MS } from "@/components/usePoll";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Plus, RotateCw, Search, Star, Trash2, Unplug } from "lucide-react";
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
import { DEFAULT_INTEGRATION_TOOLKITS, INTEGRATION_GROUPS, catalogToolkit, composioLogoUrl } from "@/lib/integration-catalog";
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
import { StatePill } from "./StatePill";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import type { ExpertTool } from "@/lib/expert-tools";
import { forWhom, recommendTools } from "@/lib/recommended-tools";
import { expertCycle } from "@/lib/expert-cycle";
import { runPool } from "@/lib/bulk";
import { keptExpertTools, teamTools } from "@/lib/expert-tools-client";
import { useInView } from "@/components/usePrefetch";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH = 3; // the toolkits route 400s a non-empty query shorter than this
const POLL_TIMEOUT_MS = 3 * 60_000;

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
  // The tool whose sign-in is awaited, its accounts before it, and when the wait stops.
  const [watch, setWatch] = useState<{ toolkit: IntegrationToolkit; baseline: number; until: number } | null>(null);
  const pending = watch ? slugKey(watch.toolkit.slug) : null;
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [open, setOpen] = useState<IntegrationToolkit | null>(null);
  // The catalog's filter by use; « Tous » is null.
  const [group, setGroup] = useState<string | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  const fetchConnections = useCallback(async () => {
    const { connections: list } = await apiFetch<IntegrationConnectionsResult>(
      `/api/agents/${agentId}/integrations/connections`
    );
    remember(`conns:${agentId}`, list);
    setConnections(list);
    return list;
  }, [agentId]);

  useEffect(() => {
    fetchConnections().catch((e) => {
      setConnections([]);
      toast.error((e as Error).message);
    });
  }, [fetchConnections]);

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

  // Only the accounts that work or did: a sign-in never finished is not a tool of the member's (Leslie,
  // 03/11, « catastrophique »: 23 red tools that were only abandoned sign-ins). They stay in the panel.
  const accounts = useMemo(() => {
    const all = accountsBySlug(connections ?? []);
    for (const [k, list] of all) if (splitAccounts(list).accounts.length === 0) all.delete(k);
    return all;
  }, [connections]);
  // « Conseillés pour vos Experts »: what the member's Experts list in their pack (outils-recommandes.json).
  const { experts: team } = useExpertsContext();
  const mineExperts = useMemo(() => team.filter((e) => e.agentId === agentId), [team, agentId]);
  const label = (e: (typeof mineExperts)[number]) => expertCycle(e)?.name ?? e.displayName;
  // The lists last read (this tab or this device) paint at once; all of them, or none.
  const keptPacks = () => {
    const kept = mineExperts.map((e) => keptExpertTools(agentId, e.profileId));
    return kept.every(Boolean) ? mineExperts.map((e, i) => ({ expert: label(e), tools: kept[i]! })) : null;
  };
  const [packs, setPacks] = useState<{ expert: string; tools: ExpertTool[] }[] | null>(keptPacks);
  const teamKey = mineExperts.map((e) => e.profileId).join(",");
  // Read once the catalog's place is on screen and the page is idle, not with the page's own first reads.
  const [wanted, setWanted] = useState(false);
  const catalogRef = useInView<HTMLElement>(() => setWanted(true));
  useEffect(() => {
    if (!teamKey || !wanted) return;
    let cancelled = false;
    const kept = keptPacks();
    if (kept) setPacks(kept);
    void teamTools(agentId, mineExperts.map((e) => e.profileId)).then((lists) => {
      if (!cancelled) setPacks(mineExperts.map((e, i) => ({ expert: label(e), tools: lists[i] })));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, teamKey, wanted]);

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

  // Watch the connections until this tool gains an account (the sign-in happens in another tab) or
  // the deadline passes: at once back on this tab or on the back office's word, else every 15 s.
  usePoll(
    async () => {
      if (!watch) return;
      if (Date.now() > watch.until) return setWatch(null);
      const conns = await fetchConnections();
      if (activeCount(conns, watch.toolkit.slug) <= watch.baseline) return;
      setWatch(null);
      toast.success(`${watch.toolkit.name} est connecté`);
    },
    { enabled: Boolean(watch), round: watch?.until, everyMs: WAIT_POLL_MS, immediate: false, runOnShow: true, wake: { types: ["job.done"], kind: "connectors" } }
  );

  async function connect(toolkit: IntegrationToolkit) {
    setConnecting(slugKey(toolkit.slug));
    try {
      const { redirectUrl } = await apiFetch<IntegrationConnectResult>(`/api/agents/${agentId}/integrations/connect`, {
        method: "POST",
        body: JSON.stringify({ toolkit: toolkit.slug }),
      });
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
      setWatch({ toolkit, baseline: activeCount(connections ?? [], toolkit.slug), until: Date.now() + POLL_TIMEOUT_MS });
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

  // Page (Leslie, 04/11): three lists of the same card: « Vos outils » (state on the logo), the tools the
  // Experts need, the whole catalog; at the bottom each account to sign in again, with its choice.
  const mine = q ? [] : visible.filter((t) => accounts.has(slugKey(t.slug)));
  const inGroup = (t: IntegrationToolkit) => !group || (INTEGRATION_GROUPS.find((g) => g.label === group)?.slugs.includes(slugKey(t.slug)) ?? false);
  const recommended = useMemo(() => {
    if (!packs || connections === null) return [];
    return recommendTools(packs, new Set(accounts.keys())).map((r) => ({
      toolkit: catalogToolkit(r.slug) ?? { slug: r.slug, name: readableName(r.slug, r.name), description: null, logo: composioLogoUrl(r.slug), enabled: true, isNoAuth: false, authSchemes: [] },
      who: forWhom(r.experts),
    }));
  }, [packs, accounts, connections]);
  const suggested = new Set(recommended.map((r) => slugKey(r.toolkit.slug)));
  const catalog = q ? visible : visible.filter((t) => !accounts.has(slugKey(t.slug)) && !suggested.has(slugKey(t.slug)) && inGroup(t));

  return (
    <div className="space-y-7">
      {mine.length > 0 && (
        <section>
          <h2 className="mb-3 text-[17px] font-bold text-ink">Vos outils</h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mine.map((t) => {
              const k = slugKey(t.slug);
              const list = accounts.get(k) ?? [];
              return (
                <AddTool
                  key={k}
                  toolkit={t}
                  detail={accountSummary(list)}
                  accounts={list}
                  waiting={connecting === k || pending === k}
                  onConnect={() => connect(t)}
                  onOpen={() => setOpen(t)}
                  mine
                />
              );
            })}
          </div>
        </section>
      )}

      {!q && recommended.length > 0 && (
        <section>
          <h2 className="mb-3 text-[17px] font-bold text-ink">Conseillés pour vos Experts</h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recommended.map(({ toolkit: t, who }) => {
              const k = slugKey(t.slug);
              return (
                <AddTool
                  key={k}
                  toolkit={t}
                  detail={who}
                  accounts={connections === null ? null : []}
                  waiting={connecting === k || pending === k}
                  onConnect={() => connect(t)}
                  onOpen={() => setOpen(t)}
                />
              );
            })}
          </div>
        </section>
      )}

      <section ref={catalogRef} className="space-y-3.5">
        <h2 className="text-[17px] font-bold text-ink">
          Tous les outils <span className="ml-1.5 text-[13.5px] font-normal text-ink-3">Plus de 1 000</span>
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            ref={searchBox}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher un outil"
            aria-label="Chercher un outil"
            className="pl-10 pr-10"
          />
          {searching && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-3" />}
        </div>
        {!q && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filtrer par usage">
            {[null, ...INTEGRATION_GROUPS.map((g) => g.label)].map((g) => (
              <button
                key={g ?? "tous"}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors",
                  group === g ? "bg-ink text-surface" : "border bg-card text-ink-2 hover:bg-soft"
                )}
              >
                {g ?? "Tous"}
              </button>
            ))}
          </div>
        )}

        {catalog.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {catalog.map((t) => {
              const k = slugKey(t.slug);
              const mineToo = accounts.get(k) ?? [];
              return (
                <AddTool
                  key={k}
                  toolkit={t}
                  detail={null}
                  accounts={connections === null ? null : mineToo}
                  waiting={connecting === k || pending === k}
                  onConnect={() => connect(t)}
                  onOpen={() => setOpen(t)}
                />
              );
            })}
            {!q && (
              <button
                type="button"
                onClick={() => searchBox.current?.focus()}
                className="flex min-h-16 items-center gap-3 rounded-[18px] border border-dashed border-ink-3/40 p-3 text-left text-ink-2 transition-colors hover:bg-soft"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft">
                  <Plus className="size-5" />
                </span>
                <span className="min-w-0 text-[14px] font-semibold leading-snug">Plus de 1 000 autres outils</span>
              </button>
            )}
          </div>
        ) : searching ? (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-[18px] border bg-soft" />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed px-6 py-12 text-center text-sm text-ink-3">
            {q && q.length < MIN_SEARCH
              ? "Tapez au moins 3 lettres pour chercher parmi toutes les applications."
              : q
                ? `Aucun outil trouvé pour « ${q} ».`
                : "Tous les outils de cette liste sont déjà branchés : cherchez-en un autre."}
          </div>
        )}
      </section>

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

// A tool of the catalog: the whole card connects it, with a small « Connecter » on the right (Leslie,
// 03/11: « le petit bouton Connecter »). In a search, a tool already connected opens its accounts instead.
function AddTool({
  toolkit,
  detail,
  accounts,
  waiting,
  onConnect,
  onOpen,
  mine = false,
}: {
  /** A card of « Vos outils »: no state pill, the list says it. */
  mine?: boolean;
  toolkit: IntegrationToolkit;
  detail?: string | null;
  // null while the connections are still loading
  accounts: IntegrationConnection[] | null;
  waiting: boolean;
  onConnect: () => void;
  onOpen: () => void;
}) {
  const connected = !!accounts && accounts.length > 0;
  return (
    <button
      type="button"
      onClick={connected ? onOpen : onConnect}
      disabled={waiting || accounts === null}
      aria-label={connected ? `Comptes ${toolkit.name}` : `Connecter ${toolkit.name}`}
      className="flex min-h-16 min-w-0 items-center gap-3 rounded-[18px] border bg-card p-3 text-left transition-colors hover:border-ink-3/40 disabled:cursor-default"
    >
      <span className="relative shrink-0">
        <ToolLogo logo={toolkit.logo} name={toolkit.name} />
        {/* A small red dot when an account is to sign in again; « Reconnecter » or « Retirer » are in its accounts,
            behind the click (Leslie, 05/11: no section « À reconnecter », no big badge). */}
        {connected && accounts.some(needsReconnect) && (
          <span title="Un compte est à reconnecter" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#dc2626] ring-2 ring-card" />
        )}
      </span>
      {/* The name gets the whole width, the state goes under it: four cards a row everywhere, as in « Vos
          outils », with no name cut to « Goog… » (Leslie, 06/11). */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold leading-snug text-ink">{toolkit.name}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          {waiting ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" />
          ) : connected ? (
            // In « Vos outils » the list says it is connected; elsewhere (a search), « Connecté » as in Canaux.
            mine ? null : <StatePill state="connected" className="h-7 min-w-0 px-3 text-[12.5px]" />
          ) : (
            <StatePill state="connect" className="h-7 min-w-0 px-3 text-[12.5px]" />
          )}
          {detail && <span className="min-w-0 truncate text-[12.5px] leading-snug text-ink-3">{detail}</span>}
        </span>
      </span>
    </button>
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
