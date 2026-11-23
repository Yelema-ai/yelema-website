import { ApiError, handleError, noStore, readJson } from "@/lib/http";
import { parseSendRequest } from "@/lib/meetings/audience";
import { meetings } from "@/lib/meetings/service";
import { meetingScope, sendPorts } from "../../_scope";

type Ctx = { params: Promise<{ id: string; meeting: string }> };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id, meeting } = await params;
    const access = await meetingScope(id, new URL(request.url).searchParams.get("profile"));
    return noStore(await meetings.sendOptions(access.scope, meeting, sendPorts(access, request)));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, meeting } = await params;
    const body = await readJson<{ profile?: unknown }>(request);
    const access = await meetingScope(id, body.profile);
    const sending = parseSendRequest(body);
    if (!sending) throw new ApiError(400, "invalid_request", "Vérifiez l’expéditeur et les adresses e-mail.");
    return noStore(await meetings.send(access.scope, meeting, sending, sendPorts(access, request)));
  } catch (e) {
    return handleError(e);
  }
}

export const maxDuration = 300;
