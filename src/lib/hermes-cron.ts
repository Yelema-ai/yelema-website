import "server-only";
import { instancePortFetch } from "@/lib/agent37";
import { ApiError } from "@/lib/http";
import { splitPrompt, summarize, type Routine } from "@/lib/routines";

// Hermes's own scheduler: each expert's routines live in its profile, the instance's gateway runs
// them (Yelema's instances never sleep), and each run is a conversation under the expert plus a
// message on the chats the run delivers to. We drive it through the Hermes dashboard's API on port
// 9119, reached on the instance's preview URL behind our key; this module is the only one that
// speaks it.
//
// The dashboard also checks its own session token, minted at each dashboard start and printed in
// its page (lib/hermes-messaging reads it the same way). It is kept per instance until refused.
const DASHBOARD_PORT = 9119;
const tokens = new Map<string, string>();

const UNAVAILABLE = "Les routines ne répondent pas pour l’instant. Réessayez dans un instant.";

async function sessionToken(agentId: string): Promise<string> {
  const cached = tokens.get(agentId);
  if (cached) return cached;
  const res = await instancePortFetch(agentId, DASHBOARD_PORT, "/");
  const page = res.ok ? await res.text() : "";
  const token = page.match(/__HERMES_SESSION_TOKEN__="([^"]+)"/)?.[1];
  if (!token) {
    await res.body?.cancel().catch(() => undefined);
    console.error(`[routines] no dashboard token on ${agentId}`, res.status);
    throw new ApiError(502, "routines_unavailable", UNAVAILABLE);
  }
  tokens.set(agentId, token);
  return token;
}

