import { after } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { hermesCron, repointRoutines } from "@/lib/hermes-cron";
import { routinesOf } from "@/lib/routine-store";
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
    const [expert, store] = await Promise.all([routineExpert(row, new URL(request.url).searchParams.get("expert"), { skills: false }), routinesOf(id)]);
    const routines = await store.list(id, expert.profile, expert.name);
    // A routine an Expert set up from a chat answers « where it was asked », which is no channel when it
    // was the app: it is pointed at the Expert's chats (the app, its Telegram topic if any), as a saved
    // routine is, after the answer and once per reading (Leslie, 01/11: « on peut pas fixer ça par défaut ? »).
    if (store === hermesCron && routines.some((r) => !r.deliver || r.deliver === "origin")) {
      after(() => repointRoutines(id, [expert.profile]).catch((e) => console.error("[routines] repoint", (e as Error).message)));
    }
    return json({ routines });
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
    const [expert, store] = await Promise.all([routineExpert(row, body.expert), routinesOf(id)]);
    const routine = await store.create(id, expert.profile, expert.name, routineFields(body, expert));
    return json({ routine }, 201);
  } catch (e) {
    return handleError(e);
  }
}
