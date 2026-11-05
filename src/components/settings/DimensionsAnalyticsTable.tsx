"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  Cpu,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  MessageSquare,
  Presentation,
  Search,
  Send,
  Sparkles,
  Terminal,
  Users,
  Video,
  Zap,
} from "lucide-react";
import type { AnalyticsItem, DimensionsData } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type DimensionTabKey =
  | "experts"
  | "models"
  | "tools"
  | "channels"
  | "deliverables";

interface TabConfig {
  key: DimensionTabKey;
  label: string;
  icon: typeof Users;
}

const TABS: TabConfig[] = [
  { key: "experts", label: "Experts Métiers", icon: Users },
  { key: "models", label: "Modèles d'IA", icon: Sparkles },
  { key: "tools", label: "Outils & MCP", icon: Cpu },
  { key: "channels", label: "Canaux d'Interaction", icon: MessageSquare },
  { key: "deliverables", label: "Formats de Livrables", icon: FileCheck },
];

function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function renderItemIcon(item: AnalyticsItem) {
  if (item.color) {
    return (
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-xs"
        style={{ backgroundColor: item.color }}
      >
        {item.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  switch (item.iconKind) {
    case "claude":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-xs font-black text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          A
        </div>
      );
    case "openai":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <Sparkles className="size-4" />
        </div>
      );
    case "gemini":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
          <Sparkles className="size-4" />
        </div>
      );
    case "telegram":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20">
          <Send className="size-4" />
        </div>
      );
    case "web":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">
          <Globe className="size-4" />
        </div>
      );
    case "memory":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20">
          <Cpu className="size-4" />
        </div>
      );
    case "logger":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/20">
          <Activity className="size-4" />
        </div>
      );
    case "trigger":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          <Zap className="size-4" />
        </div>
      );
    case "excel":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <FileSpreadsheet className="size-4" />
        </div>
      );
    case "word":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
          <FileText className="size-4" />
        </div>
      );
    case "powerpoint":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/20">
          <Presentation className="size-4" />
        </div>
      );
    case "pdf":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
          <FileText className="size-4" />
        </div>
      );
    case "video":
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20">
          <Video className="size-4" />
        </div>
      );
    default:
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-soft text-ink-2 ring-1 ring-line">
          <Terminal className="size-4" />
        </div>
      );
  }
}

