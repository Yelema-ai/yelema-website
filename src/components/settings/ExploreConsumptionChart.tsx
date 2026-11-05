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
  fatou: number;
  salif: number;
  fatima: number;
  alioune: number;
  ibrahim: number;
  awa: number;
  nadia: number;
  activeUsers: number;
  isToday?: boolean;
}

const DAILY_DATA: DailyPoint[] = [
  { date: "23 oct.", koffi: 950, djeneba: 850, adjoua: 750, mamadou: 710, kouassi: 700, fatou: 680, salif: 680, fatima: 680, alioune: 680, ibrahim: 660, awa: 640, nadia: 590, activeUsers: 3 },
  { date: "25 oct.", koffi: 1100, djeneba: 990, adjoua: 870, mamadou: 830, kouassi: 820, fatou: 800, salif: 790, fatima: 790, alioune: 790, ibrahim: 770, awa: 750, nadia: 690, activeUsers: 3 },
  { date: "28 oct.", koffi: 1050, djeneba: 950, adjoua: 830, mamadou: 800, kouassi: 780, fatou: 760, salif: 760, fatima: 760, alioune: 760, ibrahim: 740, awa: 720, nadia: 660, activeUsers: 4 },
  { date: "29 oct.", koffi: 2200, djeneba: 1980, adjoua: 1740, mamadou: 1660, kouassi: 1640, fatou: 1600, salif: 1590, fatima: 1590, alioune: 1580, ibrahim: 1550, awa: 1510, nadia: 1370, activeUsers: 4 },
  { date: "31 oct.", koffi: 1450, djeneba: 1300, adjoua: 1150, mamadou: 1100, kouassi: 1080, fatou: 1050, salif: 1050, fatima: 1050, alioune: 1050, ibrahim: 1020, awa: 990, nadia: 910, activeUsers: 4 },
  { date: "1 nov.", koffi: 800, djeneba: 720, adjoua: 630, mamadou: 600, kouassi: 600, fatou: 580, salif: 580, fatima: 580, alioune: 580, ibrahim: 560, awa: 550, nadia: 500, activeUsers: 3 },
  { date: "3 nov.", koffi: 1850, djeneba: 1660, adjoua: 1460, mamadou: 1400, kouassi: 1380, fatou: 1340, salif: 1340, fatima: 1340, alioune: 1330, ibrahim: 1300, awa: 1270, nadia: 1150, activeUsers: 4 },
  { date: "5 nov.", koffi: 1100, djeneba: 990, adjoua: 870, mamadou: 830, kouassi: 820, fatou: 800, salif: 790, fatima: 790, alioune: 790, ibrahim: 770, awa: 750, nadia: 690, activeUsers: 4, isToday: true },
  { date: "8 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, fatou: 0, salif: 0, fatima: 0, alioune: 0, ibrahim: 0, awa: 0, nadia: 0, activeUsers: 0 },
  { date: "12 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, fatou: 0, salif: 0, fatima: 0, alioune: 0, ibrahim: 0, awa: 0, nadia: 0, activeUsers: 0 },
  { date: "15 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, fatou: 0, salif: 0, fatima: 0, alioune: 0, ibrahim: 0, awa: 0, nadia: 0, activeUsers: 0 },
  { date: "18 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, fatou: 0, salif: 0, fatima: 0, alioune: 0, ibrahim: 0, awa: 0, nadia: 0, activeUsers: 0 },
  { date: "21 nov.", koffi: 0, djeneba: 0, adjoua: 0, mamadou: 0, kouassi: 0, fatou: 0, salif: 0, fatima: 0, alioune: 0, ibrahim: 0, awa: 0, nadia: 0, activeUsers: 0 },
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
                <div className="space-y-1.5 text-ink-2 max-h-56 overflow-y-auto pr-1">
                  <p className="font-bold text-ink mb-1.5 text-[11px]">Filtrer les 12 agents</p>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink text-[11px]">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Tous les 12 agents</span>
                  </label>
                  {[
                    { name: "Koffi", role: "Design & DA", color: "#8B5CF6" },
                    { name: "Djénéba", role: "Direction", color: "#10B981" },
                    { name: "Adjoua", role: "Recrutement", color: "#EC4899" },
                    { name: "Mamadou", role: "Finance", color: "#3B82F6" },
                    { name: "Kouassi", role: "Ventes B2B", color: "#F59E0B" },
                    { name: "Fatou", role: "RH & Paie", color: "#F97316" },
                    { name: "Salif", role: "Opérations", color: "#6366F1" },
                    { name: "Fatima", role: "Marketing", color: "#A855F7" },
                    { name: "Alioune", role: "M&A", color: "#14B8A6" },
                    { name: "Ibrahim", role: "Juridique", color: "#EF4444" },
                    { name: "Awa", role: "Support", color: "#06B6D4" },
                    { name: "Nadia", role: "Données", color: "#EAB308" },
                  ].map((a) => (
                    <label key={a.name} className="flex items-center justify-between gap-1.5 cursor-pointer text-[10px]">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="truncate">{a.name} ({a.role})</span>
                      </div>
                      <input type="checkbox" defaultChecked className="rounded text-brand size-3" />
                    </label>
                  ))}
                  <div className="border-t border-line my-1" />
                  <label className="flex items-center gap-2 cursor-pointer text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                    <input type="checkbox" defaultChecked className="rounded text-amber-500" />
                    <span>Membres actifs (courbe)</span>
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
                const total =
                  pt.koffi +
                  pt.djeneba +
                  pt.adjoua +
                  pt.mamadou +
                  pt.kouassi +
                  pt.fatou +
                  pt.salif +
                  pt.fatima +
                  pt.alioune +
                  pt.ibrahim +
                  pt.awa +
                  pt.nadia;
                if (total === 0) return null;

                let currentY = paddingTop + chartHeight;

                const segments = [
                  { key: "nadia", name: "Nadia", val: pt.nadia, color: "#EAB308" },
                  { key: "awa", name: "Awa", val: pt.awa, color: "#06B6D4" },
                  { key: "ibrahim", name: "Ibrahim", val: pt.ibrahim, color: "#EF4444" },
                  { key: "alioune", name: "Alioune", val: pt.alioune, color: "#14B8A6" },
                  { key: "fatima", name: "Fatima", val: pt.fatima, color: "#A855F7" },
                  { key: "salif", name: "Salif", val: pt.salif, color: "#6366F1" },
                  { key: "fatou", name: "Fatou", val: pt.fatou, color: "#F97316" },
                  { key: "kouassi", name: "Kouassi", val: pt.kouassi, color: "#F59E0B" },
                  { key: "mamadou", name: "Mamadou", val: pt.mamadou, color: "#3B82F6" },
                  { key: "adjoua", name: "Adjoua", val: pt.adjoua, color: "#EC4899" },
                  { key: "djeneba", name: "Djénéba", val: pt.djeneba, color: "#10B981" },
                  { key: "koffi", name: "Koffi", val: pt.koffi, color: "#8B5CF6" },
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

      {/* 3. Légende en français des 12 agents nommés */}
      <div className="mt-4 border-t border-line/60 pt-3 text-xs text-ink-2">
        {mode === "daily" ? (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#8B5CF6]" />
                <span className="text-[11px] font-medium truncate">Koffi (Design)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#10B981]" />
                <span className="text-[11px] font-medium truncate">Djénéba (Direction)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#EC4899]" />
                <span className="text-[11px] font-medium truncate">Adjoua (RH)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#3B82F6]" />
                <span className="text-[11px] font-medium truncate">Mamadou (Finance)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#F59E0B]" />
                <span className="text-[11px] font-medium truncate">Kouassi (Ventes)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#F97316]" />
                <span className="text-[11px] font-medium truncate">Fatou (RH & Paie)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#6366F1]" />
                <span className="text-[11px] font-medium truncate">Salif (Opérations)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#A855F7]" />
                <span className="text-[11px] font-medium truncate">Fatima (Marketing)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#14B8A6]" />
                <span className="text-[11px] font-medium truncate">Alioune (M&A)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#EF4444]" />
                <span className="text-[11px] font-medium truncate">Ibrahim (Juridique)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#06B6D4]" />
                <span className="text-[11px] font-medium truncate">Awa (Support)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[#EAB308]" />
                <span className="text-[11px] font-medium truncate">Nadia (Données)</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-2 border-t border-line/40">
              <span className="size-2.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Membres actifs (courbe d'activité)
              </span>
            </div>
          </div>
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
