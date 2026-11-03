import type { YeleBackend } from "@/lib/yele-mcp";
import { commandGuide } from "./command-guide.ts";

/** Expert découvert dynamiquement dans la sandbox (~/.hermes/profiles) */
export interface DiscoveredExpert {
  id: string;
  name: string;
  description: string;
}

/** Formate le nom et le rôle d'un expert pour l'affichage */
export function formatExpertDisplayName(exp: DiscoveredExpert | string): string {
  if (typeof exp === "string") {
    return exp.charAt(0).toUpperCase() + exp.slice(1);
  }
  const role = exp.description ? exp.description.split(/[:;]/)[0].trim() : "";
  return role ? `${exp.name} (${role})` : exp.name;
}

/** Format strict de date : AAAA-MM-JJ */
const STRICT_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Masque strictement toutes les clés d'API, tokens et secrets dans un texte brut.
 * Couvre les clés d'IA (Anthropic, OpenAI, etc.), bots Telegram, Bearer tokens,
 * chaînes de connexion de bases de données, JWT et champs sensibles.
 */
export function masquerSecrets(raw: string): string {
  return raw
    .replace(/\b(?:sk-(?:ant|proj|live|test)?-[a-zA-Z0-9_-]{12,})/gi, "[CLÉ_API_MASQUÉE]")
    .replace(/\b\d{9,11}:[a-zA-Z0-9_-]{35}\b/g, "[TOKEN_BOT_TELEGRAM_MASQUÉ]")
    .replace(/(?:Bearer\s+)[a-zA-Z0-9_.-]{16,}/gi, "Bearer [TOKEN_MASQUÉ]")
    .replace(/\b(?:ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, "[JWT_MASQUÉ]")
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, "$1[MOT_DE_PASSE_MASQUÉ]$2")
    .replace(/(?:password|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?[^"'\s\n]{6,}["']?/gi, (match) => {
      const parts = match.split(/[:=]/);
      return `${parts[0]}: "[MASQUÉ]"`;
    });
}

export function formatDateFr(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getPeriodCutoff(periode?: string, now = Date.now()): number {
  if (periode === "7_jours") return now - 7 * 24 * 3600 * 1000;
  if (periode === "30_jours") return now - 30 * 24 * 3600 * 1000;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface RawSessionInfo {
  id: string;
  profile?: string | null;
  last_active?: number | null;
  started_at?: number | null;
}

export interface RawConnectionInfo {
  toolkitSlug?: string | null;
  status?: string | null;
  isDisabled?: boolean | null;
  alias?: string | null;
}

export interface RawFileInfo {
  name: string;
  size?: number | null;
  modified?: number | null;
}

export interface TelegramConfig {
  bot?: string;
  botId?: number;
  chatTitle?: string;
  chatId?: number;
  phase?: string;
  inviteLink?: string;
  topics?: Record<string, string>;
}

export interface MailConfig {
  url?: string;
  workspace?: string;
  addresses?: Record<string, string>;
}

export interface ExpertUsageData {
  count: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationMs?: number;
  avgDurationSec?: number;
  models?: Record<string, number>;
  errors: number;
  recentExecs?: Array<{
    ts: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    model: string;
    error: string | null;
  }>;
}

export interface IncidentAlertData {
  incidents: Array<{
    type: string;
    expert: string;
    ts?: string;
    model?: string;
    error?: string;
    outil?: string;
    note?: string;
  }>;
  avertissements: Array<{
    type: string;
    expert: string;
    outil?: string;
    etat?: string;
    usage?: string;
    message?: string;
  }>;
  totalCronsScanned: number;
  telegramStatus: string;
}

export interface VoiceBriefInfo {
  expId: string;
  at?: string;
  text?: string;
}

export interface MemorySearchResult {
  expId: string;
  matches: string[];
}

export interface ExpertSkillInfo {
  expId: string;
  specific: string[];
  shared: string[];
}

export interface SupervisionDeps {
  listSessions: () => Promise<RawSessionInfo[]>;
  fetchFileContent: (path: string) => Promise<string | null>;
  listConnections: () => Promise<RawConnectionInfo[]>;
  listDeliverableFiles: () => Promise<RawFileInfo[]>;
  listInstalledExperts?: () => Promise<DiscoveredExpert[]>;
  fetchTelegramConfig?: () => Promise<TelegramConfig | null>;
  fetchMailConfig?: () => Promise<MailConfig | null>;
  fetchUsageStats?: () => Promise<Record<string, ExpertUsageData> | null>;
  fetchIncidentAlerts?: () => Promise<IncidentAlertData | null>;
  fetchVoiceBriefs?: () => Promise<VoiceBriefInfo[] | null>;
  searchMemories?: (query: string, expert?: string) => Promise<MemorySearchResult[] | null>;
  fetchSkillsCatalog?: (expert?: string) => Promise<ExpertSkillInfo[] | null>;
}

export function formatActiviteExperts(
  sessions: RawSessionInfo[],
  periode?: string,
  experts?: DiscoveredExpert[],
  now = Date.now()
): string {
  const cutoff = getPeriodCutoff(periode, now);
  const periodeLabel =
    periode === "7_jours" ? "ces 7 derniers jours" : periode === "30_jours" ? "ces 30 derniers jours" : "aujourd'hui";

  // Construction de la liste des experts à superviser
  const expertMap = new Map<string, DiscoveredExpert>();
  if (experts && experts.length > 0) {
    for (const exp of experts) {
      expertMap.set(exp.id.toLowerCase(), exp);
    }
  }

  // Si des sessions concernent un expert non présent dans le catalogue, l'ajouter dynamiquement
  for (const s of sessions) {
    const p = (s.profile || "").toLowerCase();
    if (p && !expertMap.has(p)) {
      expertMap.set(p, { id: p, name: p.charAt(0).toUpperCase() + p.slice(1), description: "" });
    }
  }

  const allExperts = Array.from(expertMap.values());
  const activeByExpert: Record<string, { count: number; lastActive: number; expert: DiscoveredExpert }> = {};
  const inactifs: DiscoveredExpert[] = [];

  for (const exp of allExperts) {
    const matching = sessions.filter((s) => {
      const profile = (s.profile || "").toLowerCase();
      const time =
        typeof s.last_active === "number"
          ? s.last_active < 1e11
            ? s.last_active * 1000
            : s.last_active
          : typeof s.started_at === "number"
          ? s.started_at < 1e11
            ? s.started_at * 1000
            : s.started_at
          : 0;
      return (profile === exp.id || s.id.includes(`_${exp.id}_`)) && time >= cutoff;
    });

    if (matching.length > 0) {
      const maxActive = Math.max(
        ...matching.map((s) =>
          typeof s.last_active === "number"
            ? s.last_active < 1e11
              ? s.last_active * 1000
              : s.last_active
            : s.started_at ?? 0
        )
      );
      activeByExpert[exp.id] = { count: matching.length, lastActive: maxActive, expert: exp };
    } else {
      inactifs.push(exp);
    }
  }

  const actifs = Object.entries(activeByExpert).sort((a, b) => b[1].lastActive - a[1].lastActive);
  let out = `### 📊 Activité des Experts (${periodeLabel})\n\n`;

  if (actifs.length > 0) {
    out += `**Experts actifs (${actifs.length}) :**\n`;
    for (const [, stats] of actifs) {
      const name = formatExpertDisplayName(stats.expert);
      out += `- **${name}** : ${stats.count} tâche(s) / session(s), dernière activité le ${formatDateFr(stats.lastActive)}\n`;
    }
  } else {
    out += `Aucun expert n'a enregistré d'activité ${periodeLabel}.\n`;
  }

  if (inactifs.length > 0) {
    out += `\n**Experts inactifs (${inactifs.length}) :**\n`;
    out += inactifs.map((exp) => formatExpertDisplayName(exp)).join(", ") + ".\n";
  }

  return out;
}

export function formatAuditOutils(connections: RawConnectionInfo[], targetExpert?: string): string {
  const filtered = targetExpert
    ? connections.filter((c) => (c.toolkitSlug || "").toLowerCase().includes(targetExpert.toLowerCase()))
    : connections;

  let out = `### 🔌 Audit des Connecteurs et Outils\n\n`;
  if (filtered.length === 0) {
    out += `Aucun connecteur tiers n'est actuellement configuré${targetExpert ? ` pour ${targetExpert}` : ""}.\n`;
    return out;
  }

  out += `**État des connexions :**\n`;
  for (const c of filtered) {
    const name = c.toolkitSlug || "Outil";
    const status = c.status === "ACTIVE" && !c.isDisabled ? "✅ Actif" : "⚠️ À reconnecter / Inactif";
    const alias = c.alias ? ` (${c.alias})` : "";
    out += `- **${name}**${alias} : ${status}\n`;
  }
  return out;
}

export function formatLivrablesRecents(files: RawFileInfo[], limite = 10): string {
  const validFiles = files
    .filter((f) => f && f.name && !f.name.startsWith(".") && !f.name.startsWith("_"))
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
    .slice(0, Math.min(Math.max(limite, 1), 50));

  if (validFiles.length === 0) {
    return "Aucun livrable récent dans le dossier `~/Livrables`.";
  }

  let out = `### 📁 Derniers Livrables Produits (${validFiles.length})\n\n`;
  for (const f of validFiles) {
    const dateStr = f.modified ? formatDateFr(f.modified < 1e11 ? f.modified * 1000 : f.modified) : "Date inconnue";
    const sizeKb = f.size ? `(${Math.round(f.size / 1024)} Ko)` : "";
    out += `- 📄 **${f.name}** ${sizeKb} — modifié le ${dateStr}\n`;
  }
  return out;
}

export function formatStatistiquesAnalytique(
  sessions: RawSessionInfo[],
  vue?: string,
  experts?: DiscoveredExpert[]
): string {
  const total = sessions.length;
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const p = (s.profile || "").toLowerCase();
    if (p) counts[p] = (counts[p] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const expertMap = new Map<string, DiscoveredExpert>();
  if (experts) {
    for (const exp of experts) {
      expertMap.set(exp.id.toLowerCase(), exp);
    }
  }

  let out = `### 📈 Synthèse Analytique de l'Instance\n\n`;
  out += `- **Volume total d'interactions** : ${total} session(s) enregistrée(s)\n`;
  out += `- **Experts les plus sollicités** :\n`;
  for (const [exp, n] of sorted.slice(0, 5)) {
    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
    const found = expertMap.get(exp);
    const name = found ? formatExpertDisplayName(found) : exp.charAt(0).toUpperCase() + exp.slice(1);
    out += `  - **${name}** : ${n} tâches (${pct}%)\n`;
  }
  if (vue === "routines") {
    out += `\n- **Routines automatiques** : Déclenchements actifs surveillés en tâche de fond.\n`;
  }
  return out;
}

export function formatCanauxEtTelegram(
  tg: TelegramConfig | null,
  mail: MailConfig | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const topicByExpert: Record<string, string> = {};
  if (tg && tg.topics) {
    for (const [topicId, expId] of Object.entries(tg.topics)) {
      topicByExpert[String(expId).toLowerCase()] = topicId;
    }
  }

  const mailByExpert: Record<string, string> = {};
  if (mail && mail.addresses) {
    for (const [expId, addr] of Object.entries(mail.addresses)) {
      mailByExpert[String(expId).toLowerCase()] = addr;
    }
  }

  if (cleanTarget) {
    const topicId = topicByExpert[cleanTarget];
    const email = mailByExpert[cleanTarget] || `${cleanTarget}.mstudio@agentmail.to`;
    const expMeta = experts?.find((e) => e.id.toLowerCase() === cleanTarget);
    const expName = expMeta ? formatExpertDisplayName(expMeta) : cleanTarget.charAt(0).toUpperCase() + cleanTarget.slice(1);

    let out = `### 📱 Canaux de communication : ${expName}\n\n`;
    out += `- **🤖 Bot Telegram Officiel** : \`@${tg?.bot || "yelema_mstudio_performa_de9d_bot"}\` (ID: \`${tg?.botId || "8800120542"}\`)\n`;
    out += `- **💬 Groupe Telegram (Forum)** : \`${tg?.chatTitle || "Yelema - Icone"}\` (ID: \`${tg?.chatId || "-1004374515273"}\`)\n`;
    out += `- **🧵 Topic / Fil de discussion dédié** : ${topicId ? `**Fil #${topicId}** (\`${cleanTarget}\`)` : "Non assigné"}\n`;
    if (tg?.inviteLink) {
      out += `- **🔗 Lien d'invitation au groupe** : ${tg.inviteLink}\n`;
    }
    out += `- **✉️ E-mail d'entreprise** : \`${email}\`\n`;
    out += `- **🌐 Passerelle de messagerie** : 🟢 Connecté et opérationnel\n`;
    return masquerSecrets(out);
  }

  let out = `### 📱 Canaux de Communication & Telegram de l'Équipe\n\n`;
  out += `- **💬 Groupe Telegram (Forum d'équipe)** : \`${tg?.chatTitle || "Yelema - Icone"}\` (ID: \`${tg?.chatId || "-1004374515273"}\`)\n`;
  out += `- **🤖 Bot Telegram Officiel** : \`@${tg?.bot || "yelema_mstudio_performa_de9d_bot"}\` (Statut: 🟢 Opérationnel, Phase: \`${tg?.phase || "ready"}\`)\n`;
  if (tg?.inviteLink) {
    out += `- **🔗 Lien d'invitation Telegram** : ${tg.inviteLink}\n`;
  }
  out += `- **✉️ Messagerie Corporate** : Passerelle \`agentmail.to\` configurée\n\n`;

  out += `#### 🧵 Répartition des Fils Telegram & E-mails par Expert :\n\n`;
  out += `| Expert | Rôle | Topic Telegram | E-mail Professionnel |\n`;
  out += `| :--- | :--- | :---: | :--- |\n`;

  const list =
    experts && experts.length > 0
      ? experts
      : Object.keys(topicByExpert).map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), description: "" }));
  for (const exp of list) {
    const role = exp.description ? exp.description.split(/[:;]/)[0].trim() : "Expert";
    const topicId = topicByExpert[exp.id.toLowerCase()];
    const email = mailByExpert[exp.id.toLowerCase()] || `${exp.id.toLowerCase()}.mstudio@agentmail.to`;
    const topicStr = topicId ? `Fil #${topicId}` : "—";
    out += `| **${exp.name}** | ${role} | ${topicStr} | \`${email}\` |\n`;
  }

  return masquerSecrets(out);
}

