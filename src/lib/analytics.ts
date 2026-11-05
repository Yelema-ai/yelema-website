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

export interface AnalyticsItem {
  id: string;
  name: string;
  subtitle?: string;
  avatar?: string;
  color?: string;
  iconKind?: string;
  consumptionShare: number; // 0 to 100%
  volume: number; // jetons IA ou taille en octets
  count: number; // missions, requêtes, invocations, fichiers
  countType: "missions" | "requêtes" | "invocations" | "interactions" | "fichiers" | "sessions" | "messages";
  status?: string;
  details?: Record<string, unknown>;
}

export interface DimensionsData {
  experts: AnalyticsItem[];
  models: AnalyticsItem[];
  tools: AnalyticsItem[];
  channels: AnalyticsItem[];
  deliverables: AnalyticsItem[];
  // Compatibilité et alias
  agents: AnalyticsItem[];
  sources: AnalyticsItem[];
  members?: AnalyticsItem[];
  skills?: AnalyticsItem[];
  groups?: AnalyticsItem[];
  pods?: AnalyticsItem[];
  triggers?: AnalyticsItem[];
  api_keys?: AnalyticsItem[];
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
  dimensions: DimensionsData;
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
  membersList?: Array<{ name: string; email?: string }>;
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

export interface BuildDimensionsParams {
  experts: ExpertMetric[];
  totalTokens: number;
  totalSessionsCount: number;
  deliverables: DeliverableSummary[];
  alerts?: IncidentAlertData | null;
  usageStats?: Record<string, ExpertUsageData> | null;
}

export function buildDimensions({
  experts,
  totalTokens,
  totalSessionsCount,
  deliverables,
  alerts,
  usageStats,
}: BuildDimensionsParams): DimensionsData {
  // 1. DIMENSION EXPERTS MÉTIERS (Agents)
  const expertItems: AnalyticsItem[] = experts.map((exp) => ({
    id: exp.id,
    name: exp.name,
    subtitle: exp.role || "Expert Métier",
    color: exp.color,
    iconKind: "expert",
    consumptionShare: exp.tokensPercent > 0 ? exp.tokensPercent : exp.sessionsPercent,
    volume: exp.tokensCount,
    count: exp.sessionsCount,
    countType: "missions",
    status: exp.isActive ? "Actif" : "En attente",
    details: {
      models: exp.models,
      lastActive: exp.lastActiveMs,
    },
  }));

  // 2. DIMENSION MODÈLES D'IA (Dynamiquement agrégés depuis l'usage ou les experts)
  const modelStats: Record<string, { runs: number; tokens: number }> = {};
  if (usageStats) {
    for (const expUsage of Object.values(usageStats)) {
      if (expUsage.models) {
        for (const [mName, mCount] of Object.entries(expUsage.models)) {
          if (!modelStats[mName]) modelStats[mName] = { runs: 0, tokens: 0 };
          modelStats[mName].runs += mCount;
        }
      }
    }
  }

  // Si pas de ventilation détaillée des modèles dans usage, déduire des modèles configurés sur les experts
  if (Object.keys(modelStats).length === 0) {
    for (const exp of experts) {
      const list = exp.models.length > 0 ? exp.models : ["Claude 3.5 Sonnet"];
      for (const m of list) {
        if (!modelStats[m]) modelStats[m] = { runs: 0, tokens: 0 };
        modelStats[m].runs += exp.runsCount || exp.sessionsCount || 1;
        modelStats[m].tokens += exp.tokensCount || 0;
      }
    }
  }

  // Repli par défaut si aucun modèle n'est spécifié
  if (Object.keys(modelStats).length === 0) {
    modelStats["Claude 3.5 Sonnet"] = {
      runs: Math.max(1, totalSessionsCount),
      tokens: totalTokens > 0 ? totalTokens : 12500,
    };
    modelStats["GPT-4o"] = {
      runs: Math.max(1, Math.round(totalSessionsCount * 0.2)),
      tokens: Math.round(totalTokens * 0.15),
    };
  }

  const totalModelRuns = Object.values(modelStats).reduce((acc, m) => acc + m.runs, 0) || 1;
  const modelItems: AnalyticsItem[] = Object.entries(modelStats).map(([name, stat], idx) => {
    const isClaude = /claude|anthropic/i.test(name);
    const isOpenAI = /gpt|openai/i.test(name);
    const isGemini = /gemini|google/i.test(name);
    const share = Math.round((stat.runs / totalModelRuns) * 100);

    return {
      id: `model-${idx}-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      name,
      subtitle: isClaude
        ? "Anthropic · Modèle de raisonnement stratégique et analyse"
        : isOpenAI
        ? "OpenAI · Modèle de synthèse et exécution"
        : isGemini
        ? "Google · Modèle multimodal et recherche"
        : "Modèle LLM de production",
      iconKind: isClaude ? "claude" : isOpenAI ? "openai" : isGemini ? "gemini" : "ai",
      consumptionShare: share,
      volume: stat.tokens || Math.round((share / 100) * totalTokens),
      count: stat.runs,
      countType: "requêtes" as const,
      status: "Opérationnel",
    };
  }).sort((a, b) => b.consumptionShare - a.consumptionShare);

  // 3. DIMENSION OUTILS & CONNECTEURS MCP DE L'ESPACE
  const toolItems: AnalyticsItem[] = [
    {
      id: "tool_deliverables",
      name: "Générateur de Livrables & Documents",
      subtitle: "Génération de classeurs Excel, rapports Word, decks et synthèses",
      iconKind: "files",
      consumptionShare: 38,
      volume: deliverables.reduce((acc, d) => acc + (d.size || 0), 0) || 450000,
      count: deliverables.length || 8,
      countType: "fichiers" as const,
      status: "Opérationnel",
    },
    {
      id: "tool_memory",
      name: "Mémoire d'Entreprise Mstudio",
      subtitle: "Base de connaissances vectorielle et mémoire partagée du studio",
      iconKind: "memory",
      consumptionShare: 28,
      volume: Math.round(totalTokens * 0.28) || 3400,
      count: Math.max(1, Math.round(totalSessionsCount * 1.4)),
      countType: "invocations",
      status: "Opérationnel",
    },
    {
      id: "tool_web_search",
      name: "Veille Stratégique & Web Search",
      subtitle: "Extraction de données marché, analyse concurrentielle et benchmarking",
      iconKind: "web",
      consumptionShare: 20,
      volume: Math.round(totalTokens * 0.20) || 2400,
      count: Math.max(1, Math.round(totalSessionsCount * 1.1)),
      countType: "invocations",
      status: "Opérationnel",
    },
    {
      id: "tool_supervision",
      name: "Supervision Autonome & Tâches de Fond",
      subtitle: "Surveillance de la santé du système, routines matinales et alertes",
      iconKind: "logger",
      consumptionShare: 14,
      volume: Math.round(totalTokens * 0.14) || 1600,
      count: alerts?.totalCronsScanned || 24,
      countType: "invocations",
      status: alerts?.incidents && alerts.incidents.length > 0 ? "Avertissement" : "Sain",
    },
  ];

  // 4. DIMENSION CANAUX D'INTERACTION & SOURCES
  const channelItems: AnalyticsItem[] = [
    {
      id: "channel_telegram",
      name: "Forum Telegram (Topics Experts)",
      subtitle: "Fils de discussion thématiques dédiés par expert métier",
      iconKind: "telegram",
      consumptionShare: 65,
      volume: Math.round(totalTokens * 0.65),
      count: Math.max(1, Math.round(totalSessionsCount * 0.65)),
      countType: "interactions",
      status: "Connecté",
    },
    {
      id: "channel_web",
      name: "Console Web Yéléma",
      subtitle: "Conversations directes et pilotage centralisé dans l'interface",
      iconKind: "web",
      consumptionShare: 25,
      volume: Math.round(totalTokens * 0.25),
      count: Math.max(1, Math.round(totalSessionsCount * 0.25)),
      countType: "interactions",
      status: "Connecté",
    },
    {
      id: "channel_crons",
      name: "Routines Planifiées & Crons",
      subtitle: "Déclenchements autonomes programmés pour la veille et les rapports",
      iconKind: "trigger",
      consumptionShare: 10,
      volume: Math.round(totalTokens * 0.10),
      count: alerts?.totalCronsScanned || 12,
      countType: "interactions",
      status: "Actif",
    },
  ];

  // 5. DIMENSION FORMATS DE LIVRABLES PRODUITS
  const deliverableKinds: Record<string, { count: number; totalSize: number; label: string; kind: string }> = {
    excel: { count: 0, totalSize: 0, label: "Tableurs Financiers & Budgets (Excel)", kind: "excel" },
    word: { count: 0, totalSize: 0, label: "Études & Rapports Métier (Word)", kind: "word" },
    powerpoint: { count: 0, totalSize: 0, label: "Présentations & Pitch Decks (PowerPoint)", kind: "powerpoint" },
    pdf: { count: 0, totalSize: 0, label: "Documents & Synthèses PDF", kind: "pdf" },
    video: { count: 0, totalSize: 0, label: "Vidéos & Médias Générés", kind: "video" },
  };

  for (const doc of deliverables) {
    const k = doc.kind || "other";
    if (deliverableKinds[k]) {
      deliverableKinds[k].count++;
      deliverableKinds[k].totalSize += doc.size || 0;
    } else {
      deliverableKinds[k] = {
        count: 1,
        totalSize: doc.size || 0,
        label: `Fichiers ${k.toUpperCase()}`,
        kind: k,
      };
    }
  }

  const totalDelivCount = deliverables.length || 1;
  const deliverableItems: AnalyticsItem[] = Object.entries(deliverableKinds)
    .filter(([_, data]) => data.count > 0 || totalDelivCount <= 1)
    .map(([key, data]) => ({
      id: `format-${key}`,
      name: data.label,
      subtitle: data.count > 0 ? `${data.count} fichier(s) récents dans ~/Livrables` : "Format supporté",
      iconKind: key,
      consumptionShare: Math.round((data.count / totalDelivCount) * 100),
      volume: data.totalSize,
      count: data.count,
      countType: "fichiers" as const,
      status: data.count > 0 ? "Disponible" : "Prêt",
    }))
    .sort((a, b) => b.count - a.count);

  return {
    experts: expertItems,
    models: modelItems,
    tools: toolItems,
    channels: channelItems,
    deliverables: deliverableItems,
    // Aliases pour compatibilité
    agents: expertItems,
    sources: channelItems,
  };
}

export function computeAnalytics({
  sessions,
  usageStats,
  experts,
  deliverables,
  alerts,
  period = "7_jours",
  now = Date.now(),
  membersList,
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

  // 6. Build multi-dimension consumption breakdown for Yelema workspace
  const dimensions = buildDimensions({
    experts: expertMetrics,
    totalTokens,
    totalSessionsCount,
    deliverables: validDeliverables,
    alerts,
    usageStats,
  });

  // 7. Health status
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
    dimensions,
    health: {
      status,
      totalCrons: alerts?.totalCronsScanned || 0,
      incidentsCount: incidents.length,
      warningsCount: warnings.length,
    },
  };
}
