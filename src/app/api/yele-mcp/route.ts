import { agent37, instanceFetch } from "@/lib/agent37";
import { composioUserId, hashAppsToken, listConnections } from "@/lib/composio";
import { createAdminClient } from "@/lib/supabase/admin";
import { withTimeout } from "@/lib/fetch-timeout";
import { isProfileId, profileQuery } from "@/lib/profile-id";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { TenantError } from "@/lib/tenant-resolver";
import { answerRpc } from "@/lib/yele-mcp";
import {
  createYeleSupervisionBackend,
  type DiscoveredExpert,
  type RawFileInfo,
  type RawSessionInfo,
  type TelegramConfig,
  type MailConfig,
  type ExpertUsageData,
  type IncidentAlertData,
  type VoiceBriefInfo,
  type MemorySearchResult,
  type ExpertSkillInfo,
} from "@/lib/yele-supervision";

export const maxDuration = 120;
const MAX_BODY_BYTES = 32_768;
const TIMEOUT_MS = 15_000;

// Script sécurisé d'interrogation de la sandbox (Node.js natif, lecture seule, pas d'injection shell)
// Extrait dynamiquement tous les experts installés dans ~/.hermes/profiles ainsi que leur nom et description SOUL.md.
const DISCOVERY_SCRIPT = `
const fs = require('fs');
const path = require('path');
const root = path.join(process.env.HOME || '/home/node', '.hermes/profiles');
const out = [];
if (fs.existsSync(root)) {
  for (const d of fs.readdirSync(root)) {
    if (d.startsWith('.') || d === 'default' || d === 'yele') continue;
    const p = path.join(root, d, 'SOUL.md');
    let name = d;
    let desc = '';
    if (fs.existsSync(p)) {
      try {
        const txt = fs.readFileSync(p, 'utf8');
        const mName = txt.match(/^name:\\s*["']?(.*?)["']?\\s*$/m);
        if (mName) name = mName[1].trim();
        const mDesc = txt.match(/^description:\\s*["']?(.*?)["']?\\s*$/m);
        if (mDesc) desc = mDesc[1].trim();
      } catch {}
    }
    out.push({ id: d, name, description: desc });
  }
}
console.log(JSON.stringify(out));
`.trim();

const DISCOVERY_B64 = Buffer.from(DISCOVERY_SCRIPT).toString("base64");
export const DISCOVER_EXPERTS_COMMAND = `node -e "$(echo '${DISCOVERY_B64}' | base64 -d)"`;