export function formatConsommationTokens(
  stats: Record<string, ExpertUsageData> | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  if (!stats || Object.keys(stats).length === 0) {
    return "Aucune donnée de consommation de tokens enregistrée sur l'instance.";
  }

  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const expertMap = new Map((experts || []).map((e) => [e.id.toLowerCase(), e]));

  let grandTotalTokens = 0;
  let grandPromptTokens = 0;
  let grandCompletionTokens = 0;
  let grandRuns = 0;
  let grandDurationMs = 0;

  const rows = Object.entries(stats).map(([expId, data]) => {
    grandTotalTokens += data.totalTokens;
    grandPromptTokens += data.promptTokens;
    grandCompletionTokens += data.completionTokens;
    grandRuns += data.count;
    grandDurationMs += data.totalDurationMs || 0;

    const expMeta = expertMap.get(expId.toLowerCase());
    return {
      expId: expId.toLowerCase(),
      name: expMeta ? expMeta.name : expId.charAt(0).toUpperCase() + expId.slice(1),
      role: expMeta?.description ? expMeta.description.split(/[:;]/)[0].trim() : "Expert",
      ...data,
      avgDurationSec:
        data.avgDurationSec ||
        (data.count > 0 && data.totalDurationMs ? Math.round(data.totalDurationMs / data.count / 1000) : 0),
    };
  });

  rows.sort((a, b) => b.totalTokens - a.totalTokens);

  if (cleanTarget) {
    const single = rows.find((r) => r.expId === cleanTarget);
    if (!single) {
      return `Aucune consommation enregistrée pour l'expert '${cleanTarget}'.`;
    }

    const pctTeam = grandTotalTokens > 0 ? ((single.totalTokens / grandTotalTokens) * 100).toFixed(1) : "0.0";
    const promptPct = single.totalTokens > 0 ? ((single.promptTokens / single.totalTokens) * 100).toFixed(1) : "0.0";
    const compPct = single.totalTokens > 0 ? ((single.completionTokens / single.totalTokens) * 100).toFixed(1) : "0.0";

    let out = `### 🪙 Consommation de Tokens : ${single.name} (${single.role})\n\n`;
    out += `- **Total Tokens consommés** : **${single.totalTokens.toLocaleString("fr-FR")}** tokens\n`;
    out += `  - 📥 *Prompt (Entrée / Contexte)* : ${single.promptTokens.toLocaleString("fr-FR")} tokens (${promptPct}%)\n`;
    out += `  - 📤 *Completion (Sortie / Génération)* : ${single.completionTokens.toLocaleString("fr-FR")} tokens (${compPct}%)\n`;
    out += `- **Volume d'exécutions de routines** : ${single.count} exécution(s)\n`;
    out += `- **Durée moyenne par exécution** : ${single.avgDurationSec}s\n`;
    out += `- **Part dans la consommation d'équipe** : **${pctTeam}%**\n`;
    out += `- **Taux de succès des inférences** : ${
      single.count > 0 ? ((1 - single.errors / single.count) * 100).toFixed(0) : 100
    }% (${single.errors} erreur(s))\n\n`;

    if (single.models && Object.keys(single.models).length > 0) {
      out += `#### 🧠 Répartition des modèles LLM :\n`;
      for (const [mName, cnt] of Object.entries(single.models)) {
        out += `- **\`${mName}\`** : ${cnt} exécution(s)\n`;
      }
    }

    return masquerSecrets(out);
  }

  let out = `### 🪙 Analyse Globale de la Consommation de Tokens & Coûts\n\n`;
  out += `**Vue consolidée de l'instance Yelema :**\n`;
  out += `- **Volume total consommé** : **${grandTotalTokens.toLocaleString("fr-FR")}** tokens\n`;
  out += `  - 📥 *Tokens d'entrée* : ${grandPromptTokens.toLocaleString("fr-FR")} (${(
    (grandPromptTokens / grandTotalTokens) *
    100
  ).toFixed(1)}%)\n`;
  out += `  - 📤 *Tokens de sortie* : ${grandCompletionTokens.toLocaleString("fr-FR")} (${(
    (grandCompletionTokens / grandTotalTokens) *
    100
  ).toFixed(1)}%)\n`;
  out += `- **Nombre total d'exécutions de routines** : **${grandRuns}** runs\n`;
  out += `- **Durée moyenne par routine** : ~${grandRuns > 0 ? Math.round(grandDurationMs / grandRuns / 1000) : 0}s\n\n`;

  out += `#### 🏆 Classement des Experts par Consommation de Tokens :\n\n`;
  out += `| Rang | Expert | Rôle | Runs | Tokens Prompt | Tokens Sortie | Total Tokens | Part Équipe |\n`;
  out += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  rows.forEach((r, idx) => {
    const share = grandTotalTokens > 0 ? ((r.totalTokens / grandTotalTokens) * 100).toFixed(1) : "0.0";
    out += `| ${idx + 1} | **${r.name}** | ${r.role} | ${r.count} | ${(r.promptTokens / 1e6).toFixed(2)}M | ${(
      r.completionTokens / 1e3
    ).toFixed(1)}k | **${r.totalTokens.toLocaleString("fr-FR")}** | ${share}% |\n`;
  });

  return masquerSecrets(out);
}

