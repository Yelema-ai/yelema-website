"use client";

import { useMemo, useState } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExploreChartProps {
  usedCredits?: number;
  capCredits?: number;
}

interface DailyPoint {
  date: string;
  koffi: number;
  djeneba: number;
  adjoua: number;
  mamadou: number;
  kouassi: number;
  others: number;
  activeUsers: number;
  isToday?: boolean;
}

const DAILY_DATA: DailyPoint[] = [
  { date: "23 oct.", koffi: 950, djeneba: 880, adjoua: 780, mamadou: 740, kouassi: 720, others: 4800, activeUsers: 3 },
  { date: "25 oct.", koffi: 1100, djeneba: 990, adjoua: 870, mamadou: 840, kouassi: 820, others: 5400, activeUsers: 3 },
  { date: "28 oct.", koffi: 1050, djeneba: 950, adjoua: 820, mamadou: 800, kouassi: 780, others: 5200, activeUsers: 4 },
  { date: "29 oct.", koffi: 2200, djeneba: 2000, adjoua: 1750, mamadou: 1680, kouassi: 1650, others: 10800, activeUsers: 4 },
  { date: "31 oct.", koffi: 1450, djeneba: 1300, adjoua: 1150, mamadou: 1100, kouassi: 1080, others: 7100, activeUsers: 4 },
  { date: "1 nov.", koffi: 800, djeneba: 720, adjoua: 640, mamadou: 610, kouassi: 600, others: 4000, activeUsers: 3 },
  { date: "3 nov.", koffi: 1850, djeneba: 1680, adjoua: 1480, mamadou: 1420, kouassi: 1400, others: 9200, activeUsers: 4 },
  { date: "5 nov.", koffi: 1100, djeneba: 990, adjoua: 870, mamadou: 830, kouassi: 820, others: 5400, activeUsers: 4, isToday: true },
  { date: "8 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, others: 0, activeUsers: 0 },
  { date: "12 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, others: 0, activeUsers: 0 },
  { date: "15 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, others: 0, activeUsers: 0 },
  { date: "18 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, others: 0, activeUsers: 0 },
  { date: "21 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, others: 0, activeUsers: 0 },
];

const CUMULATIVE_DATES = [
  "23 oct.",
  "26 oct.",
  "29 oct.",
  "1 nov.",
  "3 nov.",
  "5 nov.",
  "7 nov.",
  "9 nov.",
  "12 nov.",
  "15 nov.",
  "18 nov.",
  "21 nov.",
];

export function ExploreConsumptionChart({
  usedCredits = 111730,
  capCredits = 250000,
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
  const maxDailyCredits = 25000;
  const maxActiveUsers = 5;

  // Cumulative points calculation
  const cumulativePoints = useMemo(() => {
    const todayIndex = 5; // 5 nov.
    const targetStep = capCredits / (CUMULATIVE_DATES.length - 1);

    return CUMULATIVE_DATES.map((date, i) => {
      const x = paddingLeft + (i / (CUMULATIVE_DATES.length - 1)) * chartWidth;
      const targetVal = i * targetStep;
      const targetY = paddingTop + chartHeight - (targetVal / capCredits) * chartHeight;

      let actualY: number | null = null;
      let actualVal: number | null = null;

      if (i <= todayIndex) {
        const factor = Math.pow(i / todayIndex, 1.3);
        actualVal = Math.round(usedCredits * factor);
        actualY = paddingTop + chartHeight - (actualVal / capCredits) * chartHeight;
      }

      return { date, x, targetY, targetVal, actualY, actualVal };
    });
  }, [usedCredits, capCredits, chartWidth, chartHeight]);

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

  const targetPathD = useMemo(() => {
    if (cumulativePoints.length === 0) return "";
    return `M ${cumulativePoints[0].x} ${cumulativePoints[0].targetY} L ${cumulativePoints[cumulativePoints.length - 1].x} ${cumulativePoints[cumulativePoints.length - 1].targetY}`;
  }, [cumulativePoints]);

  return (
    <div className="rounded-[22px] border border-line bg-surface p-6 shadow-xs transition-shadow">
      {/* 1. En-tête avec titre en français et commutateur de mode */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Explorer
          </h3>
          <h4 className="font-display text-base font-bold text-ink">
            Évolution de la consommation
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton Filtres */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterPopover(!showFilterPopover)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-xs transition-colors hover:bg-soft hover:text-ink"
            >
              <Filter className="size-3.5 text-ink-3" />
              <span>Filtres</span>
            </button>

            {showFilterPopover && (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-line bg-surface p-3 text-xs shadow-lg">
                <p className="font-bold text-ink mb-2">Filtrer les agents</p>
                <div className="space-y-1.5 text-ink-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Tous les 12 experts actifs</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Koffi (Top 1 · 11%)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Membres actifs</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Commutateur Journalier / Cumulée */}
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
              Journalier
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
              Cumulée
            </button>
          </div>
        </div>
      </div>

      {/* 2. Graphique SVG interactif */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-60 w-full min-w-[700px] overflow-visible"
        >
          {/* Lignes de repère horizontales */}
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
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-ink-3 text-[10px] font-medium"
                >
                  {mode === "daily"
                    ? dailyCreditVal >= 1000
                      ? `${(dailyCreditVal / 1000).toFixed(1)}k`
                      : dailyCreditVal
                    : `${cumCreditVal}k`}
                </text>

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

          {/* Titre de l'axe vertical gauche */}
          <text
            x={16}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90, 16, ${height / 2})`}
            className="fill-ink-3 text-[10px] font-semibold"
          >
            Crédits
          </text>

          {/* Titre de l'axe vertical droit (Journalier) */}
          {mode === "daily" && (
            <text
              x={width - 14}
              y={height / 2}
              textAnchor="middle"
              transform={`rotate(90, ${width - 14}, ${height / 2})`}
              className="fill-ink-3 text-[10px] font-semibold"
            >
              Membres actifs
            </text>
          )}

          {/* --- VUE 1 : JOURNALIER (BARRES EMPILÉES + COURBE MEMBRES ACTIFS) --- */}
          {mode === "daily" && (
            <>
              {DAILY_DATA.map((pt, i) => {
                const x = paddingLeft + (i / (DAILY_DATA.length - 1)) * chartWidth;
                const barWidth = 24;
                const total = pt.koffi + pt.djeneba + pt.adjoua + pt.mamadou + pt.kouassi + pt.others;
                if (total === 0) return null;

                let currentY = paddingTop + chartHeight;

                const segments = [
                  { val: pt.others, color: "#CBD5E1" },
                  { val: pt.kouassi, color: "#6366F1" },
                  { val: pt.mamadou, color: "#93C5FD" },
                  { val: pt.adjoua, color: "#38BDF8" },
                  { val: pt.djeneba, color: "#2563EB" },
                  { val: pt.koffi, color: "#06B6D4" },
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

              {/* Repère Aujourd'hui (partiel) */}
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
                    <g transform={`translate(${x}, ${paddingTop - 12})`}>
                      <rect
                        x="-52"
                        y="-12"
                        width="104"
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
                        Aujourd'hui (partiel)
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Courbe superposée des membres actifs */}
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

              {/* Libellés de l'axe X (dates en français) */}
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

          {/* --- VUE 2 : CUMULÉE (RÉELLE VS TRAJECTOIRE CIBLE) --- */}
          {mode === "cumulative" && (
            <>
              {/* Trajectoire cible : pointillés gris */}
              <path
                d={targetPathD}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5 5"
              />

              {/* Consommation réelle : courbe bleue */}
              <path
                d={actualPathD}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="3"
                strokeLinecap="round"
              />

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

      {/* 3. Légende en français */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-line/60 pt-3 text-xs text-ink-2">
        {mode === "daily" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#06B6D4]" />
              <span className="text-[11px] font-medium">Koffi (Design)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#2563EB]" />
              <span className="text-[11px] font-medium">Djénéba (Direction)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#38BDF8]" />
              <span className="text-[11px] font-medium">Adjoua (RH)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#93C5FD]" />
              <span className="text-[11px] font-medium">Mamadou (Finance)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#6366F1]" />
              <span className="text-[11px] font-medium">Kouassi (Ventes)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#CBD5E1] ring-1 ring-ink-3/20" />
              <span className="text-[11px] font-medium">Autres experts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Membres actifs
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#3B82F6]" />
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Consommation réelle
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border border-dashed border-zinc-400 bg-transparent" />
              <span className="text-[11px] font-medium text-ink-3">
                Trajectoire cible (plafond)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
