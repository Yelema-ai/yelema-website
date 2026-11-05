"use client";

import { useMemo, useState } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExploreChartProps {
  usedCredits: number;
  capCredits: number;
}

interface DailyPoint {
  date: string;
  synthese: number;
  ossoya: number;
  others: number;
  router: number;
  maBrief: number;
  veille: number;
  activeUsers: number;
  isToday?: boolean;
}

const DAILY_DATA: DailyPoint[] = [
  { date: "Oct 23", synthese: 400, ossoya: 250, others: 150, router: 80, maBrief: 60, veille: 40, activeUsers: 3 },
  { date: "Oct 25", synthese: 650, ossoya: 400, others: 200, router: 120, maBrief: 80, veille: 50, activeUsers: 3 },
  { date: "Oct 28", synthese: 500, ossoya: 350, others: 180, router: 90, maBrief: 70, veille: 45, activeUsers: 2 },
  { date: "Oct 29", synthese: 1800, ossoya: 900, others: 350, router: 200, maBrief: 150, veille: 100, activeUsers: 3 },
  { date: "Oct 31", synthese: 1200, ossoya: 650, others: 280, router: 150, maBrief: 120, veille: 80, activeUsers: 3 },
  { date: "Nov 1", synthese: 450, ossoya: 300, others: 160, router: 80, maBrief: 50, veille: 35, activeUsers: 3 },
  { date: "Nov 3", synthese: 1500, ossoya: 750, others: 320, router: 180, maBrief: 140, veille: 90, activeUsers: 4 },
  { date: "Nov 5", synthese: 750, ossoya: 420, others: 200, router: 110, maBrief: 90, veille: 60, activeUsers: 3, isToday: true },
  { date: "Nov 8", synthese: 0, ossoya: 0, others: 0, router: 0, maBrief: 0, veille: 0, activeUsers: 0 },
  { date: "Nov 12", synthese: 0, ossoya: 0, others: 0, router: 0, maBrief: 0, veille: 0, activeUsers: 0 },
  { date: "Nov 15", synthese: 0, ossoya: 0, others: 0, router: 0, maBrief: 0, veille: 0, activeUsers: 0 },
  { date: "Nov 18", synthese: 0, ossoya: 0, others: 0, router: 0, maBrief: 0, veille: 0, activeUsers: 0 },
  { date: "Nov 21", synthese: 0, ossoya: 0, others: 0, router: 0, maBrief: 0, veille: 0, activeUsers: 0 },
];

const CUMULATIVE_DATES = [
  "Oct 23",
  "Oct 26",
  "Oct 29",
  "Nov 1",
  "Nov 3",
  "Nov 5",
  "Nov 7",
  "Nov 9",
  "Nov 12",
  "Nov 15",
  "Nov 18",
  "Nov 21",
];

