"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, MoreHorizontal, Plug, Plus, Search, Unplug } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DEFAULT_INTEGRATION_TOOLKITS, catalogToolkit, composioLogoUrl } from "@/lib/integration-catalog";
import type {
  IntegrationConnection,
  IntegrationConnectionsResult,
  IntegrationConnectResult,
  IntegrationToolkit,
  IntegrationToolkitsResult,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH = 3; // the toolkits route 400s a non-empty query shorter than this
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45000;

function slugKey(slug: string | null | undefined): string {
  return (slug || "").toLowerCase();
}

function isActive(c: IntegrationConnection): boolean {
  return (c.status || "").toUpperCase() === "ACTIVE" && !c.isDisabled;
}

function activeCount(conns: IntegrationConnection[], slug: string): number {
  return conns.filter((c) => isActive(c) && slugKey(c.toolkitSlug) === slugKey(slug)).length;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Search results come with English descriptions: a tool from our catalog keeps its French copy, any
// other one shows its name only.
function localized(t: IntegrationToolkit): IntegrationToolkit {
  const ours = catalogToolkit(t.slug);
  return ours ? { ...t, name: ours.name, description: ours.description } : { ...t, description: null };
}

// Connecteurs: the company's tools (Gmail, Drive, Notion…), connected once for the workspace through
// Yelema's own Composio (src/lib/composio.ts). A connection belongs to the workspace, so every expert
// (every Hermes profile on its instance) can use it. A popular catalog shows first; typing searches the full catalog.
export function ConnectorsView({ agentId }: { agentId: string }) {
  const [search, setSearch] = useState("");
  const [remote, setRemote] = useState<{ q: string; items: IntegrationToolkit[] } | null>(null);
  const [connections, setConnections] = useState<IntegrationConnection[] | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef(0);

  const fetchConnections = useCallback(async () => {
    const { connections: list } = await apiFetch<IntegrationConnectionsResult>(
      `/api/agents/${agentId}/integrations/connections`
    );
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

  const connectedSlugs = useMemo(
    () => new Set((connections ?? []).filter(isActive).map((c) => slugKey(c.toolkitSlug))),
    [connections]
  );

  // The catalog, plus any connected tool that is not in it (connected from a search).
  const base = useMemo(() => {
    const extra: IntegrationToolkit[] = [];
    for (const c of connections ?? []) {
      const slug = slugKey(c.toolkitSlug);
      if (!slug || !isActive(c) || catalogToolkit(slug) || extra.some((t) => t.slug === slug)) continue;
      extra.push({
        slug,
        name: c.toolkitName || slug,
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
    // Connected tools first; the catalog order otherwise (sort is stable).
    return merged.sort(
      (a, b) => Number(connectedSlugs.has(slugKey(b.slug))) - Number(connectedSlugs.has(slugKey(a.slug)))
    );
  }, [q, base, remote, connectedSlugs]);

  // Watch the connections until this tool gains an account (the sign-in happens in another tab) or
  // the deadline passes.
  function startPolling(toolkit: IntegrationToolkit, baseline: number) {
    setPending(slugKey(toolkit.slug));
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
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

  // Disconnect every account of this tool.
  async function disconnect(toolkit: IntegrationToolkit) {
    const ids = (connections ?? [])
      .filter((c) => isActive(c) && slugKey(c.toolkitSlug) === slugKey(toolkit.slug))
      .map((c) => c.id);
    setDisconnecting(slugKey(toolkit.slug));
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/agents/${agentId}/integrations/connections/${encodeURIComponent(id)}`, { method: "DELETE" })
        )
      );
      toast.success(`${toolkit.name} est déconnecté`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await fetchConnections().catch(() => undefined);
      setDisconnecting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">
        <p className="text-[15px] text-ink-2">Connectez les outils de l’entreprise : tous vos experts peuvent s’en servir.</p>
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

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const k = slugKey(t.slug);
            return (
              <ToolTile
                key={k}
                toolkit={t}
                connected={connections === null ? null : connectedSlugs.has(k)}
                waiting={connecting === k || pending === k}
                disconnecting={disconnecting === k}
                onConnect={() => connect(t)}
                onDisconnect={() => disconnect(t)}
              />
            );
          })}
        </div>
      ) : searching ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[22px] border border-line bg-soft" />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-line px-6 py-12 text-center text-sm text-ink-3">
          {q.length < MIN_SEARCH
            ? "Tapez au moins 3 lettres pour chercher parmi toutes les applications."
            : `Aucun outil trouvé pour « ${q} ».`}
        </div>
      )}

      {pending && (
        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Terminez la connexion dans l’onglet qui vient de s’ouvrir.
        </p>
      )}
    </div>
  );
}

function ToolTile({
  toolkit,
  connected,
  waiting,
  disconnecting,
  onConnect,
  onDisconnect,
}: {
  toolkit: IntegrationToolkit;
  // null while the connections are still loading
  connected: boolean | null;
  waiting: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-[22px] border border-line bg-surface py-3 pl-4 pr-3">
      <ToolLogo logo={toolkit.logo} name={toolkit.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{toolkit.name}</p>
        {toolkit.description && <p className="truncate text-[13px] text-ink-3">{toolkit.description}</p>}
      </div>

      {connected === null ? (
        <span className="h-8 w-24 shrink-0 animate-pulse rounded-[10px] bg-soft" />
      ) : connected ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
            <Check className="h-3.5 w-3.5" />
            Connecté
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options pour ${toolkit.name}`}
                disabled={disconnecting || waiting}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink disabled:opacity-60"
              >
                {disconnecting || waiting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onConnect}>
                <Plus /> Connecter un autre compte
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDisconnect}>
                <Unplug /> Déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : waiting ? (
        <Button size="sm" variant="outline" disabled className="shrink-0">
          <Loader2 className="animate-spin" />
          En attente
        </Button>
      ) : (
        <Button size="sm" className="shrink-0" onClick={onConnect}>
          Connecter
        </Button>
      )}
    </div>
  );
}

function ToolLogo({ logo, name }: { logo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-6 w-6 object-contain"
        />
      </span>
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint font-display text-sm font-bold text-brand">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
