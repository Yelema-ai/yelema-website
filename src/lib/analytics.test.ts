import test from "node:test";
import assert from "node:assert/strict";
import { computeAnalytics, type ComputeAnalyticsParams } from "./analytics.ts";
import type { DiscoveredExpert, ExpertUsageData, IncidentAlertData, RawFileInfo, RawSessionInfo } from "./yele-supervision.ts";

test("computeAnalytics: filters sessions by period cutoff", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  const oneHourAgo = now - 3600 * 1000;
  const threeDaysAgo = now - 3 * 24 * 3600 * 1000;
  const tenDaysAgo = now - 10 * 24 * 3600 * 1000;

  const sessions: RawSessionInfo[] = [
    { id: "s1", profile: "fatima", last_active: oneHourAgo, started_at: oneHourAgo },
    { id: "s2", profile: "fatima", last_active: threeDaysAgo, started_at: threeDaysAgo },
    { id: "s3", profile: "kouassi", last_active: tenDaysAgo, started_at: tenDaysAgo },
  ];

  const experts: DiscoveredExpert[] = [
    { id: "fatima", name: "Fatima", description: "Directrice Marketing" },
    { id: "kouassi", name: "Kouassi", description: "Expert Comptable" },
  ];

  // 1. Aujourd'hui
  const resToday = computeAnalytics({
    sessions,
    usageStats: null,
    experts,
    deliverables: [],
    period: "aujourdhui",
    now,
  });
  assert.equal(resToday.totals.sessions, 1);
  assert.equal(resToday.experts.find((e) => e.id === "fatima")?.sessionsCount, 1);
  assert.equal(resToday.experts.find((e) => e.id === "kouassi")?.sessionsCount, 0);

  // 2. 7 jours
  const res7Days = computeAnalytics({
    sessions,
    usageStats: null,
    experts,
    deliverables: [],
    period: "7_jours",
    now,
  });
  assert.equal(res7Days.totals.sessions, 2);
  assert.equal(res7Days.experts.find((e) => e.id === "fatima")?.sessionsCount, 2);
  assert.equal(res7Days.experts.find((e) => e.id === "kouassi")?.sessionsCount, 0);

  // 3. 30 jours
  const res30Days = computeAnalytics({
    sessions,
    usageStats: null,
    experts,
    deliverables: [],
    period: "30_jours",
    now,
  });
  assert.equal(res30Days.totals.sessions, 3);
  assert.equal(res30Days.experts.find((e) => e.id === "fatima")?.sessionsCount, 2);
  assert.equal(res30Days.experts.find((e) => e.id === "kouassi")?.sessionsCount, 1);
});

test("computeAnalytics: aggregates token metrics and percentages correctly", () => {
  const now = Date.now();
  const experts: DiscoveredExpert[] = [
    { id: "fatima", name: "Fatima", description: "Marketing" },
    { id: "kouassi", name: "Kouassi", description: "Finance" },
  ];

  const sessions: RawSessionInfo[] = [
    { id: "s1", profile: "fatima", last_active: now },
    { id: "s2", profile: "fatima", last_active: now },
    { id: "s3", profile: "kouassi", last_active: now },
  ];

  const usageStats: Record<string, ExpertUsageData> = {
    fatima: {
      count: 2,
      totalTokens: 7500,
      promptTokens: 5000,
      completionTokens: 2500,
      totalDurationMs: 4000,
      errors: 0,
      models: { "claude-3-5-sonnet": 2 },
    },
    kouassi: {
      count: 1,
      totalTokens: 2500,
      promptTokens: 2000,
      completionTokens: 500,
      totalDurationMs: 1500,
      errors: 0,
      models: { "gpt-4o": 1 },
    },
  };

  const res = computeAnalytics({
    sessions,
    usageStats,
    experts,
    deliverables: [],
    period: "7_jours",
    now,
  });

  assert.equal(res.totals.sessions, 3);
  assert.equal(res.totals.totalTokens, 10000);
  assert.equal(res.totals.promptTokens, 7000);
  assert.equal(res.totals.completionTokens, 3000);

  const fatima = res.experts.find((e) => e.id === "fatima")!;
  assert.equal(fatima.sessionsCount, 2);
  assert.equal(fatima.sessionsPercent, 67); // 2/3 = ~67%
  assert.equal(fatima.tokensCount, 7500);
  assert.equal(fatima.tokensPercent, 75); // 7500 / 10000 = 75%
  assert.deepEqual(fatima.models, ["claude-3-5-sonnet"]);

  const kouassi = res.experts.find((e) => e.id === "kouassi")!;
  assert.equal(kouassi.sessionsCount, 1);
  assert.equal(kouassi.sessionsPercent, 33); // 1/3 = ~33%
  assert.equal(kouassi.tokensCount, 2500);
  assert.equal(kouassi.tokensPercent, 25);
});