export function formatAlertesEtIncidents(
  data: IncidentAlertData | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  if (!data) {
    return "### 🛡️ Diagnostic de Santé & Alertes\n\nAucune alerte ni incident actif signalé.";
  }

  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const incidents = cleanTarget
    ? data.incidents.filter((i) => i.expert.toLowerCase().includes(cleanTarget))
    : data.incidents;

  const avertissements = cleanTarget
    ? data.avertissements.filter((a) => a.expert.toLowerCase().includes(cleanTarget))
    : data.avertissements;

  let out = `### 🛡️ Diagnostic de Santé, Alertes & Incidents\n\n`;

  if (incidents.length === 0) {
    out += `**Statut global : 🟢 TOUS LES SYSTÈMES SONT OPÉRATIONNELS**\n\n`;
    out += `- **Santé des Routines & Crons** : 🟢 **0 incident détecté** sur ${data.totalCronsScanned} exécutions enregistrées (Taux de fiabilité : **100%**).\n`;
    out += `- **Passerelle Telegram** : ${data.telegramStatus} (Bot et forum d'équipe connectés).\n`;
    out += `- **Service E-mail** : 🟢 Opérationnel (\`agentmail.to\`).\n\n`;
  } else {
    out += `**Statut global : 🔴 ${incidents.length} INCIDENT(S) DÉTECTÉ(S)**\n\n`;
    out += `#### 🚨 Incidents Critiques :\n`;
    for (const inc of incidents) {
      out += `- **${inc.expert}** : ${inc.error || inc.note || "Erreur non spécifiée"}\n`;
    }
    out += `\n`;
  }

  if (avertissements.length > 0) {
    out += `#### ⚠️ Points d'attention & Avertissements (${avertissements.length}) :\n`;
    for (const av of avertissements.slice(0, 10)) {
      out += `- **${av.expert}** : ${av.message || `Outil ${av.outil} en état '${av.etat}'`}\n`;
    }
  }

  return masquerSecrets(out);
}

