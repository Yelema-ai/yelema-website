// Business logic for Yelema Team & Expert Analytics.
// Pure functions, strictly typed, zero side effects. Used by both the Next.js API route and test suites.

import { docKind, type DocKind } from "./drive-links.ts";
import {
  getPeriodCutoff,
  type DiscoveredExpert,
  type ExpertUsageData,
  type IncidentAlertData,
  type RawFileInfo,
  type RawSessionInfo,
} from "./yele-supervision.ts";

export type AnalyticsPeriod = "aujourdhui" | "7_jours" | "30_jours";

export const EXPERT_COLORS: string[] = [
  "#8B5CF6", // Violet (Fatima / Marketing)
  "#F59E0B", // Ambre (Kouassi / Finance)
  "#10B981", // Émeraude (Djénéba / Commercial)
  "#06B6D4", // Cyan (Yélé / Assistant & Général)
  "#EC4899", // Rose (Création & Design)
  "#3B82F6", // Bleu (Opérations)
  "#F97316", // Orange
  "#6366F1", // Indigo
  "#14B8A6", // Sarcelle
];

export interface TimeSeriesPoint {
  label: string;
  date: string;
  timestamp: number;
  sessions: number;
  tokens: number;
  expertsActive: number;
}

export interface ExpertMetric {
  id: string;
  name: string;
  role: string;
  color: string;
  sessionsCount: number;
  sessionsPercent: number;
  tokensCount: number;
  tokensPercent: number;
  promptTokens: number;
  completionTokens: number;
  runsCount: number;
  lastActiveMs: number | null;
  isActive: boolean;
  models: string[];
}

export interface DeliverableSummary {
  name: string;
  path: string;
  size: number | null;
  modified: number | null;
  kind: DocKind;
}

export interface TokenDistribution {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  promptPercent: number;
  completionPercent: number;
  avgTokensPerSession: number;
}

export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  totals: {
    sessions: number;
    activeExperts: number;
    totalExperts: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    deliverablesCount: number;
  };
  timeline: TimeSeriesPoint[];
  tokenDistribution: TokenDistribution;
  experts: ExpertMetric[];
  recentDeliverables: DeliverableSummary[];
  health: {
    status: "healthy" | "warning" | "incident";
    totalCrons: number;
    incidentsCount: number;
    warningsCount: number;
  };
}

export interface ComputeAnalyticsParams {
  sessions: RawSessionInfo[];
  usageStats: Record<string, ExpertUsageData> | null;
  experts: DiscoveredExpert[];
  deliverables: RawFileInfo[];
  alerts?: IncidentAlertData | null;
  period?: AnalyticsPeriod;
  now?: number;
}

/** Converts seconds or ms to epoch ms */
function toEpochMs(raw?: number | null): number | null {
  if (raw == null || raw <= 0) return null;
  return raw < 1e11 ? raw * 1000 : raw;
}

/**
 * Builds timeline points according to the selected period:
 * - "aujourdhui": 8 buckets of 3 hours (00h, 03h, 06h, 09h, 12h, 15h, 18h, 21h)
 * - "7_jours": 7 daily buckets (J-6 to J0)
 * - "30_jours": 30 daily buckets (J-29 to J0)
 */
function buildTimeline(
  period: AnalyticsPeriod,
  periodSessions: RawSessionInfo[],
  totalTokens: number,
  now: number
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const totalSessions = periodSessions.length;
  const tokensPerSession = totalSessions > 0 ? totalTokens / totalSessions : 0;

  if (period === "aujourdhui") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    const intervalMs = 3 * 3600 * 1000; // 3 hours

    for (let i = 0; i < 8; i++) {
      const bucketStart = startMs + i * intervalMs;
      const bucketEnd = bucketStart + intervalMs;
      const hour = i * 3;
      const label = `${hour.toString().padStart(2, "0")}h`;

      const bucketSessions = periodSessions.filter((s) => {
        const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
        return act != null && act >= bucketStart && act < bucketEnd;
      });

      const distinctExperts = new Set(
        bucketSessions.map((s) => (s.profile || "").toLowerCase()).filter(Boolean)
      );

      const count = bucketSessions.length;
      points.push({
        label,
        date: new Date(bucketStart).toISOString(),
        timestamp: bucketStart,
        sessions: count,
        tokens: Math.round(count * tokensPerSession),
        expertsActive: distinctExperts.size,
      });
    }
    return points;
  }

  const daysCount = period === "30_jours" ? 30 : 7;
  const oneDayMs = 24 * 3600 * 1000;

  // Align with start of today
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  for (let i = daysCount - 1; i >= 0; i--) {
    const bucketStart = todayStartMs - i * oneDayMs;
    const bucketEnd = bucketStart + oneDayMs;
    const d = new Date(bucketStart);

    const label =
      daysCount === 7
        ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })
        : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

    const bucketSessions = periodSessions.filter((s) => {
      const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
      return act != null && act >= bucketStart && act < bucketEnd;
    });

    const distinctExperts = new Set(
      bucketSessions.map((s) => (s.profile || "").toLowerCase()).filter(Boolean)
    );

    const count = bucketSessions.length;
    points.push({
      label,
      date: new Date(bucketStart).toISOString(),
      timestamp: bucketStart,
      sessions: count,
      tokens: Math.round(count * tokensPerSession),
      expertsActive: distinctExperts.size,
    });
  }

  return points;
}

