"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  Bot,
  Calendar,
  ChevronDown,
  Clock,
  Code2,
  Cpu,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  Layout,
  Mail,
  MessageSquare,
  Search,
  Send,
  Shield,
  Sparkles,
  Table as TableIcon,
  Terminal,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { AnalyticsItem, DimensionsData } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type DimensionTabKey =
  | "agents"
  | "members"
  | "groups"
  | "pods"
  | "models"
  | "tools"
  | "skills"
  | "sources"
  | "triggers"
  | "api_keys";

interface TabConfig {
  key: DimensionTabKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "agents", label: "Agents" },
  { key: "members", label: "Members" },
  { key: "groups", label: "Groups" },
  { key: "pods", label: "Pods" },
  { key: "models", label: "Models" },
  { key: "tools", label: "Tools" },
  { key: "skills", label: "Skills" },
  { key: "sources", label: "Sources" },
  { key: "triggers", label: "Triggers" },
  { key: "api_keys", label: "API keys" },
];

function renderRowIcon(item: AnalyticsItem) {
  if (item.color) {
    const initial = item.name.charAt(0).toUpperCase();
    return (
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
        style={{ backgroundColor: item.color }}
      >
        {initial}
      </div>
    );
  }

  switch (item.iconKind) {
    case "dust_logo":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 shadow-xs ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="size-4">
            <path fill="#FF5C5C" d="M4 4h7v7H4z" />
            <path fill="#FFBD38" d="M13 4h7v7h-7z" />
            <path fill="#3ED0EB" d="M4 13h7v7H4z" />
            <path fill="#6888F5" d="M13 13h7v7h-7z" />
          </svg>
        </div>
      );
    case "green_doc":
    case "green_arrow":
    case "green_brief":
    case "green_radar":
    case "green_stats":
    case "green_pulse":
    case "green_shield":
    case "green_inbox":
    case "green_trend":
    case "green_supply":
    case "green_inventory":
    case "green_debt":
    case "green_kpi":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <FileText className="size-3.5" />
        </div>
      );
    case "blue_chart":
    case "blue_room":
    case "blue_bot":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
          <Bot className="size-3.5" />
        </div>
      );
    case "red_money":
    case "red_brief":
    case "red_research":
    case "red_archive":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
          <Shield className="size-3.5" />
        </div>
      );
    case "yellow_heart":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          <Sparkles className="size-3.5" />
        </div>
      );
    case "avatar_vc":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20">
          <Users className="size-3.5" />
        </div>
      );
    case "claude":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xs font-black text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          A
        </div>
      );
    case "openai":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <Sparkles className="size-3.5" />
        </div>
      );
    case "gmail":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/20">
          <Mail className="size-3.5" />
        </div>
      );
    case "calendar":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
          <Calendar className="size-3.5" />
        </div>
      );
    case "files":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
          <FileText className="size-3.5" />
        </div>
      );
    case "web":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20">
          <Globe className="size-3.5" />
        </div>
      );
    case "computer":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20">
          <Terminal className="size-3.5" />
        </div>
      );
    case "frames":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">
          <Layout className="size-3.5" />
        </div>
      );
    case "logger":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/20">
          <Clock className="size-3.5" />
        </div>
      );
    case "table":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 ring-1 ring-teal-500/20">
          <TableIcon className="size-3.5" />
        </div>
      );
    case "memory":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20">
          <Globe className="size-3.5" />
        </div>
      );
    case "trigger":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          <Zap className="size-3.5" />
        </div>
      );
    case "chat":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <MessageSquare className="size-3.5" />
        </div>
      );
    case "api":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
          <Code2 className="size-3.5" />
        </div>
      );
    case "panel":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20">
          <Activity className="size-3.5" />
        </div>
      );
    case "member_e":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-600 dark:text-purple-300 ring-1 ring-purple-500/30">
          E
        </div>
      );
    case "member_m":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/30">
          M
        </div>
      );
    case "member_s":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30">
          S
        </div>
      );
    case "member_l":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-600 dark:text-teal-300 ring-1 ring-teal-500/30">
          L
        </div>
      );
    default:
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-soft text-ink-3 ring-1 ring-line">
          {item.name.charAt(0).toUpperCase()}
        </div>
      );
  }
}