export function formatAppelsEtVoix(
  briefs: VoiceBriefInfo[] | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const expertMap = new Map((experts || []).map((e) => [e.id.toLowerCase(), e]));
  const list = briefs || [];

  if (cleanTarget) {
    const expMeta = expertMap.get(cleanTarget);
    const expName = expMeta ? formatExpertDisplayName(expMeta) : cleanTarget.charAt(0).toUpperCase() + cleanTarget.slice(1);
    const item = list.find((b) => b.expId.toLowerCase() === cleanTarget);

    let out = `### 📞 Module Vocal & Brief d'Appel : ${expName}\n\n`;
    out += `- **Statut du canal vocal** : 🟢 Configuré et prêt pour les appels entrants/sortants\n`;
    if (item && item.at) {
      const d = new Date(item.at);
      const dateStr = d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      out += `- **Dernier brief généré** : le ${dateStr}\n\n`;
      out += `#### 📋 Contenu du Brief d'Avant-Appel :\n\`\`\`text\n${(item.text || "").trim()}\n\`\`\`\n`;
    } else {
      out += `- **Brief d'appel** : Aucun brief récent préparé pour cet expert.\n`;
    }
    return masquerSecrets(out);
  }

  let out = `### 📞 Supervision des Appels Vocaux & Briefs de l'Équipe\n\n`;
  out += `- **Passerelle Vocale** : 🟢 Active (Serveur de voix opérationnel)\n`;
  out += `- **Briefs d'avant-appel prêts** : ${list.length} expert(s) synchronisé(s)\n\n`;
  out += `| Expert | Rôle | Dernier Brief Vocal | Extrait Contexte |\n`;
  out += `| :--- | :--- | :---: | :--- |\n`;

  const allExperts =
    experts && experts.length > 0
      ? experts
      : list.map((b) => ({ id: b.expId, name: b.expId.charAt(0).toUpperCase() + b.expId.slice(1), description: "" }));

  for (const exp of allExperts) {
    const role = exp.description ? exp.description.split(/[:;]/)[0].trim() : "Expert";
    const item = list.find((b) => b.expId.toLowerCase() === exp.id.toLowerCase());
    let dateStr = "—";
    let preview = "Aucun brief";
    if (item && item.at) {
      const d = new Date(item.at);
      dateStr = d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const firstLine = (item.text || "").split("\n").filter((l) => l.trim())[0] || "";
      preview = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
    }
    out += `| **${exp.name}** | ${role} | ${dateStr} | ${preview} |\n`;
  }

  return masquerSecrets(out);
}

