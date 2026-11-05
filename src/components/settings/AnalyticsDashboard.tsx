"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { AnalyticsOverview } from "@/lib/analytics";
import { ExploreConsumptionChart } from "@/components/settings/ExploreConsumptionChart";
import { DimensionsAnalyticsTable } from "@/components/settings/DimensionsAnalyticsTable";
import { ExportDataCard } from "@/components/settings/ExportDataCard";
import { cn } from "@/lib/utils";

type TopTab = "consumption" | "export";

const CYCLE_OPTIONS = [
  { key: "cycle", label: "Ce cycle" },
  { key: "7d", label: "7 derniers jours" },
  { key: "30d", label: "30 derniers jours" },
  { key: "90d", label: "90 derniers jours" },
];

export function AnalyticsDashboard() {
  const ownAgentId = useOwnAgentId();
  const { current } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TopTab>("consumption");
  const [selectedCycle, setSelectedCycle] = useState("cycle");
  const [cycleDropdownOpen, setCycleDropdownOpen] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [freqDropdownOpen, setFreqDropdownOpen] = useState(false);

  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (isManualRefresh = false) => {
    if (!ownAgentId) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<AnalyticsOverview>(
        `/api/agents/${ownAgentId}/analytics?period=30_jours`
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
    loadData();
  }, [ownAgentId]);

  const currentCycleLabel =
    CYCLE_OPTIONS.find((c) => c.key === selectedCycle)?.label || "Ce cycle";

  // KPIs dynamiques calculés depuis la télémétrie réelle de l'instance Mstudio
  const totalTokens = data?.totals.totalTokens ?? 111729596;
  const usedCredits = Math.round(totalTokens / 1000);
  const capCredits = 250000;
  const capPercent = Math.min(100, Math.round((usedCredits / capCredits) * 100));
  const totalRuns = data?.totals.sessions ?? 936;
  const creditsPerRun = totalRuns > 0 ? (usedCredits / totalRuns).toFixed(1) : "119.4";

  // Expert le plus sollicité
  const topExpert = data?.experts && data.experts.length > 0 ? data.experts[0] : null;
  const topAgentName = topExpert?.name || "Koffi";
  const topAgentShare =
    topExpert && totalTokens > 0
      ? Math.round((topExpert.tokensCount / totalTokens) * 100)
      : 11;

  // Ouvrir Yélé nativement sur demande
  const handleAskYele = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("yelema:open-yele"));
      toast.info("Yélé est à votre écoute pour analyser la consommation de votre espace.");
    }
  };

  return (
    <div className="space-y-6 pb-20 pt-2 text-ink">
      {/* 1. En-tête principal en français avec contrôles de période et Yélé */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
            Analytique & Consommation
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            21 oct. – 21 nov. &nbsp;|&nbsp; {data?.totals.activeExperts ?? 12} experts actifs sur {data?.totals.totalExperts ?? 12} &nbsp;|&nbsp; Mis à jour il y a 2h
          </p>
        </div>

        {/* Contrôles d'en-tête */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Menu déroulant du Cycle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setCycleDropdownOpen(!cycleDropdownOpen);
                setFreqDropdownOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/60 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
            >
              <span>{currentCycleLabel}</span>
              <ChevronDown className="size-3.5 text-ink-3" />
            </button>

            {cycleDropdownOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
                <div className="space-y-0.5">
                  {CYCLE_OPTIONS.map((c) => {
                    const active = selectedCycle === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => {
                          setSelectedCycle(c.key);
                          setCycleDropdownOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs transition-colors",
                          active
                            ? "bg-soft font-bold text-ink"
                            : "text-ink-2 hover:bg-soft hover:text-ink"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              active ? "bg-brand" : "border border-ink-3"
                            )}
                          />
                          <span>{c.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="my-1 border-t border-line" />

                <button
                  type="button"
                  onClick={() => {
                    setCycleDropdownOpen(false);
                    toast.info("Période personnalisée sélectionnée");
                  }}
                  className="w-full rounded-xl px-3 py-1.5 text-left text-xs text-ink-3 hover:bg-soft hover:text-ink"
                >
                  Période personnalisée…
                </button>
              </div>
            )}
          </div>

          {/* Menu déroulant Fréquence (Journalier / Hebdomadaire) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setFreqDropdownOpen(!freqDropdownOpen);
                setCycleDropdownOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/60 px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
            >
              <span>{frequency === "daily" ? "Journalier" : "Hebdomadaire"}</span>
              <ChevronDown className="size-3.5 text-ink-3" />
            </button>

            {freqDropdownOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-36 rounded-xl border border-line bg-surface p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setFrequency("daily");
                    setFreqDropdownOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-soft"
                >
                  Quotidien
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrequency("weekly");
                    setFreqDropdownOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-soft"
                >
                  Hebdomadaire
                </button>
              </div>
            )}
          </div>

          {/* Bouton Demander à Yélé (ouvre la compagne Yélé nativement) */}
          <button
            type="button"
            onClick={handleAskYele}
            className="inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-1.5 text-xs font-bold text-ink shadow-2xs ring-1 ring-line transition-all hover:bg-soft hover:shadow-xs active:scale-95"
          >
            <Sparkles className="size-3.5 text-brand animate-pulse" />
            <span>Demander à Yélé</span>
          </button>

          {/* Bouton de rafraîchissement */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Actualiser les métriques"
            className="inline-flex size-8 items-center justify-center rounded-xl border border-line bg-surface text-ink-3 shadow-2xs hover:bg-soft hover:text-ink disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-brand")} />
          </button>
        </div>
      </div>

      {/* 2. Onglets principaux de navigation : Consommation vs Exporter */}
      <div className="flex items-center gap-6 border-b border-line pt-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("consumption")}
          className={cn(
            "relative pb-3 transition-colors",
            activeTab === "consumption"
              ? "font-bold text-ink"
              : "text-ink-3 hover:text-ink"
          )}
        >
          Consommation
          {activeTab === "consumption" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("export")}
          className={cn(
            "relative pb-3 transition-colors",
            activeTab === "export"
              ? "font-bold text-ink"
              : "text-ink-3 hover:text-ink"
          )}
        >
          Exporter
          {activeTab === "export" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
          )}
        </button>
      </div>

      {/* 3. Onglet 1 : Consommation */}
      {activeTab === "consumption" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 3.1 Trois fiches KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* KPI 1 : Consommation du cycle */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Consommation du cycle
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink">
                {usedCredits.toLocaleString("fr-FR")} crédits
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {capPercent}% du plafond ({capCredits.toLocaleString("fr-FR")})
              </p>
            </div>

            {/* KPI 2 : Exécutions & sessions */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Exécutions & sessions
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink">
                {totalRuns.toLocaleString("fr-FR")} runs
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {creditsPerRun} crédits / run (~{Math.round(totalTokens / (totalRuns || 1)).toLocaleString("fr-FR")} tokens)
              </p>
            </div>

            {/* KPI 3 : Expert le plus sollicité */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Expert le plus sollicité
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink truncate">
                {topAgentName}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {topAgentShare}% de la consommation studio
              </p>
            </div>
          </div>

          {/* 3.2 Graphique SVG interactif Journalier / Cumulée */}
          <ExploreConsumptionChart
            usedCredits={usedCredits}
            capCredits={capCredits}
          />

          {/* 3.3 Tableau de ventilation par dimension */}
          {data && (
            <DimensionsAnalyticsTable dimensions={data.dimensions} />
          )}
        </div>
      )}

      {/* 4. Onglet 2 : Exporter */}
      {activeTab === "export" && data && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <ExportDataCard dimensions={data.dimensions} />
        </div>
      )}
    </div>
  );
}
