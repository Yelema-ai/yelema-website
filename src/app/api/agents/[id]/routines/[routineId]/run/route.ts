import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json, readJson } from "@/lib/http";
import { expertParam } from "../../_body";

type Ctx = { params: Promise<{ id: string; routineId: string }> };

// "Lancer maintenant": { expert }. The run starts within a minute; its result arrives like a
// scheduled run's.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, routineId } = await params;
    await requireAgentAccess(id);
    const expert = expertParam((await readJson<{ expert?: string }>(request)).expert);
    await hermesCron.runNow(id, expert.key, routineId);
    return json({ id: routineId, queued: true });
  } catch (e) {
    return handleError(e);
  }
}