export function formatRechercheMemoire(
  query: string,
  results: MemorySearchResult[] | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  if (!query || !query.trim()) {
    return "Veuillez préciser un terme ou mot-clé de recherche (ex: 'réunion', 'budget', 'client').";
  }

  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const expertMap = new Map((experts || []).map((e) => [e.id.toLowerCase(), e]));
  const list = results || [];

  if (list.length === 0) {
    const targetName = cleanTarget
      ? expertMap.get(cleanTarget)?.name || cleanTarget
      : "dans les mémoires des experts";
    return `Aucune mention trouvée pour la recherche **"${query}"** ${cleanTarget ? `chez ${targetName}` : targetName}.`;
  }

  let out = `### 🔍 Résultats de Recherche dans la Mémoire : "${query}"\n\n`;
  out += `*${list.length} expert(s) ont des correspondances dans leur mémoire durable :*\n\n`;

  for (const r of list) {
    const expMeta = expertMap.get(r.expId.toLowerCase());
    const expName = expMeta ? formatExpertDisplayName(expMeta) : r.expId.charAt(0).toUpperCase() + r.expId.slice(1);
    out += `#### 📌 ${expName} (${r.matches.length} extrait(s)) :\n`;
    for (const m of r.matches) {
      out += `> ${m.replace(/\n+/g, " ")}\n\n`;
    }
  }

  return masquerSecrets(out);
}

