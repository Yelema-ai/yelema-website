"use client";

import { useState } from "react";
import { Activity, Sparkles, TrendingUp, Users, Info } from "lucide-react";
import type { ExpertMetric, TimeSeriesPoint, TokenDistribution } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// --- 1. COURBE TEMPORELLE INTERACTIVE (AREA CHART) ---
export function TimelineAreaChart({
  timeline,
  activeMetric,
  onMetricChange,
}: {
  timeline: TimeSeriesPoint[];
  activeMetric: "sessions" | "tokens";
  onMetricChange: (m: "sessions" | "tokens") => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = timeline.map((p) => (activeMetric === "sessions" ? p.sessions : p.tokens));
  const maxVal = Math.max(...values, activeMetric === "sessions" ? 5 : 1000);

  // Dimensions SVG
  const width = 640;
  const height = 220;
  const paddingX = 40;
  const paddingBottom = 35;
  const paddingTop = 25;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingTop - paddingBottom;

  const points = timeline.map((p, i) => {
    const x = paddingX + (timeline.length > 1 ? (i / (timeline.length - 1)) * graphWidth : graphWidth / 2);
    const val = activeMetric === "sessions" ? p.sessions : p.tokens;
    const y = paddingTop + graphHeight - (val / maxVal) * graphHeight;
    return { x, y, point: p, val };
  });

  // Construction du chemin SVG (courbe de Bézier cubique lissée)
  let pathD = "";
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
  }

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : "";

  const isTokens = activeMetric === "tokens";
  const colorStroke = isTokens ? "#F59E0B" : "#8B5CF6";
  const colorGradStart = isTokens ? "rgba(245, 158, 11, 0.40)" : "rgba(139, 92, 246, 0.40)";
  const colorGradEnd = isTokens ? "rgba(245, 158, 11, 0.02)" : "rgba(139, 92, 246, 0.02)";

  const hoveredPoint = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length ? points[hoverIndex] : null;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-6 shadow-xs">
      {/* En-tête avec sélecteur de métrique */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-bold text-ink">
              Évolution Temporelle de l'Activité
            </h3>
            <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-medium text-ink-3">
              Dynamique
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            Survolez la courbe pour inspecter les sessions et la consommation à chaque date.
          </p>
        </div>

        {/* Boutons bascule de la métrique tracée */}
        <div className="flex items-center gap-1 rounded-xl border border-line bg-soft/80 p-1">
          <button
            type="button"
            onClick={() => onMetricChange("sessions")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
              !isTokens
                ? "bg-purple-600 text-white shadow-xs"
                : "text-ink-2 hover:bg-soft hover:text-ink"
            )}
          >
            <Activity className="size-3.5" /> Tâches
          </button>
          <button
            type="button"
            onClick={() => onMetricChange("tokens")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
              isTokens
                ? "bg-amber-500 text-white shadow-xs"
                : "text-ink-2 hover:bg-soft hover:text-ink"
            )}
          >
            <Sparkles className="size-3.5" /> Jetons IA
          </button>
        </div>
      </div>

      {/* Graphique SVG */}
      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorGradStart} />
              <stop offset="100%" stopColor={colorGradEnd} />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor={colorStroke} floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Lignes guides horizontales */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingTop + graphHeight * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={ratio} className="text-ink-3">
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-ink-3 text-[10px]"
                >
                  {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
                </text>
              </g>
            );
          })}

          {/* Aire sous la courbe */}
          {areaD && <path d={areaD} fill="url(#areaGradient)" />}

          {/* Courbe principale */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={colorStroke}
              strokeWidth="3"
              strokeLinecap="round"
              filter="url(#glow)"
            />
          )}

          {/* Ligne verticale au survol */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              y1={paddingTop}
              x2={hoveredPoint.x}
              y2={height - paddingBottom}
              stroke={colorStroke}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          )}

          {/* Points et zones de survol */}
          {points.map((p, idx) => {
            const isHover = hoverIndex === idx;
            return (
              <g key={idx} className="cursor-pointer">
                {/* Grand cercle invisible pour faciliter le survol souris/tactile */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="16"
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
                {/* Point visuel */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHover ? "6" : "4"}
                  fill="white"
                  stroke={colorStroke}
                  strokeWidth={isHover ? "3" : "2"}
                  className="transition-all duration-150"
                />
                {/* Libellé date sur l'axe X */}
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  className={cn(
                    "text-[11px] transition-colors",
                    isHover ? "fill-ink font-bold" : "fill-ink-3"
                  )}
                >
                  {p.point.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Infobulle flottante au survol */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-md transition-all"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${Math.max(10, (hoveredPoint.y / height) * 100 - 35)}%`,
            }}
          >
            <p className="text-xs font-bold text-ink">
              {new Date(hoveredPoint.point.date).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 font-semibold text-purple-600 dark:text-purple-400">
                <Activity className="size-3" />
                {hoveredPoint.point.sessions} tâche{hoveredPoint.point.sessions > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="size-3" />
                {hoveredPoint.point.tokens.toLocaleString("fr-FR")} tokens
              </span>
            </div>
            {hoveredPoint.point.expertsActive > 0 && (
              <p className="mt-0.5 text-[10px] text-ink-3">
                {hoveredPoint.point.expertsActive} expert{hoveredPoint.point.expertsActive > 1 ? "s" : ""} actif{hoveredPoint.point.expertsActive > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- 2. DIAGRAMME DONUT DE RÉPARTITION PAR EXPERT ---
export function ExpertDonutChart({
  experts,
  mode,
  onModeChange,
}: {
  experts: ExpertMetric[];
  mode: "sessions" | "tokens";
  onModeChange: (m: "sessions" | "tokens") => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const total = experts.reduce(
    (acc, e) => acc + (mode === "sessions" ? e.sessionsCount : e.tokensCount),
    0
  );

  const radius = 68;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const segments = experts
    .filter((e) => (mode === "sessions" ? e.sessionsCount : e.tokensCount) > 0)
    .map((exp) => {
      const val = mode === "sessions" ? exp.sessionsCount : exp.tokensCount;
      const pct = total > 0 ? (val / total) * 100 : 0;
      const dashLength = (pct / 100) * circumference;
      const dashOffset = -((accumulatedPercent / 100) * circumference);
      accumulatedPercent += pct;

      return {
        exp,
        val,
        pct: Math.round(pct),
        dashLength,
        dashOffset,
      };
    });

  const activeHover = hoverId ? experts.find((e) => e.id === hoverId) : null;

  return (
    <div className="flex flex-col rounded-[22px] border border-line bg-surface p-6 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-ink">
            Part de Contribution de l'Équipe
          </h3>
          <p className="text-xs text-ink-3">
            {mode === "sessions" ? "Répartition des tâches traitées" : "Part de jetons IA consommés"}
          </p>
        </div>

        {/* Bascule mode */}
        <div className="flex rounded-lg border border-line bg-soft p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onModeChange("sessions")}
            className={cn(
              "rounded-md px-2.5 py-1 font-semibold transition-all",
              mode === "sessions" ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink"
            )}
          >
            Tâches
          </button>
          <button
            type="button"
            onClick={() => onModeChange("tokens")}
            className={cn(
              "rounded-md px-2.5 py-1 font-semibold transition-all",
              mode === "tokens" ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink"
            )}
          >
            Tokens
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
        {/* SVG Donut */}
        <div className="relative size-44 shrink-0">
          <svg viewBox="0 0 180 180" className="size-full -rotate-90">
            {/* Anneau d'arrière-plan neutre */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-soft"
            />

            {/* Segments colorés des experts */}
            {segments.map((seg) => {
              const isHover = hoverId === seg.exp.id;
              return (
                <circle
                  key={seg.exp.id}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={seg.exp.color}
                  strokeWidth={isHover ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${Math.max(0, seg.dashLength - 2)} ${circumference}`}
                  strokeDashoffset={seg.dashOffset}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoverId(seg.exp.id)}
                  onMouseLeave={() => setHoverId(null)}
                />
              );
            })}
          </svg>

          {/* Centre du Donut */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {activeHover ? (
              <>
                <span className="text-[11px] font-semibold text-ink-3 truncate max-w-[90px]">
                  {activeHover.name}
                </span>
                <span className="font-display text-xl font-bold text-ink">
                  {mode === "sessions" ? activeHover.sessionsCount : `${(activeHover.tokensCount / 1000).toFixed(1)}k`}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: activeHover.color }}>
                  {mode === "sessions" ? `${activeHover.sessionsPercent}%` : `${activeHover.tokensPercent}%`}
                </span>
              </>
            ) : (
              <>
                <span className="font-display text-2xl font-bold tracking-tight text-ink">
                  {mode === "sessions" ? total : total >= 1000 ? `${(total / 1000).toFixed(0)}k` : total}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                  {mode === "sessions" ? "Tâches" : "Tokens"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Légende interactive */}
        <div className="w-full space-y-2 sm:max-w-[240px]">
          {experts.slice(0, 5).map((exp) => {
            const isHover = hoverId === exp.id;
            const pct = mode === "sessions" ? exp.sessionsPercent : exp.tokensPercent;
            const val = mode === "sessions" ? exp.sessionsCount : exp.tokensCount;

            return (
              <div
                key={exp.id}
                onMouseEnter={() => setHoverId(exp.id)}
                onMouseLeave={() => setHoverId(null)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-xl px-3 py-1.5 transition-all",
                  isHover ? "bg-soft scale-[1.02]" : "hover:bg-soft/50"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: exp.color }}
                  />
                  <div className="truncate">
                    <p className="truncate text-xs font-semibold text-ink">{exp.name}</p>
                    <p className="truncate text-[10px] text-ink-3">{exp.role}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-ink">{pct}%</span>
                  <p className="text-[10px] text-ink-3">
                    {mode === "sessions" ? `${val} tâche${val > 1 ? "s" : ""}` : `${val.toLocaleString("fr-FR")} t.`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- 3. BARRES COMPARATIVES D'EFFICACITÉ & JETONS ---
export function TokenDistributionBar({
  distribution,
}: {
  distribution: TokenDistribution;
}) {
  return (
    <div className="rounded-[22px] border border-line bg-surface p-6 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-ink">
            Consommation & Rentabilité des Jetons d'IA
          </h3>
          <p className="text-xs text-ink-3">
            Répartition entre la lecture des documents (entrée) et la rédaction des livrables (sortie).
          </p>
        </div>
        <div className="rounded-xl border border-line bg-soft px-3 py-1 text-xs font-semibold text-ink">
          Moyenne : ~{distribution.avgTokensPerSession.toLocaleString("fr-FR")} tokens / tâche
        </div>
      </div>

      {/* Barre segmentée bicolore */}
      <div className="mt-5 space-y-2">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-soft p-0.5">
          <div
            className="h-full rounded-l-full bg-blue-500 transition-all duration-500"
            style={{ width: `${distribution.promptPercent}%` }}
            title={`Jetons d'entrée : ${distribution.promptPercent}%`}
          />
          <div
            className="h-full rounded-r-full bg-amber-500 transition-all duration-500"
            style={{ width: `${distribution.completionPercent}%` }}
            title={`Jetons de sortie : ${distribution.completionPercent}%`}
          />
        </div>

        {/* Détails et explications claires pour l'utilisateur lambda */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-soft/40 p-3">
            <span className="mt-0.5 size-3 shrink-0 rounded-full bg-blue-500" />
            <div>
              <p className="text-xs font-bold text-ink">
                Jetons d'Entrée ({distribution.promptPercent}%) : {distribution.promptTokens.toLocaleString("fr-FR")} tokens
              </p>
              <p className="text-[11px] text-ink-3 mt-0.5">
                Correspond à ce que l'expert lit : vos consignes, vos documents annexes et l'historique de contexte.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-line bg-soft/40 p-3">
            <span className="mt-0.5 size-3 shrink-0 rounded-full bg-amber-500" />
            <div>
              <p className="text-xs font-bold text-ink">
                Jetons de Sortie ({distribution.completionPercent}%) : {distribution.completionTokens.toLocaleString("fr-FR")} tokens
              </p>
              <p className="text-[11px] text-ink-3 mt-0.5">
                Correspond à ce que l'expert produit : les réponses détaillées, analyses, synthèses et livrables.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
