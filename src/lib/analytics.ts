// Business logic for Yelema Team & Expert Analytics.
// Pure functions, strictly typed, zero side effects. Used by both the Next.js API route and test suites.

import { docKind } from "./drive-links.ts";
import {
  getPeriodCutoff,
  type DiscoveredExpert,
  type RawFileInfo,
  type RawSessionInfo,
} from "./yele-supervision.ts";
import {
  EXPERT_COLORS,
  type AnalyticsOverview,
  type AnalyticsPeriod,
  type ComputeAnalyticsParams,
  type DailyAuditDay,
  type DeliverableSummary,
  type ExpertMetric,
  type TimeSeriesPoint,
  type TokenDistribution,
} from "./analytics-types.ts";
import { buildDimensions } from "./analytics-dimensions.ts";

// Re-export all types and dimensions for backward compatibility
export * from "./analytics-types.ts";
export * from "./analytics-dimensions.ts";

function toEpochMs(raw?: number | null): number | null {
  if (raw == null || raw <= 0) return null;
  return raw < 1e11 ? raw * 1000 : raw;
}

/**
 * Builds timeline points according to the selected period:
 * - "aujourdhui": 8 buckets of 3 hours (00h, 03h, 06h, 09h, 12h, 15h, 18h, 21h)
 * - "7_jours": 7 daily buckets (J-6 to J0)
 * - "30_jours": 30 daily buckets (J-29 to J0)
 * 
 * If dailyAudit is provided from usage_audit.jsonl, use exact historical tokens and runs.
 * Otherwise, fall back to bucketed period sessions. Zero is rendered when no telemetry exists.
 */
function buildTimeline(
  period: AnalyticsPeriod,
  periodSessions: RawSessionInfo[],
  totalTokens: number,
  now: number,
  dailyAudit?: Record<string, DailyAuditDay> | null
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];

  if (period === "aujourdhui") {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    const intervalMs = 3 * 3600 * 1000; // 3 hours
    const todayKey = startOfDay.toISOString().slice(0, 10);
    const todayAudit = dailyAudit?.[todayKey];

    const totalSessions = periodSessions.length;
    const tokensPerSession = totalSessions > 0 ? (todayAudit?.totalTokens ?? totalTokens) / totalSessions : 0;

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

  // Align with start of today UTC
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  for (let i = daysCount - 1; i >= 0; i--) {
    const bucketStart = todayStartMs - i * oneDayMs;
    const bucketEnd = bucketStart + oneDayMs;
    const d = new Date(bucketStart);
    const dateKey = d.toISOString().slice(0, 10);

    const label =
      daysCount === 7
        ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })
        : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

    if (dailyAudit && dailyAudit[dateKey]) {
      const dayData = dailyAudit[dateKey];
      const activeCount = Object.keys(dayData.byExpert || {}).length;
      points.push({
        label,
        date: d.toISOString(),
        timestamp: bucketStart,
        sessions: dayData.runs,
        tokens: dayData.totalTokens,
        expertsActive: activeCount,
        byExpert: dayData.byExpert,
      });
    } else {
      // Fallback from session timestamps
      const bucketSessions = periodSessions.filter((s) => {
        const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
        return act != null && act >= bucketStart && act < bucketEnd;
      });

      const distinctExperts = new Set(
        bucketSessions.map((s) => (s.profile || "").toLowerCase()).filter(Boolean)
      );

      const count = bucketSessions.length;
      const totalSessions = periodSessions.length;
      const tokensPerSession = totalSessions > 0 ? totalTokens / totalSessions : 0;

      points.push({
        label,
        date: d.toISOString(),
        timestamp: bucketStart,
        sessions: count,
        tokens: Math.round(count * tokensPerSession),
        expertsActive: distinctExperts.size,
      });
    }
  }

  return points;
}


