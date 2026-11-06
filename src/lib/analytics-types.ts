// Types & interfaces for Yelema Team & Expert Analytics.
import type { DocKind } from "./drive-links.ts";
import type {
  DiscoveredExpert,
  ExpertUsageData,
  IncidentAlertData,
  RawFileInfo,
  RawSessionInfo,
  TelegramConfig,
  MailConfig,
} from "./yele-supervision.ts";

export type AnalyticsPeriod = "aujourdhui" | "7_jours" | "30_jours";

export const EXPERT_COLORS: string[] = [
  "#8B5CF6", // Violet (Fatima / Marketing / Koffi)
  "#F59E0B", // Ambre (Kouassi / Finance)
  "#10B981", // Émeraude (Djénéba / Commercial)
  "#06B6D4", // Cyan (Awa / Support)
  "#EC4899", // Rose (Adjoua / RH)
  "#3B82F6", // Bleu (Mamadou / Finance)
  "#F97316", // Orange (Fatou / RH)
  "#6366F1", // Indigo (Salif / Opérations)
  "#14B8A6", // Sarcelle (Alioune / Investissement)
  "#EF4444", // Rouge (Ibrahim / Juridique)
  "#EAB308", // Jaune (Nadia / Data)
  "#7C3AED", // Pourpre (Yélé / Supervision)
];

export interface TimeSeriesPoint {
  label: string;
  date: string;
  timestamp: number;
  sessions: number;
  tokens: number;
  expertsActive: number;
  byExpert?: Record<string, number>;
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
  // Compatibilité et dimensions enrichies Mstudio
  experts: AnalyticsItem[];
  channels: AnalyticsItem[];
  mcp: AnalyticsItem[];
  emails: AnalyticsItem[];
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

export interface DailyAuditDay {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  runs: number;
  byExpert: Record<string, number>;
  byModel: Record<string, number>;
}

export interface ToolInfo {
  name: string;
  count: number;
  status?: string;
}

export interface InstanceInfo {
  id: string;
  name: string;
  cpu?: number | null;
  memory?: number | null;
  disk?: number | null;
  status?: string | null;
}

export interface ComputeAnalyticsParams {
  sessions: RawSessionInfo[];
  usageStats: Record<string, ExpertUsageData> | null;
  dailyAudit?: Record<string, DailyAuditDay> | null;
  experts: DiscoveredExpert[];
  deliverables: RawFileInfo[];
  alerts?: IncidentAlertData | null;
  period?: AnalyticsPeriod;
  now?: number;
  membersList?: Array<{ name?: string | null; email: string; role?: string; status?: string }>;
  toolsList?: ToolInfo[];
  skillsList?: string[];
  telegram?: TelegramConfig | null;
  mail?: MailConfig | null;
  instanceInfo?: InstanceInfo | null;
}

/** Converts seconds or ms to epoch ms */

export interface BuildDimensionsParams {
  experts: ExpertMetric[];
  totalTokens: number;
  totalSessionsCount: number;
  deliverables: DeliverableSummary[];
  alerts?: IncidentAlertData | null;
  usageStats?: Record<string, ExpertUsageData> | null;
  dailyAudit?: Record<string, DailyAuditDay> | null;
  membersList?: Array<{ name?: string | null; email: string; role?: string; status?: string }>;
  toolsList?: ToolInfo[];
  skillsList?: string[];
  telegram?: TelegramConfig | null;
  mail?: MailConfig | null;
  instanceInfo?: InstanceInfo | null;
}


