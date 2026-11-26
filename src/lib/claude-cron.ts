import "server-only";
import { asMember } from "@/lib/agent37";
import { gatewayFetch, runtimeGateway } from "@/lib/runtime-gateway";
import { ApiError } from "@/lib/http";
import type { RoutineFields } from "@/lib/hermes-cron";
import { jobsToRoutines, newJob, patchJob, type ClaudeJob, type JobRuns } from "@/lib/claude-jobs";
import type { Routine } from "@/lib/routines";

// Routines of a Claude Code instance: each expert's `jobs.json`, run by the image's hub, read and written
// whole through the runtime gateway (`experts/<profile>/routines`), which checks every routine's shape.
// Same interface as lib/hermes-cron.
const UNAVAILABLE = "Les routines ne répondent pas pour l’instant. Réessayez dans un instant.";

async function call(agentId: string, path: string, init?: RequestInit): Promise<Response> {
  const gw = runtimeGateway();
  if (!gw) throw new ApiError(502, "routines_unavailable", UNAVAILABLE);
  return gatewayFetch(gw, `/v1/instances/${encodeURIComponent(agentId)}/${path}`, await asMember({ ...init, signal: AbortSignal.timeout(30_000) }));
}

async function readJobs(agentId: string, profile: string): Promise<ClaudeJob[]> {
  const res = await call(agentId, `experts/${encodeURIComponent(profile)}/routines`);
  if (res.status === 404) return [];
  if (!res.ok) {
    console.error(`[routines] jobs.json of ${profile} on ${agentId}: ${res.status}`);
    throw new ApiError(502, "routines_unavailable", UNAVAILABLE);
  }
  const body = (await res.json().catch(() => ({}))) as { jobs?: unknown };
  return Array.isArray(body.jobs) ? (body.jobs as ClaudeJob[]) : [];
}

async function writeJobs(agentId: string, profile: string, jobs: ClaudeJob[]): Promise<void> {
  const res = await call(agentId, `experts/${encodeURIComponent(profile)}/routines`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobs }) });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  console.error(`[routines] write jobs.json of ${profile} on ${agentId}: ${res.status}`, text.slice(0, 300));
  if (res.status === 400) throw new ApiError(400, "invalid_request", "La routine n’a pas pu être enregistrée. Vérifiez l’horaire, puis réessayez.");
  throw new ApiError(502, "routines_unavailable", UNAVAILABLE);
}

async function readRuns(agentId: string): Promise<JobRuns> {
  const res = await call(agentId, "routines/runs");
  return res.ok ? ((await res.json().catch(() => ({}))) as JobRuns) : {};
}

async function edit(agentId: string, profile: string, expertName: string, id: string, change: (job: ClaudeJob) => ClaudeJob): Promise<Routine> {
  const jobs = await readJobs(agentId, profile);
  const at = jobs.findIndex((j) => j.id === id);
  if (at < 0) throw new ApiError(404, "not_found", "Cette routine n’existe plus.");
  jobs[at] = change(jobs[at]!);
  await writeJobs(agentId, profile, jobs);
  return jobsToRoutines([jobs[at]!], profile, expertName, await readRuns(agentId))[0]!;
}

export const claudeCron = {
  list: async (agentId: string, profile: string, expertName: string): Promise<Routine[]> => {
    const [jobs, runs] = await Promise.all([readJobs(agentId, profile), readRuns(agentId)]);
    return jobsToRoutines(jobs, profile, expertName, runs);
  },

  create: async (agentId: string, profile: string, expertName: string, fields: RoutineFields): Promise<Routine> => {
    const jobs = await readJobs(agentId, profile);
    const job = newJob(fields, new Set(jobs.map((j) => j.id)));
    await writeJobs(agentId, profile, [...jobs, job]);
    return jobsToRoutines([job], profile, expertName, {})[0]!;
  },

  update: (agentId: string, profile: string, expertName: string, id: string, fields: RoutineFields) => edit(agentId, profile, expertName, id, (j) => patchJob(j, fields)),

  setEnabled: (agentId: string, profile: string, expertName: string, id: string, enabled: boolean) => edit(agentId, profile, expertName, id, (j) => ({ ...j, enabled })),

  hermesName: async (agentId: string, profile: string, id: string): Promise<string> => (await readJobs(agentId, profile)).find((j) => j.id === id)?.name ?? "",

  remove: async (agentId: string, profile: string, id: string) => {
    const jobs = await readJobs(agentId, profile);
    if (!jobs.some((j) => j.id === id)) throw new ApiError(404, "not_found", "Cette routine n’existe plus.");
    await writeJobs(agentId, profile, jobs.filter((j) => j.id !== id));
    return { ok: true };
  },

  // The hub runs a request within the minute, like a scheduled run, and sends the result to the expert's topic.
  runNow: async (agentId: string, profile: string, id: string) => {
    await edit(agentId, profile, "", id, (j) => {
      if (!j.enabled || j.schedule.kind !== "cron") throw new ApiError(409, "not_runnable", "Seule une routine active et récurrente se lance à la demande.");
      return { ...j, run_requested_at: new Date().toISOString() };
    });
  },
};