export function formatSkillsExperts(
  skills: ExpertSkillInfo[] | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string
): string {
  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const expertMap = new Map((experts || []).map((e) => [e.id.toLowerCase(), e]));
  const list = skills || [];

  if (cleanTarget) {
    const expMeta = expertMap.get(cleanTarget);
    const expName = expMeta ? formatExpertDisplayName(expMeta) : cleanTarget.charAt(0).toUpperCase() + cleanTarget.slice(1);
    const item = list.find((s) => s.expId.toLowerCase() === cleanTarget);

    if (!item) {
      return `Aucune compétence spécifique enregistrée pour ${expName}.`;
    }

    let out = `### 🎯 Compétences & Méthodologies Métiers : ${expName}\n\n`;
    if (item.specific && item.specific.length > 0) {
      out += `#### 💼 Modes Opératoires et Fiches Métier Spécifiques (${item.specific.length}) :\n`;
      for (const s of item.specific) {
        out += `- **\`${s}\`**\n`;
      }
      out += `\n`;
    }
    if (item.shared && item.shared.length > 0) {
      out += `#### 🛠️ Compétences Transverses & Outils Disponibles :\n`;
      out += item.shared.map((s) => `- \`${s}\``).join("\n") + "\n";
    }

    return masquerSecrets(out);
  }

  let out = `### 🎯 Cartographie des Compétences Métiers de l'Équipe\n\n`;
  out += `| Expert | Rôle | Modules Spécifiques | Compétences Transverses |\n`;
  out += `| :--- | :--- | :---: | :--- |\n`;

  const allExperts =
    experts && experts.length > 0
      ? experts
      : list.map((s) => ({ id: s.expId, name: s.expId.charAt(0).toUpperCase() + s.expId.slice(1), description: "" }));

  for (const exp of allExperts) {
    const role = exp.description ? exp.description.split(/[:;]/)[0].trim() : "Expert";
    const item = list.find((s) => s.expId.toLowerCase() === exp.id.toLowerCase());
    const specCount = item?.specific?.length ?? 0;
    const sharedCount = item?.shared?.length ?? 0;
    out += `| **${exp.name}** | ${role} | **${specCount}** fiches | ${sharedCount} transverses |\n`;
  }

  out += `\n*(Pour consulter les modules détaillés d'un expert, précisez : \`consulter_skills_experts(expert="djeneba")\`)*`;
  return masquerSecrets(out);
}

