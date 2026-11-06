import { agent37, instanceFetch } from "@/lib/agent37";
import { requireAgentAccess, requireUser } from "@/lib/auth";
import { backoffice } from "@/lib/backoffice";
import { withTimeout } from "@/lib/fetch-timeout";
import { handleError, noStore } from "@/lib/http";
import { profileQuery } from "@/lib/profile-id";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import {
  computeAnalytics,
  type AnalyticsPeriod,
  type DailyAuditDay,
  type ToolInfo,
} from "@/lib/analytics";
import type {
  DiscoveredExpert,
  ExpertUsageData,
  IncidentAlertData,
  RawFileInfo,
  RawSessionInfo,
  TelegramConfig,
  MailConfig,
} from "@/lib/yele-supervision";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;
const TIMEOUT_MS = 15_000;

const DISCOVERY_SCRIPT = `
const fs = require('fs');
const path = require('path');
const root = path.join(process.env.HOME || '/home/node', '.hermes/profiles');
const out = [];
if (fs.existsSync(root)) {
  for (const d of fs.readdirSync(root)) {
    if (d.startsWith('.') || d === 'default' || d === 'yele') continue;
    const p = path.join(root, d, 'SOUL.md');
    let name = d.charAt(0).toUpperCase() + d.slice(1);
    let desc = '';
    if (fs.existsSync(p)) {
      try {
        const txt = fs.readFileSync(p, 'utf8');
        const mName = txt.match(/^name:\\s*["\']?(.*?)["\']?\\s*$/m);
        if (mName) name = mName[1].trim();
        const mDesc = txt.match(/^description:\\s*["\']?(.*?)["\']?\\s*$/m);
        if (mDesc) desc = mDesc[1].trim();
      } catch {}
    }
    out.push({ id: d, name, description: desc });
  }
}
console.log(JSON.stringify(out));
`.trim();

const DISCOVERY_B64 = Buffer.from(DISCOVERY_SCRIPT).toString("base64");
const DISCOVER_EXPERTS_COMMAND = `node -e "$(echo '${DISCOVERY_B64}' | base64 -d)"`;

