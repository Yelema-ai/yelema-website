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
  agents: AnalyticsItem[];
  members: AnalyticsItem[];
  groups: AnalyticsItem[];
  pods: AnalyticsItem[];
  models: AnalyticsItem[];
  tools: AnalyticsItem[];
  skills: AnalyticsItem[];
  sources: AnalyticsItem[];
  triggers: AnalyticsItem[];
  api_keys: AnalyticsItem[];
  // Compatibilité et alias
  experts: AnalyticsItem[];
  channels: AnalyticsItem[];
  deliverables: AnalyticsItem[];
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
  // 1. TAB: AGENTS (Console Mstudio / Dust complete roster)
  const defaultAgents: AnalyticsItem[] = [
    {
      id: "agent_synthese_meeting",
      name: "Synthèse_Meeting",
      subtitle: "Compte-rendu et actions clés de réunion",
      iconKind: "green_doc",
      consumptionShare: 42,
      volume: 5037,
      count: 44,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_osoya_report",
      name: "OssoyaReportGen",
      subtitle: "Générateur de rapports financiers et opérationnels",
      iconKind: "blue_chart",
      consumptionShare: 22,
      volume: 2650,
      count: 35,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_meeting_router",
      name: "Meeting_Router",
      subtitle: "Aiguillage automatique des sujets en réunion",
      iconKind: "green_arrow",
      consumptionShare: 5,
      volume: 585,
      count: 44,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_ma_brief",
      name: "M&A_brief_hebdo",
      subtitle: "Veille fusions, acquisitions et investissements",
      iconKind: "green_brief",
      consumptionShare: 5,
      volume: 553,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_veille_tech",
      name: "VeilleTechIA",
      subtitle: "Radar des technologies émergentes et modèles LLM",
      iconKind: "green_radar",
      consumptionShare: 3,
      volume: 394,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_room_booker",
      name: "RoomBooker",
      subtitle: "Gestion et réservation des salles de conférence",
      iconKind: "blue_room",
      consumptionShare: 3,
      volume: 362,
      count: 23,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_gt_rs_stats",
      name: "GT_RS_StatsAnalyst",
      subtitle: "Analyste statistique des réseaux et performances",
      iconKind: "green_stats",
      consumptionShare: 3,
      volume: 343,
      count: 1,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_dust",
      name: "Dust",
      subtitle: "Connecteur et synchroniseur Dust Workspace",
      iconKind: "dust_logo",
      consumptionShare: 3,
      volume: 333,
      count: 19,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_doo_reconcile",
      name: "DooReconcileAI_Copy",
      subtitle: "Rapprochement bancaire et comptable automatisé",
      iconKind: "red_money",
      consumptionShare: 3,
      volume: 327,
      count: 11,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_geertq",
      name: "Geertq_Monitoring",
      subtitle: "Supervision des alertes et indicateurs clés",
      iconKind: "green_pulse",
      consumptionShare: 2,
      volume: 217,
      count: 3,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_fintech_reg",
      name: "Fintech_RegWatch",
      subtitle: "Conformité réglementaire et veille juridique",
      iconKind: "green_shield",
      consumptionShare: 2,
      volume: 193,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_hacks_weekly",
      name: "HacksWeeklyBot",
      subtitle: "Diffusion hebdomadaire des astuces productivité",
      iconKind: "blue_bot",
      consumptionShare: 2,
      volume: 191,
      count: 4,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_comp_intel",
      name: "CompetitiveIntelAI",
      subtitle: "Intelligence concurrentielle et benchmark",
      iconKind: "yellow_heart",
      consumptionShare: 2,
      volume: 184,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_inbox_manager",
      name: "InboxManager",
      subtitle: "Tri intelligent et préparation des réponses d'inbox",
      iconKind: "green_inbox",
      consumptionShare: 1,
      volume: 155,
      count: 14,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_gt_trend",
      name: "GT_Trend_Watcher",
      subtitle: "Détection des tendances de croissance et signaux faibles",
      iconKind: "green_trend",
      consumptionShare: 1,
      volume: 148,
      count: 1,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_supply_sourcing",
      name: "SupplySourcing",
      subtitle: "Recherche et négociation fournisseurs",
      iconKind: "green_supply",
      consumptionShare: 1,
      volume: 65,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "agent_veille_vc",
      name: "Veille_VC",
      subtitle: "Suivi des levées de fonds et valorisations startups",
      iconKind: "avatar_vc",
      consumptionShare: 0,
      volume: 23,
      count: 1,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_inventory_alert",
      name: "Inventory_Alert",
      subtitle: "Alertes stocks et flux de réapprovisionnement",
      iconKind: "green_inventory",
      consumptionShare: 0,
      volume: 23,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_wariba_coo",
      name: "Wariba_COO_Weekly",
      subtitle: "Revue exécutive hebdomadaire des opérations Wariba",
      iconKind: "red_brief",
      consumptionShare: 0,
      volume: 21,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_debt_relance",
      name: "DebtRelance",
      subtitle: "Relances automatisées des créances et impayés",
      iconKind: "green_debt",
      consumptionShare: 0,
      volume: 16,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_kpi_weekly",
      name: "KPIWeekly",
      subtitle: "Synthèse chiffrée hebdomadaire des KPIs d'équipe",
      iconKind: "green_kpi",
      consumptionShare: 0,
      volume: 12,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_wariba_research",
      name: "WaribaResearchAgent",
      subtitle: "Recherche documentaire et analyse de cas Wariba",
      iconKind: "red_research",
      consumptionShare: 0,
      volume: 2,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
    {
      id: "agent_doo_archived",
      name: "DooReconcileAI_Archived",
      subtitle: "Archives des rapprochements comptables 2024-2025",
      iconKind: "red_archive",
      consumptionShare: 0,
      volume: 2,
      count: 2,
      countType: "messages",
      status: "En attente",
    },
  ];

  // If customized workspace experts (e.g. Fatima, Kouassi) are present, integrate them prominently at top
  const workspaceAgents: AnalyticsItem[] = experts.map((exp) => ({
    id: exp.id,
    name: exp.name,
    subtitle: exp.role || "Expert Spécialisé",
    color: exp.color,
    iconKind: "expert",
    consumptionShare: exp.tokensPercent > 0 ? exp.tokensPercent : exp.sessionsPercent,
    volume: exp.tokensCount,
    count: exp.sessionsCount,
    countType: "messages" as const,
    status: exp.isActive ? "Actif" : "En attente",
    details: {
      models: exp.models,
      lastActive: exp.lastActiveMs,
    },
  }));

  const allAgents = workspaceAgents.length > 0
    ? [...workspaceAgents, ...defaultAgents.filter(da => !workspaceAgents.some(wa => wa.name.toLowerCase() === da.name.toLowerCase()))]
    : defaultAgents;

  // 2. TAB: MEMBERS (Membres de l'équipe Mstudio)
  const members: AnalyticsItem[] = [
    {
      id: "mem_ebou_christelle",
      name: "Ebou Christelle Nebie",
      subtitle: "Directrice Générale & Managing Director",
      iconKind: "member_e",
      color: "#9333ea",
      consumptionShare: 52,
      volume: 6201,
      count: 93,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_mstudio_team",
      name: "Mstudio Team",
      subtitle: "Équipe centrale Startup Studio",
      iconKind: "member_m",
      color: "#2563eb",
      consumptionShare: 42,
      volume: 4976,
      count: 97,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_selim_traore",
      name: "Selim Traore",
      subtitle: "CTO & Co-fondateur",
      iconKind: "member_s",
      color: "#16a34a",
      consumptionShare: 6,
      volume: 660,
      count: 30,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_leslie_ossete",
      name: "leslie ossete",
      subtitle: "Product Lead & Operations",
      iconKind: "member_l",
      color: "#14b8a6",
      consumptionShare: 0,
      volume: 30,
      count: 3,
      countType: "messages",
      status: "En attente",
    },
  ];

  // 3. TAB: GROUPS
  const groups: AnalyticsItem[] = [
    {
      id: "grp_mstudio_core",
      name: "Mstudio Core Team",
      subtitle: "Leadership, pilotage stratégique et opérations",
      iconKind: "group",
      consumptionShare: 68,
      volume: 8120,
      count: 122,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "grp_startup_ventures",
      name: "Startup Studio Ventures",
      subtitle: "Équipes ventures & startups du studio",
      iconKind: "group",
      consumptionShare: 32,
      volume: 3824,
      count: 67,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 4. TAB: PODS
  const pods: AnalyticsItem[] = [
    {
      id: "pod_yelema_production",
      name: "Pod Yéléma Production",
      subtitle: "Environnement d'exécution haute disponibilité",
      iconKind: "pod",
      consumptionShare: 75,
      volume: 8950,
      count: 145,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "pod_supervision_eval",
      name: "Pod Supervision & Analytics",
      subtitle: "Collecteur de métriques, audits et santé système",
      iconKind: "pod",
      consumptionShare: 25,
      volume: 2994,
      count: 44,
      countType: "invocations",
      status: "Actif",
    },
  ];

  // 5. TAB: MODELS (Claude Sonnet 5, GPT 5.6 Luna, GPT 5.6 Terra, Claude Sonnet 4.6)
  const models: AnalyticsItem[] = [
    {
      id: "model_claude_sonnet_5",
      name: "Claude Sonnet 5",
      subtitle: "Anthropic · Modèle d'analyse et de raisonnement stratégique",
      iconKind: "claude",
      consumptionShare: 90,
      volume: 10677,
      count: 139,
      countType: "messages",
      status: "Opérationnel",
    },
    {
      id: "model_gpt_5_6_luna",
      name: "GPT 5.6 Luna",
      subtitle: "OpenAI · Modèle de synthèse rapide et dialogue",
      iconKind: "openai",
      consumptionShare: 7,
      volume: 840,
      count: 72,
      countType: "messages",
      status: "Opérationnel",
    },
    {
      id: "model_gpt_5_6_terra",
      name: "GPT 5.6 Terra",
      subtitle: "OpenAI · Modèle d'exécution et calculs de données",
      iconKind: "openai",
      consumptionShare: 3,
      volume: 327,
      count: 11,
      countType: "messages",
      status: "Opérationnel",
    },
    {
      id: "model_claude_sonnet_4_6",
      name: "Claude Sonnet 4.6",
      subtitle: "Anthropic · Version de secours haute fiabilité",
      iconKind: "claude",
      consumptionShare: 0,
      volume: 23,
      count: 1,
      countType: "messages",
      status: "Opérationnel",
    },
  ];

  // 6. TAB: TOOLS (Files, Web search browse, Gmail, Google calendar)
  const tools: AnalyticsItem[] = [
    {
      id: "tool_files",
      name: "Files",
      subtitle: "Gestion, lecture et production de livrables",
      iconKind: "files",
      consumptionShare: 5,
      volume: 548.1,
      count: 408,
      countType: "invocations",
      status: "Opérationnel",
    },
    {
      id: "tool_web_search",
      name: "Web search browse",
      subtitle: "Recherche en direct, navigation et extraction de contenu",
      iconKind: "web",
      consumptionShare: 3,
      volume: 387.5,
      count: 345,
      countType: "invocations",
      status: "Opérationnel",
    },
    {
      id: "tool_gmail",
      name: "Gmail",
      subtitle: "Lecture, tri et envoi de courriers électroniques",
      iconKind: "gmail",
      consumptionShare: 3,
      volume: 298.5,
      count: 80,
      countType: "invocations",
      status: "Opérationnel",
    },
    {
      id: "tool_google_calendar",
      name: "Google calendar",
      subtitle: "Planification d'événements et vérification de disponibilités",
      iconKind: "calendar",
      consumptionShare: 2,
      volume: 247.3,
      count: 82,
      countType: "invocations",
      status: "Opérationnel",
    },
  ];

  // 7. TAB: SKILLS (Computer, Create Frames, Logger Report&Analyse, Logger Process Trigger, Mémoire Startup Mstudio)
  const skills: AnalyticsItem[] = [
    {
      id: "skill_computer",
      name: "Computer",
      subtitle: "Exécution de scripts, commandes shell et traitement système",
      iconKind: "computer",
      consumptionShare: 2,
      volume: 235.2,
      count: 476,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_create_frames",
      name: "Create Frames",
      subtitle: "Conception de maquettes visuelles et structures de documents",
      iconKind: "frames",
      consumptionShare: 1,
      volume: 146.7,
      count: 64,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_logger_report",
      name: "Logger Report&Analyse",
      subtitle: "Journalisation structurée et génération de bilans d'activité",
      iconKind: "logger",
      consumptionShare: 1,
      volume: 89.9,
      count: 50,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_logger_process",
      name: "Logger Process Trigger",
      subtitle: "Suivi des déclenchements de processus et monitoring",
      iconKind: "table",
      consumptionShare: 1,
      volume: 81.8,
      count: 45,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_memoire_startup",
      name: "Mémoire Startup Mstudio",
      subtitle: "Rappel des connaissances et décisions clés du studio",
      iconKind: "memory",
      consumptionShare: 1,
      volume: 62.1,
      count: 63,
      countType: "invocations",
      status: "Actif",
    },
  ];

  // 8. TAB: SOURCES (Trigger, Conversation, API, Analytics panel)
  const sources: AnalyticsItem[] = [
    {
      id: "src_trigger",
      name: "Trigger",
      subtitle: "Déclencheurs automatisés, webhooks et crons",
      iconKind: "trigger",
      consumptionShare: 72,
      volume: 8526,
      count: 154,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_conversation",
      name: "Conversation",
      subtitle: "Échanges directs avec les membres dans l'interface",
      iconKind: "chat",
      consumptionShare: 25,
      volume: 2993,
      count: 55,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_api",
      name: "API",
      subtitle: "Appels programmatiques externes via clés d'API",
      iconKind: "api",
      consumptionShare: 3,
      volume: 347,
      count: 13,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_analytics_panel",
      name: "Analytics panel",
      subtitle: "Consultations et requêtes d'analyse du tableau de bord",
      iconKind: "panel",
      consumptionShare: 0,
      volume: 1,
      count: 1,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 9. TAB: TRIGGERS (make, Lundi matin 7h30)
  const triggers: AnalyticsItem[] = [
    {
      id: "trig_make",
      name: "make",
      subtitle: "Scénarios d'automatisation Make (Integromat)",
      iconKind: "trigger",
      consumptionShare: 5,
      volume: 596,
      count: 45,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "trig_lundi_matin",
      name: "Lundi matin 7h30",
      subtitle: "Briefing et rapport hebdomadaire du lundi matin",
      iconKind: "trigger",
      consumptionShare: 5,
      volume: 553,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 10. TAB: API KEYS (dust_doo_reconciliation, Zu)
  const api_keys: AnalyticsItem[] = [
    {
      id: "key_dust_doo_reconciliation",
      name: "dust_doo_reconciliation",
      subtitle: "Clé dédiée au rapprochement financier et bancaire",
      iconKind: "api",
      consumptionShare: 3,
      volume: 327,
      count: 11,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "key_zu",
      name: "Zu",
      subtitle: "Clé d'accès connecteur Zu",
      iconKind: "api",
      consumptionShare: 0,
      volume: 20,
      count: 2,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 11. Formats de Livrables (Deliverables)
  const deliverableKinds: Record<string, { count: number; totalSize: number; label: string; kind: string }> = {
    excel: { count: 0, totalSize: 0, label: "Tableurs Financiers (Excel)", kind: "excel" },
    word: { count: 0, totalSize: 0, label: "Rapports & Documents (Word)", kind: "word" },
    powerpoint: { count: 0, totalSize: 0, label: "Présentations (PowerPoint)", kind: "powerpoint" },
    pdf: { count: 0, totalSize: 0, label: "Synthèses PDF", kind: "pdf" },
    video: { count: 0, totalSize: 0, label: "Vidéos & Médias", kind: "video" },
  };

  for (const doc of deliverables) {
    const k = doc.kind || "other";
    if (deliverableKinds[k]) {
      deliverableKinds[k].count++;
      deliverableKinds[k].totalSize += doc.size || 0;
    }
  }

  const totalDelivCount = deliverables.length || 1;
  const deliverableItems: AnalyticsItem[] = Object.entries(deliverableKinds)
    .map(([key, data]) => ({
      id: `format-${key}`,
      name: data.label,
      subtitle: data.count > 0 ? `${data.count} fichier(s) dans ~/Livrables` : "Format supporté",
      iconKind: key,
      consumptionShare: Math.round((data.count / totalDelivCount) * 100),
      volume: data.totalSize,
      count: data.count,
      countType: "fichiers" as const,
      status: data.count > 0 ? "Disponible" : "Prêt",
    }))
    .sort((a, b) => b.count - a.count);

  return {
    agents: allAgents,
    members,
    groups,
    pods,
    models,
    tools,
    skills,
    sources,
    triggers,
    api_keys,
    // Aliases
    experts: allAgents,
    channels: sources,
    deliverables: deliverableItems,
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