async function discoverInstalledExperts(agentId: string): Promise<DiscoveredExpert[]> {
  try {
    const res = await agent37.exec(agentId, DISCOVER_EXPERTS_COMMAND);
    if (res.exit_code === 0 && res.stdout.trim()) {
      const list = JSON.parse(res.stdout.trim()) as DiscoveredExpert[];
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.warn("[yele-mcp] Échec découverte sandbox des experts:", e);
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
        const lines = fs.readFileSync(f, 'utf8').trim().split('\\n').filter(Boolean);
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


const voiceBriefs = [];
const voixDir = path.join(yelemaDir, 'voix');
if (fs.existsSync(voixDir)) {
  for (const ent of fs.readdirSync(voixDir)) {
    if (ent.startsWith('brief-') && ent.endsWith('.json')) {
      const expId = ent.replace('brief-', '').replace('.json', '');
      try {
        const b = JSON.parse(fs.readFileSync(path.join(voixDir, ent), 'utf8'));
        voiceBriefs.push({ expId, at: b.at, text: b.text || '' });
      } catch {}
    }
  }
}

const skills = [];
if (fs.existsSync(hermesDir)) {
  for (const exp of fs.readdirSync(hermesDir)) {
    if (exp.startsWith('.') || exp === 'default' || exp === 'yele') continue;
    const sDir = path.join(hermesDir, exp, 'skills');
    let specific = [];
    let shared = [];
    if (fs.existsSync(sDir)) {
      try {
        const entries = fs.readdirSync(sDir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
        const expFolder = entries.find(e => e.isDirectory() && e.name.toLowerCase() === exp);
        if (expFolder) {
          specific = fs.readdirSync(path.join(sDir, expFolder.name)).filter(f => !f.startsWith('.'));
        }
        shared = entries.filter(e => e.isDirectory() && e.name.toLowerCase() !== exp).map(e => e.name);
      } catch {}
    }
    skills.push({ expId: exp, specific, shared });
  }
}

console.log(JSON.stringify({
  telegram,
  mail,
  usage,
  voiceBriefs,
  skills,
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
  voiceBriefs: VoiceBriefInfo[];
  skills: ExpertSkillInfo[];
}

async function fetchSandboxDiagnostics(agentId: string): Promise<SandboxDiagPayload | null> {
  try {
    const res = await agent37.exec(agentId, DIAG_COMMAND);
    if (res.exit_code === 0 && res.stdout.trim()) {
      return JSON.parse(res.stdout.trim()) as SandboxDiagPayload;
    }
  } catch (e) {
    console.warn("[yele-mcp] Échec diagnostics sandbox:", e);
  }
  return null;
}


async function searchMemoriesInSandbox(
  agentId: string,
  query: string,
  targetExpert?: string
): Promise<MemorySearchResult[]> {
  try {
    const qB64 = Buffer.from(query).toString("base64");
    const expB64 = targetExpert ? Buffer.from(targetExpert).toString("base64") : "";
    const script = `
const fs = require('fs');
const path = require('path');
const q = Buffer.from('${qB64}', 'base64').toString('utf8').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const target = '${expB64}' ? Buffer.from('${expB64}', 'base64').toString('utf8').trim().toLowerCase() : null;
const root = '/home/node/.hermes/profiles';
const results = [];
if (fs.existsSync(root)) {
  const dirs = target ? [target] : fs.readdirSync(root);
  for (const exp of dirs) {
    if (exp.startsWith('.') || exp === 'default' || exp === 'yele') continue;
    const f = path.join(root, exp, 'memories', 'MEMORY.md');
    if (fs.existsSync(f)) {
      try {
        const txt = fs.readFileSync(f, 'utf8');
        const paras = txt.split(/\\n\\s*\\n/);
        const matches = [];
        for (const p of paras) {
          if (p.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').includes(q)) {
            matches.push(p.trim());
            if (matches.length >= 3) break;
          }
        }
        if (matches.length > 0) results.push({ expId: exp, matches });
      } catch {}
    }
  }
}
console.log(JSON.stringify(results));
    `.trim();
    const cmd = `node -e "$(echo '${Buffer.from(script).toString("base64")}' | base64 -d)"`;
    const res = await agent37.exec(agentId, cmd);
    if (res.exit_code === 0 && res.stdout.trim()) {
      return JSON.parse(res.stdout.trim()) as MemorySearchResult[];
    }
  } catch (e) {
    console.warn("[yele-mcp] Échec recherche mémoire sandbox:", e);
  }
  return [];
}

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // Yélé's instance calls with its own token, as for `apps` and `memoire`; no browser session.
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return errorJson(401, "missing bearer token");

  let pinned: string | undefined;
  try {
    pinned = await pinnedWorkspaceId();
  } catch (e) {
    return e instanceof TenantError && e.status < 500 ? errorJson(401, "invalid token") : errorJson(503, "token lookup unavailable");
  }
  const { data: agent, error } = await createAdminClient()
    .from("agents")
    .select("agent37_id, workspace_id, owner_user_id")
    .eq("apps_token_hash", hashAppsToken(token))
    .maybeSingle<{ agent37_id: string; workspace_id: string | null; owner_user_id: string | null }>();
  if (error) return errorJson(503, "token lookup unavailable");
  if (!agent?.agent37_id || (pinned && agent.workspace_id !== pinned)) return errorJson(401, "invalid token");

  const raw = await request.text();
  let message: unknown;
  try {
    if (raw.length > MAX_BODY_BYTES) throw new Error("Requête trop volumineuse.");
    message = JSON.parse(raw);
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const resolvedAgentId = agent.agent37_id;
  const composioUser = composioUserId(agent);

  // Cache mémoire par requête pour éviter les appels redondants vers l'instance
  let cachedDiag: SandboxDiagPayload | null = null;
  const getDiag = async (): Promise<SandboxDiagPayload | null> => {
    if (cachedDiag === null) {
      cachedDiag = await fetchSandboxDiagnostics(resolvedAgentId);
    }
    return cachedDiag;
  };

  let cachedExperts: DiscoveredExpert[] | null = null;
  const getExperts = async (): Promise<DiscoveredExpert[]> => {
    if (cachedExperts === null) {
      cachedExperts = await discoverInstalledExperts(resolvedAgentId);
    }
    return cachedExperts;
  };

  // Création du backend réel avec les dépendances injectées et protégées par timeout
  const backend = createYeleSupervisionBackend({
    listInstalledExperts: getExperts,
    fetchTelegramConfig: async () => (await getDiag())?.telegram ?? null,
    fetchMailConfig: async () => (await getDiag())?.mail ?? null,
    fetchUsageStats: async () => (await getDiag())?.usage ?? null,
    fetchIncidentAlerts: async () => (await getDiag())?.alerts ?? null,
    fetchVoiceBriefs: async () => (await getDiag())?.voiceBriefs ?? null,
    // The expert ends up in a path on the instance: a name of the wrong shape searches nobody.
    searchMemories: async (q: string, exp?: string) => (exp && !isProfileId(exp.trim()) ? [] : searchMemoriesInSandbox(resolvedAgentId, q, exp)),
    fetchSkillsCatalog: async () => (await getDiag())?.skills ?? null,
    listSessions: async (): Promise<RawSessionInfo[]> => {
      const experts = await getExperts();
      const expertIds = experts.length > 0 ? experts.map((e) => e.id) : [];

      if (expertIds.length === 0) {
        try {
          const { data } = await agent37.listSessions(resolvedAgentId);
          return data.map((s) => ({
            id: s.id,
            profile: (s as { profile?: string | null }).profile ?? null,
            last_active: s.last_active,
            started_at: s.started_at,
          }));
        } catch {
          return [];
        }
      }

      const results: RawSessionInfo[] = [];
      await Promise.all(
        expertIds.map(async (exp) => {
          try {
            const { data } = await agent37.listSessions(resolvedAgentId, profileQuery(exp));
            for (const s of data) {
              results.push({
                id: s.id,
                profile: exp,
                last_active: s.last_active,
                started_at: s.started_at,
              });
            }
          } catch {}
        })
      );
      return results;
    },
    fetchFileContent: async (path: string): Promise<string | null> => {
      try {
        const res = await instanceFetch(
          resolvedAgentId,
          `/v1/files/content?path=${encodeURIComponent(path)}`,
          withTimeout(undefined, TIMEOUT_MS)
        );
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    },
    listConnections: async () => {
      try {
        const { connections } = await listConnections(composioUser);
        return connections.map((c) => ({
          toolkitSlug: c.toolkitSlug,
          status: c.status,
          isDisabled: c.isDisabled,
          alias: c.alias,
        }));
      } catch {
        return [];
      }
    },
    listDeliverableFiles: async (): Promise<RawFileInfo[]> => {
      try {
        const res = await instanceFetch(
          resolvedAgentId,
          `/v1/files/list?path=${encodeURIComponent("~/Livrables")}`,
          withTimeout(undefined, TIMEOUT_MS)
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { files?: RawFileInfo[]; entries?: RawFileInfo[] };
        return data.files ?? data.entries ?? [];
      } catch {
        return [];
      }
    },
  });

  try {
    const batch = Array.isArray(message) ? message.slice(0, 20) : [message];
    const answers = (await Promise.all(batch.map((m) => answerRpc(m, backend)))).filter((a) => a !== null);
    if (answers.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(message) ? answers : answers[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.warn("[yele-mcp] Erreur lors du traitement RPC:", e instanceof Error ? e.message : e);
    return errorJson(500, "Erreur interne du serveur de supervision.");
  }
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
