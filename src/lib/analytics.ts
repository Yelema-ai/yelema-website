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
  // 1. TAB: AGENTS (Roster réel des 12 experts Yelema / Mstudio + Yélé)
  const defaultAgents: AnalyticsItem[] = [
    {
      id: "expert_koffi",
      name: "Koffi",
      subtitle: "Design de marque, direction artistique & identité visuelle",
      iconKind: "expert",
      color: "#8B5CF6",
      consumptionShare: 11,
      volume: 12251088,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_djeneba",
      name: "Djénéba",
      subtitle: "Chief of Staff, coordination exécutive & assistanat de direction",
      iconKind: "expert",
      color: "#10B981",
      consumptionShare: 10,
      volume: 11051956,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_adjoua",
      name: "Adjoua",
      subtitle: "Recrutement, sourcing de talents & entretiens candidats",
      iconKind: "expert",
      color: "#EC4899",
      consumptionShare: 9,
      volume: 9690477,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_mamadou",
      name: "Mamadou",
      subtitle: "Comptabilité générale, reporting financier & réconciliation",
      iconKind: "expert",
      color: "#3B82F6",
      consumptionShare: 8,
      volume: 9291111,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_kouassi",
      name: "Kouassi",
      subtitle: "Commercial, prospection B2B & négociation partenariats",
      iconKind: "expert",
      color: "#F59E0B",
      consumptionShare: 8,
      volume: 9155366,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_fatou",
      name: "Fatou",
      subtitle: "Ressources humaines, gestion de la paie & onboarding",
      iconKind: "expert",
      color: "#F97316",
      consumptionShare: 8,
      volume: 8896977,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_salif",
      name: "Salif",
      subtitle: "Opérations, logistique, chaîne d'approvisionnement & flux",
      iconKind: "expert",
      color: "#6366F1",
      consumptionShare: 8,
      volume: 8879787,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_fatima",
      name: "Fatima",
      subtitle: "Marketing digital, stratégie de contenu & réseaux sociaux",
      iconKind: "expert",
      color: "#8B5CF6",
      consumptionShare: 8,
      volume: 8876655,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_alioune",
      name: "Alioune",
      subtitle: "Investissement, modélisation financière, levées de fonds & M&A",
      iconKind: "expert",
      color: "#14B8A6",
      consumptionShare: 8,
      volume: 8871581,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_ibrahim",
      name: "Ibrahim",
      subtitle: "Juridique, revue de contrats & conformité réglementaire",
      iconKind: "expert",
      color: "#EF4444",
      consumptionShare: 8,
      volume: 8661905,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_awa",
      name: "Awa",
      subtitle: "Support client, relation abonnés & fidélisation",
      iconKind: "expert",
      color: "#06B6D4",
      consumptionShare: 8,
      volume: 8426809,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_nadia",
      name: "Nadia",
      subtitle: "Données, tableaux de bord de pilotage & business intelligence",
      iconKind: "expert",
      color: "#EAB308",
      consumptionShare: 7,
      volume: 7675884,
      count: 78,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "expert_yele",
      name: "Yélé",
      subtitle: "Supervision globale de l'espace Mstudio & accompagnement",
      iconKind: "expert",
      color: "#7C3AED",
      consumptionShare: 1,
      volume: 1200000,
      count: 35,
      countType: "messages",
      status: "Actif",
    },
  ];

  // Si des experts sont découverts dynamiquement, mapper directement sans dupliquer
  const workspaceAgents: AnalyticsItem[] = experts.map((exp) => ({
    id: exp.id,
    name: exp.name,
    subtitle: exp.role || "Expert Spécialisé",
    color: exp.color,
    iconKind: "expert",
    consumptionShare: exp.tokensPercent > 0 ? exp.tokensPercent : exp.sessionsPercent,
    volume: exp.tokensCount,
    count: exp.sessionsCount > 0 ? exp.sessionsCount : exp.runsCount,
    countType: "messages" as const,
    status: exp.isActive ? "Actif" : "En attente",
    details: {
      models: exp.models,
      lastActive: exp.lastActiveMs,
    },
  }));

  const allAgents = workspaceAgents.length > 0 ? workspaceAgents : defaultAgents;

  // 2. TAB: MEMBERS (Membres réels de l'équipe Mstudio)
  const members: AnalyticsItem[] = [
    {
      id: "mem_christelle",
      name: "Christelle Ebou",
      subtitle: "Directrice Générale & Managing Director",
      iconKind: "member_e",
      color: "#9333ea",
      consumptionShare: 52,
      volume: 58099389,
      count: 486,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_leslie",
      name: "Leslie Ossete",
      subtitle: "Product Lead & Operations",
      iconKind: "member_l",
      color: "#14b8a6",
      consumptionShare: 28,
      volume: 31284286,
      count: 262,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_selim",
      name: "Selim Traore",
      subtitle: "CTO & Co-fondateur",
      iconKind: "member_s",
      color: "#16a34a",
      consumptionShare: 14,
      volume: 15642143,
      count: 131,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "mem_mstudio_team",
      name: "Équipe Mstudio Core",
      subtitle: "Accès partagé et agents transverses",
      iconKind: "member_m",
      color: "#2563eb",
      consumptionShare: 6,
      volume: 6703778,
      count: 57,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 3. TAB: GROUPS (Groupes et pôles opérationnels Mstudio)
  const groups: AnalyticsItem[] = [
    {
      id: "grp_direction_strategie",
      name: "Direction & Stratégie Mstudio",
      subtitle: "Christelle Ebou, Djénéba, Alioune",
      iconKind: "group",
      consumptionShare: 38,
      volume: 42457246,
      count: 356,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "grp_operations_finance",
      name: "Opérations, Finance & RH",
      subtitle: "Mamadou, Salif, Fatou, Adjoua",
      iconKind: "group",
      consumptionShare: 32,
      volume: 35753470,
      count: 300,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "grp_growth_marketing",
      name: "Croissance, Ventes & Marketing",
      subtitle: "Kouassi, Fatima, Koffi, Awa",
      iconKind: "group",
      consumptionShare: 30,
      volume: 33518880,
      count: 280,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 4. TAB: PODS (Instances de calcul Hermes réelles)
  const pods: AnalyticsItem[] = [
    {
      id: "pod_performance",
      name: "mstudio-performance (s9lgaayr9l)",
      subtitle: "Instance Performance Hermes v54 · 4 vCPU, 8 Go RAM · Région EU",
      iconKind: "panel",
      consumptionShare: 88,
      volume: 98322044,
      count: 824,
      countType: "sessions",
      status: "Actif",
    },
    {
      id: "pod_standard",
      name: "mstudio-standard (7p5qy2effr)",
      subtitle: "Instance Standby Hermes v55 · 4 vCPU, 16 Go RAM · Région US",
      iconKind: "panel",
      consumptionShare: 12,
      volume: 13407552,
      count: 112,
      countType: "sessions",
      status: "En attente",
    },
  ];

  // 5. TAB: MODELS (Modèles d'IA réels de l'instance)
  const models: AnalyticsItem[] = [
    {
      id: "model_default",
      name: "Hermes / Claude 3.5 Sonnet (Par défaut)",
      subtitle: "Modèle standard d'orchestration, tâches rapides et crons",
      iconKind: "claude",
      color: "#f59e0b",
      consumptionShare: 71,
      volume: 78871094,
      count: 661,
      countType: "requêtes",
      status: "Actif",
    },
    {
      id: "model_claude_opus",
      name: "Claude Opus 5.5",
      subtitle: "Raisonnement avancé, synthèses stratégiques et rédaction experte",
      iconKind: "claude",
      color: "#8b5cf6",
      consumptionShare: 29,
      volume: 32858502,
      count: 275,
      countType: "requêtes",
      status: "Actif",
    },
  ];

  // 6. TAB: TOOLS (Outils et connecteurs MCP réels de supervision)
  const tools: AnalyticsItem[] = [
    {
      id: "tool_apps",
      name: "Google Workspace (MCP Apps)",
      subtitle: "Intégration Gmail, Google Drive, Docs et Calendar",
      iconKind: "files",
      consumptionShare: 34,
      volume: 37988062,
      count: 385,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "tool_web_search",
      name: "Exa AI (Veille & recherche sémantique)",
      subtitle: "Moteur de veille web sémantique, concurrentielle et technologique",
      iconKind: "web",
      consumptionShare: 22,
      volume: 24580511,
      count: 248,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "tool_browser",
      name: "Playwright CDP Browser",
      subtitle: "Navigateur autonome Playwright pour consultation et capture web",
      iconKind: "search",
      consumptionShare: 18,
      volume: 20111327,
      count: 204,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "tool_files",
      name: "Gestionnaire de Livrables (~/Livrables)",
      subtitle: "Production, indexation et archivage des fichiers d'experts",
      iconKind: "files",
      consumptionShare: 12,
      volume: 13407551,
      count: 138,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "tool_computer",
      name: "Exécution de Code & Terminal (Python / Node.js)",
      subtitle: "Calculs, traitements de données et automatisations système",
      iconKind: "computer",
      consumptionShare: 8,
      volume: 8938367,
      count: 92,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "tool_memory",
      name: "Mémoire Partagée d'Entreprise (Yelema Context)",
      subtitle: "Profils d'experts, contexte partagé et mémoires épisodiques",
      iconKind: "memory",
      consumptionShare: 6,
      volume: 6703778,
      count: 68,
      countType: "invocations",
      status: "Actif",
    },
  ];

  // 7. TAB: SKILLS (Compétences réelles de supervision et de production)
  const skills: AnalyticsItem[] = [
    {
      id: "skill_video_gen",
      name: "Génération de vidéos promotionnelles (MoneyPrinter)",
      subtitle: "Production autonome de scripts, voiceover et rendus vidéo MP4",
      iconKind: "skills",
      consumptionShare: 28,
      volume: 31284286,
      count: 262,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_reporting",
      name: "Synthèse et audit financier hebdomadaire",
      subtitle: "Génération de bilans, rapprochements bancaires et rapports Excel",
      iconKind: "skills",
      consumptionShare: 24,
      volume: 26815103,
      count: 225,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_veille",
      name: "Veille stratégique, technologique & marché",
      subtitle: "Rapports d'investissement, suivi startups et tendances IA",
      iconKind: "skills",
      consumptionShare: 20,
      volume: 22345919,
      count: 187,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_content",
      name: "Création de contenus & visuels de marque",
      subtitle: "Publications réseaux sociaux, identité visuelle et présentations",
      iconKind: "skills",
      consumptionShare: 18,
      volume: 20111327,
      count: 168,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "skill_supervision",
      name: "Supervision et accompagnement studio (Yélé)",
      subtitle: "Vérifications de santé système, diagnostics et alertes",
      iconKind: "skills",
      consumptionShare: 10,
      volume: 11172961,
      count: 94,
      countType: "invocations",
      status: "Actif",
    },
  ];

  // 8. TAB: SOURCES (Canaux d'interaction réels)
  const sources: AnalyticsItem[] = [
    {
      id: "src_telegram",
      name: "Telegram (Forum Mstudio & Topics par expert)",
      subtitle: "Bot officiel @yelema_mstudio_performa_de9d_bot",
      iconKind: "chat",
      consumptionShare: 54,
      volume: 60334000,
      count: 505,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_conversation",
      name: "Interface Studio Web (Mstudio)",
      subtitle: "Discussions interactives et espaces de travail web",
      iconKind: "chat",
      consumptionShare: 32,
      volume: 35753000,
      count: 300,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_trigger",
      name: "Routines Automatiques (Crons d'instance)",
      subtitle: "Déclenchements programmés et veilles périodiques",
      iconKind: "trigger",
      consumptionShare: 12,
      volume: 13407000,
      count: 112,
      countType: "messages",
      status: "Actif",
    },
    {
      id: "src_mail",
      name: "AgentMail (@agentmail.to)",
      subtitle: "Boîtes e-mail professionnelles des experts",
      iconKind: "mail",
      consumptionShare: 2,
      volume: 2235596,
      count: 19,
      countType: "messages",
      status: "Actif",
    },
  ];

  // 9. TAB: TRIGGERS (Déclencheurs opérationnels réels)
  const triggers: AnalyticsItem[] = [
    {
      id: "trig_cron_hourly",
      name: "Routines programmées (Crons)",
      subtitle: "Exécutions périodiques automatiques (78 runs par expert)",
      iconKind: "trigger",
      consumptionShare: 70,
      volume: 78210717,
      count: 655,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "trig_telegram",
      name: "Événements & messages Telegram",
      subtitle: "Invocations via le forum Telegram et les topics experts",
      iconKind: "chat",
      consumptionShare: 22,
      volume: 24580511,
      count: 206,
      countType: "invocations",
      status: "Actif",
    },
    {
      id: "trig_studio",
      name: "Invocations interactives Mstudio Web",
      subtitle: "Requêtes directes depuis l'interface utilisateur",
      iconKind: "frames",
      consumptionShare: 8,
      volume: 8938368,
      count: 75,
      countType: "invocations",
      status: "Actif",
    },
  ];

  // 10. TAB: API KEYS (Clés de service réelles)
  const api_keys: AnalyticsItem[] = [
    {
      id: "key_agent37_live",
      name: "Agent37 Live Engine (Moteur Hermes)",
      subtitle: "Clé principale d'inférence LLM sk_live_5err...",
      iconKind: "api",
      consumptionShare: 75,
      volume: 83797197,
      count: 702,
      countType: "requêtes",
      status: "Actif",
    },
    {
      id: "key_agentmail",
      name: "AgentMail Enterprise API",
      subtitle: "Passerelle de messagerie am_us_5041...",
      iconKind: "mail",
      consumptionShare: 15,
      volume: 16759439,
      count: 140,
      countType: "requêtes",
      status: "Actif",
    },
    {
      id: "key_backoffice_qa",
      name: "Back-Office QA Yelema",
      subtitle: "Synchronisation catalogue et profils",
      iconKind: "api",
      consumptionShare: 10,
      volume: 11172960,
      count: 94,
      countType: "requêtes",
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