async function dashboard<T>(agentId: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await instancePortFetch(agentId, DASHBOARD_PORT, path, {
      method,
      headers: {
        "X-Hermes-Session-Token": await sessionToken(agentId),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    // A restarted dashboard minted a new token: read it again, once.
    if (res.status === 401 && attempt === 0) {
      tokens.delete(agentId);
      await res.body?.cancel().catch(() => undefined);
      continue;
    }
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;
    console.error(`[routines] ${method} ${path} on ${agentId}: ${res.status}`, text.slice(0, 500));
    if (res.status === 404) throw new ApiError(404, "not_found", "Cette routine n’existe plus.");
    if (res.status === 400 || res.status === 422) {
      throw new ApiError(400, "invalid_request", "La routine n’a pas pu être enregistrée. Vérifiez l’horaire, puis réessayez.");
    }
    if (res.status === 409) throw new ApiError(409, "busy", "Cette routine tourne déjà.");
    throw new ApiError(502, "routines_unavailable", UNAVAILABLE);
  }
}

interface HermesJob {
  id: string;
  name?: string | null;
  prompt?: string | null;
  enabled: boolean;
  state?: string;
  paused_reason?: string | null;
  last_run_at?: string | null;
  deliver?: string | null;
  schedule: { kind: string; expr?: string; run_at?: string; display?: string };
}

interface Route {
  platform?: string;
  chat_id?: string | number;
  thread_id?: string | number | null;
  profile?: string;
}

// The reason Hermes gives the routines it installs with an expert, paused until someone turns them on.
const SHIPPED = "Installed from a profile distribution";

const q = (profile: string) => `?profile=${encodeURIComponent(profile)}`;
const jobPath = (id: string, profile: string, action = "") =>
  `/api/cron/jobs/${encodeURIComponent(id)}${action}${q(profile)}`;

function toRoutine(job: HermesJob, expertName: string): Routine {
  const { task, skills, attachment } = splitPrompt(job.prompt ?? "");
  const schedule = job.schedule.kind === "once" ? job.schedule.run_at ?? "" : job.schedule.expr ?? job.schedule.display ?? "";
  return {
    id: job.id,
    // The experts' own routines carry their name: "Point Tresorerie Hebdo (Mamadou)".
    name: (job.name ?? "").replace(` (${expertName})`, "").trim() || summarize(task),
    task,
    summary: summarize(task),
    skills,
    attachment,
    schedule,
    enabled: job.enabled,
    suggested: !job.enabled && !job.last_run_at && (job.paused_reason ?? "").startsWith(SHIPPED),
  };
}

export interface RoutineFields {
  name: string;
  prompt: string;
  schedule: string;
}

export const hermesCron = {
  list: async (agentId: string, profile: string, expertName: string): Promise<Routine[]> => {
    const jobs = await dashboard<HermesJob[]>(agentId, "GET", `/api/cron/jobs${q(profile)}`);
    return jobs.map((j) => toRoutine(j, expertName));
  },

  create: async (agentId: string, profile: string, expertName: string, fields: RoutineFields): Promise<Routine> => {
    const deliver = await deliveryFor(agentId, profile);
    return toRoutine(await dashboard<HermesJob>(agentId, "POST", `/api/cron/jobs${q(profile)}`, { ...fields, deliver }), expertName);
  },

  update: async (agentId: string, profile: string, expertName: string, id: string, fields: Partial<RoutineFields>) => {
    const deliver = await deliveryFor(agentId, profile);
    const job = await dashboard<HermesJob>(agentId, "PUT", jobPath(id, profile), { updates: { ...fields, deliver } });
    return toRoutine(job, expertName);
  },

  // Turning a routine on also points it at the expert's chats as they are today.
  setEnabled: async (agentId: string, profile: string, expertName: string, id: string, enabled: boolean) => {
    if (enabled) {
      const deliver = await deliveryFor(agentId, profile);
      await dashboard<HermesJob>(agentId, "PUT", jobPath(id, profile), { updates: { deliver } });
    }
    const job = await dashboard<HermesJob>(agentId, "POST", jobPath(id, profile, enabled ? "/resume" : "/pause"));
    return toRoutine(job, expertName);
  },

  remove: (agentId: string, profile: string, id: string) =>
    dashboard<{ ok: boolean }>(agentId, "DELETE", jobPath(id, profile)),

  // Hermes's own "run now" (cron.jobs.trigger_job): the routine is due at once, and the gateway's
  // scheduler runs it at its next tick, within a minute, like a scheduled run, so the result reaches
  // the expert's chats. (The dashboard's /trigger runs it inside the dashboard instead, which has no
  // Telegram connection for an expert: the run happens, the post fails.) Only for a routine that is on
  // and repeats: a one-off would be spent.
  runNow: async (agentId: string, profile: string, id: string) => {
    const job = await dashboard<HermesJob>(agentId, "GET", jobPath(id, profile));
    if (!job.enabled || job.schedule.kind === "once") {
      throw new ApiError(409, "not_runnable", "Seule une routine active et récurrente se lance à la demande.");
    }
    const now = new Date().toISOString();
    await dashboard<HermesJob>(agentId, "PUT", jobPath(id, profile), { updates: { next_run_at: now, manual_run_at: now } });
  },
};

// Where an expert's routines post their result: every chat routed to the expert (its Telegram topic),
// or only the app ("local": the run is still a conversation under the expert) when there is none.
// The routes live in the default profile's config (lib/telegram-topics writes them).
async function deliveries(agentId: string): Promise<(profile: string) => string> {
  const config = await dashboard<{ gateway?: { profile_routes?: Route[] } }>(agentId, "GET", "/api/config?profile=default");
  const routes = config.gateway?.profile_routes ?? [];
  return (profile) => {
    const targets = routes
      .filter((r) => r.profile === profile && r.platform && r.chat_id)
      .map((r) => [r.platform, r.chat_id, r.thread_id].filter((p) => p !== undefined && p !== null && p !== "").join(":"));
    return targets.length ? [...new Set(targets)].join(",") : "local";
  };
}

async function deliveryFor(agentId: string, profile: string): Promise<string> {
  return (await deliveries(agentId))(profile);
}

// After the experts' Telegram topics are created: routines that posted nowhere but the app now post
// to their expert's topic too.
export async function repointRoutines(agentId: string, profiles: string[]): Promise<void> {
  const deliverFor = await deliveries(agentId);
  for (const profile of profiles) {
    const deliver = deliverFor(profile);
    if (deliver === "local") continue;
    const jobs = await dashboard<HermesJob[]>(agentId, "GET", `/api/cron/jobs${q(profile)}`);
    for (const job of jobs) {
      if (job.deliver && job.deliver !== "local" && job.deliver !== "origin") continue;
      await dashboard<HermesJob>(agentId, "PUT", jobPath(job.id, profile), { updates: { deliver } });
    }
  }
}
