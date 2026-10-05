import { loadCatalogue, loadCatalogueExpert, matchCatalogue } from "@/lib/catalogue";
import { assertInDrive } from "@/lib/drive";
import { expertDisplayName } from "@/lib/experts";
import { ApiError } from "@/lib/http";
import { DEFAULT_PROFILE, resolveProfile } from "@/lib/profiles";
import { composePrompt, isOneOff, nameFrom } from "@/lib/routines";
import type { RoutineFields } from "@/lib/hermes-cron";
import type { AgentRow } from "@/lib/types";

// Shared by the routines routes (not a route: only `route.ts` files are endpoints).

export interface RoutineExpert {
  /** The expert's Hermes profile on this instance: where its routines live. */
  profile: string;
  /** Its name, as Hermes appends it to the routines shipped with the profile. */
  name: string;
  /** The skills a routine may name; empty when the catalogue does not know this expert. */
  skills: string[];
}

// The expert whose routines these are: a profile installed on THIS instance (never the default
// home, which has no routines of its own here), dressed by the catalogue.
export async function routineExpert(row: AgentRow, raw: unknown): Promise<RoutineExpert> {
  const profile = await resolveProfile(row, raw);
  if (profile === DEFAULT_PROFILE) throw new ApiError(400, "invalid_request", "Expert inconnu");

  const entry = matchCatalogue((await loadCatalogue()).experts, profile);
  const detail = entry ? await loadCatalogueExpert(entry.key) : null;
  return {
    profile,
    name: entry?.name ?? expertDisplayName(profile),
    skills: detail ? [...detail.skills.map((s) => s.name), ...detail.competencies] : [],
  };
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
export function routineFields(body: RoutineBody, expert: RoutineExpert): RoutineFields {
  const task = (body.task ?? "").trim();
  if (!task) throw new ApiError(400, "invalid_request", "Décrivez la tâche à faire.");
  // A bound only: the experts' own routines run past 7,000 characters and come back whole when just
  // their schedule is edited. Hermes refuses a new or changed description over 5,000 (lib/hermes-cron).
  if (task.length > 10_000) throw new ApiError(400, "invalid_request", "La description est trop longue.");

  const schedule = (body.schedule ?? "").trim();
  if (!CRON.test(schedule) && !ONE_OFF.test(schedule)) throw new ApiError(400, "invalid_request", "Horaire non reconnu.");
  if (isOneOff(schedule) && new Date(schedule).getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_request", "Choisissez un moment à venir.");
  }

  // Only skills the catalogue lists for this expert are kept. Without a catalogue there is no list
  // to check against, so none are added to the prompt.
  const known = new Set(expert.skills);
  const skills = (Array.isArray(body.skills) ? body.skills : []).filter((s) => typeof s === "string" && known.has(s));
  const attachment = body.attachment ? assertInDrive(body.attachment) : null;

  const name = (body.name ?? "").trim().slice(0, 80) || nameFrom(task);
  return { name, prompt: composePrompt(task, skills, attachment), schedule };
}