export function computeAnalytics({
  sessions,
  usageStats,
  experts,
  deliverables,
  alerts,
  period = "7_jours",
  now = Date.now(),
}: ComputeAnalyticsParams): AnalyticsOverview {
  const cutoff = getPeriodCutoff(period, now);

  // 1. Filter sessions by period cutoff
  const periodSessions = sessions.filter((s) => {
    const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
    return act == null || act >= cutoff;
  });

  // Count sessions and latest active per expert
  const sessionCounts: Record<string, number> = {};
  const lastActiveMap: Record<string, number> = {};

  for (const s of periodSessions) {
    const pid = (s.profile || "").toLowerCase();
    if (!pid) continue;
    sessionCounts[pid] = (sessionCounts[pid] || 0) + 1;
    const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
    if (act && (!lastActiveMap[pid] || act > lastActiveMap[pid])) {
      lastActiveMap[pid] = act;
    }
  }

  // 2. Aggregate token consumption
  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  if (usageStats) {
    for (const data of Object.values(usageStats)) {
      totalTokens += data.totalTokens || 0;
      totalPromptTokens += data.promptTokens || 0;
      totalCompletionTokens += data.completionTokens || 0;
    }
  }

  const totalSessionsCount = periodSessions.length;

  // 3. Build experts list
  const expertMap = new Map<string, DiscoveredExpert>();
  for (const exp of experts) {
    expertMap.set(exp.id.toLowerCase(), exp);
  }

  // If some experts have sessions or usage but aren't in discovered list, include them
  const allExpertIds = new Set<string>([
    ...experts.map((e) => e.id.toLowerCase()),
    ...Object.keys(sessionCounts),
    ...Object.keys(usageStats || {}),
  ]);

  const expertMetrics: ExpertMetric[] = [];
  let activeExpertsCount = 0;
  let expertColorIndex = 0;

  for (const id of allExpertIds) {
    const meta = expertMap.get(id);
    const usage = usageStats?.[id];
    const sCount = sessionCounts[id] || 0;
    const expTokens = usage?.totalTokens || 0;
    const lastActive = lastActiveMap[id] ?? null;

    const isActive = sCount > 0 || (lastActive != null && lastActive >= cutoff);
    if (isActive) activeExpertsCount++;

    const role = meta?.description ? meta.description.split(/[:;]/)[0].trim() : "Expert";
    const name = meta?.name || id.charAt(0).toUpperCase() + id.slice(1);
    const color = EXPERT_COLORS[expertColorIndex % EXPERT_COLORS.length];
    expertColorIndex++;

    expertMetrics.push({
      id,
      name,
      role,
      color,
      sessionsCount: sCount,
      sessionsPercent: totalSessionsCount > 0 ? Math.round((sCount / totalSessionsCount) * 100) : 0,
      tokensCount: expTokens,
      tokensPercent: totalTokens > 0 ? Math.round((expTokens / totalTokens) * 100) : 0,
      promptTokens: usage?.promptTokens || 0,
      completionTokens: usage?.completionTokens || 0,
      runsCount: usage?.count || 0,
      lastActiveMs: lastActive,
      isActive,
      models: usage?.models ? Object.keys(usage.models) : [],
    });
  }

  // Sort by activity: highest sessions first, then highest tokens, then alphabetical
  expertMetrics.sort(
    (a, b) => b.sessionsCount - a.sessionsCount || b.tokensCount - a.tokensCount || a.name.localeCompare(b.name, "fr")
  );

  // Re-assign colors based on sorted rank for visual consistency
  expertMetrics.forEach((exp, idx) => {
    exp.color = EXPERT_COLORS[idx % EXPERT_COLORS.length];
  });

  // 4. Build timeline & distribution
  const timeline = buildTimeline(period, periodSessions, totalTokens, now);

  const promptPercent = totalTokens > 0 ? Math.round((totalPromptTokens / totalTokens) * 100) : 50;
  const completionPercent = totalTokens > 0 ? Math.round((totalCompletionTokens / totalTokens) * 100) : 50;
  const avgTokensPerSession = totalSessionsCount > 0 ? Math.round(totalTokens / totalSessionsCount) : 0;

  const tokenDistribution: TokenDistribution = {
    totalTokens,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    promptPercent,
    completionPercent,
    avgTokensPerSession,
  };

  // 5. Format deliverables (filter working files, take top 10 recent)
  const validDeliverables: DeliverableSummary[] = deliverables
    .filter((d) => !/^\./.test(d.name) && !/\.(srt|vtt|json|py|ts|sh|md|txt)$/i.test(d.name))
    .map((d) => ({
      name: d.name,
      path: (d as { path?: string }).path || d.name,
      size: d.size ?? null,
      modified: toEpochMs(d.modified),
      kind: docKind(d.name),
    }))
    .sort((a, b) => (b.modified || 0) - (a.modified || 0))
    .slice(0, 10);

  // 6. Health status
  const incidents = alerts?.incidents || [];
  const warnings = alerts?.avertissements || [];
  let status: "healthy" | "warning" | "incident" = "healthy";
  if (incidents.length > 0) status = "incident";
  else if (warnings.length > 0) status = "warning";

  return {
    period,
    from: new Date(cutoff).toISOString(),
    to: new Date(now).toISOString(),
    totals: {
      sessions: totalSessionsCount,
      activeExperts: activeExpertsCount,
      totalExperts: allExpertIds.size,
      totalTokens,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      deliverablesCount: validDeliverables.length,
    },
    timeline,
    tokenDistribution,
    experts: expertMetrics,
    recentDeliverables: validDeliverables,
    health: {
      status,
      totalCrons: alerts?.totalCronsScanned || 0,
      incidentsCount: incidents.length,
      warningsCount: warnings.length,
    },
  };
}