export function computeAnalytics({
  sessions,
  usageStats,
  dailyAudit,
  experts,
  deliverables,
  alerts,
  period = "7_jours",
  now = Date.now(),
  membersList,
  toolsList,
  skillsList,
  telegram,
  mail,
  instanceInfo,
}: ComputeAnalyticsParams): AnalyticsOverview {
  const cutoff = getPeriodCutoff(period, now);

  // 1. Filter sessions by period cutoff
  const periodSessions = sessions.filter((s) => {
    const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
    return act == null || act >= cutoff;
  });

  // 2. Discover unique experts across discovered array, usageStats, and session profiles
  const expertProfileSet = new Set<string>();
  for (const exp of experts) {
    expertProfileSet.add(exp.id.toLowerCase());
  }
  if (usageStats) {
    for (const expId of Object.keys(usageStats)) {
      expertProfileSet.add(expId.toLowerCase());
    }
  }
  for (const s of periodSessions) {
    if (s.profile) expertProfileSet.add(s.profile.toLowerCase());
  }

  const expertMap = new Map<string, DiscoveredExpert>();
  for (const exp of experts) {
    expertMap.set(exp.id.toLowerCase(), exp);
  }

  // 3. Compute per-expert metrics
  const expertMetrics: ExpertMetric[] = [];
  let totalExpertTokens = 0;
  let totalExpertPromptTokens = 0;
  let totalExpertCompletionTokens = 0;

  const expertIds = Array.from(expertProfileSet);

  for (let idx = 0; idx < expertIds.length; idx++) {
    const profileId = expertIds[idx];
    const discovered = expertMap.get(profileId);

    const displayName = discovered?.name || profileId.charAt(0).toUpperCase() + profileId.slice(1);
    const role = discovered?.description || "Expert Spécialisé";
    const color = EXPERT_COLORS[idx % EXPERT_COLORS.length];

    const expSessions = periodSessions.filter(
      (s) => (s.profile || "").toLowerCase() === profileId
    );
    const sessionsCount = expSessions.length;

    let lastActiveMs: number | null = null;
    for (const s of expSessions) {
      const act = toEpochMs(s.last_active) ?? toEpochMs(s.started_at);
      if (act != null && (lastActiveMs == null || act > lastActiveMs)) {
        lastActiveMs = act;
      }
    }

    const st = usageStats ? usageStats[profileId] : null;
    const tokensCount = st?.totalTokens || 0;
    const promptTokens = st?.promptTokens || 0;
    const completionTokens = st?.completionTokens || 0;
    const runsCount = st?.count || 0;
    const models = st ? Object.keys(st.models || {}) : [];

    totalExpertTokens += tokensCount;
    totalExpertPromptTokens += promptTokens;
    totalExpertCompletionTokens += completionTokens;

    expertMetrics.push({
      id: profileId,
      name: displayName,
      role,
      color,
      sessionsCount,
      sessionsPercent: 0, // computed below
      tokensCount,
      tokensPercent: 0, // computed below
      promptTokens,
      completionTokens,
      runsCount,
      lastActiveMs,
      isActive: sessionsCount > 0 || runsCount > 0,
      models,
    });
  }

  // Sort experts by sessions descending, then tokens descending
  expertMetrics.sort((a, b) => b.sessionsCount - a.sessionsCount || b.tokensCount - a.tokensCount);

  // Re-assign distinct palette colors by activity rank
  expertMetrics.forEach((m, idx) => {
    m.color = EXPERT_COLORS[idx % EXPERT_COLORS.length];
  });

  const totalSessionsCount = periodSessions.length;
  for (const m of expertMetrics) {
    m.sessionsPercent =
      totalSessionsCount > 0 ? Math.round((m.sessionsCount / totalSessionsCount) * 100) : 0;
    m.tokensPercent =
      totalExpertTokens > 0 ? Math.round((m.tokensCount / totalExpertTokens) * 100) : 0;
  }

  // 4. Token distribution
  const promptPercent =
    totalExpertTokens > 0 ? Math.round((totalExpertPromptTokens / totalExpertTokens) * 100) : 0;
  const completionPercent =
    totalExpertTokens > 0 ? Math.round((totalExpertCompletionTokens / totalExpertTokens) * 100) : 0;
  const avgTokensPerSession =
    totalSessionsCount > 0 ? Math.round(totalExpertTokens / totalSessionsCount) : 0;

  const tokenDistribution: TokenDistribution = {
    totalTokens: totalExpertTokens,
    promptTokens: totalExpertPromptTokens,
    completionTokens: totalExpertCompletionTokens,
    promptPercent,
    completionPercent,
    avgTokensPerSession,
  };

  // 5. Recent deliverables (Filter out non-deliverable files)
  const recentDeliverables: DeliverableSummary[] = deliverables
    .filter((f) => {
      const name = f.name || "";
      if (name.startsWith(".")) return false;
      const lower = name.toLowerCase();
      if (
        lower.endsWith(".srt") ||
        lower.endsWith(".vtt") ||
        lower.endsWith(".py") ||
        lower.endsWith(".sh") ||
        lower.endsWith(".txt") ||
        lower.endsWith(".md") ||
        lower.endsWith(".json")
      ) {
        return false;
      }
      return true;
    })
    .map((f) => ({
      name: f.name,
      path: f.name,
      size: f.size ?? null,
      modified: toEpochMs(f.modified),
      kind: docKind(f.name),
    }))
    .sort((a, b) => (b.modified || 0) - (a.modified || 0))
    .slice(0, 10);

  // 6. Timeline points (Pure calculation)
  const timeline = buildTimeline(period, periodSessions, totalExpertTokens, now, dailyAudit);

  // 7. System Health Status
  let healthStatus: "healthy" | "warning" | "incident" = "healthy";
  const incidents = alerts?.incidents || [];
  const avertissements = alerts?.avertissements || [];
  if (incidents.length > 0) {
    healthStatus = "incident";
  } else if (avertissements.length > 0) {
    healthStatus = "warning";
  }

  const activeExpertsCount = expertMetrics.filter((e) => e.isActive).length;

  // 8. Build Dimensions
  const dimensions = buildDimensions({
    experts: expertMetrics,
    totalTokens: totalExpertTokens,
    totalSessionsCount,
    deliverables: recentDeliverables,
    alerts,
    usageStats,
    dailyAudit,
    membersList,
    toolsList,
    skillsList,
    telegram,
    mail,
    instanceInfo,
  });

  return {
    period,
    from: new Date(cutoff).toISOString(),
    to: new Date(now).toISOString(),
    totals: {
      sessions: totalSessionsCount,
      activeExperts: activeExpertsCount,
      totalExperts: expertMetrics.length,
      totalTokens: totalExpertTokens,
      promptTokens: totalExpertPromptTokens,
      completionTokens: totalExpertCompletionTokens,
      deliverablesCount: recentDeliverables.length,
    },
    timeline,
    tokenDistribution,
    experts: expertMetrics,
    recentDeliverables,
    dimensions,
    health: {
      status: healthStatus,
      totalCrons: alerts?.totalCronsScanned || 0,
      incidentsCount: incidents.length,
      warningsCount: avertissements.length,
    },
  };
}
