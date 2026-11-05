import { agent37, instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { withTimeout } from "@/lib/fetch-timeout";
import { handleError, noStore } from "@/lib/http";
import { profileQuery } from "@/lib/profile-id";
import { computeAnalytics, type AnalyticsPeriod } from "@/lib/analytics";
import type {
  DiscoveredExpert,
  ExpertUsageData,
  IncidentAlertData,
  RawFileInfo,
  RawSessionInfo,
  TelegramConfig,
  MailConfig,
  VoiceBriefInfo,
  ExpertSkillInfo,
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

let telegram = null;
let mail = null;
try { telegram = JSON.parse(fs.readFileSync(path.join(yelemaDir, 'telegram.json'), 'utf8')); } catch {}
try { mail = JSON.parse(fs.readFileSync(path.join(yelemaDir, 'mail.json'), 'utf8')); } catch {}

const usage = {};
const incidents = [];
const avertissements = [];
let totalCrons = 0;

if (fs.existsSync(hermesDir)) {
  for (const exp of fs.readdirSync(hermesDir)) {
    if (exp.startsWith('.') || exp === 'default' || exp === 'yele') continue;
    const f = path.join(hermesDir, exp, 'cron', 'usage_audit.jsonl');
    let totalTokens = 0, promptTokens = 0, completionTokens = 0, totalDurationMs = 0, errors = 0, runs = 0;
    const models = {};
    if (fs.existsSync(f)) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.trim().split(/\r?\n/).filter(Boolean);
        for (const l of lines) {
          totalCrons++;
          try {
            const row = JSON.parse(l);
            totalTokens += row.total_tokens || 0;
            promptTokens += row.prompt_tokens || 0;
            completionTokens += row.completion_tokens || 0;
            totalDurationMs += row.duration_ms || 0;
            runs++;
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

    const cFile = path.join(yelemaDir, 'profiles', exp, 'connecteurs.json');
    if (fs.existsSync(cFile)) {
      try {
        const cData = JSON.parse(fs.readFileSync(cFile, 'utf8'));
        if (cData.outils && Array.isArray(cData.outils)) {
          for (const o of cData.outils) {
            if (o.etat === 'erreur') incidents.push({ type: 'CONNECTOR_ERROR', expert: exp, outil: o.nom, note: o.note });
            else if (o.etat !== 'ok') avertissements.push({ type: 'CONNECTOR_WARNING', expert: exp, outil: o.nom, etat: o.etat });
          }
        }
      } catch {}
    }
  }
}

console.log(JSON.stringify({
  telegram,
  mail,
  usage,
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
    await requireAgentAccess(id);

    const url = new URL(request.url);
    const rawPeriod = url.searchParams.get("period");
    const period: AnalyticsPeriod =
      rawPeriod === "aujourdhui" || rawPeriod === "30_jours" ? rawPeriod : "7_jours";

    // 1. Fetch experts and sandbox diagnostics in parallel
    const [experts, diag] = await Promise.all([
      discoverInstalledExperts(id),
      fetchSandboxDiagnostics(id),
    ]);

    // 2. Fetch sessions for all experts in parallel
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

    // 3. Fetch deliverables from instance
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

    // 4. Compute analytics overview
    const overview = computeAnalytics({
      sessions,
      usageStats: diag?.usage ?? null,
      experts,
      deliverables,
      alerts: diag?.alerts ?? null,
      period,
    });

    return noStore(overview);
  } catch (e) {
    return handleError(e);
  }
}
