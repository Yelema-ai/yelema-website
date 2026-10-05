import { keepAwake } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { routineExpert, routineFields, type RoutineBody } from "../_body";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; routineId: string }> };

// { expert, enabled } turns a routine on or off; { expert, name, task, skills, attachment, schedule }
// edits it.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    const { row } = await requireAgentAccess(id);
    const body = await readJson<RoutineBody>(request);
    const expert = await routineExpert(row, body.expert);
    const routine =
      typeof body.enabled === "boolean"
        ? await hermesCron.setEnabled(id, expert.profile, expert.name, routineId, body.enabled)
        : await hermesCron.update(id, expert.profile, expert.name, routineId, routineFields(body, expert));
    if (routine.enabled) await keepAwake(id);
    return json({ routine });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    const { row } = await requireAgentAccess(id);
    const expert = await routineExpert(row, new URL(request.url).searchParams.get("expert"));
    await hermesCron.remove(id, expert.profile, routineId);
    return json({ id: routineId, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