async function discoverInstalledExperts(agentId: string): Promise<DiscoveredExpert[]> {
  try {
    const res = await agent37.exec(agentId, DISCOVER_EXPERTS_COMMAND);
    if (res.exit_code === 0 && res.stdout.trim()) {
      const list = JSON.parse(res.stdout.trim()) as DiscoveredExpert[];
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.warn("[analytics] Échec découverte experts:", e);
  }
  return [];
}

const DIAG_SCRIPT = `
const fs = require('fs');
const path = require('path');
const yelemaDir = '/home/node/.yelema';
const hermesDir = '/home/node/.hermes/profiles';
const globalSkillsDir = '/home/node/.hermes/skills';

let telegram = null;
let mail = null;
try { telegram = JSON.parse(fs.readFileSync(path.join(yelemaDir, 'telegram.json'), 'utf8')); } catch {}
try { mail = JSON.parse(fs.readFileSync(path.join(yelemaDir, 'mail.json'), 'utf8')); } catch {}

const usage = {};
const dailyAudit = {};
const incidents = [];
const avertissements = [];
const toolsMap = {};
const skillsSet = new Set();
let totalCrons = 0;

if (fs.existsSync(globalSkillsDir)) {
  try {
    for (const s of fs.readdirSync(globalSkillsDir)) {
      if (!s.startsWith('.')) skillsSet.add(s);
    }
  } catch {}
}

if (fs.existsSync(hermesDir)) {
  for (const exp of fs.readdirSync(hermesDir)) {
    if (exp.startsWith('.') || exp === 'default' || exp === 'yele') continue;

    const sDir = path.join(hermesDir, exp, 'skills');
    if (fs.existsSync(sDir)) {
      try {
        for (const s of fs.readdirSync(sDir)) {
          if (!s.startsWith('.')) skillsSet.add(s);
        }
      } catch {}
    }

    const cFile = path.join(yelemaDir, 'profiles', exp, 'connecteurs.json');
    if (fs.existsSync(cFile)) {
      try {
        const cData = JSON.parse(fs.readFileSync(cFile, 'utf8'));
        if (cData.outils && Array.isArray(cData.outils)) {
          for (const o of cData.outils) {
            const nom = o.nom || 'Outil';
            if (!toolsMap[nom]) toolsMap[nom] = { count: 0, status: 'ok' };
            toolsMap[nom].count++;
            if (o.etat === 'erreur') {
              toolsMap[nom].status = 'erreur';
              incidents.push({ type: 'CONNECTOR_ERROR', expert: exp, outil: nom, note: o.note });
            } else if (o.etat !== 'ok') {
              avertissements.push({ type: 'CONNECTOR_WARNING', expert: exp, outil: nom, etat: o.etat });
            }
          }
        }
      } catch {}
    }

    const f = path.join(hermesDir, exp, 'cron', 'usage_audit.jsonl');
    let totalTokens = 0, promptTokens = 0, completionTokens = 0, totalDurationMs = 0, errors = 0, runs = 0;
    const models = {};
    if (fs.existsSync(f)) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.trim().split(/\\r?\\n/).filter(Boolean);
        for (const l of lines) {
          totalCrons++;
          try {
            const row = JSON.parse(l);
            const t = row.total_tokens || 0;
            const pt = row.prompt_tokens || 0;
            const ct = row.completion_tokens || 0;
            const dur = row.duration_ms || 0;
            totalTokens += t;
            promptTokens += pt;
            completionTokens += ct;
            totalDurationMs += dur;
            runs++;

            const day = (row.ts || '').slice(0, 10);
            if (day) {
              if (!dailyAudit[day]) {
                dailyAudit[day] = { totalTokens: 0, promptTokens: 0, completionTokens: 0, runs: 0, byExpert: {}, byModel: {} };
              }
              dailyAudit[day].totalTokens += t;
              dailyAudit[day].promptTokens += pt;
              dailyAudit[day].completionTokens += ct;
              dailyAudit[day].runs += 1;
              dailyAudit[day].byExpert[exp] = (dailyAudit[day].byExpert[exp] || 0) + t;
              const m = row.model || 'default';
              dailyAudit[day].byModel[m] = (dailyAudit[day].byModel[m] || 0) + t;
            }

            if (row.error) {
              errors++;
              incidents.push({ type: 'CRON_ERROR', expert: exp, ts: row.ts, model: row.model, error: row.error });
            }
            if (row.model) models[row.model] = (models[row.model] || 0) + 1;
          } catch {}
        }
      } catch {}
    }
    usage[exp] = { count: runs, totalTokens, promptTokens, completionTokens, totalDurationMs, errors, models };
  }
}

const toolsList = Object.entries(toolsMap).map(([name, data]) => ({
  name,
  count: data.count,
  status: data.status,
})).sort((a, b) => b.count - a.count);

console.log(JSON.stringify({
  telegram,
  mail,
  usage,
  dailyAudit,
  tools: toolsList,
  skills: Array.from(skillsSet),
  alerts: {
    incidents,
    avertissements,
    totalCronsScanned: totalCrons,
    telegramStatus: telegram?.phase === 'ready' ? '🟢 Opérationnel' : '⚠️ En attente'
  }
}));
`.trim();

const DIAG_B64 = Buffer.from(DIAG_SCRIPT).toString("base64");
const DIAG_COMMAND = `node -e "$(echo '${DIAG_B64}' | base64 -d)"`;

interface SandboxDiagPayload {
  telegram: TelegramConfig | null;
  mail: MailConfig | null;
  usage: Record<string, ExpertUsageData>;
  dailyAudit?: Record<string, DailyAuditDay>;
  tools?: ToolInfo[];
  skills?: string[];
  alerts: IncidentAlertData;
}

async function fetchSandboxDiagnostics(agentId: string): Promise<SandboxDiagPayload | null> {
  try {
    const res = await agent37.exec(agentId, DIAG_COMMAND);
    if (res.exit_code === 0 && res.stdout.trim()) {
      return JSON.parse(res.stdout.trim()) as SandboxDiagPayload;
    }
  } catch (e) {
    console.warn("[analytics] Échec diagnostics sandbox:", e);
  }
  return null;
}

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);

    const url = new URL(request.url);
    const rawPeriod = url.searchParams.get("period");
    const period: AnalyticsPeriod =
      rawPeriod === "aujourdhui" || rawPeriod === "30_jours" ? rawPeriod : "7_jours";

    // 1. Fetch experts, sandbox diagnostics, and members in parallel
    const [experts, diag] = await Promise.all([
      discoverInstalledExperts(id),
      fetchSandboxDiagnostics(id),
    ]);

    // 2. Fetch workspace members
    let membersList: Array<{ name?: string | null; email: string; role?: string; status?: string }> = [];
    if (authViaBackoffice()) {
      try {
        const session = await readSession();
        if (session?.accessToken) {
          const res = await backoffice.members(session.accessToken);
          membersList = (res.items || []).map((m) => ({
            name: m.name,
            email: m.email,
            role: m.role,
            status: m.status,
          }));
        }
      } catch {}
    }
    if (membersList.length === 0 && row.workspace_id) {
      try {
        const { db } = await requireUser();
        const { data: dbMembers } = await db.rpc("get_workspace_members", { p_workspace: row.workspace_id });
        if (Array.isArray(dbMembers)) {
          membersList = dbMembers.map((m: { name?: string; email: string; role?: string }) => ({
            name: m.name || m.email.split("@")[0],
            email: m.email,
            role: m.role,
          }));
        }
      } catch {}
    }

    // 3. Fetch sessions for all experts in parallel
    const expertIds = experts.map((e) => e.id);
    let sessions: RawSessionInfo[] = [];

    if (expertIds.length === 0) {
      try {
        const { data } = await agent37.listSessions(id);
        sessions = data.map((s) => ({
          id: s.id,
          profile: (s as { profile?: string | null }).profile ?? null,
          last_active: s.last_active,
          started_at: s.started_at,
        }));
      } catch {}
    } else {
      const perExpertSessions = await Promise.all(
        expertIds.map(async (exp) => {
          try {
            const { data } = await agent37.listSessions(id, profileQuery(exp));
            return data.map((s) => ({
              id: s.id,
              profile: exp,
              last_active: s.last_active,
              started_at: s.started_at,
            }));
          } catch {
            return [];
          }
        })
      );
      sessions = perExpertSessions.flat();
    }

    // 4. Fetch deliverables from instance
    let deliverables: RawFileInfo[] = [];
    try {
      const res = await instanceFetch(
        id,
        `/v1/files/list?path=${encodeURIComponent("~/Livrables")}`,
        withTimeout(undefined, TIMEOUT_MS)
      );
      if (res.ok) {
        const data = (await res.json()) as { files?: RawFileInfo[]; entries?: RawFileInfo[] };
        deliverables = data.files ?? data.entries ?? [];
      }
    } catch {}

    // 5. Compute analytics overview purely from real data
    const overview = computeAnalytics({
      sessions,
      usageStats: diag?.usage ?? null,
      dailyAudit: diag?.dailyAudit ?? null,
      experts,
      deliverables,
      alerts: diag?.alerts ?? null,
      period,
      membersList,
      toolsList: diag?.tools ?? [],
      skillsList: diag?.skills ?? [],
      telegram: diag?.telegram ?? null,
      mail: diag?.mail ?? null,
      instanceInfo: {
        id,
        name: row.name || id,
        cpu: row.cpu,
        memory: row.memory,
        disk: row.disk,
        status: row.status,
      },
    });

    return noStore(overview);
  } catch (e) {
    return handleError(e);
  }
}