export function ExploreConsumptionChart({
  usedCredits = 11866,
  capCredits = 35495,
}: ExploreChartProps) {
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [showFilterPopover, setShowFilterPopover] = useState(false);

  // Dimensions SVG
  const width = 860;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 50;
  const paddingTop = 30;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Max scale for Daily credits Y-axis
  const maxDailyCredits = 3600;
  const maxActiveUsers = 5;

  // Cumulative points calculation (actual climbs to usedCredits on Nov 5, target climbs linearly to capCredits)
  const cumulativePoints = useMemo(() => {
    const todayIndex = 5; // Nov 5
    const actualStep = usedCredits / todayIndex;
    const targetStep = capCredits / (CUMULATIVE_DATES.length - 1);

    return CUMULATIVE_DATES.map((date, i) => {
      const x = paddingLeft + (i / (CUMULATIVE_DATES.length - 1)) * chartWidth;
      const targetVal = i * targetStep;
      const targetY = paddingTop + chartHeight - (targetVal / capCredits) * chartHeight;

      let actualY: number | null = null;
      let actualVal: number | null = null;

      if (i <= todayIndex) {
        // Curve shape matching Screenshot 5
        const factor = Math.pow(i / todayIndex, 1.3);
        actualVal = Math.round(usedCredits * factor);
        actualY = paddingTop + chartHeight - (actualVal / capCredits) * chartHeight;
      }

      return { date, x, targetY, targetVal, actualY, actualVal };
    });
  }, [usedCredits, capCredits, chartWidth, chartHeight]);

  // SVG path for actual cumulative
  const actualPathD = useMemo(() => {
    const pts = cumulativePoints.filter((p) => p.actualY !== null);
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].actualY}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.actualY!;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.actualY!;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.actualY}`;
    }
    return d;
  }, [cumulativePoints]);

  // SVG path for target cumulative
  const targetPathD = useMemo(() => {
    if (cumulativePoints.length === 0) return "";
    return `M ${cumulativePoints[0].x} ${cumulativePoints[0].targetY} L ${cumulativePoints[cumulativePoints.length - 1].x} ${cumulativePoints[cumulativePoints.length - 1].targetY}`;
  }, [cumulativePoints]);

  return (
    <div className="rounded-[22px] border border-line bg-surface p-6 shadow-xs transition-shadow">
      {/* 1. Header with Title and Mode Switcher */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Explore
          </h3>
          <h4 className="font-display text-base font-bold text-ink">
            Consumption
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterPopover(!showFilterPopover)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-xs transition-colors hover:bg-soft hover:text-ink"
            >
              <Filter className="size-3.5" />
              <span>Filters</span>
            </button>

            {showFilterPopover && (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-line bg-surface p-3 text-xs shadow-lg">
                <p className="font-bold text-ink mb-2">Filtrer les agents</p>
                <div className="space-y-1.5 text-ink-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Tous les agents actifs</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Synthèse_Meeting (Top 1)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Utilisateurs actifs</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Daily vs Cumulative Toggle matching screenshot */}
          <div className="flex items-center rounded-xl border border-line bg-soft/60 p-1">
            <button
              type="button"
              onClick={() => setMode("daily")}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-all",
                mode === "daily"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-3 hover:text-ink"
              )}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setMode("cumulative")}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-all",
                mode === "cumulative"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-3 hover:text-ink"
              )}
            >
              Cumulative
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive SVG Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-60 w-full min-w-[700px] overflow-visible"
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingTop + ratio * chartHeight;
            const dailyCreditVal = Math.round(maxDailyCredits * (1 - ratio));
            const cumCreditVal = Math.round((capCredits * (1 - ratio)) / 1000);
            const userVal = Math.round(maxActiveUsers * (1 - ratio));

            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  className="text-line/40"
                  strokeWidth="1"
                />
                {/* Left Y-axis label */}
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-ink-3 text-[10px] font-medium"
                >
                  {mode === "daily"
                    ? dailyCreditVal >= 1000
                      ? `${(dailyCreditVal / 1000).toFixed(1)}K`
                      : dailyCreditVal
                    : `${cumCreditVal}K`}
                </text>

                {/* Right Y-axis label for Daily Active users */}
                {mode === "daily" && (
                  <text
                    x={width - paddingRight + 8}
                    y={y + 4}
                    textAnchor="start"
                    className="fill-ink-3 text-[10px] font-medium"
                  >
                    {userVal}
                  </text>
                )}
              </g>
            );
          })}

          {/* Left Y-axis title */}
          <text
            x={16}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90, 16, ${height / 2})`}
            className="fill-ink-3 text-[10px] font-semibold"
          >
            Credits
          </text>

          {/* Right Y-axis title for Daily */}
          {mode === "daily" && (
            <text
              x={width - 14}
              y={height / 2}
              textAnchor="middle"
              transform={`rotate(90, ${width - 14}, ${height / 2})`}
              className="fill-ink-3 text-[10px] font-semibold"
            >
              Active users
            </text>
          )}

          {/* --- MODE 1: DAILY STACKED BARS + ACTIVE USERS LINE --- */}
          {mode === "daily" && (
            <>
              {/* Stacked Bars for each day */}
              {DAILY_DATA.map((pt, i) => {
                const x = paddingLeft + (i / (DAILY_DATA.length - 1)) * chartWidth;
                const barWidth = 24;
                const total = pt.synthese + pt.ossoya + pt.others + pt.router + pt.maBrief + pt.veille;
                if (total === 0) return null;

                let currentY = paddingTop + chartHeight;

                const segments = [
                  { val: pt.veille, color: "#E2E8F0" },
                  { val: pt.maBrief, color: "#93C5FD" },
                  { val: pt.router, color: "#38BDF8" },
                  { val: pt.others, color: "#1D4ED8" },
                  { val: pt.ossoya, color: "#2563EB" },
                  { val: pt.synthese, color: "#06B6D4" },
                ];

                return (
                  <g key={pt.date}>
                    {segments.map((seg, sIdx) => {
                      const h = (seg.val / maxDailyCredits) * chartHeight;
                      currentY -= h;
                      return (
                        <rect
                          key={sIdx}
                          x={x - barWidth / 2}
                          y={currentY}
                          width={barWidth}
                          height={Math.max(0, h)}
                          fill={seg.color}
                          rx={sIdx === segments.length - 1 ? 4 : 0}
                          className="transition-all hover:opacity-85"
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Vertical Dashed Marker for Today (partial) */}
              {DAILY_DATA.filter((d) => d.isToday).map((todayPt) => {
                const idx = DAILY_DATA.indexOf(todayPt);
                const x = paddingLeft + (idx / (DAILY_DATA.length - 1)) * chartWidth;
                return (
                  <g key="today-marker">
                    <line
                      x1={x}
                      y1={paddingTop - 6}
                      x2={x}
                      y2={paddingTop + chartHeight}
                      stroke="currentColor"
                      strokeDasharray="4 4"
                      className="text-ink-2"
                      strokeWidth="1.5"
                    />
                    {/* Badge Today (partial) */}
                    <g transform={`translate(${x}, ${paddingTop - 12})`}>
                      <rect
                        x="-40"
                        y="-12"
                        width="80"
                        height="20"
                        rx="10"
                        className="fill-surface stroke-line shadow-xs"
                      />
                      <text
                        x="0"
                        y="2"
                        textAnchor="middle"
                        className="fill-ink text-[10px] font-semibold"
                      >
                        Today (partial)
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Line overlay for Active Users */}
              {(() => {
                const pts = DAILY_DATA.filter((d) => d.activeUsers > 0).map((d) => {
                  const idx = DAILY_DATA.indexOf(d);
                  const x = paddingLeft + (idx / (DAILY_DATA.length - 1)) * chartWidth;
                  const y = paddingTop + chartHeight - (d.activeUsers / maxActiveUsers) * chartHeight;
                  return { x, y, users: d.activeUsers };
                });

                if (pts.length === 0) return null;

                let lineD = `M ${pts[0].x} ${pts[0].y}`;
                for (let i = 1; i < pts.length; i++) {
                  lineD += ` L ${pts[i].x} ${pts[i].y}`;
                }

                return (
                  <g key="active-users-line">
                    <path
                      d={lineD}
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {pts.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill="#F59E0B"
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    ))}
                  </g>
                );
              })()}

              {/* X-axis labels for Daily */}
              {DAILY_DATA.map((d, i) => {
                const x = paddingLeft + (i / (DAILY_DATA.length - 1)) * chartWidth;
                return (
                  <text
                    key={d.date}
                    x={x}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-ink-3 text-[10px] font-medium"
                  >
                    {d.date}
                  </text>
                );
              })}
            </>
          )}

          {/* --- MODE 2: CUMULATIVE DUAL LINE (Actual vs Target) --- */}
          {mode === "cumulative" && (
            <>
              {/* Target consumption: Dashed Line */}
              <path
                d={targetPathD}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5 5"
              />

              {/* Actual consumption: Blue Solid Curve */}
              <path
                d={actualPathD}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* X-axis labels for Cumulative */}
              {cumulativePoints.map((p) => (
                <text
                  key={p.date}
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-ink-3 text-[10px] font-medium"
                >
                  {p.date}
                </text>
              ))}
            </>
          )}
        </svg>
      </div>

      {/* 3. Bottom Legends matching Screenshot 1 & 5 */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-line/60 pt-3 text-xs text-ink-2">
        {mode === "daily" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#06B6D4]" />
              <span className="text-[11px] font-medium">Synthèse_Meeting</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#2563EB]" />
              <span className="text-[11px] font-medium">OssoyaReportGen</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#1D4ED8]" />
              <span className="text-[11px] font-medium">Others</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#38BDF8]" />
              <span className="text-[11px] font-medium">Meeting_Router</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#93C5FD]" />
              <span className="text-[11px] font-medium">M&A_brief_hebdo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#E2E8F0] ring-1 ring-ink-3/20" />
              <span className="text-[11px] font-medium">VeilleTechIA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Active users
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#3B82F6]" />
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Actual consumption
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border border-dashed border-zinc-400 bg-transparent" />
              <span className="text-[11px] font-medium text-ink-3">
                Target consumption
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
