import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { routineExpert, routineFields, type RoutineBody } from "./_body";

// Each call reads the instance's key file and talks to Hermes's API server on the instance.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// An expert's routines (?expert=<profile>): its own suggestions, paused until turned on, and the
// ones the member or the expert created.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const expert = await routineExpert(row, new URL(request.url).searchParams.get("expert"));
    return json({ routines: await hermesCron.list(id, expert.profile, expert.name) });
  } catch (e) {
    return handleError(e);
  }
}

// "Nouvelle routine": { expert, name, task, skills, attachment, schedule }.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const body = await readJson<RoutineBody>(request);
    const expert = await routineExpert(row, body.expert);
    const routine = await hermesCron.create(id, expert.profile, expert.name, routineFields(body, expert));
    return json({ routine }, 201);
  } catch (e) {
    return handleError(e);
  }
}
