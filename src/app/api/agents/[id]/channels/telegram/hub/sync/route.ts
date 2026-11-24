import { agent37 } from "@/lib/agent37";
import { requireChannelWrite } from "@/lib/auth";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// `POST /api/agents/{id}/channels/telegram/hub/sync`: an expert added since gets its topic in the group.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireChannelWrite(id);
    return json(await agent37.telegramHub.sync(id));
  } catch (e) {
    return handleError(e);
  }
}
