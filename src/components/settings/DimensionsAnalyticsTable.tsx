"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  Code2,
  Clock,
  Cpu,
  FileText,
  Filter,
  Globe,
  Layout,
  MessageSquare,
  Search,
  Sparkles,
  Table as TableIcon,
  Terminal,
  Zap,
} from "lucide-react";
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
  switch (item.iconKind) {
    case "claude":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-black text-amber-500 shadow-xs ring-1 ring-white/10">
          A
        </div>
      );
    case "openai":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-emerald-400 shadow-xs ring-1 ring-white/10">
          <Sparkles className="size-4" />
        </div>
      );
    case "gmail":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 shadow-xs ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="size-4">
            <path
              fill="#EA4335"
              d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.146C21.69 2.28 24 3.434 24 5.457z"
            />
          </svg>
        </div>
      );
    case "calendar":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 shadow-xs ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="size-4">
            <rect width="20" height="20" x="2" y="2" rx="4" fill="#4285F4" />
            <path
              fill="#fff"
              d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"
            />
          </svg>
        </div>
      );
    case "files":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-blue-400 shadow-xs ring-1 ring-white/10">
          <FileText className="size-3.5" />
        </div>
      );
    case "web":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sky-400 shadow-xs ring-1 ring-white/10">
          <Globe className="size-3.5" />
        </div>
      );
    case "computer":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-purple-400 shadow-xs ring-1 ring-white/10">
          <Terminal className="size-3.5" />
        </div>
      );
    case "frames":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-indigo-400 shadow-xs ring-1 ring-white/10">
          <Layout className="size-3.5" />
        </div>
      );
    case "logger":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-cyan-400 shadow-xs ring-1 ring-white/10">
          <Clock className="size-3.5" />
        </div>
      );
    case "table":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-teal-400 shadow-xs ring-1 ring-white/10">
          <TableIcon className="size-3.5" />
        </div>
      );
    case "memory":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-violet-400 shadow-xs ring-1 ring-white/10">
          <Globe className="size-3.5" />
        </div>
      );
    case "trigger":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-amber-400 shadow-xs ring-1 ring-white/10">
          <Zap className="size-3.5" />
        </div>
      );
    case "chat":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-emerald-400 shadow-xs ring-1 ring-white/10">
          <MessageSquare className="size-3.5" />
        </div>
      );
    case "api":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-rose-400 shadow-xs ring-1 ring-white/10">
          <Code2 className="size-3.5" />
        </div>
      );
    case "panel":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-purple-400 shadow-xs ring-1 ring-white/10">
          <Activity className="size-3.5" />
        </div>
      );
    case "agent":
      return (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-purple-600/20 font-bold text-purple-400 ring-1 ring-purple-500/30">
          {item.name.charAt(0).toUpperCase()}
        </div>
      );
    case "member":
    default: {
      // Initials with pastel colors matching screenshot
      const initial = item.name.charAt(0).toUpperCase();
      const colorMap: Record<string, string> = {
        E: "bg-purple-900/60 text-purple-300 ring-purple-500/30",
        M: "bg-blue-900/60 text-blue-300 ring-blue-500/30",
        S: "bg-emerald-900/60 text-emerald-300 ring-emerald-500/30",
        L: "bg-teal-900/60 text-teal-300 ring-teal-500/30",
      };
      const classes = colorMap[initial] || "bg-zinc-800 text-zinc-300 ring-white/10";
      return (
        <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1", classes)}>
          {initial}
        </div>
      );
    }
  }
}

export function DimensionsAnalyticsTable({
  dimensions,
}: {
  dimensions: DimensionsData;
}) {
  const [activeTab, setActiveTab] = useState<DimensionTabKey>("members");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "share" | "credits" | "count">("credits");
  const [sortAsc, setSortAsc] = useState(false);

  const rawItems = dimensions[activeTab] || [];

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
      else if (sortField === "credits") cmp = a.credits - b.credits;
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

  const countColumnHeader =
    activeTab === "tools" || activeTab === "skills" || activeTab === "pods" || activeTab === "triggers"
      ? "Invocations"
      : "Messages";

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-[#161618] text-white shadow-md">
      {/* 1. Sub-tabs bar matching screenshot */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-white/10 px-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                "relative pb-3 pt-2 text-sm font-medium transition-colors whitespace-nowrap",
                active
                  ? "font-semibold text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-white" />
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Search bar matching screenshot */}
      <div className="p-4 sm:px-6">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-full border border-white/10 bg-[#1e1e21] py-2 pl-4 pr-10 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
          />
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* 3. Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm max-sm:min-w-[620px]">
          <thead className="border-b border-white/10 text-xs text-zinc-400">
            <tr>
              {/* Name */}
              <th
                onClick={() => handleSort("name")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-white"
              >
                <div className="flex items-center gap-1.5">
                  Name
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Consumption share */}
              <th
                onClick={() => handleSort("share")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-white"
              >
                <div className="flex items-center gap-1.5">
                  Consumption share
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Credits */}
              <th
                onClick={() => handleSort("credits")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-white"
              >
                <div className="flex items-center gap-1.5">
                  Credits
                  <ChevronDown className={cn("size-3.5 transition-transform", sortField === "credits" && sortAsc && "rotate-180")} />
                </div>
              </th>

              {/* Messages / Invocations */}
              <th
                onClick={() => handleSort("count")}
                className="cursor-pointer px-6 py-3 font-semibold transition-colors hover:text-white"
              >
                <div className="flex items-center gap-1.5">
                  {countColumnHeader}
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Actions Header */}
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5 text-xs text-zinc-300">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-zinc-500">
                  No records found matching "{search}"
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-white/[0.03]"
                >
                  {/* Name cell */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {renderRowIcon(item)}
                      <div>
                        <p className="font-semibold text-white">{item.name}</p>
                        {item.subtitle && (
                          <p className="text-[10px] text-zinc-500">{item.subtitle}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Consumption share cell */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {/* Pill Progress Bar */}
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-zinc-200 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(3, item.consumptionShare))}%` }}
                        />
                      </div>
                      <span className="w-9 font-medium text-zinc-400">
                        {item.consumptionShare}%
                      </span>
                    </div>
                  </td>

                  {/* Credits cell */}
                  <td className="px-6 py-4 font-medium text-zinc-200">
                    {item.credits.toLocaleString("en-US")}
                  </td>

                  {/* Messages / Invocations cell */}
                  <td className="px-6 py-4 font-medium text-zinc-400">
                    {item.count.toLocaleString("en-US")}
                  </td>

                  {/* Action Icons matching screenshot */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-zinc-500">
                      <ChevronDown className="size-3.5 cursor-pointer transition-colors hover:text-white" />
                      <Filter className="size-3.5 cursor-pointer transition-colors hover:text-white" />
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