export function DimensionsAnalyticsTable({
  dimensions,
}: {
  dimensions: DimensionsData;
}) {
  const [activeTab, setActiveTab] = useState<DimensionTabKey>("agents");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "share" | "credits" | "count">("credits");
  const [sortAsc, setSortAsc] = useState(false);

  const rawItems: AnalyticsItem[] = useMemo(() => {
    return dimensions[activeTab] || [];
  }, [dimensions, activeTab]);

  const filteredItems = useMemo(() => {
    let list = rawItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name, "fr");
      else if (sortField === "share") cmp = a.consumptionShare - b.consumptionShare;
      else if (sortField === "credits") cmp = a.volume - b.volume;
      else if (sortField === "count") cmp = a.count - b.count;

      return sortAsc ? cmp : -cmp;
    });
  }, [rawItems, search, sortField, sortAsc]);

  const handleSort = (field: "name" | "share" | "credits" | "count") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending
    }
  };

  const handleDownloadRawData = () => {
    const headers = "Name,ConsumptionShare,Credits,Count,Type\n";
    const rows = filteredItems.map(
      (item) => `"${item.name}",${item.consumptionShare}%,${item.volume},${item.count},${item.countType}`
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mstudio_attribution_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Données brutes (${activeTab}) exportées en CSV !`);
  };

  const countColumnHeader =
    activeTab === "tools" || activeTab === "skills" || activeTab === "pods"
      ? "Invocations"
      : "Messages";

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-xs transition-shadow">
      {/* 1. Header with Title Attribution + Download raw data button */}
      <div className="flex flex-col gap-3 border-b border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-base font-bold text-ink">
          Attribution
        </h3>

        <button
          type="button"
          onClick={handleDownloadRawData}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-soft/60 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-soft"
        >
          <Download className="size-3.5 text-ink-3" />
          <span>Download raw data</span>
        </button>
      </div>

      {/* 2. Sub-tabs bar matching screenshot exactly */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-line bg-soft/30 px-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSearch("");
              }}
              className={cn(
                "relative pb-3 pt-2 text-xs font-medium transition-colors whitespace-nowrap",
                active
                  ? "font-bold text-ink"
                  : "text-ink-3 hover:text-ink"
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Search bar matching screenshot */}
      <div className="p-4 sm:px-6">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-full border border-line bg-soft/60 py-2 pl-4 pr-10 text-xs text-ink placeholder:text-ink-3 transition-colors focus:border-brand/40 focus:bg-surface focus:outline-none"
          />
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        </div>
      </div>

      {/* 4. Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs max-sm:min-w-[620px]">
          <thead className="border-b border-line text-[11px] font-semibold text-ink-3">
            <tr>
              {/* Name */}
              <th
                onClick={() => handleSort("name")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  Name
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Consumption share */}
              <th
                onClick={() => handleSort("share")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  Consumption share
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Credits */}
              <th
                onClick={() => handleSort("credits")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  Credits
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      sortField === "credits" && sortAsc && "rotate-180"
                    )}
                  />
                </div>
              </th>

              {/* Messages / Invocations */}
              <th
                onClick={() => handleSort("count")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  {countColumnHeader}
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Action column */}
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-line text-xs">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-ink-3">
                  No records found matching "{search}"
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-soft/40"
                >
                  {/* Name cell */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      {renderRowIcon(item)}
                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{item.name}</p>
                        {item.subtitle && (
                          <p className="text-[10px] text-ink-3 truncate">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Consumption share cell */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-soft ring-1 ring-line/40">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(3, item.consumptionShare))}%`,
                            backgroundColor: item.color || "var(--brand, #7c3aed)",
                          }}
                        />
                      </div>
                      <span className="w-9 font-semibold text-ink text-[11px]">
                        {item.consumptionShare}%
                      </span>
                    </div>
                  </td>

                  {/* Credits cell */}
                  <td className="px-6 py-3.5 font-semibold text-ink-2">
                    {item.volume.toLocaleString("en-US")}
                  </td>

                  {/* Messages / Invocations cell */}
                  <td className="px-6 py-3.5 font-medium text-ink-3">
                    {item.count.toLocaleString("en-US")}
                  </td>

                  {/* Actions matching screenshot */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2 text-ink-3">
                      <ChevronDown className="size-3.5 cursor-pointer transition-colors hover:text-ink" />
                      <Filter className="size-3.5 cursor-pointer transition-colors hover:text-ink" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
