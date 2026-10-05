import { getExpert, type Expert } from "@/config/experts";
import { assertInDrive } from "@/lib/drive";
import { ApiError } from "@/lib/http";
import { composePrompt, isOneOff, nameFrom } from "@/lib/routines";
import type { RoutineFields } from "@/lib/hermes-cron";

// Shared by the routines routes (not a route: only `route.ts` files are endpoints).

// The expert whose routines these are; its key is also its Hermes profile.
export function expertParam(raw: unknown): Expert {
  const expert = typeof raw === "string" ? getExpert(raw) : undefined;
  if (!expert) throw new ApiError(400, "invalid_request", "Expert inconnu");
  return expert;
}

const CRON = /^[\d*,\-/]+(\s+[\d*,\-/]+){4}$/;
const ONE_OFF = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;

export interface RoutineBody {
  expert?: string;
  name?: string;
  task?: string;
  skills?: string[];
  attachment?: string | null;
  schedule?: string;
  enabled?: boolean;
}

// The form's fields as Hermes takes them: a name, the prompt (task, then skills and file), a schedule.
export function routineFields(body: RoutineBody, expert: Expert): RoutineFields {
  const task = (body.task ?? "").trim();
  if (!task) throw new ApiError(400, "invalid_request", "Décrivez la tâche à faire.");
  if (task.length > 6000) throw new ApiError(400, "invalid_request", "La description est trop longue.");

  const schedule = (body.schedule ?? "").trim();
  if (!CRON.test(schedule) && !ONE_OFF.test(schedule)) throw new ApiError(400, "invalid_request", "Horaire non reconnu.");
  if (isOneOff(schedule) && new Date(schedule).getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_request", "Choisissez un moment à venir.");
  }

  const known = new Set(expert.skills.map((s) => s.title));
  const skills = (Array.isArray(body.skills) ? body.skills : []).filter((s) => typeof s === "string" && known.has(s));
  const attachment = body.attachment ? assertInDrive(body.attachment) : null;

  const name = (body.name ?? "").trim().slice(0, 80) || nameFrom(task);
  return { name, prompt: composePrompt(task, skills, attachment), schedule };
}
