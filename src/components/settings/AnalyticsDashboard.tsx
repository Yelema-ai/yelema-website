"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  FileCheck,
  FileCode,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  LayoutGrid,
  List,
  Music,
  PieChart,
  Presentation,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  File as GenericFile,
} from "lucide-react";
import { toast } from "sonner";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { AnalyticsOverview, AnalyticsPeriod, DeliverableSummary, ExpertMetric } from "@/lib/analytics";
import type { DocKind } from "@/lib/drive-links";
import {
  TimelineAreaChart,
  ExpertDonutChart,
  TokenDistributionBar,
} from "@/components/settings/analytics-charts";
import { DimensionsAnalyticsTable } from "@/components/settings/DimensionsAnalyticsTable";
import { cn } from "@/lib/utils";

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "aujourdhui", label: "Aujourd'hui" },
  { key: "7_jours", label: "7 derniers jours" },
  { key: "30_jours", label: "30 jours" },
];

function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDateFr(ms: number | null): string {
  if (!ms) return "Aucune activité";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDocIcon(kind: DocKind) {
  switch (kind) {
    case "excel":
      return <FileSpreadsheet className="size-4 text-emerald-500" />;
    case "word":
      return <FileText className="size-4 text-blue-500" />;
    case "powerpoint":
      return <Presentation className="size-4 text-orange-500" />;
    case "pdf":
      return <FileText className="size-4 text-rose-500" />;
    case "video":
      return <Video className="size-4 text-purple-500" />;
    case "audio":
      return <Music className="size-4 text-amber-500" />;
    default:
      return <GenericFile className="size-4 text-ink-3" />;
  }
}

export function AnalyticsDashboard() {
  const ownAgentId = useOwnAgentId();
  const { current } = useWorkspace();
  const { experts } = useExpertsContext();

  const [period, setPeriod] = useState<AnalyticsPeriod>("7_jours");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode d'affichage et filtres
  const [viewMode, setViewMode] = useState<"all" | "console" | "charts">("all");
  const [timelineMetric, setTimelineMetric] = useState<"sessions" | "tokens">("sessions");
  const [donutMetric, setDonutMetric] = useState<"sessions" | "tokens">("sessions");

  const loadData = async (targetPeriod: AnalyticsPeriod, isManualRefresh = false) => {
    if (!ownAgentId) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<AnalyticsOverview>(
        `/api/agents/${ownAgentId}/analytics?period=${targetPeriod}`
      );
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible de charger les métriques analytiques.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(period);
  }, [ownAgentId, period]);

  const handlePeriodChange = (newPeriod: AnalyticsPeriod) => {
    setPeriod(newPeriod);
  };

  const findExpertMeta = (expId: string) => {
    const clean = expId.toLowerCase().trim();
    return experts.find(
      (e) =>
        e.profileId.toLowerCase() === clean ||
        e.displayName.toLowerCase() === clean ||
        e.agentId.toLowerCase() === clean
    );
  };

  return (
    <div className="space-y-8 pb-20 pt-3">
      {/* 1. Header & Period Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <BarChart3 className="size-5" />
            </div>
            <h2 className="font-display text-[22px] font-bold tracking-tight text-ink sm:text-[25px]">
              Tableau de Bord & Métriques d'Équipe
            </h2>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Statistiques visuelles, graphiques d'évolution et consommation des modèles d'IA en temps réel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode d'affichage ergonomique */}
          <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                viewMode === "all"
                  ? "bg-brand text-brand-fg shadow-xs"
                  : "text-ink-2 hover:bg-soft hover:text-ink"
              )}
            >
              Vue Complète
            </button>
            <button
              type="button"
              onClick={() => setViewMode("console")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                viewMode === "console"
                  ? "bg-brand text-brand-fg shadow-xs"
                  : "text-ink-2 hover:bg-soft hover:text-ink"
              )}
            >
              Ventilation par Dimension
            </button>
            <button
              type="button"
              onClick={() => setViewMode("charts")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                viewMode === "charts"
                  ? "bg-brand text-brand-fg shadow-xs"
                  : "text-ink-2 hover:bg-soft hover:text-ink"
              )}
            >
              Courbes & Évolution
            </button>
          </div>

          {/* Period Selector Tabs */}
          <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-xs">
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePeriodChange(p.key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    active
                      ? "bg-brand text-brand-fg shadow-xs"
                      : "text-ink-2 hover:bg-soft hover:text-ink"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(period, true)}
            disabled={refreshing || loading}
            title="Rafraîchir les métriques"
            className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-xs transition-colors hover:bg-soft hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin text-brand")} />
          </button>
        </div>
      </div>

      {/* 2. Health & Alert Pill */}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          {data.health.status === "healthy" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Système sain · {data.health.totalCrons} routines de fond scannées · 0 incident
            </div>
          ) : data.health.status === "warning" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              {data.health.warningsCount} avertissement(s) de configuration ou de connecteur
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-3.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <ShieldAlert className="size-3.5" />
              {data.health.incidentsCount} incident(s) d'exécution détecté(s)
            </div>
          )}

          <span className="text-xs text-ink-3">
            Période : {new Date(data.from).toLocaleDateString("fr-FR")} au {new Date(data.to).toLocaleDateString("fr-FR")}
          </span>
        </div>
      )}

      {/* 3. Loading State */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-[20px] border border-line bg-surface p-4"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-[22px] border border-line bg-surface p-6" />
        </div>
      )}

      {/* 4. Error State */}
      {error && !loading && (
        <div className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          <button
            type="button"
            onClick={() => loadData(period)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-xs hover:bg-soft"
          >
            <RefreshCw className="size-3.5" /> Réessayer
          </button>
        </div>
      )}

      {/* 5. Main Dashboard Content */}
      {data && !loading && (
        <>
          {/* KPI Cards (4 Cartes Modernes) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Tâches & Sessions */}
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  Tâches Traitées
                </span>
                <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Activity className="size-4" />
                </div>
              </div>
              <p className="mt-3 font-display text-[30px] font-bold tracking-tight text-ink">
                {formatNumber(data.totals.sessions)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Total des missions réalisées par les experts
              </p>
            </div>

            {/* KPI 2: Jetons IA (Tokens) */}
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  Jetons IA Consommés
                </span>
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Sparkles className="size-4" />
                </div>
              </div>
              <p className="mt-3 font-display text-[30px] font-bold tracking-tight text-ink">
                {formatNumber(data.totals.totalTokens)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {formatNumber(data.totals.promptTokens)} lu · {formatNumber(data.totals.completionTokens)} généré
              </p>
            </div>

            {/* KPI 3: Experts Mobilisés */}
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  Taux d'Engagement
                </span>
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Users className="size-4" />
                </div>
              </div>
              <p className="mt-3 font-display text-[30px] font-bold tracking-tight text-ink">
                {data.totals.activeExperts}{" "}
                <span className="text-lg font-normal text-ink-3">/ {data.totals.totalExperts}</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {data.totals.totalExperts > 0
                  ? Math.round((data.totals.activeExperts / data.totals.totalExperts) * 100)
                  : 0}
                % des experts ont travaillé cette période
              </p>
            </div>

            {/* KPI 4: Livrables */}
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  Livrables Prêts
                </span>
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <FileCheck className="size-4" />
                </div>
              </div>
              <p className="mt-3 font-display text-[30px] font-bold tracking-tight text-ink">
                {formatNumber(data.totals.deliverablesCount)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Fichiers finaux enregistrés dans Livrables
              </p>
            </div>
          </div>

          {/* 6. VENTILATION MULTI-DIMENSIONS NATIVE DE L'ESPACE */}
          {(viewMode === "all" || viewMode === "console") && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    Ventilation Détaillée de l'Espace
                  </h3>
                  <p className="text-xs text-ink-3">
                    Répartition interactive par experts métiers, modèles LLM, outils MCP, canaux d'interaction et formats de livrables.
                  </p>
                </div>
                <span className="rounded-full bg-soft px-3 py-1 text-[11px] font-semibold text-ink-2">
                  Télémétrie Espace Yéléma
                </span>
              </div>

              <DimensionsAnalyticsTable dimensions={data.dimensions} />
            </section>
          )}

          {/* 7. GRAPHIQUES ET VUES DÉTAILLÉES */}
          {(viewMode === "all" || viewMode === "charts") && (
            <>
              {/* 7.1 GRAPHIQUE 1 : COURBE TEMPORELLE INTERACTIVE */}
          <TimelineAreaChart
            timeline={data.timeline}
            activeMetric={timelineMetric}
            onMetricChange={setTimelineMetric}
          />

          {/* 7. GRAPHIQUE 2 & 3 : DONUT DE RÉPARTITION + BARRE D'EFFICACITÉ */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExpertDonutChart
              experts={data.experts}
              mode={donutMetric}
              onModeChange={setDonutMetric}
            />

            <TokenDistributionBar distribution={data.tokenDistribution} />
          </div>

          {/* 8. TABLEAU COMPARATIF DES EXPERTS */}
          <section className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-xs">
            <div className="border-b border-line px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    Performance Détaillée par Expert
                  </h3>
                  <p className="text-xs text-ink-3">
                    Volume de production, jetons IA consommés et modèles sollicités pour chaque profil.
                  </p>
                </div>
                <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-ink-2">
                  {data.experts.length} expert{data.experts.length > 1 ? "s" : ""} référencé{data.experts.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {data.experts.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-3">
                Aucun expert n'a encore enregistré d'activité sur cette période.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm max-sm:min-w-[720px]">
                  <thead className="border-b border-line bg-soft/60 text-xs font-semibold uppercase tracking-wider text-ink-3">
                    <tr>
                      <th className="px-6 py-3.5">Expert</th>
                      <th className="px-6 py-3.5">Rôle Métier</th>
                      <th className="px-6 py-3.5">Tâches Traitées</th>
                      <th className="px-6 py-3.5">Jetons IA</th>
                      <th className="px-6 py-3.5">Modèle Principal</th>
                      <th className="px-6 py-3.5">Dernière Action</th>
                      <th className="px-6 py-3.5 text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {data.experts.map((exp) => {
                      const meta = findExpertMeta(exp.id);
                      return (
                        <tr key={exp.id} className="transition-colors hover:bg-soft/40">
                          {/* Expert Avatar & Name */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {meta ? (
                                <ExpertAvatar expert={{ ...meta, gateway: null }} size="xs" />
                              ) : (
                                <div
                                  className="flex size-7 items-center justify-center rounded-full text-white font-bold"
                                  style={{ backgroundColor: exp.color }}
                                >
                                  {exp.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <span className="font-bold text-ink">{exp.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: exp.color }}
                                  />
                                  <span className="text-[10px] text-ink-3">
                                    {exp.sessionsPercent}% de l'équipe
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-6 py-4 text-ink-2">
                            <span className="inline-flex rounded-md bg-soft px-2.5 py-1 text-[11px] font-medium text-ink-2">
                              {exp.role}
                            </span>
                          </td>

                          {/* Sessions Count & Percent Bar */}
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-ink">
                                <span className="font-bold">{formatNumber(exp.sessionsCount)}</span>
                                <span className="text-[10px] text-ink-3">{exp.sessionsPercent}%</span>
                              </div>
                              <div className="h-2 w-28 overflow-hidden rounded-full bg-soft">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${Math.min(100, exp.sessionsPercent)}%`,
                                    backgroundColor: exp.color,
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Tokens Count & Percent Bar */}
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-ink">
                                <span className="font-bold">{formatNumber(exp.tokensCount)}</span>
                                <span className="text-[10px] text-ink-3">{exp.tokensPercent}%</span>
                              </div>
                              <div className="h-2 w-28 overflow-hidden rounded-full bg-soft">
                                <div
                                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, exp.tokensPercent)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Models */}
                          <td className="px-6 py-4 text-ink-3">
                            {exp.models.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {exp.models.map((m) => (
                                  <span
                                    key={m}
                                    className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-2"
                                  >
                                    {m.replace(/^models\//, "")}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-ink-3">Standard</span>
                            )}
                          </td>

                          {/* Last Active */}
                          <td className="px-6 py-4 text-ink-3">
                            {formatDateFr(exp.lastActiveMs)}
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4 text-right">
                            {exp.isActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Actif
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-[11px] font-medium text-ink-3">
                                En attente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 9. DERNIERS LIVRABLES DE L'ÉQUIPE */}
          <section className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-xs">
            <div className="border-b border-line px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    Derniers Livrables Générés
                  </h3>
                  <p className="text-xs text-ink-3">
                    Fichiers récents produits par l'équipe (rapports, feuilles de calcul, présentations, vidéos).
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand">
                  Dossier ~/Livrables
                </span>
              </div>
            </div>

            {data.recentDeliverables.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-3">
                Aucun livrable n'a été produit récemment dans le dossier Livrables.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {data.recentDeliverables.map((doc, idx) => (
                  <div
                    key={`${doc.name}-${idx}`}
                    className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-soft/40"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft">
                        {getDocIcon(doc.kind)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-ink">
                          {doc.name}
                        </p>
                        <p className="text-[11px] text-ink-3">
                          {formatBytes(doc.size)} · Modifié le {formatDateFr(doc.modified)}
                        </p>
                      </div>
                    </div>

                    <span className="rounded-lg bg-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-2">
                      {doc.kind}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