test("computeAnalytics: sorts experts by activity (sessions, then tokens, then name)", () => {
  const now = Date.now();
  const experts: DiscoveredExpert[] = [
    { id: "a_expert", name: "Alice", description: "Consultante" },
    { id: "b_expert", name: "Bob", description: "Ingénieur" },
    { id: "c_expert", name: "Charlie", description: "Designer" },
  ];

  const sessions: RawSessionInfo[] = [
    { id: "s1", profile: "c_expert", last_active: now },
    { id: "s2", profile: "b_expert", last_active: now },
    { id: "s3", profile: "b_expert", last_active: now },
  ];

  const usageStats: Record<string, ExpertUsageData> = {
    a_expert: { count: 0, totalTokens: 500, promptTokens: 400, completionTokens: 100, totalDurationMs: 0, errors: 0, models: {} },
    c_expert: { count: 1, totalTokens: 100, promptTokens: 80, completionTokens: 20, totalDurationMs: 0, errors: 0, models: {} },
    b_expert: { count: 2, totalTokens: 200, promptTokens: 150, completionTokens: 50, totalDurationMs: 0, errors: 0, models: {} },
  };

  const res = computeAnalytics({
    sessions,
    usageStats,
    experts,
    deliverables: [],
    period: "7_jours",
    now,
  });

  // b_expert: 2 sessions (top)
  // c_expert: 1 session
  // a_expert: 0 sessions, but 500 tokens
  assert.equal(res.experts[0].id, "b_expert");
  assert.equal(res.experts[1].id, "c_expert");
  assert.equal(res.experts[2].id, "a_expert");
  assert.ok(res.experts[0].color.startsWith("#"));
});

test("computeAnalytics: computes timeline points according to period", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  const sessions: RawSessionInfo[] = [
    { id: "s1", profile: "fatima", last_active: now - 3600 * 1000 },
    { id: "s2", profile: "fatima", last_active: now - 2 * 24 * 3600 * 1000 },
  ];

  // 1. Aujourd'hui (8 points of 3h)
  const resToday = computeAnalytics({
    sessions,
    usageStats: null,
    experts: [],
    deliverables: [],
    period: "aujourdhui",
    now,
  });
  assert.equal(resToday.timeline.length, 8);
  assert.equal(resToday.timeline[0].label, "00h");

  // 2. 7 jours (7 points)
  const res7 = computeAnalytics({
    sessions,
    usageStats: null,
    experts: [],
    deliverables: [],
    period: "7_jours",
    now,
  });
  assert.equal(res7.timeline.length, 7);

  // 3. 30 jours (30 points)
  const res30 = computeAnalytics({
    sessions,
    usageStats: null,
    experts: [],
    deliverables: [],
    period: "30_jours",
    now,
  });
  assert.equal(res30.timeline.length, 30);
});

test("computeAnalytics: computes multi-dimension analytics for workspace experts, models, tools, channels, deliverables", () => {
  const res = computeAnalytics({
    sessions: [{ id: "s1", profile: "fatima", last_active: Date.now() }],
    usageStats: null,
    experts: [{ id: "fatima", name: "Fatima", description: "Directrice Marketing" }],
    deliverables: [
      { name: "Budget_2026.xlsx", size: 1024, modified: Date.now() },
      { name: "Etude_Marche.docx", size: 2048, modified: Date.now() },
    ],
  });

  // 1. Experts (Agents)
  assert.ok(Array.isArray(res.dimensions.experts));
  assert.ok(res.dimensions.experts.length >= 1);
  assert.equal(res.dimensions.experts[0].name, "Fatima");
  assert.equal(res.dimensions.experts[0].subtitle, "Directrice Marketing");
  assert.equal(res.dimensions.experts[0].count, 1);

  // 2. Modèles d'IA
  assert.ok(Array.isArray(res.dimensions.models));
  assert.ok(res.dimensions.models.length >= 1);
  assert.ok(res.dimensions.models.some((m) => m.name.includes("Claude") || m.name.includes("GPT")));

  // 3. Outils & Connecteurs MCP
  assert.ok(Array.isArray(res.dimensions.tools));
  assert.ok(res.dimensions.tools.length >= 4);
  assert.ok(res.dimensions.tools.some((t) => t.id === "tool_files"));
  assert.ok(res.dimensions.tools.some((t) => t.id === "tool_web_search"));

  // 4. Canaux d'interaction & Sources
  assert.ok(Array.isArray(res.dimensions.channels));
  assert.ok(res.dimensions.channels.length >= 3);
  assert.ok(res.dimensions.channels.some((c) => c.id === "src_trigger"));
  assert.ok(res.dimensions.channels.some((c) => c.id === "src_conversation"));

  // 5. Formats de Livrables
  assert.ok(Array.isArray(res.dimensions.deliverables));
  assert.ok(res.dimensions.deliverables.some((d) => d.id === "format-excel"));
  assert.ok(res.dimensions.deliverables.some((d) => d.id === "format-word"));

  // 6. Aliases de compatibilité
  assert.equal(res.dimensions.agents, res.dimensions.experts);
  assert.equal(res.dimensions.sources, res.dimensions.channels);
});