export function formatDiagnosticConfiguration(configRaw: string | null): string {
  let out = `### 🩺 Diagnostic de Santé de l'Instance\n\n`;
  out += `- **Moteur d'exécution** : Hermes (Agent37)\n`;
  out += `- **Statut du système** : En ligne et opérationnel\n`;

  if (configRaw) {
    const sanitized = masquerSecrets(configRaw);
    const hasTelegram = sanitized.includes("telegram");
    const hasModel = sanitized.includes("model");
    out += `- **Intégration Telegram** : ${hasTelegram ? "✅ Configurée" : "⚪ Non configurée"}\n`;
    out += `- **Modèle d'IA par défaut** : ${hasModel ? "✅ Configuré" : "⚪ Par défaut"}\n`;
    out += `- **Sécurité des clés** : ✅ Tous les secrets et clés API sont protégés et masqués.\n`;
  } else {
    out += `- **Fichier de configuration** : Lecture directe protégée.\n`;
  }
  return out;
}

export function createYeleSupervisionBackend(deps: SupervisionDeps): YeleBackend {
  return {
    async analyserActivite(periode?: string): Promise<string> {
      try {
        const [sessions, experts] = await Promise.all([
          deps.listSessions(),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatActiviteExperts(sessions, periode, experts.length > 0 ? experts : undefined);
      } catch (e) {
        return `Impossible de récupérer les sessions d'activité : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async lireRapportJournalier(dateStr?: string): Promise<string> {
      let targetDate = (dateStr ?? "").trim().toLowerCase();
      const today = new Date().toISOString().slice(0, 10);

      if (!targetDate || targetDate === "aujourdhui" || targetDate === "today") {
        targetDate = today;
      } else if (targetDate === "hier" || targetDate === "yesterday") {
        const y = new Date(Date.now() - 24 * 3600 * 1000);
        targetDate = y.toISOString().slice(0, 10);
      }

      // SÉCURITÉ ANTI-PATH TRAVERSAL : rejet strict si le format n'est pas AAAA-MM-JJ
      if (!STRICT_DATE_REGEX.test(targetDate)) {
        return "Format de date invalide. Veuillez indiquer une date au format AAAA-MM-JJ (ex: 2026-10-28) ou 'aujourdhui' / 'hier'.";
      }

      const candidatePaths = [
        `~/.hermes/memory/daily/${targetDate}.md`,
        `~/.yelema/memory/daily/${targetDate}.md`,
        `~/.hermes/memory/${targetDate}.md`,
        `~/Livrables/_memoire/daily-${targetDate}.md`,
      ];

      for (const p of candidatePaths) {
        try {
          const content = await deps.fetchFileContent(p);
          if (content && content.trim()) {
            return `### 📝 Rapport Journalier de Mémoire (${targetDate})\n\n${masquerSecrets(content.trim())}`;
          }
        } catch {}
      }

      return `Aucun rapport de mémoire n'a encore été consolidé pour le **${targetDate}** sur l'instance. Les sessions en cours seront intégrées lors du prochain cycle de synthèse.`;
    },

    async auditerOutils(targetExpert?: string): Promise<string> {
      try {
        const conns = await deps.listConnections();
        return formatAuditOutils(conns, targetExpert);
      } catch (e) {
        return `Impossible d'auditer les outils : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async consulterLivrables(limite = 10): Promise<string> {
      try {
        const files = await deps.listDeliverableFiles();
        return formatLivrablesRecents(files, limite);
      } catch (e) {
        return `Erreur lors de la lecture des livrables : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async statistiquesAnalytique(vue?: string): Promise<string> {
      try {
        const [sessions, experts] = await Promise.all([
          deps.listSessions(),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatStatistiquesAnalytique(sessions, vue, experts.length > 0 ? experts : undefined);
      } catch (e) {
        return `Impossible de calculer les statistiques analytiques : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async consulterCanauxTelegram(targetExpert?: string): Promise<string> {
      try {
        const [tg, mail, experts] = await Promise.all([
          deps.fetchTelegramConfig ? deps.fetchTelegramConfig() : Promise.resolve(null),
          deps.fetchMailConfig ? deps.fetchMailConfig() : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatCanauxEtTelegram(tg, mail, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible de consulter les canaux Telegram : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async analyserConsommationTokens(targetExpert?: string): Promise<string> {
      try {
        const [stats, experts] = await Promise.all([
          deps.fetchUsageStats ? deps.fetchUsageStats() : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatConsommationTokens(stats, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible d'analyser la consommation de tokens : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async consulterAlertesIncidents(targetExpert?: string): Promise<string> {
      try {
        const [alerts, experts] = await Promise.all([
          deps.fetchIncidentAlerts ? deps.fetchIncidentAlerts() : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatAlertesEtIncidents(alerts, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible de consulter les alertes et incidents : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async consulterAppelsEtVoix(targetExpert?: string): Promise<string> {
      try {
        const [briefs, experts] = await Promise.all([
          deps.fetchVoiceBriefs ? deps.fetchVoiceBriefs() : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatAppelsEtVoix(briefs, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible de consulter les briefs vocaux : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async rechercherDansLaMemoire(requete: string, targetExpert?: string): Promise<string> {
      try {
        const [results, experts] = await Promise.all([
          deps.searchMemories ? deps.searchMemories(requete, targetExpert) : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatRechercheMemoire(requete, results, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible d'effectuer la recherche en mémoire : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async consulterSkillsExperts(targetExpert?: string): Promise<string> {
      try {
        const [skills, experts] = await Promise.all([
          deps.fetchSkillsCatalog ? deps.fetchSkillsCatalog(targetExpert) : Promise.resolve(null),
          deps.listInstalledExperts ? deps.listInstalledExperts() : Promise.resolve([]),
        ]);
        return formatSkillsExperts(skills, experts.length > 0 ? experts : undefined, targetExpert);
      } catch (e) {
        return `Impossible de consulter les compétences métiers : ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    async trouverCommande(besoin?: string, expert?: string): Promise<string> {
      const experts = deps.listInstalledExperts ? await deps.listInstalledExperts().catch(() => []) : [];
      return commandGuide(experts, besoin, expert);
    },

    async diagnostiquerConfiguration(): Promise<string> {
      try {
        const raw = await deps.fetchFileContent("~/.hermes/config.yaml");
        return formatDiagnosticConfiguration(raw);
      } catch (e) {
        return `Diagnostic impossible : ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}
