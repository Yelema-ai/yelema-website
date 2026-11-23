import { ApiError, handleError, json, noStore, readJson } from "@/lib/http";
import { meetings, parsePageRequest } from "@/lib/meetings/service";
import { deferAfterResponse, meetingRequester, meetingScope } from "./_scope";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const { scope } = await meetingScope(id, search.get("profile"));
    const page = parsePageRequest(search);
    if (!page) throw new ApiError(400, "invalid_request", "Cette page de réunions n’existe pas.");
    return noStore(await meetings.list(scope, deferAfterResponse, page));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson<{ profile?: unknown; link?: unknown }>(request);
    const access = await meetingScope(id, body.profile);
    return json(await meetings.start(access.scope, body.link, await meetingRequester(access), deferAfterResponse), 201);
  } catch (e) {
    return handleError(e);
  }
}

export const maxDuration = 800;
