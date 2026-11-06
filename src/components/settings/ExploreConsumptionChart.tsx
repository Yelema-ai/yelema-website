"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimeSeriesPoint, ExpertMetric } from "@/lib/analytics";

export interface ExploreChartProps {
  usedCredits?: number;
  capCredits?: number | null;
  timeline?: TimeSeriesPoint[];
  experts?: ExpertMetric[];
}

export function ExploreConsumptionChart({
  usedCredits = 0,
  capCredits = null,
  timeline = [],
  experts = [],
}: ExploreChartProps) {
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => {
    return new Set(experts.map((e) => e.id));
  });

  // Keep selectedAgents updated if experts load asynchronously
  useMemo(() => {
    if (experts.length > 0 && selectedAgents.size === 0) {
      setSelectedAgents(new Set(experts.map((e) => e.id)));
    }
  }, [experts]);

  const toggleAllAgents = () => {
    if (selectedAgents.size === experts.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(experts.map((e) => e.id)));
    }
  };

  const toggleAgent = (id: string) => {
    const next = new Set(selectedAgents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAgents(next);
  };

  // SVG dimensions
  const width = 860;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 50;
  const paddingTop = 30;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const totalTokensInTimeline = useMemo(() => {
    return timeline.reduce((sum, p) => sum + (p.tokens || 0), 0);
  }, [timeline]);

  const isEmpty = timeline.length === 0 || totalTokensInTimeline === 0;

  // Max scales
  const maxDailyTokens = useMemo(() => {
    if (timeline.length === 0) return 1000;
    const maxT = Math.max(...timeline.map((p) => p.tokens || 0));
    return maxT > 0 ? maxT : 1000;
  }, [timeline]);

  const maxDailyCredits = Math.max(100, Math.ceil((maxDailyTokens / 1000) * 1.25));

  const maxActiveUsers = useMemo(() => {
    if (timeline.length === 0) return 5;
    const maxU = Math.max(...timeline.map((p) => p.expertsActive || 0));
    return maxU > 0 ? maxU : 5;
  }, [timeline]);

  // Expert color map
  const expertColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const exp of experts) {
      map.set(exp.id.toLowerCase(), exp.color);
    }
    return map;
  }, [experts]);

  // Cumulative points calculation from real timeline
  const cumulativePoints = useMemo(() => {
    if (timeline.length === 0) return [];
    let runningSum = 0;
    const effectiveCap = capCredits ?? Math.max(100, Math.ceil((usedCredits || 1) * 1.25));
    const targetStep = effectiveCap / Math.max(1, timeline.length - 1);

    return timeline.map((pt, i) => {
      const x =
        paddingLeft +
        (timeline.length > 1 ? (i / (timeline.length - 1)) * chartWidth : chartWidth / 2);
      const targetVal = i * targetStep;
      const targetY = paddingTop + chartHeight - (targetVal / effectiveCap) * chartHeight;

      runningSum += Math.round((pt.tokens || 0) / 1000);
      const actualVal = runningSum;
      const actualY = Math.max(
        paddingTop,
        paddingTop + chartHeight - (actualVal / effectiveCap) * chartHeight
      );

      return { date: pt.label, x, targetY, targetVal, actualY, actualVal };
    });
  }, [timeline, capCredits, usedCredits, chartWidth, chartHeight]);

  const actualPathD = useMemo(() => {
    const pts = cumulativePoints.filter((p) => p.actualY !== null);
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].actualY}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.actualY;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.actualY;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.actualY}`;
    }
    return d;
  }, [cumulativePoints]);

  const targetPathD = useMemo(() => {
    if (cumulativePoints.length === 0 || capCredits === null) return "";
    return `M ${cumulativePoints[0].x} ${cumulativePoints[0].targetY} L ${cumulativePoints[cumulativePoints.length - 1].x} ${cumulativePoints[cumulativePoints.length - 1].targetY}`;
  }, [cumulativePoints, capCredits]);

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
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-line bg-surface p-3 text-xs shadow-lg">
                <p className="font-bold text-ink mb-2">Filtrer les experts</p>
                <div className="space-y-1.5 text-ink-2 max-h-56 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink text-[11px]">
                    <input
                      type="checkbox"
                      checked={selectedAgents.size === experts.length && experts.length > 0}
                      onChange={toggleAllAgents}
                      className="rounded text-brand"
                    />
                    <span>Tous les experts ({experts.length})</span>
                  </label>
                  <div className="border-t border-line my-1" />
                  {experts.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center justify-between gap-1.5 cursor-pointer text-[10px]"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: a.color }}
                        />
                        <span className="truncate">
                          {a.name} ({a.role})
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedAgents.has(a.id)}
                        onChange={() => toggleAgent(a.id)}
                        className="rounded text-brand size-3"
                      />
                    </label>
                  ))}
                  {experts.length === 0 && (
                    <p className="text-[10px] text-ink-3">Aucun expert découvert</p>
                  )}
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
            const cumCreditVal = Math.round(
              ((capCredits ?? Math.max(100, Math.ceil((usedCredits || 1) * 1.25))) *
                (1 - ratio))
            );
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
                    : cumCreditVal >= 1000
                    ? `${(cumCreditVal / 1000).toFixed(1)}k`
                    : cumCreditVal}
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
              Experts actifs
            </text>
          )}

          {/* État vide si aucune consommation */}
          {isEmpty && (
            <g transform={`translate(${width / 2}, ${height / 2})`}>
              <text
                x="0"
                y="-6"
                textAnchor="middle"
                className="fill-ink text-xs font-semibold"
              >
                Aucune consommation enregistrée sur cette période
              </text>
              <text
                x="0"
                y="14"
                textAnchor="middle"
                className="fill-ink-3 text-[11px]"
              >
                Les métriques s'actualiseront automatiquement dès les prochaines exécutions.
              </text>
            </g>
          )}

          {/* --- VUE 1 : JOURNALIER (BARRES EMPILÉES PAR EXPERT + COURBE ACTIVITÉ) --- */}
          {!isEmpty && mode === "daily" && (
            <>
              {timeline.map((pt, i) => {
                const x =
                  paddingLeft +
                  (timeline.length > 1 ? (i / (timeline.length - 1)) * chartWidth : chartWidth / 2);
                const barWidth = Math.min(28, Math.max(8, Math.floor(chartWidth / (timeline.length * 1.6))));

                let currentY = paddingTop + chartHeight;

                // Segments per expert
                const segments: Array<{ key: string; name: string; val: number; color: string }> = [];

                if (pt.byExpert && Object.keys(pt.byExpert).length > 0) {
                  for (const [expId, tokens] of Object.entries(pt.byExpert)) {
                    if (selectedAgents.size > 0 && !selectedAgents.has(expId)) continue;
                    const credits = Math.round((tokens || 0) / 1000);
                    if (credits > 0) {
                      const color = expertColorMap.get(expId.toLowerCase()) || "#8B5CF6";
                      segments.push({
                        key: expId,
                        name: expId.charAt(0).toUpperCase() + expId.slice(1),
                        val: credits,
                        color,
                      });
                    }
                  }
                } else if (pt.tokens > 0) {
                  const credits = Math.round(pt.tokens / 1000);
                  segments.push({
                    key: "total",
                    name: "Total",
                    val: credits,
                    color: "#8B5CF6",
                  });
                }

                return (
                  <g key={pt.date || i}>
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

              {/* Courbe superposée des experts actifs */}
              {(() => {
                const pts = timeline
                  .filter((d) => d.expertsActive > 0)
                  .map((d) => {
                    const idx = timeline.indexOf(d);
                    const x =
                      paddingLeft +
                      (timeline.length > 1
                        ? (idx / (timeline.length - 1)) * chartWidth
                        : chartWidth / 2);
                    const y =
                      paddingTop +
                      chartHeight -
                      (d.expertsActive / maxActiveUsers) * chartHeight;
                    return { x, y, users: d.expertsActive };
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
              {timeline.map((d, i) => {
                const x =
                  paddingLeft +
                  (timeline.length > 1 ? (i / (timeline.length - 1)) * chartWidth : chartWidth / 2);
                return (
                  <text
                    key={d.date || i}
                    x={x}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-ink-3 text-[10px] font-medium"
                  >
                    {d.label}
                  </text>
                );
              })}
            </>
          )}

          {/* --- VUE 2 : CUMULÉE (RÉELLE VS TRAJECTOIRE CIBLE) --- */}
          {!isEmpty && mode === "cumulative" && (
            <>
              {/* Trajectoire cible : pointillés gris (si plafond défini) */}
              {targetPathD && (
                <path
                  d={targetPathD}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              )}

              {/* Consommation réelle : courbe bleue */}
              {actualPathD && (
                <path
                  d={actualPathD}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}

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

      {/* 3. Légende dynamique basée sur les experts réels */}
      <div className="mt-4 border-t border-line/60 pt-3 text-xs text-ink-2">
        {mode === "daily" ? (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2">
              {experts.map((exp) => (
                <div key={exp.id} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: exp.color }}
                  />
                  <span className="text-[11px] font-medium truncate">
                    {exp.name} {exp.tokensPercent > 0 ? `(${exp.tokensPercent}%)` : ""}
                  </span>
                </div>
              ))}
              {experts.length === 0 && (
                <span className="text-[11px] text-ink-3">Aucun expert configuré</span>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-2 border-t border-line/40">
              <span className="size-2.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Experts actifs (courbe d'activité)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#3B82F6]" />
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Consommation réelle
              </span>
            </div>
            {capCredits !== null && (
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border border-dashed border-zinc-400 bg-transparent" />
                <span className="text-[11px] font-medium text-ink-3">
                  Trajectoire cible (plafond)
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
