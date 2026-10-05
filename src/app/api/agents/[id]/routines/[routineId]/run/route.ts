import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { routineExpert } from "../../_body";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; routineId: string }> };

// "Lancer maintenant": { expert }. The run starts within a minute; its result arrives like a
// scheduled run's.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    const { row } = await requireAgentAccess(id);
    const expert = await routineExpert(row, (await readJson<{ expert?: string }>(request)).expert);
    await hermesCron.runNow(id, expert.profile, routineId);
    return json({ id: routineId, queued: true });
  } catch (e) {
    return handleError(e);
  }
}
