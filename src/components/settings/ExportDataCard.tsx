"use client";

import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { DimensionsData } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface ExportDataCardProps {
  dimensions: DimensionsData;
}

const PERIOD_OPTIONS = [
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

const METRIC_OPTIONS = [
  { key: "usage", label: "Usage metrics" },
  { key: "users", label: "Active users" },
  { key: "source", label: "Message source" },
  { key: "agents", label: "Agents" },
  { key: "members", label: "Users" },
  { key: "skills", label: "Skills" },
  { key: "skill_usage", label: "Skill usage" },
  { key: "tool_usage", label: "Tool usage" },
  { key: "messages", label: "Messages" },
  { key: "feedback", label: "Feedback" },
];

export function ExportDataCard({ dimensions }: ExportDataCardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [selectedMetric, setSelectedMetric] = useState("usage");

  const [periodOpen, setPeriodOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);

  const currentPeriodLabel =
    PERIOD_OPTIONS.find((p) => p.key === selectedPeriod)?.label || "30 days";
  const currentMetricLabel =
    METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || "Usage metrics";

  const handleDownload = () => {
    let headers = "Name,ConsumptionShare,Credits,Count,Type\n";
    let rows: string[] = [];

    if (selectedMetric === "agents") {
      rows = dimensions.agents.map(
        (a) => `"${a.name}",${a.consumptionShare}%,${a.volume},${a.count},${a.countType}`
      );
    } else if (selectedMetric === "members" || selectedMetric === "users") {
      rows = (dimensions.members || []).map(
        (m) => `"${m.name}",${m.consumptionShare}%,${m.volume},${m.count},${m.countType}`
      );
    } else if (selectedMetric === "tool_usage") {
      rows = (dimensions.tools || []).map(
        (t) => `"${t.name}",${t.consumptionShare}%,${t.volume},${t.count},${t.countType}`
      );
    } else if (selectedMetric === "skills" || selectedMetric === "skill_usage") {
      rows = (dimensions.skills || []).map(
        (s) => `"${s.name}",${s.consumptionShare}%,${s.volume},${s.count},${s.countType}`
      );
    } else if (selectedMetric === "source" || selectedMetric === "messages") {
      rows = (dimensions.sources || []).map(
        (s) => `"${s.name}",${s.consumptionShare}%,${s.volume},${s.count},${s.countType}`
      );
    } else {
      // Default: usage metrics across top agents and members
      rows = [
        ...dimensions.agents.slice(0, 10).map((a) => `"${a.name}",${a.consumptionShare}%,${a.volume},${a.count},Agent`),
        ...(dimensions.members || []).map((m) => `"${m.name}",${m.consumptionShare}%,${m.volume},${m.count},Member`),
      ];
    }

    const csvContent = "data:text/csv;charset=utf-8," + headers + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mstudio_analytics_${selectedMetric}_${selectedPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Fichier analytics_${selectedMetric}_${selectedPeriod}.csv téléchargé avec succès !`);
  };

  return (
    <div className="rounded-[22px] border border-line bg-surface p-6 shadow-xs transition-shadow">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Titles */}
        <div>
          <h3 className="font-display text-base font-bold text-ink">
            Export data
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            Download analytics for the selected period as a CSV file.
          </p>
        </div>

        {/* Right: Controls matching Screenshot 2 & 3 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown 1: Period */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setPeriodOpen(!periodOpen);
                setMetricOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/70 px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
            >
              <span>{currentPeriodLabel}</span>
              <ChevronDown className="size-3.5 text-ink-3" />
            </button>

            {periodOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-36 rounded-xl border border-line bg-surface p-1 shadow-lg">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(opt.key);
                      setPeriodOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
                      selectedPeriod === opt.key
                        ? "bg-brand/10 font-bold text-brand"
                        : "text-ink hover:bg-soft"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown 2: Metric Type */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMetricOpen(!metricOpen);
                setPeriodOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/70 px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
            >
              <span>{currentMetricLabel}</span>
              <ChevronDown className="size-3.5 text-ink-3" />
            </button>

            {metricOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg max-h-60 overflow-y-auto">
                {METRIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSelectedMetric(opt.key);
                      setMetricOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
                      selectedMetric === opt.key
                        ? "bg-brand/10 font-bold text-brand"
                        : "text-ink hover:bg-soft"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Download CSV"
            className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-2xs transition-colors hover:bg-soft hover:text-ink"
          >
            <Download className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
