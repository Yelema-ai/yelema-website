import { handleError, json, readJson } from "@/lib/http";
import { meetings } from "@/lib/meetings/service";
import { deferAfterResponse, meetingScope } from "../../_scope";

type Ctx = { params: Promise<{ id: string; meeting: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, meeting } = await params;
    const body = await readJson<{ profile?: unknown }>(request);
    const { scope } = await meetingScope(id, body.profile);
    return json(await meetings.rewrite(scope, meeting, deferAfterResponse), 202);
  } catch (e) {
    return handleError(e);
  }
}

export const maxDuration = 800;