export function DimensionsAnalyticsTable({
  dimensions,
}: {
  dimensions: DimensionsData;
}) {
  const [activeTab, setActiveTab] = useState<DimensionTabKey>("experts");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "share" | "volume" | "count">("share");
  const [sortAsc, setSortAsc] = useState(false);

  // Fallback to aliases if available
  const rawItems: AnalyticsItem[] = useMemo(() => {
    if (activeTab === "experts") return dimensions.experts || dimensions.agents || [];
    if (activeTab === "models") return dimensions.models || [];
    if (activeTab === "tools") return dimensions.tools || [];
    if (activeTab === "channels") return dimensions.channels || dimensions.sources || [];
    if (activeTab === "deliverables") return dimensions.deliverables || [];
    return [];
  }, [dimensions, activeTab]);

  const filteredItems = useMemo(() => {
    let list = rawItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name, "fr");
      else if (sortField === "share") cmp = a.consumptionShare - b.consumptionShare;
      else if (sortField === "volume") cmp = a.volume - b.volume;
      else if (sortField === "count") cmp = a.count - b.count;

      return sortAsc ? cmp : -cmp;
    });
  }, [rawItems, search, sortField, sortAsc]);

  const handleSort = (field: "name" | "share" | "volume" | "count") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending
    }
  };

  const volumeHeader =
    activeTab === "deliverables" ? "Volume Fichiers" : "Jetons IA Estimés";

  const countHeader =
    activeTab === "experts"
      ? "Missions"
      : activeTab === "models"
      ? "Requêtes"
      : activeTab === "tools"
      ? "Invocations"
      : activeTab === "channels"
      ? "Interactions"
      : "Fichiers";

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-xs transition-shadow">
      {/* 1. Navigation par onglets ergonomique inspirée du modèle Dust */}
      <div className="border-b border-line bg-soft/40 px-6 pt-3">
        <div className="flex items-center gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const items =
              tab.key === "experts"
                ? dimensions.experts || dimensions.agents || []
                : tab.key === "models"
                ? dimensions.models || []
                : tab.key === "tools"
                ? dimensions.tools || []
                : tab.key === "channels"
                ? dimensions.channels || dimensions.sources || []
                : dimensions.deliverables || [];

            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setSearch("");
                }}
                className={cn(
                  "relative flex items-center gap-2 pb-3.5 pt-1 text-xs transition-colors whitespace-nowrap",
                  active
                    ? "font-bold text-ink"
                    : "font-medium text-ink-3 hover:text-ink"
                )}
              >
                <Icon className={cn("size-3.5", active ? "text-brand" : "text-ink-3")} />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-semibold transition-colors",
                    active
                      ? "bg-brand/10 text-brand font-bold"
                      : "bg-soft text-ink-3"
                  )}
                >
                  {items.length}
                </span>

                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Barre de recherche et filtres */}
      <div className="flex flex-col gap-3 border-b border-line/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, rôle ou outil..."
            className="w-full rounded-full border border-line bg-soft/60 py-2 pl-4 pr-10 text-xs text-ink placeholder:text-ink-3 transition-colors focus:border-brand/40 focus:bg-surface focus:outline-none"
          />
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-3">
          <span>
            {filteredItems.length} élément{filteredItems.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* 3. Tableau de ventilation */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs max-sm:min-w-[620px]">
          <thead className="border-b border-line bg-soft/30 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            <tr>
              {/* Nom & Rôle */}
              <th
                onClick={() => handleSort("name")}
                className="cursor-pointer px-6 py-3.5 transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  Élément
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Part de consommation */}
              <th
                onClick={() => handleSort("share")}
                className="cursor-pointer px-6 py-3.5 transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  Part de Consommation
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Volume */}
              <th
                onClick={() => handleSort("volume")}
                className="cursor-pointer px-6 py-3.5 transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  {volumeHeader}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      sortField === "volume" && sortAsc && "rotate-180"
                    )}
                  />
                </div>
              </th>

              {/* Activité */}
              <th
                onClick={() => handleSort("count")}
                className="cursor-pointer px-6 py-3.5 transition-colors hover:text-ink"
              >
                <div className="flex items-center gap-1.5">
                  {countHeader}
                  <ArrowUpDown className="size-3 opacity-60" />
                </div>
              </th>

              {/* Statut */}
              <th className="px-6 py-3.5 text-right">Statut</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-line text-xs">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-ink-3">
                  Aucun élément ne correspond à votre recherche "{search}".
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-soft/40"
                >
                  {/* Nom & Métadonnées */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3.5">
                      {renderItemIcon(item)}
                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{item.name}</p>
                        {item.subtitle && (
                          <p className="text-[11px] text-ink-3 truncate">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Barre de part de consommation */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-soft ring-1 ring-line/40">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(4, item.consumptionShare))}%`,
                            backgroundColor: item.color || "var(--brand, #7c3aed)",
                          }}
                        />
                      </div>
                      <span className="w-10 font-bold text-ink text-[11px]">
                        {item.consumptionShare}%
                      </span>
                    </div>
                  </td>

                  {/* Volume (Tokens / Bytes) */}
                  <td className="px-6 py-4 font-semibold text-ink-2">
                    {activeTab === "deliverables"
                      ? formatBytes(item.volume)
                      : `${formatNumber(item.volume)} jetons`}
                  </td>

                  {/* Nombre d'activités */}
                  <td className="px-6 py-4 font-medium text-ink-3">
                    <span className="font-semibold text-ink">
                      {formatNumber(item.count)}
                    </span>{" "}
                    {item.countType}
                  </td>

                  {/* Statut */}
                  <td className="px-6 py-4 text-right">
                    {item.status ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          item.status === "Actif" || item.status === "Opérationnel" || item.status === "Connecté" || item.status === "Sain" || item.status === "Disponible"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-soft text-ink-3"
                        )}
                      >
                        {(item.status === "Actif" || item.status === "Opérationnel" || item.status === "Connecté" || item.status === "Sain") && (
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {item.status}
                      </span>
                    ) : (
                      <span className="text-ink-3">--</span>
                    )}
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