test("computeAnalytics: computes token distribution and ratios", () => {
  const res = computeAnalytics({
    sessions: [{ id: "s1", profile: "fatima", last_active: Date.now() }, { id: "s2", profile: "fatima", last_active: Date.now() }],
    usageStats: {
      fatima: {
        count: 2,
        totalTokens: 10000,
        promptTokens: 8000,
        completionTokens: 2000,
        totalDurationMs: 0,
        errors: 0,
        models: {},
      },
    },
    experts: [],
    deliverables: [],
  });

  assert.equal(res.tokenDistribution.totalTokens, 10000);
  assert.equal(res.tokenDistribution.promptPercent, 80);
  assert.equal(res.tokenDistribution.completionPercent, 20);
  assert.equal(res.tokenDistribution.avgTokensPerSession, 5000); // 10000 / 2
});

test("computeAnalytics: filters out hidden and non-deliverable files", () => {
  const deliverables: RawFileInfo[] = [
    { name: ".hidden_file", size: 100, modified: 1000 },
    { name: "subtitle.srt", size: 200, modified: 2000 },
    { name: "transcript.vtt", size: 200, modified: 3000 },
    { name: "script.py", size: 500, modified: 4000 },
    { name: "notes.txt", size: 150, modified: 5000 },
    { name: "Rapport_Financier_Q3.xlsx", size: 54000, modified: 6000 },
    { name: "Pitch_Deck_Yelema.pptx", size: 125000, modified: 7000 },
    { name: "Video_Promo.mp4", size: 8500000, modified: 8000 },
  ];

  const res = computeAnalytics({
    sessions: [],
    usageStats: null,
    experts: [],
    deliverables,
  });

  assert.equal(res.recentDeliverables.length, 3);
  assert.equal(res.recentDeliverables[0].name, "Video_Promo.mp4");
  assert.equal(res.recentDeliverables[0].kind, "video");
  assert.equal(res.recentDeliverables[1].name, "Pitch_Deck_Yelema.pptx");
  assert.equal(res.recentDeliverables[1].kind, "powerpoint");
  assert.equal(res.recentDeliverables[2].name, "Rapport_Financier_Q3.xlsx");
  assert.equal(res.recentDeliverables[2].kind, "excel");
});

test("computeAnalytics: sets correct health status from alerts", () => {
  // 1. Healthy
  const res1 = computeAnalytics({
    sessions: [],
    usageStats: null,
    experts: [],
    deliverables: [],
    alerts: { totalCronsScanned: 5, telegramStatus: "🟢 Opérationnel", incidents: [], avertissements: [] },
  });
  assert.equal(res1.health.status, "healthy");

  // 2. Warning
  const res2 = computeAnalytics({
    sessions: [],
    usageStats: null,
    experts: [],
    deliverables: [],
    alerts: {
      totalCronsScanned: 5,
      telegramStatus: "🟢 Opérationnel",
      incidents: [],
      avertissements: [{ expert: "fatima", type: "TOKEN_SPIKE", message: "Usage élevé" }],
    },
  });
  assert.equal(res2.health.status, "warning");

  // 3. Incident
  const res3 = computeAnalytics({
    sessions: [],
    usageStats: null,
    experts: [],
    deliverables: [],
    alerts: {
      totalCronsScanned: 5,
      telegramStatus: "🟢 Opérationnel",
      incidents: [{ expert: "fatima", type: "CRON_ERROR", error: "Timeout API" }],
      avertissements: [],
    },
  });
  assert.equal(res3.health.status, "incident");
});

test("computeAnalytics: handles empty inputs gracefully without throwing", () => {
  const res = computeAnalytics({
    sessions: [],
    usageStats: null,
    experts: [],
    deliverables: [],
  });

  assert.equal(res.totals.sessions, 0);
  assert.equal(res.totals.totalTokens, 0);
  assert.equal(res.totals.activeExperts, 0);
  assert.equal(res.totals.totalExperts, 0);
  assert.equal(res.experts.length, 0);
  assert.equal(res.recentDeliverables.length, 0);
  assert.equal(res.timeline.length, 7);
  assert.ok(res.dimensions.tools.length > 0);
  assert.equal(res.health.status, "healthy");
});
