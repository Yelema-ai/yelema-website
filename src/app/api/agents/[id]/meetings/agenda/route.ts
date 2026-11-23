import { ApiError, handleError, noStore, readJson } from "@/lib/http";
import { parseAgendaChange } from "@/lib/meetings/agenda";
import { meetings } from "@/lib/meetings/service";
import { agendaPorts, meetingScope } from "../_scope";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const access = await meetingScope(id, new URL(request.url).searchParams.get("profile"));
    return noStore(await meetings.agenda(access.scope, await agendaPorts(access)));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson<{ profile?: unknown }>(request);
    const access = await meetingScope(id, body.profile);
    const change = parseAgendaChange(body);
    if (!change) throw new ApiError(400, "invalid_request", "Ce réglage n’est pas valide.");
    const ports = await agendaPorts(access);
    return noStore("event" in change ? await meetings.toggleEvent(access.scope, change, ports) : await meetings.changeAgenda(access.scope, change, ports));
  } catch (e) {
    return handleError(e);
  }
}

export const maxDuration = 300;
