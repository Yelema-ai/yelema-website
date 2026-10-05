import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { expertParam, routineFields, type RoutineBody } from "./_body";

type Ctx = { params: Promise<{ id: string }> };

// An expert's routines (?expert=<key>): its own suggestions, paused until turned on, and the ones the
// team or the expert created.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const expert = expertParam(new URL(request.url).searchParams.get("expert"));
    return json({ routines: await hermesCron.list(id, expert.key, expert.name) });
  } catch (e) {
    return handleError(e);
  }
}

// "Nouvelle routine": { expert, name, task, skills, attachment, schedule }.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const body = await readJson<RoutineBody>(request);
    const expert = expertParam(body.expert);
    const routine = await hermesCron.create(id, expert.key, expert.name, routineFields(body, expert));
    return json({ routine }, 201);
  } catch (e) {
    return handleError(e);
  }
}
