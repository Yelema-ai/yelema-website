import { requireAgentAccess } from "@/lib/auth";
import { hermesCron } from "@/lib/hermes-cron";
import { handleError, json } from "@/lib/http";
import { routinesOf } from "@/lib/routine-store";
import { routineExpert } from "../routines/_body";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// `GET ?expert=<profile>` — les objectifs de l'expert, en lecture seule. `available: false` : moteur ou image sans objectifs.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const [expert, store] = await Promise.all([routineExpert(row, new URL(request.url).searchParams.get("expert"), { skills: false }), routinesOf(id)]);
    const objectifs = store === hermesCron ? await hermesCron.objectifs(id, expert.profile) : null;
    return json({ objectifs: objectifs ?? [], available: objectifs !== null });
  } catch (e) {
    return handleError(e);
  }
}
