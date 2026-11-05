"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { expertTools } from "@/lib/expert-tools-client";
import { instanceEvents, matches } from "@/lib/instance-events";
import { toolsOverview, type ExpertTool, type ToolState } from "@/lib/expert-tools";
import type { McpOverview } from "@/lib/mcp-servers";
import type { IntegrationConnection, IntegrationConnectionsResult, IntegrationConnectResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { Button } from "@/components/ui/button";

interface Loaded {
  tools: ExpertTool[];
  connections: IntegrationConnection[];
  mcpNames: string[];
}

// A focus re-reads the connections at most this often.
const REFOCUS_MS = 60_000;

// Outils: what this expert needs to work fully (its pack's outils-recommandes.json) against what this
// member has connected, so they know what is left to connect.

export function ExpertTools({ agentId, profileId, expertName }: { agentId: string; profileId: string; expertName: string }) {
  const viaBackoffice = usePublicConfig().authVia === "backoffice";
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const connectionsUrl = `/api/agents/${agentId}/integrations/connections`;
  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [outils, connections, mcp] = await Promise.all([
        expertTools(agentId, profileId),
        apiFetch<IntegrationConnectionsResult>(connectionsUrl).then((r) => r.connections, () => []),
        viaBackoffice ? apiFetch<McpOverview>("/api/mcp").catch(() => null) : null,
      ]);
      const mcpNames = [...(mcp?.own ?? []), ...(mcp?.client ?? [])].map((s) => s.name);
      setData({ tools: outils, connections, mcpNames });
    } catch {
      setLoadError(true);
    }
  }, [agentId, profileId, connectionsUrl, viaBackoffice]);

  useEffect(() => {
    void load();
  }, [load]);

  // The sign-in happens in another tab: the list is read again when the member comes back (at most once a
  // minute: a click back from a frame is a focus too), or when the back office says a connection changed.
  useEffect(() => {
    let last = Date.now();
    const refresh = (force = false) => {
      if (!force && Date.now() - last < REFOCUS_MS) return;
      last = Date.now();
      void apiFetch<IntegrationConnectionsResult>(connectionsUrl).then(
        (r) => setData((d) => d && { ...d, connections: r.connections }),
        () => undefined
      );
    };
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const off = instanceEvents.on(null, (e) => matches(e, { types: ["job.done"], kind: "connectors" }) && refresh(true));
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [connectionsUrl]);

  async function connect(t: ToolState) {
    setConnecting(t.nom);
    try {
      const { redirectUrl } = await apiFetch<IntegrationConnectResult>(`/api/agents/${agentId}/integrations/connect`, {
        method: "POST",
        body: JSON.stringify({ toolkit: t.composio }),
      });
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  const panel = "mt-5 rounded-[22px] border bg-card p-4 sm:p-5";
  const o = data && toolsOverview(data.tools, data.connections, data.mcpNames);

  return (
    <div>
      <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Outils de {expertName}</h1>
      <p className="mt-1 max-w-xl text-sm text-ink-3">
        Ce dont {expertName} a besoin pour travailler pleinement, et ce qui est déjà branché.
      </p>

      {!o ? (
        <div className={cn(panel, "flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-3")}>
          {loadError ? (
            <>
              <p className="text-ink-2">Impossible de charger les outils.</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Réessayer
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des outils…
            </p>
          )}
        </div>
      ) : o.total === 0 ? (
        <p className={cn(panel, "text-sm text-ink-3")}>{expertName} n’a besoin d’aucun outil en plus de ceux déjà inclus.</p>
      ) : (
        <>
          <p className="mt-4 text-[15px] font-semibold text-ink">
            {o.usable} outil{o.usable > 1 ? "s" : ""} sur {o.total} prêt{o.usable > 1 ? "s" : ""}
          </p>
          <ToolGroup title="À connecter" tools={o.todo} className={panel}>
            {(t) => <TodoAction tool={t} busy={connecting === t.nom} onConnect={() => void connect(t)} />}
          </ToolGroup>
          <ToolGroup title="Prêts" tools={o.ready} className={panel}>
            {(t) => <Pill>{t.type === "mcp" ? "Branché" : "Connecté"}</Pill>}
          </ToolGroup>
          <ToolGroup title="Inclus" tools={o.included} className={panel}>
            {(t) => <Pill>{t.type === "socle" ? "Inclus" : "Disponible"}</Pill>}
          </ToolGroup>
        </>
      )}
    </div>
  );
}

function ToolGroup({
  title,
  tools,
  className,
  children,
}: {
  title: string;
  tools: ToolState[];
  className: string;
  children: (t: ToolState) => React.ReactNode;
}) {
  if (tools.length === 0) return null;
  return (
    <section className={className}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <ul className="mt-2 divide-y divide-line">
        {tools.map((t) => (
          <li key={t.nom} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">
                {t.nom}
                {t.status === "todo" && t.priorite === "essentiel" && (
                  <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.06em] text-coral-ink">Essentiel</span>
                )}
              </p>
              {t.usage && <p className="text-[13px] text-ink-3">{t.usage}</p>}
            </div>
            <div className="shrink-0">{children(t)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodoAction({ tool, busy, onConnect }: { tool: ToolState; busy: boolean; onConnect: () => void }) {
  if (tool.type === "mcp") {
    return (
      <span className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-[13px] text-ink-3">À fournir par l’entreprise</span>
        <Link href="/integrations/mcp" className="text-[13px] font-semibold text-link hover:underline">
          Ajouter un serveur
        </Link>
      </span>
    );
  }
  if (!tool.composio) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href="/integrations/connecteurs">Connecter</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={onConnect} disabled={busy}>
      {busy && <Loader2 className="animate-spin" />}
      Connecter
    </Button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
      <Check className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
