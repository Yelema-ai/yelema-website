import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { expertParam, routineFields, type RoutineBody } from "../_body";

type Ctx = { params: Promise<{ id: string; routineId: string }> };

// { expert, enabled } turns a routine on or off; { expert, name, task, skills, attachment, schedule }
// edits it.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    await requireAgentAccess(id);
    const body = await readJson<RoutineBody>(request);
    const expert = expertParam(body.expert);
    const routine =
      typeof body.enabled === "boolean"
        ? await hermesCron.setEnabled(id, expert.key, expert.name, routineId, body.enabled)
        : await hermesCron.update(id, expert.key, expert.name, routineId, routineFields(body, expert));
    return json({ routine });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    await requireAgentAccess(id);
    const expert = expertParam(new URL(request.url).searchParams.get("expert"));
    await hermesCron.remove(id, expert.key, routineId);
    return json({ id: routineId, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
