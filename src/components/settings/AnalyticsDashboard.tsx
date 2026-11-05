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
import type { AnalyticsOverview, AnalyticsPeriod } from "@/lib/analytics";
import { ExploreConsumptionChart } from "@/components/settings/ExploreConsumptionChart";
import { DimensionsAnalyticsTable } from "@/components/settings/DimensionsAnalyticsTable";
import { ExportDataCard } from "@/components/settings/ExportDataCard";
import { AskAnalystModal } from "@/components/settings/AskAnalystModal";
import { cn } from "@/lib/utils";

type TopTab = "consumption" | "export";

const CYCLE_OPTIONS = [
  { key: "cycle", label: "This cycle" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

export function AnalyticsDashboard() {
  const ownAgentId = useOwnAgentId();
  const { current } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TopTab>("consumption");
  const [selectedCycle, setSelectedCycle] = useState("cycle");
  const [cycleDropdownOpen, setCycleDropdownOpen] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [freqDropdownOpen, setFreqDropdownOpen] = useState(false);
  const [analystModalOpen, setAnalystModalOpen] = useState(false);

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
    CYCLE_OPTIONS.find((c) => c.key === selectedCycle)?.label || "This cycle";

  // KPIs calculations
  const usedCredits = 11866;
  const capCredits = 35495;
  const capPercent = Math.round((usedCredits / capCredits) * 100);
  const totalMessages = 222;
  const creditsPerMessage = (usedCredits / totalMessages).toFixed(1);
  const topAgentName = "Synthèse_Meeting";
  const topAgentShare = 42;

  return (
    <div className="space-y-6 pb-20 pt-2 text-ink">
      {/* 1. TOP HEADER MATCHING SCREENSHOT 1 & 4 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
            Analytics
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            Oct 21 to Nov 21 &nbsp;|&nbsp; 4 of 13 members active &nbsp;|&nbsp; Updated 2h ago
          </p>
        </div>

        {/* Top-Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cycle Dropdown matching Screenshot 4 */}
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
              <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
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
                              active ? "bg-white" : "border border-ink-3"
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
                  Custom range...
                </button>
              </div>
            )}
          </div>

          {/* Frequency Dropdown (Daily / Weekly) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setFreqDropdownOpen(!freqDropdownOpen);
                setCycleDropdownOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/60 px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
            >
              <span className="capitalize">{frequency}</span>
              <ChevronDown className="size-3.5 text-ink-3" />
            </button>

            {freqDropdownOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-32 rounded-xl border border-line bg-surface p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setFrequency("daily");
                    setFreqDropdownOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-soft"
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrequency("weekly");
                    setFreqDropdownOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-soft"
                >
                  Weekly
                </button>
              </div>
            )}
          </div>

          {/* Ask Analyst Action Button */}
          <button
            type="button"
            onClick={() => setAnalystModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-1.5 text-xs font-bold text-ink shadow-2xs ring-1 ring-line transition-all hover:bg-soft active:scale-95"
          >
            <Bot className="size-3.5 text-brand" />
            <span>Ask analyst</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Rafraîchir"
            className="inline-flex size-8 items-center justify-center rounded-xl border border-line bg-surface text-ink-3 shadow-2xs hover:bg-soft hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-brand")} />
          </button>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS (Consumption vs Export) MATCHING SCREENSHOTS */}
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
          Consumption
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
          Export
          {activeTab === "export" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
          )}
        </button>
      </div>

      {/* 3. MAIN TAB 1: CONSUMPTION */}
      {activeTab === "consumption" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 3.1 Three KPI Cards matching Screenshot 1 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* KPI 1: Used this period */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Used this period
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink">
                {usedCredits.toLocaleString()} credits
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {capPercent}% of {capCredits.toLocaleString()} cap
              </p>
            </div>

            {/* KPI 2: Messages */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Messages
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink">
                {totalMessages}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {creditsPerMessage} credits / message
              </p>
            </div>

            {/* KPI 3: Top agent */}
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <span className="text-xs font-semibold text-ink-3">
                Top agent
              </span>
              <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-ink truncate">
                {topAgentName}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {topAgentShare}% of agent consumption
              </p>
            </div>
          </div>

          {/* 3.2 Explore / Consumption Chart (Daily mixed bar + Cumulative line) */}
          <ExploreConsumptionChart
            usedCredits={usedCredits}
            capCredits={capCredits}
          />

          {/* 3.3 Attribution / 10 Dimension Tabs Table */}
          {data && (
            <DimensionsAnalyticsTable dimensions={data.dimensions} />
          )}
        </div>
      )}

      {/* 4. MAIN TAB 2: EXPORT MATCHING SCREENSHOT 2 & 3 */}
      {activeTab === "export" && data && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <ExportDataCard dimensions={data.dimensions} />
        </div>
      )}

      {/* 5. AI ANALYST MODAL */}
      <AskAnalystModal
        isOpen={analystModalOpen}
        onClose={() => setAnalystModalOpen(false)}
        usedCredits={usedCredits}
        totalMessages={totalMessages}
        topAgentName={topAgentName}
      />
    </div>
  );
}
